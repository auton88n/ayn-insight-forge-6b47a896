// admin-notifications — the real-time target of security_logs' own
// notify_security_alert() trigger (see that function's definition in the
// live database; it isn't tracked in this repo's migrations, only
// described here). The trigger fires on every INSERT into security_logs
// whose severity is 'high' or 'critical', gated on
// admin_notification_config.security_alert = true, and POSTs here.
//
// Rebuilt from scratch (Sept 2026 security review): a function under this
// exact name existed once, was deleted at some point (likely during the
// old admin-dashboard cleanup), and the trigger kept calling it anyway —
// pg_net.http_post fails silently on a 404, so every high/critical
// security event since then has attempted to alert and failed with no
// visible error anywhere. Confirmed live: the trigger is still enabled,
// the config flag is still on, the function was just gone.
//
// Auth: the trigger is being changed to send SUPABASE_SERVICE_ROLE_KEY as
// the bearer token (it previously sent the anon key, which is public by
// design — trusting it here would recreate the exact "unauthenticated
// alert-spam" shape just fixed in admin-pin-alert, just one layer removed).
// This function requires an exact match against the real service-role key,
// the same hardened pattern error-alert-check already uses.
import { corsHeaders as getCorsHeadersFn } from "../_shared/cors.ts";
import { sendBrandedEmail } from "../_shared/emailTemplate.ts";
import { buildSecurityAlertEmail } from "../_shared/adminAlertCopy.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.replace(/^Bearer\s+/i, "") !== serviceKey) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const {
      type = "security_alert",
      action = "unknown",
      severity = "high",
      created_at = new Date().toISOString(),
    } = body as {
      type?: string; action?: string; severity?: string;
      details?: Record<string, unknown>; ip_address?: string | null; created_at?: string;
    };

    const notifyEmail = Deno.env.get("NOTIFICATION_EMAIL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, serviceKey);

    let alerted = false;
    if (notifyEmail) {
      const { subject, html } = buildSecurityAlertEmail([{ action, severity, created_at }]);

      const sendResult = await sendBrandedEmail(notifyEmail, subject, html);
      alerted = sendResult.ok;
      await admin.from("email_logs").insert({
        email_type: "security_alert",
        recipient_email: notifyEmail,
        status: sendResult.ok ? "sent" : "failed",
        error_message: sendResult.ok ? null : sendResult.error,
        metadata: { action, severity, type },
      });
    }

    return new Response(JSON.stringify({ ok: true, alerted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("admin-notifications failed", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
