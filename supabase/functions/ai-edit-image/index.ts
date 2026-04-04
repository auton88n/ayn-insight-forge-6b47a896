import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

type EditAction = 'remove-background' | 'enhance' | 'style-transfer';

interface StyleTransferOptions {
  style: 'instagram' | 'cyberpunk' | 'vintage' | 'luxury' | 'minimal' | 'neon' | 'cinematic';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, action, options } = await req.json() as { 
      imageUrl: string; 
      action: EditAction; 
      options?: StyleTransferOptions;
    };
    
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Image URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let prompt = '';
    
    switch (action) {
      case 'remove-background':
        prompt = "Remove the background from this image completely. Keep only the main subject with a clean, transparent background. Make the edges clean and precise. Output the result as an image with the background removed.";
        break;
        
      case 'enhance':
        prompt = "Enhance this image professionally: improve color vibrancy, sharpen details, optimize contrast and exposure, reduce noise, and make it look like it was shot by a professional photographer. Keep the same composition but significantly elevate the overall quality. Output the enhanced image.";
        break;
        
      case 'style-transfer':
        const stylePrompts: Record<string, string> = {
          instagram: "Transform this image with a warm, high-contrast Instagram aesthetic. Apply slightly lifted shadows, warm golden tones, enhanced colors, and a soft vignette. Make it look Instagram-worthy and engagement-ready. Output the styled image.",
          cyberpunk: "Transform this image into a cyberpunk aesthetic with neon pink and cyan color grading, high contrast, dramatic lens flares, and a futuristic sci-fi atmosphere. Add glowing neon accents. Output the styled image.",
          vintage: "Transform this image with a vintage film aesthetic. Apply faded colors, slight sepia tones, film grain texture, and a nostalgic 70s/80s retro vibe. Output the styled image.",
          luxury: "Transform this image with an elegant luxury aesthetic. Apply rich deep blacks, gold/champagne accents, high contrast, and a premium sophisticated feel. Make it look expensive and refined. Output the styled image.",
          minimal: "Transform this image with a clean minimal aesthetic. Desaturate colors slightly, apply soft contrast, create a Scandinavian-inspired look with muted tones and clean lines. Output the styled image.",
          neon: "Transform this image with vibrant neon colors and glowing effects. Apply high saturation, dark backgrounds with electric colors, and an energetic nightlife atmosphere. Output the styled image.",
          cinematic: "Transform this image with cinematic color grading. Apply teal and orange tones, dramatic shadows, and a movie-like atmosphere similar to Hollywood films. Output the styled image.",
        };
        prompt = stylePrompts[options?.style || 'instagram'] || stylePrompts.instagram;
        break;
        
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action. Use: remove-background, enhance, or style-transfer' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    console.log(`Processing image with action: ${action}, prompt: ${prompt.substring(0, 100)}...`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          }
        ],
        modalities: ["image", "text"]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("AI response received:", JSON.stringify(data).substring(0, 200));
    
    // Extract the edited image from the response
    const editedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!editedImageUrl) {
      console.error("No image in response:", JSON.stringify(data));
      throw new Error("AI did not return an edited image");
    }

    console.log(`Image editing successful for action: ${action}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        editedImageUrl,
        action
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-edit-image function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
