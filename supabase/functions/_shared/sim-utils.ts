// Shared helpers for the World Simulation v2 edge functions.
// All sim-* functions import from here to keep prompts, CORS and
// the AI Gateway client consistent.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const badRequest = (msg: string) => json({ error: msg }, 400);

export interface Persona {
  id: string;
  name: string;
  category: string;
  subcategory?: string | null;
  country?: string | null;
  region?: string | null;
  flag?: string | null;
  age?: number | null;
  gender?: string | null;
  ethnicity?: string | null;
  religion?: string | null;
  income_class?: string | null;
  occupation?: string | null;
  culture?: string | null;
  bio?: string | null;
  beliefs?: string | null;
  biases?: string | null;
  speaking_style?: string | null;
  layer?: number | null;
}

export interface PersonaState {
  persona_id: string;
  emotion: string;
  emotion_intensity: number;
  belief_score: number;
  recent_summary?: string | null;
}

// Compact one-liner used inside batched LLM prompts.
export const personaLine = (p: Persona, s?: PersonaState) => {
  const parts = [
    `${p.id}|${p.name}`,
    p.category + (p.subcategory ? `/${p.subcategory}` : ""),
    p.country ?? "",
    p.age ? `age ${p.age}` : "",
    p.gender ?? "",
    p.religion ?? "",
    p.income_class ?? "",
    p.occupation ?? "",
    p.culture ?? "",
    p.beliefs ? `beliefs:${p.beliefs}` : "",
    p.biases ? `biases:${p.biases}` : "",
    s ? `currently:${s.emotion}@${s.emotion_intensity}, belief:${s.belief_score}` : "",
  ].filter(Boolean);
  return `- ${parts.join(" | ")}`;
};

// Call Gemini (direct API or Lovable gateway) and return parsed JSON via tool calling.
// Priority: GEMINI_API_KEY (direct Google) → LOVABLE_API_KEY (gateway fallback)
export async function callGeminiJSON<T>(opts: {
  systemPrompt: string;
  userPrompt: string;
  toolName: string;
  toolDescription: string;
  parameters: Record<string, unknown>;
  model?: string;
}): Promise<T> {
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const apiKey = geminiKey || lovableKey;
  if (!apiKey) throw new Error("No LLM API key configured. Set GEMINI_API_KEY in Supabase Edge Function secrets.");

  const isDirectGemini = !!geminiKey;
  const model = opts.model ?? (isDirectGemini ? "gemini-2.5-flash" : "google/gemini-2.5-flash");
  const endpoint = isDirectGemini
    ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";

  const body = {
    model,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: opts.toolName,
          description: opts.toolDescription,
          parameters: opts.parameters,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: opts.toolName } },
  };

  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (r.status === 429) throw new Error("rate_limited");
  if (r.status === 402) throw new Error("payment_required");
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`gateway_error_${r.status}: ${t.slice(0, 200)}`);
  }

  const data = await r.json();
  const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
  const argsStr = tc?.function?.arguments;
  if (!argsStr) throw new Error("no_tool_call_in_response");
  try {
    return JSON.parse(argsStr) as T;
  } catch {
    throw new Error("bad_json_in_tool_call");
  }
}

// Auth helper for sim-* functions: returns the userId or throws.
export async function requireUser(req: Request): Promise<{ userId: string; authHeader: string }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("unauthorized");
  // We trust JWT verification handled by config.toml (verify_jwt=true).
  // Decode sub claim ourselves to avoid a roundtrip.
  const token = authHeader.slice(7);
  const part = token.split(".")[1];
  if (!part) throw new Error("unauthorized");
  try {
    const padded = part + "===".slice((part.length + 3) % 4);
    const jsonStr = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(jsonStr);
    if (!claims.sub) throw new Error("unauthorized");
    return { userId: claims.sub as string, authHeader };
  } catch {
    throw new Error("unauthorized");
  }
}
