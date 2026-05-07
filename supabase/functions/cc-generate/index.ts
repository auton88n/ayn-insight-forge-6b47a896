import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEMS: Record<string, string> = {
  manager_report: `You are an executive operations analyst. From the team updates given, write a concise Manager Report in markdown with these sections:
**Highlights** (3-5 bullets), **Blockers** (bullets, if any), **KPIs / Signals** (bullets), **Next Week** (bullets). Be specific, no fluff, no em dashes.`,
  ceo_brief: `You are a chief of staff. Write a 1-page CEO Brief in markdown:
**Headline** (one line), **Top 3 Wins**, **Top 3 Risks**, **Single Ask**. Plain English, board-ready, no fluff, no em dashes.`,
  action_plan: `You are a senior strategist. Produce an Action Plan in markdown:
**Objective**, **5 Steps** (numbered, each with suggested Owner and Deadline in days), **KPI** (one measurable). No fluff, no em dashes.`,
  qa: `You are an analyst answering a question grounded ONLY in the provided team updates. If the answer is not in the updates, say "Not in current updates." Be concise (4-8 sentences max). No em dashes.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { kind, updates, question } = await req.json();
    const system = SYSTEMS[kind];
    if (!system) return new Response(JSON.stringify({ error: "invalid kind" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const updatesText = (updates || []).slice(0, 50).map((u: any, i: number) =>
      `${i + 1}. [${u.department || "general"} | ${u.impact || "medium"}] ${u.author || "anon"}: ${u.text}`
    ).join("\n") || "(no updates yet)";

    const userMsg = kind === "qa"
      ? `TEAM UPDATES:\n${updatesText}\n\nQUESTION: ${question || ""}`
      : `TEAM UPDATES:\n${updatesText}\n\nGenerate the document now.`;

    const KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!KEY) throw new Error("LOVABLE_API_KEY missing");

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, { role: "user", content: userMsg }],
        stream: true,
      }),
    });

    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "Add credits to your AI workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: `gateway ${r.status}: ${t}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(r.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
