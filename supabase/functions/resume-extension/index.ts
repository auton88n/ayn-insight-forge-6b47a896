// Resume Hub — Chrome extension endpoint.
// Accepts the extension token via `x-ayn-ext-token` header.
// Actions:
//   - bootstrap            -> { user, profile, resume }
//   - ingest_job { url, html?, text?, company?, title?, ... } -> { job_id }
//   - autofill { fields }  -> { values: [{ id, value }] }
//   - tailor { job_id }    -> { resume }  (returns tailored resume json for download)
//   - cover_letter { job_id, tone? } -> { body }

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

async function callAI(system: string, user: string, schema?: Record<string, unknown>) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const body: Record<string, unknown> = {
    model: "google/gemini-2.5-flash",
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  };
  if (schema) {
    body.tools = [{ type: "function", function: { name: "emit", description: "emit", parameters: schema } }];
    body.tool_choice = { type: "function", function: { name: "emit" } };
  }
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 429) throw new Error("AI rate-limited");
  if (r.status === 402) throw new Error("AI credits exhausted");
  if (!r.ok) throw new Error(`AI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  if (schema) return JSON.parse(d.choices[0].message.tool_calls[0].function.arguments);
  return d.choices[0].message.content as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const token = req.headers.get("x-ayn-ext-token");
    if (!token) return json({ error: "x-ayn-ext-token required" }, 401);
    const tokenHash = await sha256Hex(token);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: tok } = await admin
      .from("extension_tokens")
      .select("user_id, revoked_at, device_label")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (!tok) return json({ error: "Invalid token" }, 401);
    if (tok.revoked_at) return json({ error: "Token revoked" }, 401);
    const userId = tok.user_id as string;
    admin.from("extension_tokens").update({ last_used_at: new Date().toISOString() }).eq("token_hash", tokenHash).then(() => {});

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    // ------ bootstrap ------
    if (action === "bootstrap") {
      const [{ data: profile }, { data: resume }] = await Promise.all([
        admin.from("user_profile_data").select("*").eq("user_id", userId).maybeSingle(),
        admin.from("resumes").select("id, title, content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
      ]);
      return json({ user: { id: userId, device: tok.device_label }, profile, resume });
    }

    // ------ ingest_job ------
    if (action === "ingest_job") {
      let { source_url, html, text, company, title, location: loc, jd_text } = body as Record<string, string | undefined>;
      const raw = (text || html || "").slice(0, 25000);
      if (!company || !title || !jd_text) {
        try {
          const parsed = await callAI(
            "Extract job posting fields from raw page content. Return empty string for unknown fields.",
            `URL: ${source_url ?? ""}\n\nCONTENT:\n${raw}`,
            {
              type: "object",
              properties: { company: { type: "string" }, title: { type: "string" }, location: { type: "string" }, remote: { type: "boolean" }, jd_text: { type: "string" } },
              required: ["company", "title", "jd_text"],
            },
          ) as Record<string, string | boolean>;
          company = company || (parsed.company as string);
          title = title || (parsed.title as string);
          loc = loc || (parsed.location as string);
          jd_text = jd_text || (parsed.jd_text as string);
        } catch (e) { console.warn("ai parse failed", e); }
      }
      const urlPath = source_url ? source_url.split("?")[0] : "";
      const dedupe = await sha256Hex(`${(company ?? "").toLowerCase()}|${(title ?? "").toLowerCase()}|${urlPath}`);
      const { data: existing } = await admin.from("jobs").select("id").eq("user_id", userId).eq("dedupe_hash", dedupe).maybeSingle();
      if (existing) return json({ job_id: existing.id, deduped: true });
      const { data: inserted, error } = await admin.from("jobs").insert({
        user_id: userId, source: "extension", source_url, company: company || "Unknown", title: title || "Unknown role",
        location: loc, jd_text, jd_html: html?.slice(0, 100000), dedupe_hash: dedupe,
      }).select("id").single();
      if (error) throw error;
      return json({ job_id: inserted.id, deduped: false });
    }

    // ------ autofill ------
    if (action === "autofill") {
      const fields = body.fields as Array<{ id: string; label: string; type?: string; options?: string[] }>;
      if (!Array.isArray(fields)) return json({ error: "fields required" }, 400);
      const [{ data: profile }, { data: resume }] = await Promise.all([
        admin.from("user_profile_data").select("*").eq("user_id", userId).maybeSingle(),
        admin.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
      ]);
      const result = await callAI(
        "Given form fields and the user's profile + resume, return the best value for each. For select fields with options, pick from options. Leave value empty if unknown or sensitive (do NOT guess SSN, DOB year, salary).",
        JSON.stringify({ fields, profile, resume: resume?.content }).slice(0, 30000),
        {
          type: "object",
          properties: { values: { type: "array", items: { type: "object", properties: { id: { type: "string" }, value: { type: "string" } }, required: ["id", "value"] } } },
          required: ["values"],
        },
      );
      return json(result);
    }

    // ------ tailor ------
    if (action === "tailor") {
      const jobId = body.job_id as string;
      if (!jobId) return json({ error: "job_id required" }, 400);
      const [{ data: job }, { data: resume }] = await Promise.all([
        admin.from("jobs").select("id, jd_text, company, title").eq("user_id", userId).eq("id", jobId).maybeSingle(),
        admin.from("resumes").select("id, content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
      ]);
      if (!job || !resume) return json({ error: "Missing job or primary resume" }, 404);
      const tailored = await callAI(
        "Tailor the resume to maximize relevance to the JD. Preserve facts; reorder and rephrase. Return same schema.",
        JSON.stringify({ resume: resume.content, jdText: job.jd_text }).slice(0, 40000),
        {
          type: "object",
          properties: {
            basics: { type: "object" }, work: { type: "array" }, education: { type: "array" },
            skills: { type: "array" }, projects: { type: "array" }, certifications: { type: "array" },
          },
        },
      );
      await admin.from("resume_versions").insert({ user_id: userId, resume_id: resume.id, content: tailored, created_for_job_id: jobId });
      return json({ resume: tailored, company: job.company, title: job.title });
    }

    // ------ cover_letter ------
    if (action === "cover_letter") {
      const jobId = body.job_id as string;
      const tone = (body.tone as string) || "professional, warm";
      if (!jobId) return json({ error: "job_id required" }, 400);
      const [{ data: job }, { data: resume }] = await Promise.all([
        admin.from("jobs").select("id, jd_text, company").eq("user_id", userId).eq("id", jobId).maybeSingle(),
        admin.from("resumes").select("id, content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
      ]);
      if (!job || !resume) return json({ error: "Missing job or primary resume" }, 404);
      const text = await callAI(
        `Write a concise (under 280 words) cover letter. Tone: ${tone}. Address ${job.company}. No clichés.`,
        JSON.stringify({ resume: resume.content, jdText: job.jd_text }).slice(0, 30000),
      ) as string;
      await admin.from("cover_letters").insert({ user_id: userId, job_id: jobId, resume_id: resume.id, body: text, tone });
      return json({ body: text });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("ext error", e);
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
