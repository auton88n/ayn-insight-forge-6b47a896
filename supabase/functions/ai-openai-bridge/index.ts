// Internal-only bridge: lets a non-edge-function caller (the job-closure
// checker container, which holds only the service-role key, never the real
// AI credential) reach the same AI gateway resume-hub's own callAI() uses,
// without that credential ever leaving the edge runtime. Mirrors the exact
// AI_RELAY_URL / RELAY_SECRET vs LOVABLE_API_KEY fallback resume-hub's
// lib/ai.ts already established -- same credential, same gateway, just a
// second, minimal caller. Not yet in git (written directly on the VPS while
// local repo access was broken this session) -- needs a proper commit,
// including adding this directory to auto_deploy.sh's own explicit list,
// the moment that access is restored.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_RELAY_URL = Deno.env.get("AI_RELAY_URL");
const GATEWAY_URL = AI_RELAY_URL || "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!serviceKey || token !== serviceKey) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = AI_RELAY_URL ? Deno.env.get("RELAY_SECRET") : Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "gateway credential not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: body.model || DEFAULT_MODEL, messages, temperature: body.temperature }),
    });
    const text = await r.text();
    return new Response(text, {
      status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
