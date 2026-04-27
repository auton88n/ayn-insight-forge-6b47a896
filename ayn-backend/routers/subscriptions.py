"""
routers/subscriptions.py — Stripe checkout/portal (Railway Postgres)
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.auth import verify_token
from core.config import STRIPE_SECRET_KEY
from core.database import fetchrow, execute

router = APIRouter(prefix="/subscriptions")
log = logging.getLogger("ayn.subscriptions")

SUCCESS_URL = "https://aynn.io/subscription-success"
CANCEL_URL = "https://aynn.io/subscription-canceled"


class CheckoutBody(BaseModel):
    tier: str
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


@router.post("/checkout")
async def create_checkout(body: CheckoutBody, user_id: str = Depends(verify_token)):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Payment system not configured")
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY

        sub = await fetchrow(
            "SELECT stripe_customer_id FROM user_subscriptions WHERE user_id=$1::uuid", user_id)
        user = await fetchrow("SELECT email, first_name FROM users WHERE id=$1::uuid", user_id)

        customer_id = sub["stripe_customer_id"] if sub else None

        if not customer_id:
            email = user["email"] if user else ""
            name = user["first_name"] if user else ""
            customer = stripe.Customer.create(
                email=email, name=name, metadata={"user_id": user_id})
            customer_id = customer.id
            await execute(
                "INSERT INTO user_subscriptions (user_id, stripe_customer_id, subscription_tier, status) "
                "VALUES ($1::uuid, $2, 'free', 'inactive') "
                "ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id=$2",
                user_id, customer_id)

        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{"price": body.tier, "quantity": 1}],
            success_url=body.success_url or SUCCESS_URL,
            cancel_url=body.cancel_url or CANCEL_URL,
            metadata={"user_id": user_id},
        )
        return {"url": session.url, "session_id": session.id}
    except Exception as e:
        log.error(f"[subscriptions] checkout error: {e}")
        raise HTTPException(500, str(e))


@router.post("/portal")
async def customer_portal(user_id: str = Depends(verify_token)):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Payment system not configured")
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        sub = await fetchrow(
            "SELECT stripe_customer_id FROM user_subscriptions WHERE user_id=$1::uuid", user_id)
        if not sub or not sub["stripe_customer_id"]:
            raise HTTPException(404, "No subscription found")
        session = stripe.billing_portal.Session.create(
            customer=sub["stripe_customer_id"],
            return_url="https://aynn.io/settings",
        )
        return {"url": session.url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/status")
async def get_subscription_status(user_id: str = Depends(verify_token)):
    sub = await fetchrow(
        "SELECT * FROM user_subscriptions WHERE user_id=$1::uuid", user_id)
    limits = await fetchrow(
        "SELECT * FROM user_ai_limits WHERE user_id=$1::uuid", user_id)
    return {
        "subscription": dict(sub) if sub else None,
        "limits": dict(limits) if limits else None,
    }
