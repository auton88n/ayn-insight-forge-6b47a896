import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

const PRODUCT_TO_TIER: Record<string, string> = {
  'prod_UAKDh9hg4JJGTm': 'starter',
  'prod_UAKEcB3fRQfSFX': 'pro',
  'prod_UAKEhupZ67M3vB': 'business',
};

const TIER_LIMITS: Record<string, { monthlyCredits: number; monthlyEngineering: number }> = {
  'free': { monthlyCredits: 5, monthlyEngineering: 1 },
  'starter': { monthlyCredits: 200, monthlyEngineering: 10 },
  'pro': { monthlyCredits: 1000, monthlyEngineering: 50 },
  'business': { monthlyCredits: 5000, monthlyEngineering: 100 },
};

const TIER_NAMES: Record<string, string> = {
  'free': 'Free', 'starter': 'Starter', 'pro': 'Pro', 'business': 'Business',
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

async function getUserByEmail(supabase: ReturnType<typeof createClient>, email: string) {
  const { data, error } = await supabase.auth.admin.listUsers({ filter: `email.eq.${email}` });
  if (error || !data?.users?.length) {
    const { data: allData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const user = allData?.users?.find((u: { email?: string }) => u.email === email);
    if (!user) {
      logStep('User lookup failed', { email });
      return null;
    }
    return user;
  }
  return data.users[0];
}

async function updateUserSubscription(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tier: string,
  subscriptionData: {
    stripe_subscription_id?: string | null;
    stripe_customer_id?: string;
    status?: string;
    current_period_end?: string;
  }
) {
  const limits = TIER_LIMITS[tier] || TIER_LIMITS['free'];

  const { error: subError } = await supabase
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      subscription_tier: tier,
      stripe_subscription_id: subscriptionData.stripe_subscription_id,
      stripe_customer_id: subscriptionData.stripe_customer_id,
      status: subscriptionData.status,
      current_period_end: subscriptionData.current_period_end,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (subError) {
    logStep('Failed to update user_subscriptions', { userId, error: subError.message });
  }

  // Fetch true limit state to preserve bonus credits and current usage
  const { data: existingLimits } = await supabase
    .from('user_ai_limits')
    .select('bonus_credits, current_daily_messages, current_monthly_messages, current_daily_engineering, current_monthly_engineering')
    .eq('user_id', userId)
    .single();

  const { error: limitsError } = await supabase
    .from('user_ai_limits')
    .upsert({
      user_id: userId,
      monthly_messages: limits.monthlyCredits,
      monthly_engineering: limits.monthlyEngineering,
      daily_messages: limits.monthlyCredits,
      daily_engineering: limits.monthlyEngineering,
      bonus_credits: existingLimits?.bonus_credits ?? 0,
      current_daily_messages: existingLimits?.current_daily_messages ?? 0,
      current_monthly_messages: existingLimits?.current_monthly_messages ?? 0,
      current_daily_engineering: existingLimits?.current_daily_engineering ?? 0,
      current_monthly_engineering: existingLimits?.current_monthly_engineering ?? 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (limitsError) {
    logStep('Failed to update user_ai_limits', { userId, error: limitsError.message });
  }

  return { subError, limitsError };
}

function sendEmailNotification(
  emailType: string, to: string, data: Record<string, unknown>, userId?: string
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  
  fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ to, emailType, data, userId }),
  }).then(r => r.json()).then(result => {
    logStep('Email sent', { emailType, to, result });
  }).catch(err => {
    logStep('Email failed', { emailType, to, error: String(err) });
  });
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: currency.toUpperCase(),
  }).format(amount / 100);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "No signature" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.text();
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
      logStep("Signature verified", { eventType: event.type, eventId: event.id });
    } catch (err) {
      logStep("Signature verification failed", { error: String(err) });
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep(`Subscription ${event.type.split('.')[2]}`, { subscriptionId: subscription.id });

        const customer = await stripe.customers.retrieve(subscription.customer as string);
        if (customer.deleted || !customer.email) break;

        const user = await getUserByEmail(supabase, customer.email);
        if (!user) break;

        const productId = subscription.items.data[0]?.price?.product as string;
        const tier = PRODUCT_TO_TIER[productId] || 'free';

        await updateUserSubscription(supabase, user.id, tier, {
          stripe_subscription_id: subscription.id,
          stripe_customer_id: customer.id,
          status: subscription.status,
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        });

        if (event.type === "customer.subscription.created") {
          sendEmailNotification('subscription_created', customer.email, {
            userName: user.user_metadata?.first_name || 'there',
            planName: TIER_NAMES[tier],
            credits: TIER_LIMITS[tier]?.monthlyCredits || 5,
            nextBillingDate: formatDate(subscription.current_period_end),
          }, user.id);
        }

        logStep("Processed", { userId: user.id, tier });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string);
        if (customer.deleted || !customer.email) break;

        const user = await getUserByEmail(supabase, customer.email);
        if (!user) break;

        const productId = subscription.items.data[0]?.price?.product as string;
        const canceledTier = PRODUCT_TO_TIER[productId] || 'starter';

        await updateUserSubscription(supabase, user.id, 'free', {
          stripe_subscription_id: null,
          stripe_customer_id: customer.id,
          status: 'canceled',
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        });

        sendEmailNotification('subscription_canceled', customer.email, {
          userName: user.user_metadata?.first_name || 'there',
          planName: TIER_NAMES[canceledTier],
          endDate: formatDate(subscription.current_period_end),
        }, user.id);

        logStep("Subscription canceled", { userId: user.id });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.billing_reason === 'subscription_create') break;

        const customer = await stripe.customers.retrieve(invoice.customer as string);
        if (customer.deleted || !customer.email) break;

        const user = await getUserByEmail(supabase, customer.email);
        if (!user) break;

        const subscriptionId = invoice.subscription as string;
        if (!subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const productId = subscription.items.data[0]?.price?.product as string;
        const tier = PRODUCT_TO_TIER[productId] || 'free';
        const limits = TIER_LIMITS[tier];

        // Reset usage on renewal, but preserve bonus credits!
        await supabase.from('user_ai_limits').update({
          current_monthly_messages: 0,
          current_monthly_engineering: 0,
          monthly_messages: limits.monthlyCredits,
          monthly_engineering: limits.monthlyEngineering,
          monthly_reset_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id);

        sendEmailNotification('subscription_renewed', customer.email, {
          userName: user.user_metadata?.first_name || 'there',
          planName: TIER_NAMES[tier],
          amount: formatAmount(invoice.amount_paid, invoice.currency),
          nextBillingDate: formatDate(subscription.current_period_end),
        }, user.id);

        logStep("Invoice paid processed", { userId: user.id, tier });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customer = await stripe.customers.retrieve(invoice.customer as string);
        if (customer.deleted || !customer.email) break;

        const user = await getUserByEmail(supabase, customer.email);
        if (!user) break;

        await supabase.from('user_subscriptions').update({
          status: 'past_due', updated_at: new Date().toISOString(),
        }).eq('user_id', user.id);

        logStep("Payment failed processed", { userId: user.id });
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'payment') break; // We only care about one-time payments here

        const userId = session.metadata?.user_id;
        if (!userId) {
          logStep("Checkout completed but no user_id in metadata");
          break;
        }

        const type = session.metadata?.type;
        if (type === 'topup') {
          const creditsToAdd = parseInt(session.metadata?.credits || '0', 10);
          if (creditsToAdd > 0) {
            logStep(`Adding ${creditsToAdd} top-up credits to user`, { userId });
            
            const { error: topupError } = await supabase.rpc('add_bonus_credits', {
              p_user_id: userId,
              p_amount: creditsToAdd,
              p_reason: 'Stripe one-time top-up purchase',
              p_gift_type: 'top_up_purchase'
            });

            if (topupError) {
              logStep("Error adding top-up credits", { userId, error: topupError.message });
            } else {
              logStep("Top-up credits added successfully", { userId });
            }
          }
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    logStep("ERROR", { error: String(error) });
    return new Response(JSON.stringify({ received: true, error: String(error) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
