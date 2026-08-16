// v3.34.0 — Stripe billing. Actions:
//   checkout     -> a Stripe Checkout subscription session for a plan key
//   portal       -> the Stripe customer portal, for the card on file
//   cancel       -> stop renewing at the end of the paid period
//   resume       -> undo a cancellation before the period ends
//   change_plan  -> move up or down between paid plans, or down to Free
//   invoices     -> billing history with a receipt link for each charge
// Plans and their Stripe price ids live in public.plans. Nothing is hardcoded here.

// v3.159.0 — npm: specifier, see stripe-webhook's identical comment.
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Stripe is not configured" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.slice(7);

    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userErr } = await anon.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user?.email) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "checkout");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = req.headers.get("origin") || "https://ayn.careers";

    // one customer per email
    const existing = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId = existing.data[0]?.id;

    if (action === "portal") {
      if (!customerId) return json({ error: "No billing account yet" }, 400);
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/pricing`,
      });
      return json({ url: portal.url });
    }

    // v3.30.0 — cancel from inside the product, not only by email or by the
    // hosted portal. Cancellation takes effect at the end of the period that
    // has already been paid for, and nothing is refunded.
    if (action === "cancel") {
      if (!customerId) return json({ error: "No billing account yet" }, 400);
      const subs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
      const sub = subs.data[0];
      if (!sub) return json({ error: "No active subscription to cancel" }, 400);
      const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
      return json({
        ok: true,
        cancel_at_period_end: updated.cancel_at_period_end,
        current_period_end: updated.items.data[0]?.current_period_end ?? null,
      });
    }

    if (action === "resume") {
      if (!customerId) return json({ error: "No billing account yet" }, 400);
      const subs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
      const sub = subs.data[0];
      if (!sub) return json({ error: "No subscription found" }, 400);
      await stripe.subscriptions.update(sub.id, { cancel_at_period_end: false });
      return json({ ok: true, cancel_at_period_end: false });
    }

    // v3.34.0 — the current state of the subscription, so the screen can tell
    // the difference between renewing, ending at the period end, and none.
    if (action === "state") {
      if (!customerId) return json({ subscription: null });
      const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 5 });
      const sub = subs.data.find((s) => s.status === "active" || s.status === "trialing" || s.status === "past_due");
      if (!sub) return json({ subscription: null });
      return json({
        subscription: {
          id: sub.id,
          status: sub.status,
          cancel_at_period_end: sub.cancel_at_period_end,
          current_period_end: sub.items.data[0]?.current_period_end ?? null,
          price_id: sub.items.data[0]?.price?.id ?? null,
        },
      });
    }

    // v3.34.0 — receipts. People need them, and the portal is a round trip.
    if (action === "invoices") {
      if (!customerId) return json({ invoices: [] });
      const list = await stripe.invoices.list({ customer: customerId, limit: 24 });
      return json({
        invoices: list.data.map((i) => ({
          id: i.id,
          number: i.number,
          status: i.status,
          amount_paid: i.amount_paid,
          amount_due: i.amount_due,
          currency: i.currency,
          created: i.created,
          hosted_invoice_url: i.hosted_invoice_url,
          invoice_pdf: i.invoice_pdf,
        })),
      });
    }

    // v3.34.0 — moving between plans in either direction. Down to Free means
    // stopping the renewal, which is the same thing as cancelling.
    if (action === "change_plan") {
      const key = String(body?.plan_key || "");
      if (!key) return json({ error: "plan_key is required" }, 400);
      if (!customerId) return json({ error: "No billing account yet" }, 400);

      const adminC = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const { data: target } = await adminC
        .from("plans").select("key, name, price_cents, stripe_price_id, active")
        .eq("key", key).maybeSingle();
      if (!target || !target.active) return json({ error: "Unknown plan" }, 400);

      const subs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
      const sub = subs.data[0];

      if (!target.stripe_price_id || target.price_cents === 0) {
        if (!sub) return json({ ok: true, moved_to: target.key, cancel_at_period_end: false });
        const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
        return json({
          ok: true, moved_to: target.key, cancel_at_period_end: true,
          current_period_end: updated.items.data[0]?.current_period_end ?? null,
        });
      }

      if (!sub) return json({ needs_checkout: true });

      const item = sub.items.data[0];
      const updated = await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: false,
        items: [{ id: item.id, price: target.stripe_price_id }],
        proration_behavior: "create_prorations",
        metadata: { user_id: user.id, plan_key: target.key },
      });
      return json({
        ok: true, moved_to: target.key,
        current_period_end: updated.items.data[0]?.current_period_end ?? null,
      });
    }


    const planKey = String(body?.plan_key || "");
    if (!planKey) return json({ error: "plan_key is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: plan } = await admin
      .from("plans")
      .select("key, name, audience, stripe_price_id, active")
      .eq("key", planKey)
      .maybeSingle();

    if (!plan || !plan.active) return json({ error: "Unknown plan" }, 400);
    if (!plan.stripe_price_id) return json({ error: "This plan has no price yet" }, 400);

    if (!customerId) {
      const created = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      customerId = created.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      client_reference_id: user.id,
      subscription_data: { metadata: { user_id: user.id, plan_key: plan.key } },
      metadata: { user_id: user.id, plan_key: plan.key },
      // v3.30.0 — cancellation terms are shown before payment, not only in the
      // Terms. Several consumer laws require this at the point of purchase.
      custom_text: {
        submit: {
          message:
            "This subscription renews automatically until you cancel. You can cancel at any time from Billing inside AYN. Cancellation takes effect at the end of the period you have already paid for, and you keep access until then. Fees already paid are not refunded.",
        },
      },
      success_url: `${origin}/subscription-success?plan=${encodeURIComponent(plan.key)}`,
      cancel_url: `${origin}/subscription-canceled`,
    });

    return json({ url: session.url });
  } catch (e) {
    console.error("[stripe-billing]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
