// v3.18.0 — Stripe webhook. Activates the plan, grants seeker credits on
// every paid period, and drops people back to free when a subscription ends.
// Public endpoint: no JWT, the Stripe signature is the auth.
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { wrapEmail, ctaButton, heading, para, receiptRow, escapeHtml, sendBrandedEmail } from "../_shared/emailTemplate.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

async function planFromPriceId(priceId: string) {
  const { data } = await admin
    .from("plans")
    .select("key, name, audience, credits")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  return data;
}

// v3.44.0 — a paid renewal used to grant credits with zero notification.
// Best effort only: a failed email must never undo a real charge or a
// real credit grant that already succeeded above.
async function sendReceiptEmail(userId: string, planName: string, creditsGranted: number, amountPaidCents: number, currency: string) {
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;
  if (!email) return;
  const amount = (amountPaidCents / 100).toLocaleString(undefined, {
    style: "currency", currency: (currency || "usd").toUpperCase(),
  });
  const html = wrapEmail(`
    ${heading("Payment received")}
    ${para(`Thanks for your payment. Here's what changed on your account.`)}
    <div style="margin:24px 0;">
      ${receiptRow("Plan", escapeHtml(planName))}
      ${receiptRow("Amount charged", amount)}
      ${receiptRow("Credits added", String(creditsGranted))}
    </div>
    ${para("This is an automated receipt. If anything looks wrong, contact support from your account.", { muted: true, marginTop: 32 })}
  `, undefined, ctaButton("https://ayn.careers/billing", "View billing"));
  const r = await sendBrandedEmail(email, "Your AYN payment receipt", html);
  if (!r.ok) console.error("[stripe-webhook] receipt email failed", r.error);

  // v3.47.0 — record every attempt so the admin panel's email log shows
  // whether this actually sent, not just that the code ran.
  await admin.from("email_logs").insert({
    user_id: userId,
    email_type: "payment_receipt",
    recipient_email: email,
    status: r.ok ? "sent" : "failed",
    error_message: r.ok ? null : r.error,
  }).then(({ error }) => { if (error) console.error("[stripe-webhook] email_logs insert failed", error.message); });
}

async function userIdForCustomer(customerId: string, fallback?: string | null) {
  if (fallback) return fallback;
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || (customer as { deleted?: boolean }).deleted) return null;
  const c = customer as Stripe.Customer;
  if (c.metadata?.user_id) return c.metadata.user_id;
  if (!c.email) return null;
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("email", c.email)
    .maybeSingle();
  return data?.id ?? null;
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !secret) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    const raw = await req.text();
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret);
  } catch (e) {
    console.error("[stripe-webhook] bad signature", (e as Error).message);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await userIdForCustomer(
          String(sub.customer),
          sub.metadata?.user_id ?? null,
        );
        if (!userId) break;

        const priceId = sub.items.data[0]?.price?.id || "";
        const plan = await planFromPriceId(priceId);
        const ended = event.type === "customer.subscription.deleted" ||
          ["canceled", "unpaid", "incomplete_expired"].includes(sub.status);

        const item = sub.items.data[0];
        const periodStart = item?.current_period_start ?? null;
        const periodEnd = item?.current_period_end ?? null;

        const { error: subUpsertError } = await admin.from("subscriptions").upsert({
          user_id: userId,
          plan_key: ended ? (plan?.audience === "employer" ? "employer_free" : "seeker_free") : (plan?.key ?? "seeker_free"),
          status: ended ? "canceled" : sub.status,
          current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : new Date().toISOString(),
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        // v3.129.0 — this write was previously unchecked; a failure here
        // left the account on its old plan state with no record anywhere
        // that the sync from Stripe's own event didn't take.
        if (subUpsertError) console.error("[stripe-webhook] subscriptions upsert failed", subUpsertError.message);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const priceId = invoice.lines.data[0]?.pricing?.price_details?.price ||
          (invoice.lines.data[0] as unknown as { price?: { id?: string } })?.price?.id || "";
        const plan = priceId ? await planFromPriceId(String(priceId)) : null;
        if (!plan || plan.audience !== "seeker") break;

        const userId = await userIdForCustomer(String(invoice.customer));
        if (!userId) break;

        // v3.29.0 — a per account override beats the plan. Null means fall back
        // to the plan, 0 is a real zero and grants nothing.
        const { data: override } = await admin
          .from("account_limit_overrides")
          .select("monthly_credits")
          .eq("user_id", userId)
          .maybeSingle();
        const overrideCredits = override?.monthly_credits;
        const amount = overrideCredits !== null && overrideCredits !== undefined
          ? overrideCredits
          : (plan.credits ?? 0);
        if (!amount) break;

        // v3.129.0 — Stripe's own delivery is documented at-least-once, and
        // this endpoint retries any non-2xx, so the same invoice.paid event
        // can arrive twice. credit_grant itself has no idempotency (its ref
        // convention is shared with admin_adjust_credits, which legitimately
        // reuses the same ref across multiple real grants — so uniqueness
        // can't be enforced inside credit_grant itself). Checked here
        // instead, scoped to this call site only: a Stripe invoice id is
        // globally unique, so a ledger row already carrying it means this
        // exact event was already processed.
        const { data: already } = await admin
          .from("credit_ledger")
          .select("id")
          .eq("user_id", userId)
          .eq("ref_id", invoice.id)
          .maybeSingle();

        if (!already) {
          const { error: grantError } = await admin.rpc("credit_grant", {
            _user_id: userId,
            _amount: amount,
            _reason: overrideCredits !== null && overrideCredits !== undefined
              ? `${plan.key} period, account override`
              : `${plan.key} period`,
            _ref: invoice.id,
          });

          if (grantError) {
            console.error("[stripe-webhook] credit_grant failed", grantError.message);
            break; // don't email a receipt for credits that were never actually granted
          }

          try {
            await sendReceiptEmail(userId, plan.name || plan.key, amount, invoice.amount_paid ?? 0, invoice.currency || "usd");
          } catch (e) {
            console.error("[stripe-webhook] receipt email threw", e);
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[stripe-webhook] handler failed", e);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
