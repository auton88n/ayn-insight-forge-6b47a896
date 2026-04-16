"""
services/email.py — email service using Resend API

Ports all 8 templates from supabase/functions/send-email/index.ts
Same templates, same branding, now running in Python/spine.
"""
import os
import logging
import httpx
from datetime import datetime

log = logging.getLogger("ayn.email")

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = "AYN Team <noreply@mail.aynn.io>"

# ── Shared HTML components ─────────────────────────────────────────────────────

AYN_HEADER = """
<div style="text-align:center;margin-bottom:32px;">
  <h1 style="font-size:56px;font-weight:900;letter-spacing:-2px;margin:0;color:#000;">AYN</h1>
  <div style="width:40px;height:4px;background:#000;margin:16px auto;"></div>
</div>"""

AYN_FOOTER = f"""
<div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;text-align:center;">
  <p style="font-size:12px;color:#999;margin:0;">AYN AI - Your Intelligent Companion</p>
  <p style="font-size:11px;color:#bbb;margin:8px 0 0;">© {datetime.now().year} AYN Team. All rights reserved.</p>
</div>"""

def _html(body: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  {AYN_HEADER}
  {body}
  {AYN_FOOTER}
</div>
</body>
</html>"""


# ── Email templates ────────────────────────────────────────────────────────────

def welcome_email(user_name: str) -> dict:
    name = user_name or "there"
    return {
        "subject": "Welcome to AYN! 🎉",
        "html": _html(f"""
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi {name},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">
    Welcome to AYN! Your AI business intelligence companion is ready.
  </p>
  <div style="background:#f0f9ff;border-radius:8px;padding:16px;margin:24px 0;border-left:4px solid #0284c7;">
    <p style="font-size:14px;color:#0369a1;margin:0;">
      🎁 You start with <strong>5 free daily credits</strong> to explore!
    </p>
  </div>
  <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:24px 0;">
    <p style="font-size:14px;color:#374151;margin:0 0 8px;font-weight:600;">What can AYN help you with?</p>
    <ul style="font-size:14px;color:#6b7280;margin:0;padding-left:20px;line-height:1.8;">
      <li>🌍 World Intelligence & Geopolitical Analysis</li>
      <li>📈 Market Predictions & Business Signals</li>
      <li>💬 AI Chat with Memory</li>
      <li>🤖 Agent Society Simulations</li>
    </ul>
  </div>""")
    }


def password_reset_email(user_name: str, reset_url: str) -> dict:
    name = user_name or "there"
    return {
        "subject": "Reset Your AYN Password",
        "html": _html(f"""
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi {name},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">
    We received a request to reset your AYN password. Click the button below to set a new password.
  </p>
  <div style="text-align:center;margin:32px 0;">
    <a href="{reset_url}" style="background:#000;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:600;display:inline-block;">
      Reset Password
    </a>
  </div>
  <p style="font-size:14px;color:#999;text-align:center;">
    This link expires in 2 hours. If you didn't request this, you can safely ignore this email.
  </p>""")
    }


def subscription_created_email(user_name: str, plan_name: str, credits: int, next_billing: str) -> dict:
    name = user_name or "there"
    return {
        "subject": f"Welcome to AYN {plan_name}! 🚀",
        "html": _html(f"""
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi {name},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;">
    Your <strong>{plan_name}</strong> subscription is now active!
  </p>
  <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:24px 0;border-left:4px solid #16a34a;">
    <p style="font-size:14px;color:#15803d;margin:0 0 8px;font-weight:600;">Your plan includes:</p>
    <ul style="font-size:14px;color:#166534;margin:0;padding-left:20px;line-height:1.8;">
      <li>✅ {credits} messages per month</li>
      <li>✅ Full World Intelligence access</li>
      <li>✅ Priority AI processing</li>
    </ul>
  </div>
  <p style="font-size:14px;color:#6b7280;">Next billing date: <strong>{next_billing}</strong></p>""")
    }


def subscription_renewed_email(user_name: str, plan_name: str, amount: str, next_billing: str) -> dict:
    name = user_name or "there"
    return {
        "subject": f"AYN {plan_name} Renewed ✅",
        "html": _html(f"""
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi {name},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;">
    Your <strong>{plan_name}</strong> subscription has been renewed successfully.
  </p>
  <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:24px 0;">
    <p style="font-size:14px;color:#374151;margin:4px 0;">Amount charged: <strong>{amount}</strong></p>
    <p style="font-size:14px;color:#374151;margin:4px 0;">Next billing: <strong>{next_billing}</strong></p>
  </div>""")
    }


def subscription_canceled_email(user_name: str, plan_name: str, end_date: str) -> dict:
    name = user_name or "there"
    return {
        "subject": "AYN Subscription Canceled",
        "html": _html(f"""
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi {name},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;">
    Your <strong>{plan_name}</strong> subscription has been canceled.
    You'll continue to have access until <strong>{end_date}</strong>.
  </p>
  <div style="background:#fef2f2;border-radius:8px;padding:16px;margin:24px 0;border-left:4px solid #dc2626;">
    <p style="font-size:14px;color:#991b1b;margin:0;">
      After {end_date}, your account will revert to the free plan (5 messages/day).
    </p>
  </div>
  <div style="text-align:center;margin:32px 0;">
    <a href="https://aynn.io/dashboard/pricing" style="background:#000;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:600;display:inline-block;">
      Reactivate Plan
    </a>
  </div>""")
    }


def payment_receipt_email(user_name: str, amount: str, plan: str, date: str) -> dict:
    name = user_name or "there"
    return {
        "subject": f"AYN Payment Receipt — {amount}",
        "html": _html(f"""
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi {name},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;">
    Thank you for your payment. Here's your receipt.
  </p>
  <div style="background:#f9fafb;border-radius:8px;padding:20px;margin:24px 0;">
    <p style="font-size:14px;color:#374151;margin:4px 0;">Plan: <strong>{plan}</strong></p>
    <p style="font-size:14px;color:#374151;margin:4px 0;">Amount: <strong>{amount}</strong></p>
    <p style="font-size:14px;color:#374151;margin:4px 0;">Date: <strong>{date}</strong></p>
  </div>""")
    }


def credit_warning_email(user_name: str, credits_left: int, total_credits: int) -> dict:
    name = user_name or "there"
    pct = int((credits_left / total_credits) * 100) if total_credits > 0 else 0
    return {
        "subject": "⚠️ AYN Credits Running Low",
        "html": _html(f"""
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi {name},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;">
    You have <strong>{credits_left}</strong> of {total_credits} credits remaining ({pct}%).
  </p>
  <div style="text-align:center;margin:32px 0;">
    <a href="https://aynn.io/dashboard/pricing" style="background:#000;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:600;display:inline-block;">
      Top Up Credits
    </a>
  </div>""")
    }


def topup_receipt_email(user_name: str, credits: int, amount: str) -> dict:
    name = user_name or "there"
    return {
        "subject": f"AYN Credits Added — {credits} credits",
        "html": _html(f"""
  <p style="font-size:18px;color:#333;margin-bottom:16px;">Hi {name},</p>
  <p style="font-size:16px;color:#666;line-height:1.6;">
    <strong>{credits} bonus credits</strong> have been added to your account!
  </p>
  <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:24px 0;border-left:4px solid #16a34a;">
    <p style="font-size:14px;color:#15803d;margin:0;">
      ✅ {credits} credits added · {amount} charged · Credits never expire
    </p>
  </div>""")
    }


# ── Send function ──────────────────────────────────────────────────────────────

async def send_email(to: str, template: str, data: dict) -> bool:
    """Send an email using Resend. Returns True on success."""
    if not RESEND_API_KEY:
        log.warning(f"[email] RESEND_API_KEY not set — skipping email to {to}")
        return False

    try:
        # Build email content based on template type
        if template == "welcome":
            content = welcome_email(data.get("userName", ""))
        elif template == "password_reset":
            content = password_reset_email(data.get("userName", ""), data.get("resetUrl", ""))
        elif template == "subscription_created":
            content = subscription_created_email(
                data.get("userName", ""), data.get("planName", ""),
                data.get("credits", 0), data.get("nextBillingDate", "")
            )
        elif template == "subscription_renewed":
            content = subscription_renewed_email(
                data.get("userName", ""), data.get("planName", ""),
                data.get("amount", ""), data.get("nextBillingDate", "")
            )
        elif template == "subscription_canceled":
            content = subscription_canceled_email(
                data.get("userName", ""), data.get("planName", ""), data.get("endDate", "")
            )
        elif template == "payment_receipt":
            content = payment_receipt_email(
                data.get("userName", ""), data.get("amount", ""),
                data.get("plan", ""), data.get("date", "")
            )
        elif template == "credit_warning":
            content = credit_warning_email(
                data.get("userName", ""), data.get("creditsLeft", 0), data.get("totalCredits", 5)
            )
        elif template == "topup_receipt":
            content = topup_receipt_email(
                data.get("userName", ""), data.get("credits", 0), data.get("amount", "$10")
            )
        else:
            log.warning(f"[email] Unknown template: {template}")
            return False

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json={"from": FROM_EMAIL, "to": [to], "subject": content["subject"], "html": content["html"]},
                timeout=10,
            )
            if resp.status_code == 200:
                log.info(f"[email] ✅ Sent {template} to {to}")
                return True
            else:
                log.error(f"[email] ❌ Failed {template} to {to}: {resp.text}")
                return False

    except Exception as e:
        log.error(f"[email] Exception sending {template} to {to}: {e}")
        return False
