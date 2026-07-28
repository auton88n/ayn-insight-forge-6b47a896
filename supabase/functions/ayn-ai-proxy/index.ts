import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateExtOrSession } from "../_shared/ext-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-source, x-ayn-ext-token",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticateExtOrSession(req);
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { messages, model, max_tokens, temperature } = body;

    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "google/gemini-2.0-flash-001",
        messages,
        max_tokens: max_tokens || 1000,
        temperature: temperature || 0.7,
        stream: false,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gateway error ${response.status}: ${err}`);
    }

    const data = await response.json();
    console.log(`[ayn-ai-proxy] user=${auth.userId} via=${auth.via} model=${model || "default"}`);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
