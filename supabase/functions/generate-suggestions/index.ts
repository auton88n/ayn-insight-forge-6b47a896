import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sanitizeUserPrompt, INJECTION_GUARD } from "../_shared/sanitizePrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lastUserMessage, lastAynResponse, mode } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ suggestions: getDefaultSuggestions(mode) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are AYN's suggestion engine that generates contextual follow-up suggestions.

IDENTITY (NON-NEGOTIABLE):
- You are AYN, built by the AYN Team.
- NEVER mention Google, Gemini, OpenAI, ChatGPT, Claude, Anthropic, Lovable, or any AI provider in suggestions.

Based on the conversation context, generate 3 short, highly relevant follow-up suggestions.

Rules:
- Each suggestion must be 2-5 words maximum
- Make them SPECIFIC to the response content, not generic
- For technical topics: suggest diving deeper, getting examples, or exploring alternatives
- For explanations: suggest clarifications, real-world applications, or related topics
- For creative content: suggest variations, expansions, or refinements
- Include an appropriate emoji that matches the topic
- Never suggest generic phrases like "Tell me more" - be specific to the content
- Consider the AI mode: ${mode || 'general'}

Examples for engineering/technical topics:
- "Show load diagram" 📊
- "Compare materials" ⚖️
- "Check safety factors" 🔒
- "Optimize the design" ⚡
- "Add code example" 💻

Examples for creative/writing topics:
- "Make it funnier" 😄
- "Add more drama" 🎭
- "Shorten this" ✂️
- "Try formal tone" 📜

Examples for general/explanatory topics:
- "Give real examples" 📝
- "Explain the benefits" ✨
- "What are the risks?" ⚠️
- "How to implement?" 🛠️

Return ONLY a JSON array with exactly 3 objects, each with "content" (string) and "emoji" (single emoji string).` + INJECTION_GUARD;

    // Increase context window to 1000 chars for better relevance
    const responseContext = lastAynResponse?.substring(0, 1000) || 'No response yet';
    
    const userPrompt = `User asked: "${sanitizeUserPrompt(lastUserMessage || '')}"

AYN responded: "${responseContext}"

Generate 3 contextual follow-up suggestions that are SPECIFIC to this response. Focus on what the user might logically want to know next based on the content above.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      if (response.status === 429) {
        console.warn("Rate limited by Lovable AI Gateway");
        return new Response(
          JSON.stringify({ 
            error: "Rate limited",
            suggestions: getDefaultSuggestions(mode) 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (response.status === 402) {
        console.warn("Payment required for Lovable AI Gateway");
        return new Response(
          JSON.stringify({ suggestions: getDefaultSuggestions(mode) }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.error("Lovable AI Gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ suggestions: getDefaultSuggestions(mode) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Parse the JSON response
    let suggestions;
    try {
      // Extract JSON array from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        suggestions = getDefaultSuggestions(mode);
      }
    } catch {
      console.error("Failed to parse suggestions:", content);
      suggestions = getDefaultSuggestions(mode);
    }

    // Validate and limit to 3 suggestions
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      suggestions = getDefaultSuggestions(mode);
    }
    
    suggestions = suggestions.slice(0, 3).map((s: any) => ({
      content: String(s.content || "Ask follow-up").substring(0, 30),
      emoji: String(s.emoji || "💡").substring(0, 2),
    }));

    return new Response(
      JSON.stringify({ suggestions }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-suggestions error:", error);
    return new Response(
      JSON.stringify({ suggestions: getDefaultSuggestions() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getDefaultSuggestions(mode?: string) {
  if (mode === 'engineering' || mode === 'duty') {
    return [
      { content: "Show calculations", emoji: "📐" },
      { content: "Check code specs", emoji: "📋" },
      { content: "Compare options", emoji: "⚖️" },
    ];
  }
  if (mode === 'lab' || mode === 'creative') {
    return [
      { content: "Make it longer", emoji: "✍️" },
      { content: "Try different style", emoji: "🎨" },
      { content: "Add more details", emoji: "✨" },
    ];
  }
  if (mode === 'search') {
    return [
      { content: "Find more sources", emoji: "🔍" },
      { content: "Recent news only", emoji: "📰" },
      { content: "Compare results", emoji: "📊" },
    ];
  }
  return [
    { content: "Give examples", emoji: "📝" },
    { content: "Explain simpler", emoji: "🔍" },
    { content: "What's next?", emoji: "➡️" },
  ];
}
