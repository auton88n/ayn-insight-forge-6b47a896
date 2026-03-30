import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { activateMaintenanceMode } from "../_shared/maintenanceGuard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cache for generated keywords (in-memory, persists for function lifetime)
let cachedKeywords: Record<string, string[]> | null = null;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Return cached keywords if available
    if (cachedKeywords) {
      console.log('Returning cached emotion keywords');
      return new Response(JSON.stringify({ keywords: cachedKeywords, cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Generating emotion keywords via Lovable AI...');

    const prompt = `Generate a comprehensive list of keywords and phrases for detecting these emotions in text.
For each emotion, provide 50+ words/phrases including:
- Common expressions
- Slang and informal language
- Phrases (2-4 words)
- Arabic equivalents

Return as JSON with this exact structure:
{
  "happy": ["keyword1", "keyword2", ...],
  "sad": ["keyword1", "keyword2", ...],
  "mad": ["keyword1", "keyword2", ...],
  "frustrated": ["keyword1", "keyword2", ...],
  "excited": ["keyword1", "keyword2", ...],
  "curious": ["keyword1", "keyword2", ...],
  "bored": ["keyword1", "keyword2", ...]
}

Focus on natural language people actually use when expressing these emotions. Include both subtle and strong expressions.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert in emotional language analysis. Return only valid JSON, no markdown or explanation.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.', keywords: null }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        await activateMaintenanceMode(supabase, 'AI credits exhausted (402 from generate-emotion-keywords)');
        return new Response(JSON.stringify({ error: 'Service temporarily unavailable.', keywords: null }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse the JSON response
    let keywords: Record<string, string[]>;
    try {
      // Clean up potential markdown formatting
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      keywords = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse keyword response');
    }

    // Cache the result
    cachedKeywords = keywords;
    console.log('Generated and cached emotion keywords:', Object.keys(keywords));

    return new Response(JSON.stringify({ keywords, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error generating emotion keywords:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      // Return fallback minimal keywords on error
      keywords: null
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
