/**
 * AYN v2 — Gateway (ayn-gateway)
 * 
 * The single entry point for all AI requests.
 * 
 * Responsibilities:
 *   1. Validate JWT → extract user_id
 *   2. Validate request body (must have `messages` or `message`)
 *   3. Generate request_id for tracing
 *   4. Log request start
 *   5. Apply per-user rate limiting (30 req/min)
 *   6. Forward to ayn-unified (unchanged body + headers)
 *   7. Log completion with latency
 *   8. Return response to client, unchanged
 * 
 * CRITICAL: Does NOT modify ayn-unified. Additive only.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { validateOrigin, getAllowedOrigin } from "../_shared/originGuard.ts";
import { createRequestLog, generateRequestId } from "../_shared/requestLogger.ts";

// ── Rate limiter (in-memory, per-isolate) ─────────────────────────────────────
// Each Deno isolate is per-region, so this gives ~30 req/min per user per region.
// For global enforcement, move to a Redis-backed approach later.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 30;       // requests
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

// ── CORS ──────────────────────────────────────────────────────────────────────
function corsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(req),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-request-id",
    "Access-Control-Expose-Headers": "x-request-id, x-rate-limit-remaining",
    "Vary": "Origin",
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  const requestId = generateRequestId();
  const startedAt = Date.now();

  // ── 1. Origin check ─────────────────────────────────────────────────────────
  if (!validateOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden origin" }), {
      status: 403,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // ── 2. Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return new Response(JSON.stringify({ error: "Missing authorization token" }), {
      status: 401,
      headers: {
        ...corsHeaders(req),
        "Content-Type": "application/json",
        "x-request-id": requestId,
      },
    });
  }

  // Create Supabase client for logging + user validation
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Validate token and extract user_id
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401,
      headers: {
        ...corsHeaders(req),
        "Content-Type": "application/json",
        "x-request-id": requestId,
      },
    });
  }

  const userId = user.id;

  // ── 3. Body validation ───────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: {
        ...corsHeaders(req),
        "Content-Type": "application/json",
        "x-request-id": requestId,
      },
    });
  }

  // Must have at least a messages array or a message string
  const hasMessages = Array.isArray(body.messages) && body.messages.length > 0;
  const hasMessage = typeof body.message === "string" && body.message.trim().length > 0;
  if (!hasMessages && !hasMessage) {
    return new Response(
      JSON.stringify({ error: "Request must include 'messages' array or 'message' string" }),
      {
        status: 400,
        headers: {
          ...corsHeaders(req),
          "Content-Type": "application/json",
          "x-request-id": requestId,
        },
      }
    );
  }

  // ── 4. Rate limiting ─────────────────────────────────────────────────────────
  const { allowed, remaining } = checkRateLimit(userId);
  if (!allowed) {
    // Log the rate-limit hit (fire-and-forget)
    const log = createRequestLog({ request_id: requestId, user_id: userId, endpoint: "ayn-gateway" });
    void log.end(supabase, { status: "rate_limited" });

    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Max 30 requests per minute." }),
      {
        status: 429,
        headers: {
          ...corsHeaders(req),
          "Content-Type": "application/json",
          "x-request-id": requestId,
          "x-rate-limit-remaining": "0",
          "Retry-After": "60",
        },
      }
    );
  }

  // ── 5. Log request start ─────────────────────────────────────────────────────
  const log = createRequestLog({
    request_id: requestId,
    user_id: userId,
    endpoint: "ayn-gateway",
    metadata: {
      intent: body.intent ?? null,
      user_email: user.email,
      has_attachment: !!(body.fileUrl || (body.messages as any[])?.[0]?.file_url),
    },
  });

  // ── 6. Forward to ayn-unified ────────────────────────────────────────────────
  try {
    const forwardUrl = `${supabaseUrl}/functions/v1/ayn-unified`;

    const forwardResponse = await fetch(forwardUrl, {
      method: req.method,
      headers: {
        // Pass original auth token so ayn-unified can still validate if it wants
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        // Inject request ID for end-to-end tracing
        "x-request-id": requestId,
        // Mark as gateway-forwarded (ayn-unified can use this to skip redundant validation)
        "x-ayn-gateway": "1",
        // Forward client info headers if present
        ...(req.headers.get("x-client-info")
          ? { "x-client-info": req.headers.get("x-client-info")! }
          : {}),
      },
      body: JSON.stringify(body),
      // Stream: propagate signal for SSE support
    });

    const latency = Date.now() - startedAt;

    // Log completion (async, non-blocking)
    void log.end(supabase, {
      status: forwardResponse.ok ? "success" : "upstream_error",
      intent: body.intent as string | undefined,
      metadata: {
        upstream_status: forwardResponse.status,
        latency_ms: latency,
      },
    });

    // ── 7. Return upstream response UNCHANGED ─────────────────────────────────
    // Copy all upstream headers, inject our tracing headers
    const responseHeaders = new Headers(forwardResponse.headers);
    responseHeaders.set("x-request-id", requestId);
    responseHeaders.set("x-rate-limit-remaining", String(remaining));
    // Fix CORS: use gateway's validated origin (upstream may have * or wrong value)
    responseHeaders.set("Access-Control-Allow-Origin", getAllowedOrigin(req));
    responseHeaders.set("Vary", "Origin");

    return new Response(forwardResponse.body, {
      status: forwardResponse.status,
      headers: responseHeaders,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown upstream error";
    console.error(`[ayn-gateway] Upstream error for request ${requestId}:`, errorMsg);

    void log.error(supabase, errorMsg, {
      metadata: { latency_ms: Date.now() - startedAt },
    });

    return new Response(
      JSON.stringify({ error: "Gateway error. Please try again.", request_id: requestId }),
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
