// v3.158.0 — a thin, single-purpose relay so the self-hosted VPS instance
// can keep using the same AI gateway/model this app was built and tuned
// against, without ever holding the real LOVABLE_API_KEY. Self-hosted
// sends the exact same request body it would send Lovable directly,
// authenticated with RELAY_SECRET (a value only this function and the
// self-hosted instance know, never the real Lovable credential). This
// function is the only thing that ever touches LOVABLE_API_KEY.
//
// v3.159.0 — this only ever relayed /v1/chat/completions. embedText()
// (lib/embeddings.ts) is a completely separate call path that was never
// wired to the relay at all and kept calling Lovable's gateway directly
// with a LOVABLE_API_KEY that doesn't exist on self-hosted, silently
// falling back to a hash embedding every time (confirmed live: every
// self-hosted candidate_index row carried embedding_model
// 'deterministic-v1', never the real model) — degrading semanticGapRecheck
// and employer_match's vector recall on self-hosted specifically, with no
// visible error anywhere. Routes on the request's own path suffix now, so
// one relay serves both endpoints; the existing chat-completions caller
// (lib/ai.ts) sends no suffix and is unaffected.
const CHAT_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const EMBEDDINGS_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/embeddings";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const relaySecret = Deno.env.get("RELAY_SECRET");
  if (!relaySecret) {
    return new Response(JSON.stringify({ error: "relay not configured" }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const auth = req.headers.get("authorization") || "";
  const provided = auth.replace(/^Bearer\s+/i, "");
  if (provided !== relaySecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured on relay" }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return new Response(JSON.stringify({ error: "could not read request body" }), {
      status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const targetUrl = new URL(req.url).pathname.endsWith("/embeddings") ? EMBEDDINGS_GATEWAY_URL : CHAT_GATEWAY_URL;

  try {
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: bodyText,
    });
    const respBody = await upstream.text();
    return new Response(respBody, {
      status: upstream.status,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `relay fetch failed: ${(e as Error).message}` }), {
      status: 502, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
