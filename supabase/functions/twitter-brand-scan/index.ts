import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SCREENSHOTONE_API_KEY = Deno.env.get("SCREENSHOTONE_API_KEY");
    if (!SCREENSHOTONE_API_KEY) throw new Error("SCREENSHOTONE_API_KEY not configured");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // 1. Capture screenshot via ScreenshotOne
    const screenshotParams = new URLSearchParams({
      access_key: SCREENSHOTONE_API_KEY,
      url,
      viewport_width: "1280",
      viewport_height: "900",
      format: "png",
      full_page: "false",
      image_quality: "80",
    });

    console.log("Capturing screenshot for:", url);
    const screenshotResp = await fetch(`https://api.screenshotone.com/take?${screenshotParams.toString()}`);
    if (!screenshotResp.ok) {
      const errText = await screenshotResp.text();
      console.error("Screenshot error:", screenshotResp.status, errText);
      throw new Error("Failed to capture website screenshot");
    }

    const imageBuffer = await screenshotResp.arrayBuffer();
    // Chunked base64 conversion to avoid call stack overflow
    const bytes = new Uint8Array(imageBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    const base64Image = btoa(binary);
    const imageDataUrl = `data:image/png;base64,${base64Image}`;

    console.log("Screenshot captured, sending to Gemini for brand analysis...");

    // 2. Send to Gemini vision for brand DNA extraction
    const analysisResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this website screenshot and extract the brand DNA. Return a JSON object with these exact keys:
{
  "primary_colors": ["#hex1", "#hex2", "#hex3"],
  "accent_colors": ["#hex1"],
  "typography_style": "serif | sans-serif | mono | mixed",
  "aesthetic": "minimal | bold | playful | corporate | luxury | techy | organic",
  "key_messaging": ["tagline or headline 1", "tagline 2"],
  "brand_personality": ["trait1", "trait2", "trait3"],
  "tone_of_voice": "professional | casual | authoritative | friendly | edgy",
  "visual_density": "sparse | balanced | dense",
  "dominant_imagery": "photography | illustration | abstract | icons | none"
}
Return ONLY the JSON, no markdown fences, no explanation.`,
              },
              {
                type: "image_url",
                image_url: { url: imageDataUrl },
              },
            ],
          },
        ],
      }),
    });

    if (!analysisResponse.ok) {
      if (analysisResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (analysisResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Brand analysis failed");
    }

    const analysisData = await analysisResponse.json();
    let brandDNA = analysisData.choices?.[0]?.message?.content || "";

    // Clean up any markdown fences
    brandDNA = brandDNA.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(brandDNA);
    } catch {
      console.error("Failed to parse brand DNA JSON:", brandDNA);
      parsed = { raw_analysis: brandDNA };
    }

    console.log("Brand DNA extracted for:", url);

    return new Response(
      JSON.stringify({ brand_dna: parsed, url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("twitter-brand-scan error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
