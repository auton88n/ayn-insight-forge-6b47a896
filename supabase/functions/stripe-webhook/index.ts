// v3.18.0 — Stripe webhook. Activates the plan, grants seeker credits on
// every paid period, and drops people back to free when a subscription ends.
// Public endpoint: no JWT, the Stripe signature is the auth.
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

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
    .select("key, audience, credits")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  return data;
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

        await admin.from("subscriptions").upsert({
          user_id: userId,
          plan_key: ended ? (plan?.audience === "employer" ? "employer_free" : "seeker_free") : (plan?.key ?? "seeker_free"),
          status: ended ? "canceled" : sub.status,
          current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : new Date().toISOString(),
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const priceId = invoice.lines.data[0]?.pricing?.price_details?.price ||
          (invoice.lines.data[0] as unknown as { price?: { id?: string } })?.price?.id || "";
        const plan = priceId ? await planFromPriceId(String(priceId)) : null;
        if (!plan || plan.audience !== "seeker" || !plan.credits) break;

        const userId = await userIdForCustomer(String(invoice.customer));
        if (!userId) break;

        await admin.rpc("credit_grant", {
          _user_id: userId,
          _amount: plan.credits,
          _reason: `${plan.key} period`,
          _ref: invoice.id,
        });
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
