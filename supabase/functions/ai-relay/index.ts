// v3.158.0 — a thin, single-purpose relay so the self-hosted VPS instance
// can keep using the same AI gateway/model this app was built and tuned
// against, without ever holding the real LOVABLE_API_KEY. Self-hosted
// sends the exact same request body it would send Lovable directly,
// authenticated with RELAY_SECRET (a value only this function and the
// self-hosted instance know, never the real Lovable credential). This
// function is the only thing that ever touches LOVABLE_API_KEY.
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

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

  try {
    const upstream = await fetch(GATEWAY_URL, {
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
