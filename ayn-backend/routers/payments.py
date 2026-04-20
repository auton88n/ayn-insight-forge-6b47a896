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


# ── Balance ───────────────────────────────────────────────────────────────────
@router.get("/balance")
async def get_stripe_balance(_: str = Depends(get_user_id)):
    """Get Stripe account balance. For admin dashboard revenue view."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Payment system not configured")
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        balance = stripe.Balance.retrieve()
        available = [{"amount": f["amount"] / 100, "currency": f["currency"].upper()}
                     for f in balance["available"]]
        pending = [{"amount": f["amount"] / 100, "currency": f["currency"].upper()}
                   for f in balance["pending"]]
        return {"available": available, "pending": pending}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/admin/balance")
async def get_admin_stripe_balance(_: str = Depends(get_user_id)):
    """Admin: full balance + recent payouts."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Payment system not configured")
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        balance = stripe.Balance.retrieve()
        payouts = stripe.Payout.list(limit=5)
        charges = stripe.Charge.list(limit=10)

        total_revenue = sum(c["amount"] for c in charges["data"]
                            if c["status"] == "succeeded") / 100
        return {
            "available": [{"amount": f["amount"] / 100, "currency": f["currency"].upper()}
                          for f in balance["available"]],
            "pending": [{"amount": f["amount"] / 100, "currency": f["currency"].upper()}
                        for f in balance["pending"]],
            "recent_payouts": [{"amount": p["amount"] / 100, "arrival_date": p["arrival_date"],
                                 "status": p["status"]} for p in payouts["data"]],
            "total_revenue_recent": total_revenue,
            "recent_charge_count": len(charges["data"]),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Refunds ───────────────────────────────────────────────────────────────────
class RefundRequest(BaseModel):
    payment_intent_id: str
    amount: float = None  # None = full refund, float = partial (in dollars)
    reason: str = "requested_by_customer"


@router.post("/refund")
async def issue_refund(req: RefundRequest, admin_id: str = Depends(get_user_id)):
    """Issue a refund. Admin only."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Payment system not configured")
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY

        refund_params = {
            "payment_intent": req.payment_intent_id,
            "reason": req.reason,
        }
        if req.amount:
            refund_params["amount"] = int(req.amount * 100)  # convert to cents

        refund = stripe.Refund.create(**refund_params)

        # Log the refund
        await execute("""
            INSERT INTO payment_events (event_type, stripe_id, amount, currency, status, metadata, created_at)
            VALUES ('refund', $1, $2, 'usd', $3, $4::jsonb, NOW())
        """, refund["id"],
            refund["amount"] / 100,
            refund["status"],
            f'{{"payment_intent": "{req.payment_intent_id}", "reason": "{req.reason}", "admin": "{admin_id}"}}')

        return {
            "ok": True,
            "refund_id": refund["id"],
            "amount": refund["amount"] / 100,
            "status": refund["status"],
            "currency": refund["currency"].upper(),
        }
    except Exception as e:
        log.error(f"[payments] refund error: {e}")
        raise HTTPException(500, str(e))


@router.get("/admin/charges")
async def get_recent_charges(_: str = Depends(get_user_id)):
    """Admin: list recent charges with refund eligibility."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Payment system not configured")
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        charges = stripe.Charge.list(limit=50, expand=["data.customer"])
        return [{
            "id": c["id"],
            "payment_intent": c.get("payment_intent"),
            "amount": c["amount"] / 100,
            "currency": c["currency"].upper(),
            "status": c["status"],
            "refunded": c["refunded"],
            "amount_refunded": c.get("amount_refunded", 0) / 100,
            "customer_email": c.get("billing_details", {}).get("email"),
            "description": c.get("description"),
            "created": c["created"],
            "can_refund": not c["refunded"] and c["status"] == "succeeded",
        } for c in charges["data"]]
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Subscription Management ───────────────────────────────────────────────────
@router.get("/admin/subscriptions")
async def get_all_subscriptions(_: str = Depends(get_user_id)):
    """Admin: all active Stripe subscriptions with user info."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Payment system not configured")
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        subs = stripe.Subscription.list(limit=100, status="all",
                                         expand=["data.customer"])
        return [{
            "id": s["id"],
            "status": s["status"],
            "customer_email": s["customer"].get("email") if isinstance(s["customer"], dict) else None,
            "plan": s["items"]["data"][0]["price"]["nickname"] if s["items"]["data"] else None,
            "amount": s["items"]["data"][0]["price"]["unit_amount"] / 100 if s["items"]["data"] else 0,
            "current_period_end": s["current_period_end"],
            "cancel_at_period_end": s["cancel_at_period_end"],
        } for s in subs["data"]]
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/admin/cancel/{subscription_id}")
async def cancel_subscription(subscription_id: str, _: str = Depends(get_user_id)):
    """Admin: cancel a subscription at period end."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Payment system not configured")
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        sub = stripe.Subscription.modify(subscription_id, cancel_at_period_end=True)
        return {"ok": True, "cancel_at": sub["cancel_at"]}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Webhook enhanced ──────────────────────────────────────────────────────────
# Handle more events for accurate subscription tracking
@router.post("/webhook/v2")
async def stripe_webhook_v2(request: Request):
    """Enhanced webhook — handles all subscription lifecycle events."""
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

    etype = event["type"]
    obj = event["data"]["object"]

    if etype == "checkout.session.completed":
        user_id = obj.get("client_reference_id")
        customer_id = obj.get("customer")
        sub_id = obj.get("subscription")
        metadata = obj.get("metadata", {})
        tier = metadata.get("tier", "starter")
        if user_id:
            await execute("""
                INSERT INTO user_subscriptions
                    (user_id, stripe_customer_id, stripe_subscription_id,
                     subscription_tier, status, updated_at)
                VALUES ($1::uuid, $2, $3, $4, 'active', NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    stripe_customer_id = $2,
                    stripe_subscription_id = $3,
                    subscription_tier = $4,
                    status = 'active',
                    updated_at = NOW()
            """, user_id, customer_id, sub_id, tier)
            # Upgrade message limits based on tier
            limits = {"starter": 50, "pro": 200, "business": 1000, "enterprise": 9999}
            daily = limits.get(tier, 50)
            await execute("""
                UPDATE user_ai_limits SET daily_messages = $2, updated_at = NOW()
                WHERE user_id = $1::uuid
            """, user_id, daily)
            log.info(f"[payments] Activated {tier} for user {user_id[:8]}")

    elif etype == "customer.subscription.updated":
        customer_id = obj.get("customer")
        status = obj.get("status")
        period_end = obj.get("current_period_end")
        cancel_at_end = obj.get("cancel_at_period_end", False)
        await execute("""
            UPDATE user_subscriptions
            SET status = $2, current_period_end = TO_TIMESTAMP($3),
                cancel_at_period_end = $4, updated_at = NOW()
            WHERE stripe_customer_id = $1
        """, customer_id, status, period_end, cancel_at_end)

    elif etype in ("customer.subscription.deleted", "customer.subscription.paused"):
        customer_id = obj.get("customer")
        await execute("""
            UPDATE user_subscriptions
            SET subscription_tier = 'free', status = 'inactive', updated_at = NOW()
            WHERE stripe_customer_id = $1
        """, customer_id)
        # Reset to free limits
        await execute("""
            UPDATE user_ai_limits ul
            SET daily_messages = 5, updated_at = NOW()
            FROM user_subscriptions us
            WHERE us.user_id = ul.user_id AND us.stripe_customer_id = $1
        """, customer_id)
        log.info(f"[payments] Subscription ended for customer {customer_id}")

    elif etype == "invoice.payment_failed":
        customer_id = obj.get("customer")
        await execute("""
            UPDATE user_subscriptions SET status = 'past_due', updated_at = NOW()
            WHERE stripe_customer_id = $1
        """, customer_id)

    # Log all events
    try:
        await execute("""
            INSERT INTO payment_events (event_type, stripe_id, amount, currency, status, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
        """, etype, obj.get("id", ""), 
            obj.get("amount", obj.get("amount_total", 0)) / 100 if obj.get("amount") or obj.get("amount_total") else 0,
            obj.get("currency", "usd"),
            obj.get("status", "received"),
            f'{{"event_type": "{etype}"}}')
    except Exception:
        pass

    return {"ok": True}
