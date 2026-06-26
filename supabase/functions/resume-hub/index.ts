// Resume Hub — unified AI edge function.
// Actions: parse, rewrite, tailor, match, cover-letter, autofill
// Auth: requires the caller's Supabase JWT (Authorization: Bearer ...).
// All DB writes use the caller's JWT so RLS enforces per-user isolation.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";
const QUALITY_MODEL = "google/gemini-2.5-pro";

async function callAI(opts: {
  model?: string;
  system: string;
  user: string | Array<unknown>;
  toolName?: string;
  toolSchema?: Record<string, unknown>;
}): Promise<{ text: string; structured?: unknown }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const body: Record<string, unknown> = {
    model: opts.model ?? DEFAULT_MODEL,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  };
  if (opts.toolName && opts.toolSchema) {
    body.tools = [{
      type: "function",
      function: { name: opts.toolName, description: opts.toolName, parameters: opts.toolSchema },
    }];
    body.tool_choice = { type: "function", function: { name: opts.toolName } };
  }

  const r = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 429) throw new Error("AI rate limit. Try again in a minute.");
  if (r.status === 402) throw new Error("AI credits exhausted. Add credits in workspace billing.");
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`AI error ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  const msg = data?.choices?.[0]?.message;
  const tc = msg?.tool_calls?.[0]?.function?.arguments;
  if (tc) {
    return { text: "", structured: JSON.parse(tc) };
  }
  return { text: msg?.content ?? "" };
}

const RESUME_SCHEMA = {
  type: "object",
  properties: {
    basics: {
      type: "object",
      properties: {
        name: { type: "string" },
        title: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        location: { type: "string" },
        summary: { type: "string" },
        links: { type: "array", items: { type: "object", properties: { label: { type: "string" }, url: { type: "string" } }, required: ["label", "url"] } },
      },
      required: ["name", "summary"],
    },
    work: {
      type: "array",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          title: { type: "string" },
          location: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
        },
        required: ["company", "title", "bullets"],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: { school: { type: "string" }, degree: { type: "string" }, field: { type: "string" }, start: { type: "string" }, end: { type: "string" } },
        required: ["school"],
      },
    },
    skills: { type: "array", items: { type: "string" } },
    projects: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, url: { type: "string" } }, required: ["name"] },
    },
    certifications: { type: "array", items: { type: "string" } },
  },
  required: ["basics", "work", "skills"],
};

async function sha256Hex(s: string) {
  const b = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", b);
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

const EXT_ACTIONS = new Set([
  "ext_bootstrap", "ext_ingest_job", "ext_autofill", "ext_tailor",
  "ext_cover_letter", "ext_cover_letter_text",
  "ext_job_score", "ext_suggest_roles", "ext_find_contacts",
  "ext_save_application", "ext_get_applications", "ext_update_application",
  "ext_download_resume_text", "smart_tailor",
]);

// Public link-flow actions (no auth required for start/poll)
const LINK_PUBLIC_ACTIONS = new Set(["link_start", "link_poll"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json();
    const { action, ...payload } = body;

    // ============ PUBLIC LINK FLOW (no auth) ============
    // Extension generates a random code, opens /extension/approve?code=...
    // in a tab, polls link_poll until status=approved, then receives the token.
    if (typeof action === "string" && LINK_PUBLIC_ACTIONS.has(action)) {
      const admin = createClient(supabaseUrl, serviceKey);

      if (action === "link_start") {
        const { device_label } = payload as { device_label?: string };
        const bytes = new Uint8Array(24);
        crypto.getRandomValues(bytes);
        const code = "ayn_link_" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
        const { error } = await admin.from("extension_link_codes").insert({
          code, device_label: device_label || "Chrome", status: "pending",
        });
        if (error) return json({ error: error.message }, 500);
        return json({ code, expires_in: 300 });
      }

      if (action === "link_poll") {
        const { code } = payload as { code?: string };
        if (!code) return json({ error: "code required" }, 400);
        const { data, error } = await admin.from("extension_link_codes")
          .select("status, token, expires_at").eq("code", code).maybeSingle();
        if (error || !data) return json({ status: "not_found" }, 404);
        if (new Date(data.expires_at).getTime() < Date.now()) {
          await admin.from("extension_link_codes").delete().eq("code", code);
          return json({ status: "expired" });
        }
        if (data.status === "approved" && data.token) {
          // Consume — delete after returning token
          await admin.from("extension_link_codes").delete().eq("code", code);
          return json({ status: "approved", token: data.token });
        }
        return json({ status: data.status || "pending" });
      }
    }

    // ============ EXTENSION-AUTH ACTIONS (x-ayn-ext-token) ============
    if (typeof action === "string" && EXT_ACTIONS.has(action)) {
      const token = req.headers.get("x-ayn-ext-token");
      if (!token) return json({ error: "x-ayn-ext-token required" }, 401);
      const tokenHash = await sha256Hex(token);
      const admin = createClient(supabaseUrl, serviceKey);
      const { data: tok } = await admin
        .from("extension_tokens")
        .select("user_id, revoked_at, device_label")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (!tok) return json({ error: "Invalid token" }, 401);
      if (tok.revoked_at) return json({ error: "Token revoked" }, 401);
      const userId = tok.user_id as string;
      admin.from("extension_tokens").update({ last_used_at: new Date().toISOString() }).eq("token_hash", tokenHash).then(() => {});

      if (action === "ext_bootstrap") {
        const [{ data: profile }, { data: resume }, authUserRes] = await Promise.all([
          admin.from("user_profile_data").select("*").eq("user_id", userId).maybeSingle(),
          admin.from("resumes").select("id, title, content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
          admin.auth.admin.getUserById(userId),
        ]);
        const authEmail = authUserRes?.data?.user?.email || null;
        return json({ user: { id: userId, email: authEmail, device: tok.device_label }, profile, resume });
      }

      if (action === "ext_ingest_job") {
        let { source_url, html, text, company, title, location: loc, jd_text } = payload as Record<string, string | undefined>;
        const raw = (text || html || "").slice(0, 25000);
        if (!company || !title || !jd_text) {
          try {
            const parsed = await callAI({
              system: "Extract job posting fields from raw page content. Return empty string for unknown fields.",
              user: `URL: ${source_url ?? ""}\n\nCONTENT:\n${raw}`,
              toolName: "emit_job",
              toolSchema: {
                type: "object",
                properties: { company: { type: "string" }, title: { type: "string" }, location: { type: "string" }, jd_text: { type: "string" } },
                required: ["company", "title", "jd_text"],
              },
            });
            const p = parsed.structured as Record<string, string>;
            company = company || p.company;
            title = title || p.title;
            loc = loc || p.location;
            jd_text = jd_text || p.jd_text;
          } catch (e) { console.warn("ext parse failed", e); }
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

      if (action === "ext_autofill") {
        const { fields, jobText } = payload as { fields?: unknown; jobText?: string };
        if (!Array.isArray(fields)) return json({ error: "fields required" }, 400);
        if (fields.length === 0) return json({ values: [], meta: { reason: "no_form_fields" } });
        const [{ data: profile }, { data: resume }] = await Promise.all([
          admin.from("user_profile_data").select("*").eq("user_id", userId).maybeSingle(),
          admin.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
        ]);

        const profileFieldsAvailable = profile
          ? Object.entries(profile).filter(([_, v]) => v != null && v !== "" && (Array.isArray(v) ? v.length : true)).map(([k]) => k)
          : [];
        const hasAnyData = profileFieldsAvailable.length > 0 || !!resume?.content;

        // Derive merged basics so the AI always has name/email/phone even when profile is empty
        const rb = (resume?.content as { basics?: Record<string, unknown>; work?: unknown[]; skills?: unknown[]; education?: unknown[] } | null) || null;
        const basics = (rb?.basics || {}) as Record<string, string>;
        const [firstFromResume, ...restFromResume] = (basics.name || "").trim().split(/\s+/);
        const merged = {
          first_name: profile?.legal_first_name || firstFromResume || "",
          last_name: profile?.legal_last_name || restFromResume.join(" ") || "",
          full_name: [profile?.legal_first_name, profile?.legal_last_name].filter(Boolean).join(" ") || basics.name || "",
          email: profile?.email || basics.email || "",
          phone: profile?.phone || basics.phone || "",
          location: profile?.city || basics.location || "",
          linkedin_url: profile?.linkedin_url || (basics.links as unknown as Array<{ label: string; url: string }>)?.find?.(l => /linkedin/i.test(l?.label || l?.url || ""))?.url || "",
          portfolio_url: profile?.portfolio_url || (basics.links as unknown as Array<{ label: string; url: string }>)?.find?.(l => !/linkedin/i.test(l?.label || l?.url || ""))?.url || "",
          summary: basics.summary || "",
        };

        const r = await callAI({
          system: `You are filling out a job application form for a real candidate. Use ONLY the candidate's profile, resume basics, and the job description provided.

IT IS COMPLETELY FINE IF THE PROFILE IS PARTIAL. Fill every field you can from the available data — including basic identity fields (name, email, phone) which are almost always present in either the profile OR the resume basics. Prefer profile values when present; otherwise fall back to resume basics (basics.name, basics.email, basics.phone, basics.location, basics.links). NEVER refuse to fill the form because the profile is partial — partial answers are far better than no answers.

Rules:
- Only use real data — never invent names, phone numbers, addresses, eligibility, or experience.
- Always fill name / first name / last name / email / phone / city / LinkedIn URL when ANY source (profile, mergedBasics, or resume.basics) contains them.
- Map common application fields from profile (legal_first_name, legal_last_name, email, phone, address, city, province_state, postal_code, country, linkedin_url, portfolio_url, work_authorization, default_answers.salary_expectation, default_answers.about_me, default_answers.why_this_role, default_answers.criminal_record, equity flags).
- For "Tell us about yourself" / "Why this role" use default_answers.about_me / default_answers.why_this_role (or resume.basics.summary lightly adapted) — if no source, leave empty.
- For select / radio fields, pick the closest matching option from the provided options list when you have a clear answer; otherwise leave empty.
- Skip and leave empty: SIN/SSN, full birth date, bank info, passwords, anything not in any source.
- Return one entry per field id you confidently filled. Omit fields you are leaving empty.`,
          user: JSON.stringify({
            fields,
            mergedBasics: merged,
            profile,
            resume: resume?.content,
            jobDescription: (jobText || "").slice(0, 3000),
          }).slice(0, 35000),
          toolName: "emit_autofill",
          toolSchema: {
            type: "object",
            properties: { values: { type: "array", items: { type: "object", properties: { id: { type: "string" }, value: { type: "string" } }, required: ["id", "value"] } } },
            required: ["values"],
          },
        });
        const out = (r.structured as { values?: Array<{ id: string; value: string }> }) || { values: [] };
        return json({
          values: out.values || [],
          meta: {
            jobDetected: !!(jobText && jobText.length > 80),
            profileFieldsAvailable: profileFieldsAvailable.length,
            hasResume: !!resume?.content,
            hasAnyData,
          },
        });
      }

      if (action === "ext_tailor") {
        const jobId = (payload as { job_id?: string }).job_id;
        if (!jobId) return json({ error: "job_id required" }, 400);
        const [{ data: job }, { data: resume }] = await Promise.all([
          admin.from("jobs").select("id, jd_text, company, title").eq("user_id", userId).eq("id", jobId).maybeSingle(),
          admin.from("resumes").select("id, content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
        ]);
        if (!job || !resume) return json({ error: "Missing job or primary resume" }, 404);
        const r = await callAI({
          model: QUALITY_MODEL,
          system: "Tailor the resume to maximize relevance to the JD. Preserve facts; reorder and rephrase. Return same schema.",
          user: JSON.stringify({ resume: resume.content, jdText: job.jd_text }).slice(0, 40000),
          toolName: "emit_resume",
          toolSchema: RESUME_SCHEMA,
        });
        await admin.from("resume_versions").insert({ user_id: userId, resume_id: resume.id, content: r.structured, created_for_job_id: jobId });
        return json({ resume: r.structured, company: job.company, title: job.title });
      }

      if (action === "ext_cover_letter") {
        const jobId = (payload as { job_id?: string }).job_id;
        const tone = (payload as { tone?: string }).tone || "professional, warm";
        if (!jobId) return json({ error: "job_id required" }, 400);
        const [{ data: job }, { data: resume }] = await Promise.all([
          admin.from("jobs").select("id, jd_text, company").eq("user_id", userId).eq("id", jobId).maybeSingle(),
          admin.from("resumes").select("id, content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
        ]);
        if (!job || !resume) return json({ error: "Missing job or primary resume" }, 404);
        const r = await callAI({
          system: `Write a concise (under 280 words) cover letter. Tone: ${tone}. Address ${job.company}. No clichés.`,
          user: JSON.stringify({ resume: resume.content, jdText: job.jd_text }).slice(0, 30000),
        });
        await admin.from("cover_letters").insert({ user_id: userId, job_id: jobId, resume_id: resume.id, body: r.text, tone });
        return json({ body: r.text });
      }

      // ext_job_score: score a job snippet against the user's resume quickly
      // Returns score 1-10, matchLabel, and 3 key reasons
      if (action === "ext_job_score") {
        const { jobTitle, company, jobSnippet } = payload as { jobTitle?: string; company?: string; jobSnippet?: string };
        if (!jobSnippet) return json({ score: 0, matchLabel: "Unknown", reasons: [], salaryEstimate: "" });
        const { data: resume } = await admin.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle();
        if (!resume?.content) return json({ score: 0, matchLabel: "No resume", reasons: [], salaryEstimate: "" });

        const r = await callAI({
          system: `You are a fast job-resume matcher. Given a job snippet and resume, score the match and estimate salary.
Return ONLY valid JSON, no code fences:
{ "score": <integer 1-10>, "matchLabel": "<Poor|Fair|Good|Strong>", "reasons": ["<r1>","<r2>","<r3>"], "salaryEstimate": "<e.g. $90K-$120K or empty string if unknown>" }
- score: 1-3 Poor, 4-6 Fair, 7-8 Good, 9-10 Strong
- reasons: 3 short phrases max 5 words each
- salaryEstimate: extract from snippet if mentioned, or estimate based on role/seniority for US/Canada market. Use $CAD if Canada role, $USD otherwise. Format: $80K-$110K. Empty string if truly unknown.
- Be honest and fast`,
          user: `JOB: ${jobTitle || ""} at ${company || ""}\n${(jobSnippet || "").slice(0, 1500)}\n\nRESUME:\n${JSON.stringify(resume.content?.basics || {}).slice(0, 600)}\nSKILLS: ${JSON.stringify(resume.content?.skills || []).slice(0, 300)}`,
        });

        let parsed = { score: 5, matchLabel: "Fair", reasons: [] as string[], salaryEstimate: "" };
        try {
          const raw = r.text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
          const s = raw.indexOf("{"); const e = raw.lastIndexOf("}");
          parsed = JSON.parse(s !== -1 ? raw.slice(s, e+1) : raw);
        } catch { /* keep defaults */ }

        const score = Math.max(1, Math.min(10, Math.round(Number(parsed.score) || 5)));
        const validLabels = ["Poor", "Fair", "Good", "Strong"];
        const matchLabel = validLabels.includes(parsed.matchLabel) ? parsed.matchLabel
          : score >= 8 ? "Strong" : score >= 6 ? "Good" : score >= 4 ? "Fair" : "Poor";

        return json({ score, matchLabel, reasons: (parsed.reasons || []).slice(0, 3), salaryEstimate: String(parsed.salaryEstimate || "") });
      }

      // ext_suggest_roles: suggest best job titles to search for based on resume
      if (action === "ext_suggest_roles") {
        const { data: resume } = await admin.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle();
        if (!resume?.content) return json({ roles: [], keywords: [] });

        const r = await callAI({
          system: `You are a job search expert for the US and Canadian job markets. Based on this resume, suggest the best job titles to search for on LinkedIn and Indeed.
Return ONLY valid JSON, no code fences:
{
  "roles": ["<title1>", "<title2>", ...],
  "keywords": ["<keyword1>", ...],
  "summary": "<one sentence about their profile>"
}
- roles: 8-10 specific job titles they should search for, ordered best match first
- keywords: 6-8 skills/tools to add to searches for better results
- Be specific to the US and Canadian job markets and their actual experience level`,
          user: JSON.stringify({ basics: resume.content?.basics, work: resume.content?.work, skills: resume.content?.skills }).slice(0, 5000),
        });

        let parsed = { roles: [] as string[], keywords: [] as string[], summary: "" };
        try {
          const raw = r.text.replace(/\`\`\`(?:json)?\s*/gi, "").replace(/\`\`\`/g, "").trim();
          const s = raw.indexOf("{"); const e = raw.lastIndexOf("}");
          parsed = JSON.parse(s !== -1 ? raw.slice(s, e+1) : raw);
        } catch { /* keep defaults */ }

        return json({
          roles: (parsed.roles || []).slice(0, 10),
          keywords: (parsed.keywords || []).slice(0, 8),
          summary: parsed.summary || "",
        });
      }

      // ext_find_contacts: given company + job title, return recruiter search links + outreach message
      if (action === "ext_find_contacts") {
        const { company, jobTitle, jobUrl, jobSnippet } = payload as { company?: string; jobTitle?: string; jobUrl?: string; jobSnippet?: string };
        if (!company) return json({ error: "company required" }, 400);

        const { data: profile } = await admin.from("user_profile_data").select("legal_first_name, legal_last_name, default_answers").eq("user_id", userId).maybeSingle();
        const { data: resume } = await admin.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle();

        const userName = [profile?.legal_first_name, profile?.legal_last_name].filter(Boolean).join(" ") || "the candidate";
        const aboutMe = (profile?.default_answers as Record<string,unknown>)?.about_me as string || "";

        const r = await callAI({
          system: `You are a job search assistant helping a candidate find the right person to contact at a company about a job opening.

Return ONLY valid JSON, no code fences:
{
  "contacts": [
    {
      "role": "<likely role title e.g. 'Talent Acquisition Manager', 'HR Business Partner', 'Technical Recruiter'>",
      "why": "<one sentence: why contact this person for this job>",
      "linkedinSearchUrl": "<LinkedIn people search URL for this type of person at the company>",
      "titles": ["<title variant 1>", "<title variant 2>"]
    }
  ],
  "emailFormats": ["<format e.g. firstname.lastname@company.com>", "<format e.g. f.lastname@company.com>"],
  "companyDomain": "<best guess at company email domain e.g. shopify.com>",
  "coldOutreach": "<a 3-sentence LinkedIn connection message or cold email from the candidate to a recruiter at this company. Professional, specific to the role, not generic. First person. No em dashes.>",
  "subjectLine": "<email subject line for cold outreach>"
}

LinkedIn search URL format:
https://www.linkedin.com/search/results/people/?keywords=ENCODED_TITLE&currentCompany=["COMPANY_NAME"]&origin=FACETED_SEARCH

Rules:
- Suggest 2-3 different contact types (Recruiter, HR Manager, Hiring Manager)  
- Email formats: suggest 2-3 most common formats for this company size/type
- Cold outreach: use the candidate name and their background. Make it specific to the role. Under 80 words. No "I hope this message finds you well".`,
          user: `COMPANY: ${company}
JOB TITLE: ${jobTitle || "Not specified"}
JOB URL: ${jobUrl || ""}
JOB SNIPPET: ${(jobSnippet || "").slice(0, 800)}
CANDIDATE NAME: ${userName}
CANDIDATE BACKGROUND: ${aboutMe.slice(0, 400) || JSON.stringify(resume?.content?.basics || {}).slice(0, 400)}`,
        });

        let parsed: Record<string, unknown> = {};
        try {
          const raw = r.text.replace(/\`\`\`(?:json)?\s*/gi, "").replace(/\`\`\`/g, "").trim();
          const s = raw.indexOf("{"); const e = raw.lastIndexOf("}");
          parsed = JSON.parse(s !== -1 ? raw.slice(s, e + 1) : raw);
        } catch { /* keep empty */ }

        return json({
          contacts: (parsed.contacts as unknown[] || []).slice(0, 3),
          emailFormats: (parsed.emailFormats as string[] || []).slice(0, 3),
          companyDomain: parsed.companyDomain || "",
          coldOutreach: parsed.coldOutreach || "",
          subjectLine: parsed.subjectLine || "",
        });
      }

      // ext_cover_letter_text — generate a cover letter from pasted resume/JD text
      if (action === "ext_cover_letter_text") {
        const { resumeText, jdText, tone, company } = payload as {
          resumeText?: string; jdText?: string; tone?: string; company?: string;
        };
        if (!resumeText || !jdText) return json({ error: "resumeText and jdText required" }, 400);
        const r = await callAI({
          system: `Write a concise cover letter (under 280 words). Tone: ${tone || "professional, warm"}. Address ${company || "the hiring team"}. No clichés. No em dashes. Pull concrete achievements from the resume only.`,
          user: `RESUME:\n${resumeText.slice(0, 8000)}\n\nJOB DESCRIPTION:\n${jdText.slice(0, 6000)}`,
        });
        return json({ body: r.text });
      }

      // ext_save_application — save to tracker via extension token
      if (action === "ext_save_application") {
        const { jobTitle, company, jobUrl, status, score, salaryEstimate, notes } = payload as {
          jobTitle?: string; company?: string; jobUrl?: string;
          status?: string; score?: number; salaryEstimate?: string; notes?: string;
        };
        if (!company || !jobTitle) return json({ error: "company and jobTitle required" }, 400);
        const { data, error } = await admin.from("job_applications").upsert({
          user_id: userId, job_title: jobTitle, company,
          job_url: jobUrl || "", status: status || "saved",
          match_score: score || null, salary_estimate: salaryEstimate || "",
          notes: notes || "",
          applied_at: status === "applied" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,job_url", ignoreDuplicates: false }).select("id").single();
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, id: data.id });
      }

      if (action === "ext_get_applications") {
        const { data, error } = await admin.from("job_applications")
          .select("id,job_title,company,job_url,status,match_score,salary_estimate,notes,applied_at,updated_at,created_at")
          .eq("user_id", userId).order("updated_at", { ascending: false }).limit(100);
        if (error) return json({ error: error.message }, 500);
        return json({ applications: data || [] });
      }

      if (action === "ext_update_application") {
        const { id, status, notes } = payload as { id?: string; status?: string; notes?: string };
        if (!id) return json({ error: "id required" }, 400);
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (status) { updates.status = status; if (status === "applied") updates.applied_at = new Date().toISOString(); }
        if (notes !== undefined) updates.notes = notes;
        const { error } = await admin.from("job_applications").update(updates).eq("id", id).eq("user_id", userId);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      // ext_download_resume_text — returns primary resume as ATS plain text for manual upload
      if (action === "ext_download_resume_text") {
        const { data: resume } = await admin.from("resumes").select("title, content").eq("user_id", userId).eq("is_primary", true).maybeSingle();
        if (!resume?.content) return json({ error: "No primary resume saved in AYN" }, 404);
        const c = resume.content as Record<string, unknown>;
        const basics = (c.basics || {}) as Record<string, string>;
        const work = (c.work || []) as Array<Record<string, unknown>>;
        const edu = (c.education || []) as Array<Record<string, unknown>>;
        const skills = (c.skills || []) as string[];
        const lines: string[] = [];
        if (basics.name) lines.push(String(basics.name).toUpperCase());
        if (basics.title) lines.push(String(basics.title));
        const contact = [basics.email, basics.phone, basics.location].filter(Boolean).join(" | ");
        if (contact) lines.push(contact);
        if (basics.summary) { lines.push("", "SUMMARY", String(basics.summary)); }
        if (work.length) {
          lines.push("", "EXPERIENCE");
          work.forEach(w => {
            lines.push("", `${w.title || ""} | ${w.company || ""}  ${w.start || ""} to ${w.end || "Present"}`);
            ((w.bullets || []) as string[]).forEach(b => lines.push(`- ${b}`));
          });
        }
        if (edu.length) {
          lines.push("", "EDUCATION");
          edu.forEach(e => lines.push(`${e.degree || ""} | ${e.school || ""}  ${e.end || ""}`));
        }
        if (skills.length) { lines.push("", "SKILLS", skills.join(", ")); }
        return json({ text: lines.join("\n"), filename: `${(basics.name || "Resume").replace(/\s+/g,"_")}_AYN.txt` });
      }

      // smart_tailor (extension path) — same as JWT smart_tailor below
      if (action === "smart_tailor") {
        const { resumeText, jdText, jobTitle, company } = payload as { resumeText?: string; jdText?: string; jobTitle?: string; company?: string };
        if (!resumeText || !jdText) return json({ error: "resumeText and jdText required" }, 400);
        const r = await callAI({
          model: QUALITY_MODEL,
          system: `Extract 10-14 key job keywords and produce an ATS-formatted tailored resume. Never invent experience. Keep all facts/dates/titles exactly. Return ONLY JSON: {"keywords":[{"text":"...","inResume":true|false}],"tailoredText":"...","changes":["..."]}`,
          user: `TARGET: ${jobTitle||""} at ${company||""}\n\nRESUME:\n${resumeText.slice(0,8000)}\n\nJOB:\n${jdText.slice(0,6000)}`,
        });
        let parsed: { keywords?: unknown; tailoredText?: unknown; changes?: unknown } = {};
        try {
          const raw = r.text.replace(/```(?:json)?\s*/gi,"").replace(/```/g,"").trim();
          const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
          parsed = JSON.parse(s !== -1 ? raw.slice(s, e+1) : raw);
        } catch { return json({ error: "Failed to parse AI response" }, 500); }
        return json({
          keywords: Array.isArray(parsed.keywords) ? (parsed.keywords as Array<Record<string, unknown>>).slice(0,14).map(k => ({ text: String(k.text||""), inResume: Boolean(k.inResume) })) : [],
          tailoredText: String(parsed.tailoredText || ""),
          changes: Array.isArray(parsed.changes) ? (parsed.changes as string[]).slice(0,5) : [],
        });
      }
    }

    // ============ DASHBOARD ACTIONS (Supabase JWT) ============
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Missing Authorization" }, 401);

    const supa = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: u } = await supa.auth.getUser();
    const user = u?.user;
    if (!user) return json({ error: "Invalid session" }, 401);

    // ---------------- link_approve: user clicks Approve on /extension/approve ----------------
    if (action === "link_approve") {
      const { code, device_label } = payload as { code?: string; device_label?: string };
      if (!code) return json({ error: "code required" }, 400);
      const admin2 = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      const { data: link } = await admin2.from("extension_link_codes")
        .select("status, expires_at").eq("code", code).maybeSingle();
      if (!link) return json({ error: "Invalid code" }, 404);
      if (new Date(link.expires_at).getTime() < Date.now()) return json({ error: "Code expired" }, 410);
      if (link.status !== "pending") return json({ error: "Code already used" }, 409);

      // Mint a device token bound to this user
      const tokBytes = new Uint8Array(32);
      crypto.getRandomValues(tokBytes);
      const token = "ayn_" + Array.from(tokBytes).map(b => b.toString(16).padStart(2, "0")).join("");
      const tokHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))))
        .map(x => x.toString(16).padStart(2, "0")).join("");
      const prefix = token.slice(0, 12) + "…";
      const label = device_label || "Chrome";

      const { error: tokErr } = await admin2.from("extension_tokens")
        .insert({ user_id: user.id, token_hash: tokHash, token_prefix: prefix, device_label: label });
      if (tokErr) return json({ error: tokErr.message }, 500);

      const { error: updErr } = await admin2.from("extension_link_codes")
        .update({ user_id: user.id, token, status: "approved", approved_at: new Date().toISOString(), device_label: label })
        .eq("code", code);
      if (updErr) return json({ error: updErr.message }, 500);

      return json({ ok: true });
    }




    // ---------------- extension token management ----------------
    if (action === "token_mint") {
      const label = (payload as { label?: string }).label || "Browser";
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const token = "ayn_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      const tokHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))))
        .map((x) => x.toString(16).padStart(2, "0")).join("");
      const prefix = token.slice(0, 12) + "…";
      const { data, error } = await supa.from("extension_tokens")
        .insert({ user_id: user.id, token_hash: tokHash, token_prefix: prefix, device_label: label })
        .select("id").single();
      if (error) throw error;
      return json({ token, prefix, id: data.id });
    }
    if (action === "token_list") {
      const { data, error } = await supa.from("extension_tokens")
        .select("id, token_prefix, device_label, last_used_at, revoked_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ tokens: data });
    }
    if (action === "token_revoke") {
      const id = (payload as { id?: string }).id;
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await supa.from("extension_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }


    // ---------------- parse ----------------
    if (action === "parse") {
      const { resumeText } = payload as { resumeText: string };
      if (!resumeText || resumeText.length > 60000) return json({ error: "Bad resumeText" }, 400);
      const r = await callAI({
        system: "You convert raw resume text into a structured resume JSON. Be faithful, do not invent data.",
        user: resumeText,
        toolName: "emit_resume",
        toolSchema: RESUME_SCHEMA,
      });
      return json({ resume: r.structured });
    }

    // ---------------- parse_file ----------------
    if (action === "parse_file") {
      const { fileBase64, mimeType } = payload as { fileBase64: string; mimeType: string };
      if (!fileBase64) return json({ error: "fileBase64 required" }, 400);

      const isDocx = (mimeType || "").includes("wordprocessingml") || (mimeType || "").includes("docx");
      const isPdf = (mimeType || "").includes("pdf");
      const isText = (mimeType || "").startsWith("text/");
      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

      // Stage 1: try to extract plain text natively
      let resumeText = "";

      const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

      if (isText) {
        try { resumeText = new TextDecoder("utf-8").decode(b64ToBytes(fileBase64)); } catch (_) { /* noop */ }
      } else if (isDocx) {
        // Use mammoth for real DOCX text extraction
        try {
          const mammoth = await import("npm:mammoth@1.8.0");
          const { value } = await mammoth.extractRawText({ buffer: b64ToBytes(fileBase64) });
          resumeText = (value || "").replace(/\s+\n/g, "\n").trim();
        } catch (e) {
          console.warn("mammoth DOCX extraction failed", e);
        }
      }

      const isMeaningful = resumeText.replace(/\s+/g, " ").trim().length >= 80;

      // Stage 2 — text path (fast, accurate when extraction worked)
      if (isMeaningful) {
        const r = await callAI({
          system: `You convert raw resume text into structured JSON. Be faithful — extract exactly what is written. Never invent names, employers, dates, or skills. If a field is missing, return an empty string or empty array. The name, contact info, and companies in this text are real.`,
          user: `RESUME TEXT:\n${resumeText.slice(0, 18000)}`,
          toolName: "emit_resume",
          toolSchema: RESUME_SCHEMA,
        });
        return json({ resume: r.structured, plainText: resumeText.slice(0, 18000) });
      }

      // Stage 3 — vision/file fallback for PDFs (or DOCX when mammoth failed)
      // Use the gateway's OpenAI-compatible `file` content block with a data URL.
      const realMime = isPdf
        ? "application/pdf"
        : isDocx
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : (mimeType || "application/octet-stream");

      const userContent = [
        { type: "text", text: "Extract ALL information from this resume document: full name, contact details (email, phone, location, links), every job (company, title, dates, bullets), education, skills, certifications, projects. Be exhaustive and faithful — extract exactly what is written, never invent. Return through the emit_resume tool." },
        { type: "file", file: { filename: isPdf ? "resume.pdf" : "resume.docx", file_data: `data:${realMime};base64,${fileBase64}` } },
      ];

      const r = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You convert resume documents into structured JSON. The name, employers, dates, and contact details in the document are real — extract them exactly. Never invent data. If a field is missing, leave it empty. Always call the emit_resume tool." },
            { role: "user", content: userContent },
          ],
          tools: [{ type: "function", function: { name: "emit_resume", description: "emit_resume", parameters: RESUME_SCHEMA } }],
          tool_choice: { type: "function", function: { name: "emit_resume" } },
        }),
      });

      if (r.status === 429) return json({ error: "AI rate limit. Try again in a minute." }, 429);
      if (r.status === 402) return json({ error: "AI credits exhausted." }, 402);
      if (!r.ok) { const t = await r.text(); return json({ error: `AI error ${r.status}: ${t.slice(0, 300)}` }, 500); }

      const data = await r.json();
      const tc = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!tc) {
        const fallback = data?.choices?.[0]?.message?.content;
        return json({
          error: isPdf
            ? "Couldn't read this PDF — it may be scanned/image-based. Paste your resume text instead."
            : "AI couldn't extract resume data. Paste your resume text instead.",
          detail: typeof fallback === "string" ? fallback.slice(0, 400) : null,
        }, 422);
      }

      let resume: unknown;
      try { resume = JSON.parse(tc); } catch { return json({ error: "Failed to parse AI response" }, 500); }

      const plainText = [
        (resume as Record<string, unknown>)?.basics,
        ...(((resume as Record<string, unknown>)?.work as unknown[]) ?? []),
        ...(((resume as Record<string, unknown>)?.education as unknown[]) ?? []),
      ].map(s => JSON.stringify(s)).join("\n");

      return json({ resume, plainText });
    }

    // ---------------- rewrite ----------------
    if (action === "rewrite") {
      const { resume, jdText } = payload as { resume: unknown; jdText?: string };
      const r = await callAI({
        model: QUALITY_MODEL,
        system: "You improve resume bullets to be impact-focused, quantified, and ATS-friendly. Preserve facts; rewrite for clarity and strength. If a job description is provided, weave in relevant keywords without lying. Return a complete improved resume in the same schema, plus an ats_score 0-100, plus an array of suggestions (short strings).",
        user: JSON.stringify({ resume, jdText: jdText ?? "" }).slice(0, 40000),
        toolName: "emit_rewrite",
        toolSchema: {
          type: "object",
          properties: {
            resume: RESUME_SCHEMA,
            ats_score: { type: "integer" },
            suggestions: { type: "array", items: { type: "string" } },
          },
          required: ["resume", "ats_score", "suggestions"],
        },
      });
      return json(r.structured);
    }

    // ---------------- match ----------------
    if (action === "match") {
      const { resume, jdText } = payload as { resume: unknown; jdText: string };
      if (!jdText) return json({ error: "jdText required" }, 400);
      const r = await callAI({
        system: "Score how well a resume matches a job description. Return score 0-100, breakdown { skills_match, experience_match, education_match } each 0-100, and missing_keywords (array of strings).",
        user: JSON.stringify({ resume, jdText }).slice(0, 30000),
        toolName: "emit_match",
        toolSchema: {
          type: "object",
          properties: {
            score: { type: "integer" },
            breakdown: {
              type: "object",
              properties: {
                skills_match: { type: "integer" },
                experience_match: { type: "integer" },
                education_match: { type: "integer" },
              },
              required: ["skills_match", "experience_match", "education_match"],
            },
            missing_keywords: { type: "array", items: { type: "string" } },
            summary: { type: "string" },
          },
          required: ["score", "breakdown", "missing_keywords", "summary"],
        },
      });
      return json(r.structured);
    }

    // ---------------- tailor ----------------
    if (action === "tailor") {
      const { resume, jdText } = payload as { resume: unknown; jdText: string };
      if (!jdText) return json({ error: "jdText required" }, 400);
      const r = await callAI({
        model: QUALITY_MODEL,
        system: `You are an expert Canadian resume writer. Tailor the resume to the job description using these strict rules:

RULES — YOU MUST FOLLOW EVERY ONE:
1. NEVER invent, add, or imply experience, skills, tools, or achievements the resume does not already contain.
2. ONLY reword existing bullets to naturally include job keywords where the underlying experience already supports it.
3. Keep every fact, number, company name, date, and result exactly as-is.
4. You may reorder skills sections to put the most relevant skills first.
5. You may adjust the summary to echo 2-3 key phrases from the job description — only using experience already in the resume.
6. Do NOT change job titles, company names, or dates.
7. No em dashes. No en dashes. Write dates as "2023 to Present".
8. Return the tailored resume in the same schema as the input.`,
        user: JSON.stringify({ resume, jdText }).slice(0, 40000),
        toolName: "emit_resume",
        toolSchema: RESUME_SCHEMA,
      });
      return json({ resume: r.structured });
    }

    // ---------------- smart_tailor ----------------
    // Accepts resumeText (plain text) + jdText, returns:
    //   keywords: { text, inResume }[]  — job keywords with match status
    //   tailoredText: string            — ATS-formatted plain text resume
    //   changes: string[]               — brief list of what was changed
    if (action === "smart_tailor") {
      const { resumeText, jdText, jobTitle, company } = payload as { resumeText: string; jdText: string; jobTitle?: string; company?: string };
      if (!resumeText || !jdText) return json({ error: "resumeText and jdText required" }, 400);

      const r = await callAI({
        model: QUALITY_MODEL,
        system: `You are an expert Canadian resume writer and ATS specialist. Given a resume and job description, do two things:

1. Extract the 10-14 most important keywords and skills from the job description.
2. Produce a tailored version of the resume that passes ATS and reads naturally to a human recruiter.

STRICT RULES — follow every one without exception:
- NEVER invent, add, or imply experience, skills, tools, certifications, or achievements not already in the resume.
- ONLY reword existing bullets to naturally include job keywords where the underlying experience already supports it.
- Keep every fact, number, company name, job title, date, and result exactly as written.
- You may reorder the skills section to put the most relevant items first.
- You may adjust the summary to echo 2-3 key phrases from the job — only using experience the resume already contains.
- Do NOT change job titles, company names, or employment dates.
- No em dashes, no en dashes. Dates written as "2020 to 2022" or "2023 to Present".
- Output the resume in clean ATS plain text using this exact format:

[FULL NAME]
[JOB TITLE LINE — what the person calls themselves, can echo the target role if resume supports it]
[Phone] | [Email] | [Website/LinkedIn] | [Citizenship/Status] | [City, Province] | [Open to Remote if applicable]

SUMMARY
[2-4 sentences. First person voice. Specific, no clichés. Echo the role's key requirements only where resume supports them.]

EXPERIENCE

[Job Title] | [Company Name]  [Start to End]
- [Bullet]
- [Bullet]

[repeat for each role]

EDUCATION

[Credential] | [Institution]  [Year]

SKILLS
[Category]: [comma separated skills]
[repeat]

Return ONLY valid JSON in this exact shape, no code fences:
{
  "keywords": [{ "text": "<keyword>", "inResume": <true|false> }],
  "tailoredText": "<full resume as plain text>",
  "changes": ["<what changed, max 5 short items>"]
}`,
        user: `TARGET ROLE: ${jobTitle || "Not specified"} at ${company || "Not specified"}

RESUME:
${resumeText.slice(0, 8000)}

JOB DESCRIPTION:
${jdText.slice(0, 6000)}`,
      });

      // Parse the JSON response
      let parsed: { keywords: unknown; tailoredText: unknown; changes: unknown };
      try {
        const raw = r.text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        parsed = JSON.parse(start !== -1 ? raw.slice(start, end + 1) : raw);
      } catch {
        return json({ error: "Failed to parse AI response", raw: r.text.slice(0, 500) }, 500);
      }

      const keywords = Array.isArray(parsed.keywords)
        ? (parsed.keywords as Array<Record<string, unknown>>).slice(0, 14).map(k => ({
            text: String(k.text || ""),
            inResume: Boolean(k.inResume),
          }))
        : [];

      return json({
        keywords,
        tailoredText: String(parsed.tailoredText || ""),
        changes: Array.isArray(parsed.changes) ? (parsed.changes as string[]).slice(0, 5) : [],
      });
    }

    // ---------------- cover_letter ----------------
    if (action === "cover_letter") {
      const { resume, jdText, tone, company } = payload as { resume: unknown; jdText: string; tone?: string; company?: string };
      const r = await callAI({
        system: `Write a concise, specific cover letter (under 280 words). Tone: ${tone || "professional, warm"}. Address ${company || "the hiring team"}. No clichés. Pull concrete achievements from the resume.`,
        user: JSON.stringify({ resume, jdText }).slice(0, 30000),
      });
      return json({ body: r.text });
    }

    // ---------------- autofill ----------------
    if (action === "autofill") {
      const { fields, profile, resume } = payload as { fields: Array<{ id: string; label: string; type?: string; options?: string[] }>; profile: unknown; resume?: unknown };
      if (!Array.isArray(fields)) return json({ error: "fields required" }, 400);
      const r = await callAI({
        system: "Given a list of form fields and the user's profile + resume, return the best value to enter for each field. For select fields with options, pick from options. Leave value empty if unknown or sensitive (do NOT guess SSN, DOB year, salary expectation).",
        user: JSON.stringify({ fields, profile, resume }).slice(0, 30000),
        toolName: "emit_autofill",
        toolSchema: {
          type: "object",
          properties: {
            values: {
              type: "array",
              items: { type: "object", properties: { id: { type: "string" }, value: { type: "string" } }, required: ["id", "value"] },
            },
          },
          required: ["values"],
        },
      });
      return json(r.structured);
    }

    // ── NEW ACTIONS (JWT auth) ──
    // These run after JWT validation using supa client with RLS
    const userId = user.id;
    const adminForNew = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (action === "ext_job_score") {
      const { jobTitle, company, jobSnippet } = payload as { jobTitle?: string; company?: string; jobSnippet?: string };
      if (!jobSnippet) return json({ score: 5, matchLabel: "Fair", reasons: [] });
      const { data: resume } = await adminForNew.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle();
      if (!resume?.content) return json({ score: 0, matchLabel: "No resume", reasons: ["Upload your resume in AYN first"] });
      const r = await callAI({
        system: `You are a fast job-resume matcher. Return ONLY valid JSON, no code fences:
{ "score": <integer 1-10>, "matchLabel": "<Poor|Fair|Good|Strong>", "reasons": ["<reason1>","<reason2>","<reason3>"] }
- 1-3=Poor, 4-6=Fair, 7-8=Good, 9-10=Strong. Reasons: 5 words max each.`,
        user: `JOB: ${jobTitle||""} at ${company||""}
${(jobSnippet||"").slice(0,1500)}

RESUME:
${JSON.stringify(resume.content?.basics||{}).slice(0,600)}
SKILLS: ${JSON.stringify(resume.content?.skills||[]).slice(0,300)}`,
      });
      let parsed = { score: 5, matchLabel: "Fair", reasons: [] as string[] };
      try { const raw = r.text.replace(/```(?:json)?\s*/gi,"").replace(/```/g,"").trim(); const s=raw.indexOf("{"),e=raw.lastIndexOf("}"); parsed=JSON.parse(s!==-1?raw.slice(s,e+1):raw); } catch {}
      const score = Math.max(1,Math.min(10,Math.round(Number(parsed.score)||5)));
      const vl = ["Poor","Fair","Good","Strong"];
      return json({ score, matchLabel: vl.includes(parsed.matchLabel)?parsed.matchLabel:score>=8?"Strong":score>=6?"Good":score>=4?"Fair":"Poor", reasons:(parsed.reasons||[]).slice(0,3) });
    }

    if (action === "ext_suggest_roles") {
      const { data: resume } = await adminForNew.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle();
      if (!resume?.content) return json({ roles: [], keywords: [], summary: "No resume found. Add your resume in AYN first." });
      const r = await callAI({
        system: `Canadian job search expert. Return ONLY valid JSON:
{"roles":["<title>",...],"keywords":["<kw>",...],"summary":"<one sentence>"}
- 8-10 job titles ordered best match first
- 6-8 skill keywords for searches
- Specific to Canadian market`,
        user: JSON.stringify({basics:resume.content?.basics,work:resume.content?.work,skills:resume.content?.skills}).slice(0,5000),
      });
      let parsed = { roles:[] as string[], keywords:[] as string[], summary:"" };
      try { const raw=r.text.replace(/```(?:json)?\s*/gi,"").replace(/```/g,"").trim(); const s=raw.indexOf("{"),e=raw.lastIndexOf("}"); parsed=JSON.parse(s!==-1?raw.slice(s,e+1):raw); } catch {}
      return json({ roles:(parsed.roles||[]).slice(0,10), keywords:(parsed.keywords||[]).slice(0,8), summary:parsed.summary||"" });
    }

    if (action === "ext_find_contacts") {
      const { company, jobTitle, jobUrl, jobSnippet } = payload as { company?:string; jobTitle?:string; jobUrl?:string; jobSnippet?:string };
      if (!company) return json({ error: "company required" }, 400);
      const { data: profile } = await adminForNew.from("user_profile_data").select("legal_first_name,legal_last_name,default_answers").eq("user_id",userId).maybeSingle();
      const { data: resume } = await adminForNew.from("resumes").select("content").eq("user_id",userId).eq("is_primary",true).maybeSingle();
      const userName = [profile?.legal_first_name,profile?.legal_last_name].filter(Boolean).join(" ")||"the candidate";
      const aboutMe = ((profile?.default_answers as Record<string,unknown>)?.about_me as string)||"";
      const r = await callAI({
        system: `Job search assistant. Return ONLY valid JSON:
{"contacts":[{"role":"<title>","why":"<why>","linkedinSearchUrl":"<url>","titles":["<t1>"]}],"emailFormats":["<fmt>"],"companyDomain":"<domain>","coldOutreach":"<message>","subjectLine":"<subject>"}
- 2-3 contact types. LinkedIn URL: https://www.linkedin.com/search/results/people/?keywords=TITLE&currentCompany=["COMPANY"]
- Cold outreach: under 80 words, first person, specific to role, no generic openers`,
        user: `COMPANY: ${company}
JOB: ${jobTitle||""}
URL: ${jobUrl||""}
SNIPPET: ${(jobSnippet||"").slice(0,600)}
CANDIDATE: ${userName}
BACKGROUND: ${aboutMe.slice(0,300)||JSON.stringify(resume?.content?.basics||{}).slice(0,300)}`,
      });
      let parsed: Record<string,unknown> = {};
      try { const raw=r.text.replace(/```(?:json)?\s*/gi,"").replace(/```/g,"").trim(); const s=raw.indexOf("{"),e=raw.lastIndexOf("}"); parsed=JSON.parse(s!==-1?raw.slice(s,e+1):raw); } catch {}
      return json({ contacts:(parsed.contacts as unknown[]||[]).slice(0,3), emailFormats:(parsed.emailFormats as string[]||[]).slice(0,3), companyDomain:parsed.companyDomain||"", coldOutreach:parsed.coldOutreach||"", subjectLine:parsed.subjectLine||"" });
    }

    // ext_save_application: save a job application to the tracker
    if (action === "ext_save_application") {
      const { jobTitle, company, jobUrl, status, score, salaryEstimate, notes } = payload as {
        jobTitle?: string; company?: string; jobUrl?: string;
        status?: string; score?: number; salaryEstimate?: string; notes?: string;
      };
      if (!company || !jobTitle) return json({ error: "company and jobTitle required" }, 400);
      const { data, error } = await admin.from("job_applications").upsert({
        user_id: userId,
        job_title: jobTitle,
        company,
        job_url: jobUrl || "",
        status: status || "saved",
        match_score: score || null,
        salary_estimate: salaryEstimate || "",
        notes: notes || "",
        applied_at: status === "applied" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,job_url", ignoreDuplicates: false }).select("id").single();
      if (error) {
        // Table may not exist yet — return graceful error
        console.error("save_application error", error);
        return json({ error: "Could not save application: " + error.message }, 500);
      }
      return json({ ok: true, id: data.id });
    }

    // ext_get_applications: get all tracked applications for this user
    if (action === "ext_get_applications") {
      const { data, error } = await admin.from("job_applications")
        .select("id,job_title,company,job_url,status,match_score,salary_estimate,notes,applied_at,updated_at,created_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) return json({ error: error.message }, 500);
      return json({ applications: data || [] });
    }

    // ext_update_application: update status or notes
    if (action === "ext_update_application") {
      const { id, status, notes } = payload as { id?: string; status?: string; notes?: string };
      if (!id) return json({ error: "id required" }, 400);
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (status) { updates.status = status; if (status === "applied") updates.applied_at = new Date().toISOString(); }
      if (notes !== undefined) updates.notes = notes;
      const { error } = await admin.from("job_applications").update(updates).eq("id", id).eq("user_id", userId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("resume-hub error", e);
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
