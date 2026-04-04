import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      post_id,
      tweet_text,
      background_color = "white",
      header_text,
      accent_color = "#0EA5E9",
      include_logo = true,
      cta_text = "",
    } = await req.json();

    if (!post_id || !tweet_text) {
      return new Response(JSON.stringify({ error: "post_id and tweet_text are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract 3-4 word hook from the tweet text
    const words = (header_text || tweet_text).split(/\s+/);
    const displayText = words.length > 4 ? words.slice(0, 4).join(' ') : words.join(' ');

    // Build background instruction — black/white dominant
    const bgMap: Record<string, string> = {
      white: `Clean white background with maximum negative space. Premium, minimal, like a high-end print ad`,
      dark: `Pure black (#000000) background. Dramatic, high-contrast, premium feel. Like a luxury brand ad`,
      blue: `Deep black background with very subtle dark blue (#0a0a2e) tint. Moody and minimal`,
    };
    const bgInstruction = bgMap[background_color] || bgMap.dark;

    // Build logo instruction
    const logoInstruction = include_logo
      ? "Include a subtle AYN watermark text in the bottom-right corner, very small, in gray"
      : "Do NOT include any logo or watermark";

    // Build CTA instruction
    const ctaInstruction = cta_text
      ? `Include a small call-to-action: "${cta_text}" in a thin pill-shaped outline`
      : "";

    // Text color based on background
    const textColor = background_color === "white"
      ? "pure black (#000000) text"
      : "pure white (#FFFFFF) text";

    const imagePrompt = `Create a BOLD, scroll-stopping 1080x1080 social media image for AYN, an AI engineering platform.

CRITICAL DESIGN RULES:
- ${bgInstruction}
- The main text is ONLY 3-4 WORDS: "${displayText}"
- Text must be HUGE, BOLD, and the ONLY focal point — modern geometric sans-serif font
- Text color: ${textColor}
- Highlight exactly ONE word in electric blue (#0EA5E9) — this is the only color accent
- ${logoInstruction}
- BLACK AND WHITE DOMINANT. No gradients as main design. No busy backgrounds.
- Maximum negative space. The text IS the design.
- Think premium black-and-white print ad with one pop of blue
- NO small text, NO paragraphs, NO cluttered layouts, NO stock photo feel
- NO colorful backgrounds, NO rainbow gradients
${ctaInstruction ? `- ${ctaInstruction}` : ""}

Style reference: Apple keynote slides meets high-end fashion advertising — bold, minimal, monochrome with one blue accent.`;

    console.log("Generating bold image for post:", post_id, "bg:", background_color);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [{ role: "user", content: imagePrompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error("Image generation failed");
    }

    const aiData = await aiResponse.json();
    const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) throw new Error("No image generated");

    // Extract base64 data and upload to storage
    const base64Match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) throw new Error("Invalid image format returned");

    const imageFormat = base64Match[1];
    const base64Data = base64Match[2];
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const filename = `tweet-${post_id}-${Date.now()}.${imageFormat}`;

    console.log("Uploading image to storage:", filename, "size:", binaryData.length);

    const { error: uploadError } = await supabase.storage
      .from("generated-images")
      .upload(filename, binaryData, {
        contentType: `image/${imageFormat}`,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error("Failed to upload image");
    }

    const { data: publicUrlData } = supabase.storage
      .from("generated-images")
      .getPublicUrl(filename);

    const permanentUrl = publicUrlData.publicUrl;

    // Update the twitter_posts row
    const { error: updateError } = await supabase
      .from("twitter_posts")
      .update({ image_url: permanentUrl })
      .eq("id", post_id);

    if (updateError) {
      console.error("DB update error:", updateError);
      throw new Error("Failed to save image URL");
    }

    console.log("Image generated and saved:", permanentUrl);

    return new Response(
      JSON.stringify({ image_url: permanentUrl, filename }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("twitter-generate-image error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
