import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { activateMaintenanceMode } from "../_shared/maintenanceGuard.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

type Platform = 'instagram' | 'linkedin' | 'tiktok' | 'twitter' | 'facebook';

interface CaptionResult {
  platform: Platform;
  caption: string;
  hashtags: string[];
  emojis: string;
  characterCount: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, context, platforms, tone, industry } = await req.json() as { 
      imageUrl?: string;
      context: string; 
      platforms: Platform[];
      tone?: 'professional' | 'casual' | 'playful' | 'inspirational' | 'urgent';
      industry?: string;
    };
    
    if (!context && !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Either context or imageUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const platformSpecs = {
      instagram: { maxLength: 2200, hashtagCount: '20-30', style: 'Visual storytelling, emojis welcome, line breaks for readability' },
      linkedin: { maxLength: 3000, hashtagCount: '3-5', style: 'Professional, value-driven, thought leadership, minimal emojis' },
      tiktok: { maxLength: 150, hashtagCount: '3-5', style: 'Trendy, hook in first 3 words, Gen-Z friendly, viral potential' },
      twitter: { maxLength: 280, hashtagCount: '1-2', style: 'Punchy, conversational, thread-worthy hooks' },
      facebook: { maxLength: 500, hashtagCount: '2-3', style: 'Community-focused, shareable, questions welcome' },
    };

    const selectedPlatforms = platforms || ['instagram', 'linkedin', 'tiktok'];

    const systemPrompt = `You are a viral social media copywriter who has generated millions of impressions.

CONTEXT: ${context}
${industry ? `INDUSTRY: ${industry}` : ''}
TONE: ${tone || 'engaging'}

Generate platform-optimized captions that:
1. HOOK readers in the first line (pattern interrupt)
2. Provide VALUE or EMOTION
3. Include a clear CALL TO ACTION
4. Use platform-specific BEST PRACTICES

${selectedPlatforms.map(p => `
${p.toUpperCase()}:
- Max length: ${platformSpecs[p].maxLength} chars
- Hashtags: ${platformSpecs[p].hashtagCount}
- Style: ${platformSpecs[p].style}
`).join('\n')}

RESPOND WITH VALID JSON ONLY:
{
  "captions": [
    {
      "platform": "instagram|linkedin|tiktok|twitter|facebook",
      "caption": "The full caption text with line breaks as \\n",
      "hashtags": ["hashtag1", "hashtag2", ...],
      "emojis": "Key emojis used",
      "characterCount": number
    }
  ]
}`;

    console.log('Generating platform-specific captions...');

    const messages: any[] = [
      { role: "system", content: systemPrompt }
    ];

    if (imageUrl) {
      messages.push({ 
        role: "user", 
        content: [
          { type: "text", text: `Analyze this image and generate viral captions for: ${selectedPlatforms.join(', ')}` },
          { type: "image_url", image_url: { url: imageUrl, detail: "low" } }
        ]
      });
    } else {
      messages.push({ 
        role: "user", 
        content: `Generate viral captions for: ${selectedPlatforms.join(', ')}`
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        await activateMaintenanceMode(supabase, 'AI credits exhausted (402 from ai-caption-generator)');
        return new Response(
          JSON.stringify({ error: 'Service temporarily unavailable. Please try again later.' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from AI');
    }

    console.log('Caption generation response:', content);

    // Parse JSON from response
    let captionResult: { captions: CaptionResult[] };
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1]?.trim() || content.trim();
      captionResult = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Return fallback captions
      captionResult = {
        captions: selectedPlatforms.map(platform => ({
          platform,
          caption: context || "Share your story with us! ✨",
          hashtags: ['#trending', '#viral', '#explore'],
          emojis: '✨🔥💫',
          characterCount: (context || "Share your story with us! ✨").length
        }))
      };
    }

    console.log('Captions generated successfully');

    return new Response(
      JSON.stringify(captionResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-caption-generator function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
