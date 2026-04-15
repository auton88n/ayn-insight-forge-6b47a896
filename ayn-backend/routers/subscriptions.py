"""
routers/subscriptions.py — Stripe checkout and customer portal
Replaces: create-checkout, customer-portal Supabase edge functions.
Stripe webhook STAYS in Supabase (needs public URL Stripe can reach).
"""
import stripe
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.auth import verify_token
from core.config import STRIPE_SECRET_KEY
from core.db import get_db

router = APIRouter(prefix="/subscriptions")

stripe.api_key = STRIPE_SECRET_KEY

PRICE_IDS = {
    "starter":    "price_starter",    # replace with real Stripe price IDs
    "pro":        "price_pro",
    "business":   "price_business",
    "enterprise": "price_enterprise",
}

SUCCESS_URL = "https://aynn.io/subscription-success"
CANCEL_URL  = "https://aynn.io/subscription-canceled"


class CheckoutBody(BaseModel):
    tier: str
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


@router.post("/checkout")
async def create_checkout(body: CheckoutBody, user_id: str = Depends(verify_token)):
    """Create a Stripe checkout session. Replaces create-checkout edge fn."""
    price_id = PRICE_IDS.get(body.tier)
    if not price_id:
        raise HTTPException(400, f"Unknown tier: {body.tier}")

    db = get_db()

    # Get or create Stripe customer
    sub = db.table("user_subscriptions").select("stripe_customer_id").eq("user_id", user_id).maybe_single().execute()
    profile = db.table("profiles").select("email,contact_person").eq("id", user_id).maybe_single().execute()

    customer_id = sub.data.get("stripe_customer_id") if sub.data else None

    if not customer_id:
        email = profile.data.get("email", "") if profile.data else ""
        name  = profile.data.get("contact_person", "") if profile.data else ""
        customer = stripe.Customer.create(email=email, name=name, metadata={"user_id": user_id})
        customer_id = customer.id

        # Save customer ID
        db.table("user_subscriptions").upsert({
            "user_id": user_id,
            "stripe_customer_id": customer_id,
            "subscription_tier": "free",
            "status": "inactive",
        }, on_conflict="user_id").execute()

    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=body.success_url or SUCCESS_URL,
        cancel_url=body.cancel_url or CANCEL_URL,
        metadata={"user_id": user_id, "tier": body.tier},
    )

    return {"url": session.url, "session_id": session.id}


@router.post("/portal")
async def customer_portal(user_id: str = Depends(verify_token)):
    """Create a Stripe customer portal session. Replaces customer-portal edge fn."""
    db = get_db()
    sub = db.table("user_subscriptions").select("stripe_customer_id").eq("user_id", user_id).maybe_single().execute()

    if not sub.data or not sub.data.get("stripe_customer_id"):
        raise HTTPException(404, "No subscription found")

    session = stripe.billing_portal.Session.create(
        customer=sub.data["stripe_customer_id"],
        return_url="https://aynn.io/settings",
    )
    return {"url": session.url}


@router.get("/status")
async def get_subscription_status(user_id: str = Depends(verify_token)):
    """Get current subscription status for the user."""
    db = get_db()
    sub = db.table("user_subscriptions").select("*").eq("user_id", user_id).maybe_single().execute()
    limits = db.table("user_ai_limits").select("*").eq("user_id", user_id).maybe_single().execute()
    return {
        "subscription": sub.data,
        "limits": limits.data,
    }
