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

const EXT_ACTIONS = new Set(["ext_bootstrap", "ext_ingest_job", "ext_autofill", "ext_tailor", "ext_cover_letter"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json();
    const { action, ...payload } = body;

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
        const [{ data: profile }, { data: resume }] = await Promise.all([
          admin.from("user_profile_data").select("*").eq("user_id", userId).maybeSingle(),
          admin.from("resumes").select("id, title, content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
        ]);
        return json({ user: { id: userId, device: tok.device_label }, profile, resume });
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
        const [{ data: profile }, { data: resume }] = await Promise.all([
          admin.from("user_profile_data").select("*").eq("user_id", userId).maybeSingle(),
          admin.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
        ]);
        const r = await callAI({
          system: `You are filling out a job application form for a Canadian job seeker.

You have: their profile (name, address, phone, work authorization, answers), their resume (experience, skills, education), and the job description.

RULES:
- Only use real data from profile and resume — never invent information
- Work authorization questions (legally eligible to work in Canada): use work_auth.legally_eligible
- Salary: use default_answers.salary_expectation if set, else leave empty
- "Tell us about yourself": use default_answers.about_me adapted to the job
- "Why this role": use default_answers.why_this_role adapted to the job
- Criminal record: use default_answers.criminal_record
- Equity/diversity: use equity flags from default_answers (voluntary only)
- Select fields: pick the closest matching option from the provided options list
- Leave empty: SIN, exact birth date, banking info, passwords, anything not in profile
- If not confident: return empty string — never guess sensitive fields`,
          user: JSON.stringify({
            fields,
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
        return json(r.structured);
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
    // Accepts a base64-encoded PDF or DOCX and returns structured ResumeContent.
    // The file is sent directly to Gemini as an inline document so no server-side
    // PDF library is needed — Gemini reads the bytes natively.
    if (action === "parse_file") {
      const { fileBase64, mimeType } = payload as { fileBase64: string; mimeType: string };
      if (!fileBase64) return json({ error: "fileBase64 required" }, 400);

      const supportedTypes = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
      const effectiveMime = supportedTypes.includes(mimeType) ? mimeType : "application/pdf";

      // Gemini can read PDF natively as an inline document part
      const userContent = [
        {
          type: "text",
          text: "Extract ALL information from this resume document. Return every name, company, date, bullet point, skill, and education entry you can find. Be exhaustive and faithful — do not invent or omit anything.",
        },
        {
          type: "document",
          source: {
            type: "base64",
            media_type: effectiveMime,
            data: fileBase64,
          },
        },
      ];

      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

      // For DOCX we first ask Gemini to extract plain text, then parse that.
      // For PDF Gemini reads it directly.
      const r = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "You convert resume documents into structured JSON. Extract every fact faithfully. Do not invent or omit data. Return only the tool call.",
            },
            { role: "user", content: userContent },
          ],
          tools: [{
            type: "function",
            function: { name: "emit_resume", description: "emit_resume", parameters: RESUME_SCHEMA },
          }],
          tool_choice: { type: "function", function: { name: "emit_resume" } },
        }),
      });

      if (r.status === 429) return json({ error: "AI rate limit. Try again in a minute." }, 429);
      if (r.status === 402) return json({ error: "AI credits exhausted." }, 402);
      if (!r.ok) { const t = await r.text(); return json({ error: `AI error ${r.status}: ${t.slice(0, 200)}` }, 500); }

      const data = await r.json();
      const choice = data?.choices?.[0];
      const tc = choice?.message?.tool_calls?.[0]?.function?.arguments;
      if (!tc) return json({ error: "AI did not return structured data" }, 500);

      let resume: unknown;
      try { resume = JSON.parse(tc); } catch { return json({ error: "Failed to parse AI response" }, 500); }

      // Also produce a plain-text version for the ResumeMatch textarea
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

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("resume-hub error", e);
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
