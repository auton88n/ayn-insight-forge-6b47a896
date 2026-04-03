/**
 * AYN v2 — AI Router (ai-router)
 * 
 * Receives a request, detects intent, and routes to the correct handler.
 * In Phase 1, ALL intents route to ayn-unified.
 * In Phase 2+, intents will route to dedicated services:
 *   chat        → ayn-chat (future)
 *   intelligence → ayn-intelligence (future)
 *   trading     → ayn-trading (future)
 *   document    → ayn-documents (future)
 *   engineering → ayn-engineering (future)
 * 
 * CRITICAL: ayn-unified is NOT modified. Router is additive only.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { validateOrigin, getAllowedOrigin } from "../_shared/originGuard.ts";
import { createRequestLog, generateRequestId } from "../_shared/requestLogger.ts";

// ── Intent detection ──────────────────────────────────────────────────────────
// Lightweight version of the intent system — no LLM call, pure heuristic.
// The "real" intent detection remains inside ayn-unified.
// This is used only for ROUTING and LOGGING decisions.

type Intent = "chat" | "intelligence" | "trading" | "document" | "engineering" | "image" | "search" | "files";

function detectRoutingIntent(body: Record<string, unknown>): Intent {
  // Explicit intent from body (already detected upstream, e.g. from ayn-gateway)
  if (typeof body.intent === "string") {
    const explicit = body.intent.toLowerCase() as Intent;
    if (["chat","intelligence","trading","document","engineering","image","search","files"].includes(explicit)) {
      return explicit;
    }
  }

  // Heuristic from last user message
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastMsg = messages.filter((m: any) => m.role === "user").slice(-1)[0];
  const text: string = typeof lastMsg?.content === "string"
    ? lastMsg.content.toLowerCase()
    : typeof body.message === "string" ? body.message.toLowerCase() : "";

  if (!text) return "chat";

  // Document generation
  if (/pdf|excel|spreadsheet|generate.*report|create.*document|make.*contract|nda/.test(text)) {
    return "document";
  }

  // Engineering
  if (/beam|column|foundation|rebar|load|structural|grading|dxf|engineering/.test(text)) {
    return "engineering";
  }

  // Trading/markets
  if (/trade|trading|buy.*coin|sell.*coin|entry|stop.?loss|take.?profit|crypto|btc|eth|chart/.test(text)) {
    return "trading";
  }

  // Intelligence/world events
  if (/market|geopolitical|war|conflict|sanctions|economy|gdp|inflation|oil|gold|sector|supply.chain/.test(text)) {
    return "intelligence";
  }

  // Image generation
  if (/^generate.*image|^create.*image|^draw |^image of |^picture of /.test(text)) {
    return "image";
  }

  // Web search
  if (/search for|look up|find.*online|what.*latest|current news|today.*news/.test(text)) {
    return "search";
  }

  // File analysis
  if (body.fileUrl || (lastMsg as any)?.file_url) {
    return "files";
  }

  return "chat";
}

// ── Handler registry ──────────────────────────────────────────────────────────
// Phase 1: ALL intents → ayn-unified.
// To migrate an intent to a dedicated service, update its entry here.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const INTENT_HANDLERS: Record<Intent, string> = {
  chat:          `${SUPABASE_URL}/functions/v1/ayn-unified`,
  intelligence:  `${SUPABASE_URL}/functions/v1/ayn-unified`,
  trading:       `${SUPABASE_URL}/functions/v1/ayn-unified`,
  document:      `${SUPABASE_URL}/functions/v1/ayn-unified`,
  engineering:   `${SUPABASE_URL}/functions/v1/ayn-unified`,
  image:         `${SUPABASE_URL}/functions/v1/ayn-unified`,
  search:        `${SUPABASE_URL}/functions/v1/ayn-unified`,
  files:         `${SUPABASE_URL}/functions/v1/ayn-unified`,
};

// ── CORS ──────────────────────────────────────────────────────────────────────
function corsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(req),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-request-id, x-ayn-gateway",
    "Access-Control-Expose-Headers": "x-request-id, x-routed-intent, x-routed-handler",
    "Vary": "Origin",
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  const requestId = req.headers.get("x-request-id") ?? generateRequestId();

  // Origin check
  if (!validateOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden origin" }), {
      status: 403,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Auth — read token from header (gateway already validated, but router also accepts direct calls)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return new Response(JSON.stringify({ error: "Missing authorization token" }), {
      status: 401,
      headers: { ...corsHeaders(req), "Content-Type": "application/json", "x-request-id": requestId },
    });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });

  // If request came through gateway, trust x-ayn-gateway header and skip re-validation
  // Otherwise validate token ourselves
  let userId: string | null = null;
  const fromGateway = req.headers.get("x-ayn-gateway") === "1";

  if (!fromGateway) {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json", "x-request-id": requestId },
      });
    }
    userId = user.id;
  } else {
    // Gateway already validated — extract user_id from JWT payload without re-calling auth
    try {
      const payloadB64 = token.split(".")[1];
      const payload = JSON.parse(atob(payloadB64));
      userId = payload.sub ?? null;
    } catch {
      // Shouldn't happen if gateway passed it through, but be safe
      userId = null;
    }
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json", "x-request-id": requestId },
    });
  }

  // ── Detect intent ─────────────────────────────────────────────────────────
  const intent = detectRoutingIntent(body);
  const handlerUrl = INTENT_HANDLERS[intent];

  // ── Log routing decision ──────────────────────────────────────────────────
  const log = createRequestLog({
    request_id: requestId,
    user_id: userId,
    endpoint: "ai-router",
    intent,
    metadata: {
      handler: handlerUrl,
      from_gateway: fromGateway,
      explicit_intent: body.intent ?? null,
    },
  });

  console.log(`[ai-router] ${requestId} intent=${intent} → ${handlerUrl}`);

  // ── Forward to handler ────────────────────────────────────────────────────
  try {
    const handlerResponse = await fetch(handlerUrl, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-request-id": requestId,
        "x-ayn-gateway": "1",     // Mark as gateway-forwarded
        "x-routed-intent": intent, // Tell downstream what intent was detected
        ...(req.headers.get("x-client-info")
          ? { "x-client-info": req.headers.get("x-client-info")! }
          : {}),
      },
      body: JSON.stringify({ ...body, intent }), // Inject detected intent into body for ayn-unified
    });

    // Log completion
    void log.end(supabase, {
      status: handlerResponse.ok ? "success" : "upstream_error",
      metadata: {
        upstream_status: handlerResponse.status,
        handler: handlerUrl,
      },
    });

    // Return upstream response, add routing metadata headers
    const responseHeaders = new Headers(handlerResponse.headers);
    responseHeaders.set("x-request-id", requestId);
    responseHeaders.set("x-routed-intent", intent);
    responseHeaders.set("x-routed-handler", "ayn-unified"); // Phase 1: always unified
    responseHeaders.set("Access-Control-Allow-Origin", getAllowedOrigin(req));
    responseHeaders.set("Vary", "Origin");

    return new Response(handlerResponse.body, {
      status: handlerResponse.status,
      headers: responseHeaders,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[ai-router] Error routing ${requestId} to ${handlerUrl}:`, errorMsg);

    void log.error(supabase, errorMsg);

    return new Response(
      JSON.stringify({ error: "Router error. Please try again.", request_id: requestId }),
      {
        status: 502,
        headers: {
          ...corsHeaders(req),
          "Content-Type": "application/json",
          "x-request-id": requestId,
        },
      }
    );
  }
});
