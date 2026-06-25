// Ingest a job from the Chrome extension or manual form.
// Accepts: source_url, html?, text?, company?, title?, location?
// Uses AI to parse company/title/location/jd from raw HTML/text if missing.
// Deduplicates per user by sha256(company + title + url path).

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ayn-ext-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha256Hex(s: string) {
  const b = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", b);
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function callAI(system: string, user: string, schema: Record<string, unknown>) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      tools: [{ type: "function", function: { name: "emit", description: "emit", parameters: schema } }],
      tool_choice: { type: "function", function: { name: "emit" } },
    }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}`);
  const d = await r.json();
  return JSON.parse(d.choices[0].message.tool_calls[0].function.arguments);
}

async function resolveUser(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Path A: Supabase JWT (from dashboard)
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (jwt) {
    const sb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: u } = await sb.auth.getUser();
    if (u?.user) return { user_id: u.user.id, client: sb };
  }

  // Path B: extension token
  const extToken = req.headers.get("x-ayn-ext-token");
  if (extToken) {
    const tokenHash = await sha256Hex(extToken);
    const admin = createClient(supabaseUrl, serviceKey);
    const { data, error } = await admin
      .from("extension_tokens")
      .select("user_id, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error || !data || data.revoked_at) return null;
    await admin.from("extension_tokens").update({ last_used_at: new Date().toISOString() }).eq("token_hash", tokenHash);
    return { user_id: data.user_id as string, client: admin };
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await resolveUser(req);
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    let { source_url, html, text, company, title, location: loc, jd_text } = body as Record<string, string | undefined>;

    const raw = (text || html || "").slice(0, 25000);

    if (!company || !title || !jd_text) {
      try {
        const parsed = await callAI(
          "Extract job posting fields from raw page content. If a field is unknown, return empty string.",
          `URL: ${source_url ?? ""}\n\nCONTENT:\n${raw}`,
          {
            type: "object",
            properties: {
              company: { type: "string" },
              title: { type: "string" },
              location: { type: "string" },
              remote: { type: "boolean" },
              salary_min: { type: "integer" },
              salary_max: { type: "integer" },
              jd_text: { type: "string" },
            },
            required: ["company", "title", "jd_text"],
          },
        );
        company = company || parsed.company;
        title = title || parsed.title;
        loc = loc || parsed.location;
        jd_text = jd_text || parsed.jd_text;
        body.remote = body.remote ?? parsed.remote;
        body.salary_min = body.salary_min ?? parsed.salary_min;
        body.salary_max = body.salary_max ?? parsed.salary_max;
      } catch (e) {
        console.warn("AI parse failed", e);
      }
    }

    const urlPath = source_url ? source_url.split("?")[0] : "";
    const dedupe = await sha256Hex(`${(company ?? "").toLowerCase()}|${(title ?? "").toLowerCase()}|${urlPath}`);

    const insertRow = {
      user_id: auth.user_id,
      source: body.source || "extension",
      source_url,
      company: company || "Unknown",
      title: title || "Unknown role",
      location: loc,
      remote: body.remote ?? null,
      salary_min: body.salary_min ?? null,
      salary_max: body.salary_max ?? null,
      jd_text,
      jd_html: html?.slice(0, 100000),
      dedupe_hash: dedupe,
    };

    const { data: existing } = await auth.client
      .from("jobs")
      .select("id")
      .eq("user_id", auth.user_id)
      .eq("dedupe_hash", dedupe)
      .maybeSingle();

    if (existing) {
      return json({ job_id: existing.id, deduped: true });
    }

    const { data: inserted, error } = await auth.client.from("jobs").insert(insertRow).select("id").single();
    if (error) throw error;

    return json({ job_id: inserted.id, deduped: false });
  } catch (e) {
    console.error("ingest error", e);
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
