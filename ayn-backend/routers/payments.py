"""
routers/payments.py — Stripe payment endpoints
Replaces: create-checkout, customer-portal, stripe-webhook
"""
import os
import logging
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel
from core.auth_new import get_user_id
from core.database import execute, fetchrow

router = APIRouter(prefix="/payments", tags=["payments"])
log = logging.getLogger("ayn.payments")

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")


class CheckoutRequest(BaseModel):
    price_id: str
    success_url: str = "https://aynn.io/dashboard?payment=success"
    cancel_url: str = "https://aynn.io/dashboard"


@router.post("/checkout")
async def create_checkout(req: CheckoutRequest, user_id: str = Depends(get_user_id)):
    """Create Stripe checkout session. Replaces create-checkout."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Payment system not configured")
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        user = await fetchrow("SELECT email FROM users WHERE id = $1::uuid", user_id)
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{"price": req.price_id, "quantity": 1}],
            mode="subscription",
            success_url=req.success_url,
            cancel_url=req.cancel_url,
            client_reference_id=user_id,
            customer_email=user["email"] if user else None,
        )
        return {"url": session.url}
    except Exception as e:
        log.error(f"[payments] checkout error: {e}")
        raise HTTPException(500, str(e))


@router.post("/portal")
async def customer_portal(user_id: str = Depends(get_user_id)):
    """Create Stripe customer portal session. Replaces customer-portal."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Payment system not configured")
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        sub = await fetchrow(
            "SELECT stripe_customer_id FROM user_subscriptions WHERE user_id = $1::uuid", user_id
        )
        if not sub or not sub.get("stripe_customer_id"):
            raise HTTPException(400, "No subscription found")
        session = stripe.billing_portal.Session.create(
            customer=sub["stripe_customer_id"],
            return_url="https://aynn.io/dashboard",
        )
        return {"url": session.url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events. Replaces stripe-webhook."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Payment system not configured")
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        raise HTTPException(400, str(e))

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("client_reference_id")
        customer_id = session.get("customer")
        if user_id:
            await execute("""
                UPDATE user_subscriptions 
                SET subscription_tier = 'starter', status = 'active',
                    stripe_customer_id = $2, updated_at = NOW()
                WHERE user_id = $1::uuid
            """, user_id, customer_id)
            log.info(f"[payments] Subscription activated for {user_id[:8]}")

    elif event["type"] in ("customer.subscription.deleted", "customer.subscription.paused"):
        customer_id = event["data"]["object"].get("customer")
        await execute("""
            UPDATE user_subscriptions SET subscription_tier = 'free', status = 'inactive',
            updated_at = NOW() WHERE stripe_customer_id = $1
        """, customer_id)

    return {"ok": True}
