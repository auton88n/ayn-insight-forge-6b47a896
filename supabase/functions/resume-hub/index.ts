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

  const primary = opts.model ?? DEFAULT_MODEL;
  // Fallback chain: try a cheaper/different model when the primary 402/5xx's.
  const FALLBACKS: Record<string, string[]> = {
    [QUALITY_MODEL]: [DEFAULT_MODEL, "google/gemini-2.5-flash-lite"],
    [DEFAULT_MODEL]: ["google/gemini-2.5-flash-lite"],
  };
  const chain = [primary, ...(FALLBACKS[primary] || [])];

  let lastErr = "";
  for (let mi = 0; mi < chain.length; mi++) {
    const model = chain[mi];
    const body: Record<string, unknown> = {
      model,
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

    // Up to 3 attempts per model with exponential backoff on 429 / transient 5xx.
    for (let attempt = 0; attempt < 3; attempt++) {
      let r: Response;
      try {
        r = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (e) {
        lastErr = `network: ${(e as Error).message}`;
        await new Promise(res => setTimeout(res, 400 * (attempt + 1)));
        continue;
      }

      if (r.ok) {
        const data = await r.json();
        const msg = data?.choices?.[0]?.message;
        const tc = msg?.tool_calls?.[0]?.function?.arguments;
        if (tc) {
          try { return { text: "", structured: JSON.parse(tc) }; }
          catch { return { text: tc, structured: undefined }; }
        }
        return { text: msg?.content ?? "" };
      }

      // 402 = credits — don't retry same model, jump to next in chain.
      if (r.status === 402) {
        lastErr = "AI credits exhausted.";
        break;
      }
      // 429 / 5xx = transient — backoff then retry same model.
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) {
        lastErr = `AI ${r.status}`;
        await new Promise(res => setTimeout(res, 500 * Math.pow(2, attempt)));
        continue;
      }
      // 4xx other = terminal, stop everything.
      const t = await r.text();
      throw new Error(`AI error ${r.status}: ${t.slice(0, 200)}`);
    }
  }
  throw new Error(lastErr || "AI request failed");
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
  "ext_download_resume_text", "smart_tailor", "ext_ask",
  // v1.4.0: smarter AI
  "ext_save_answer", "ext_lookup_answer", "ext_get_resume_blob",
  // v1.5.0 Phase 1: canonical profile read for extension
  "ext_profile_canonical_get",
]);

// ---------------- Canonical structured profile (Phase 1) ----------------
// Single source of truth for skills, experiences, work auth, and derived
// fields like total YoE / seniority. Read by autofill, scoring, tailoring,
// cover letter. Extracted once from primary resume + user_profile_data;
// users can edit it in the Profile tab and edits win over re-extraction.
type CanonicalProfile = {
  skills: Array<{ name: string; years?: number; last_used?: string; level?: string; evidence?: string }>;
  experiences: Array<{ company: string; title: string; location?: string; start?: string; end?: string; current?: boolean; bullets?: string[]; tech?: string[] }>;
  education: Array<{ school: string; degree?: string; field?: string; start?: string; end?: string; gpa?: string }>;
  certifications: Array<{ name: string; issuer?: string; year?: string }>;
  work_auth: {
    citizenship?: string;
    work_authorized_us?: boolean;
    work_authorized_ca?: boolean;
    needs_sponsorship_now?: boolean;
    needs_sponsorship_future?: boolean;
    visa_type?: string;
    notes?: string;
  };
  preferences: {
    open_to_remote?: boolean;
    open_to_relocation?: boolean;
    open_to_travel?: boolean;
    salary_min_usd?: number;
    salary_currency?: string;
    start_date_availability?: string;
    desired_titles?: string[];
    desired_locations?: string[];
  };
  derived: {
    total_yoe?: number;
    seniority?: string;
    primary_function?: string;
    top_skills?: string[];
    education_level?: string;
    current_title?: string;
    current_company?: string;
  };
};

const EMPTY_CANONICAL: CanonicalProfile = {
  skills: [], experiences: [], education: [], certifications: [],
  work_auth: {}, preferences: {}, derived: {},
};

async function loadCanonical(admin: ReturnType<typeof createClient>, userId: string): Promise<CanonicalProfile | null> {
  const { data } = await admin.from("user_profile_canonical")
    .select("skills, experiences, education, certifications, work_auth, preferences, derived")
    .eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return {
    skills: (data.skills as CanonicalProfile["skills"]) || [],
    experiences: (data.experiences as CanonicalProfile["experiences"]) || [],
    education: (data.education as CanonicalProfile["education"]) || [],
    certifications: (data.certifications as CanonicalProfile["certifications"]) || [],
    work_auth: (data.work_auth as CanonicalProfile["work_auth"]) || {},
    preferences: (data.preferences as CanonicalProfile["preferences"]) || {},
    derived: (data.derived as CanonicalProfile["derived"]) || {},
  };
}

// Compact textual digest of the canonical profile for inclusion in LLM
// prompts. Keeps token count low and prevents the model from drifting.
function canonicalDigest(c: CanonicalProfile | null): string {
  if (!c) return "";
  const skills = c.skills.slice(0, 30).map(s => s.years ? `${s.name} (${s.years}y)` : s.name).join(", ");
  const exp = c.experiences.slice(0, 5).map(e => `${e.title} @ ${e.company} [${e.start || "?"}-${e.end || (e.current ? "Now" : "?")}]`).join("; ");
  const edu = c.education.slice(0, 3).map(e => `${e.degree || ""} ${e.field || ""} @ ${e.school}`.trim()).join("; ");
  const wa = c.work_auth;
  const waLine = `citizenship=${wa.citizenship || "?"}, us_auth=${wa.work_authorized_us ?? "?"}, needs_sponsorship=${wa.needs_sponsorship_now ?? "?"}, visa=${wa.visa_type || "n/a"}`;
  const pr = c.preferences;
  const prLine = `remote=${pr.open_to_remote ?? "?"}, relocate=${pr.open_to_relocation ?? "?"}, salary_min=${pr.salary_min_usd ?? "?"} ${pr.salary_currency || ""}, start=${pr.start_date_availability || "?"}`;
  const d = c.derived;
  return [
    `TOTAL_YOE=${d.total_yoe ?? "?"} | SENIORITY=${d.seniority || "?"} | FUNCTION=${d.primary_function || "?"} | EDU_LEVEL=${d.education_level || "?"}`,
    `CURRENT=${d.current_title || "?"} @ ${d.current_company || "?"}`,
    `TOP_SKILLS: ${(d.top_skills || []).slice(0, 12).join(", ")}`,
    `ALL_SKILLS: ${skills}`,
    `EXPERIENCE: ${exp}`,
    `EDUCATION: ${edu}`,
    `WORK_AUTH: ${waLine}`,
    `PREFERENCES: ${prLine}`,
  ].join("\n");
}

// LLM extraction schema for the canonical profile. Strict: model fills only
// what it can see in the resume + supplemental profile fields; missing data
// stays empty rather than being hallucinated.
const CANONICAL_SCHEMA = {
  type: "object",
  properties: {
    skills: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          years: { type: "number" },
          last_used: { type: "string" },
          level: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["name"],
      },
    },
    experiences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          title: { type: "string" },
          location: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          current: { type: "boolean" },
          bullets: { type: "array", items: { type: "string" } },
          tech: { type: "array", items: { type: "string" } },
        },
        required: ["company", "title"],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          school: { type: "string" }, degree: { type: "string" }, field: { type: "string" },
          start: { type: "string" }, end: { type: "string" }, gpa: { type: "string" },
        },
        required: ["school"],
      },
    },
    certifications: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, issuer: { type: "string" }, year: { type: "string" } },
        required: ["name"],
      },
    },
    work_auth: {
      type: "object",
      properties: {
        citizenship: { type: "string" },
        work_authorized_us: { type: "boolean" },
        work_authorized_ca: { type: "boolean" },
        needs_sponsorship_now: { type: "boolean" },
        needs_sponsorship_future: { type: "boolean" },
        visa_type: { type: "string" },
        notes: { type: "string" },
      },
    },
    preferences: {
      type: "object",
      properties: {
        open_to_remote: { type: "boolean" },
        open_to_relocation: { type: "boolean" },
        open_to_travel: { type: "boolean" },
        salary_min_usd: { type: "number" },
        salary_currency: { type: "string" },
        start_date_availability: { type: "string" },
        desired_titles: { type: "array", items: { type: "string" } },
        desired_locations: { type: "array", items: { type: "string" } },
      },
    },
    derived: {
      type: "object",
      properties: {
        total_yoe: { type: "number" },
        seniority: { type: "string" },
        primary_function: { type: "string" },
        top_skills: { type: "array", items: { type: "string" } },
        education_level: { type: "string" },
        current_title: { type: "string" },
        current_company: { type: "string" },
      },
    },
  },
  required: ["skills", "experiences", "education", "certifications", "work_auth", "preferences", "derived"],
};

async function extractCanonical(opts: {
  resumeContent?: unknown;
  resumeText?: string;
  profileExtras?: unknown;
}): Promise<CanonicalProfile> {
  const r = await callAI({
    model: QUALITY_MODEL,
    system: `You convert a resume + supplemental profile fields into a strict canonical profile JSON.

RULES:
- Faithful: never invent skills, years, titles, or work-auth values not in the input.
- Years: only set "years" on a skill if the resume gives explicit evidence (e.g. "5 years of Python", or you can compute it from dated jobs that explicitly used it).
- derived.total_yoe: sum of distinct, non-overlapping professional years (count "Present" as ${new Date().getFullYear()}). Internships count as 0.5x. Cap at 50.
- derived.seniority: one of "intern","entry","mid","senior","staff","principal","manager","director","vp","cxo". Pick from titles.
- derived.education_level: one of "High School","Associate's","Bachelor's","Master's","PhD". Pick the highest completed.
- derived.top_skills: 8-12 skills you would put on a resume for this person, ordered by relevance.
- work_auth: leave booleans missing if unstated. Do NOT guess citizenship from name.
- preferences: leave fields missing if unstated. Do NOT default to true/false.
- All dates: keep the format as written ("2021", "Jan 2021", "2021-03"). Do not normalize.`,
    user: JSON.stringify({
      resumeContent: opts.resumeContent ?? null,
      resumeText: (opts.resumeText || "").slice(0, 30000),
      profileExtras: opts.profileExtras ?? null,
    }).slice(0, 45000),
    toolName: "emit_canonical_profile",
    toolSchema: CANONICAL_SCHEMA,
  });
  const out = r.structured as CanonicalProfile | undefined;
  if (!out) throw new Error("Canonical extraction returned no structured output");
  return {
    skills: out.skills || [],
    experiences: out.experiences || [],
    education: out.education || [],
    certifications: out.certifications || [],
    work_auth: out.work_auth || {},
    preferences: out.preferences || {},
    derived: out.derived || {},
  };
}

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
        const { fields, jobText, jobTitle, company, ats, url } = payload as {
          fields?: unknown; jobText?: string; jobTitle?: string; company?: string; ats?: string; url?: string;
        };
        if (!Array.isArray(fields)) return json({ error: "fields required" }, 400);
        if (fields.length === 0) return json({ values: [], meta: { reason: "no_form_fields" } });
        const [{ data: profile }, { data: resume }, canonical] = await Promise.all([
          admin.from("user_profile_data").select("*").eq("user_id", userId).maybeSingle(),
          admin.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
          loadCanonical(admin, userId),
        ]);
        const canonicalText = canonicalDigest(canonical);

        const profileFieldsAvailable = profile
          ? Object.entries(profile).filter(([_, v]) => v != null && v !== "" && (Array.isArray(v) ? v.length : true)).map(([k]) => k)
          : [];
        const hasAnyData = profileFieldsAvailable.length > 0 || !!resume?.content;

        const rb = (resume?.content as { basics?: Record<string, unknown>; work?: Array<Record<string, unknown>>; skills?: unknown[]; education?: Array<Record<string, unknown>> } | null) || null;
        const basics = (rb?.basics || {}) as Record<string, string>;
        const work = (rb?.work || []) as Array<Record<string, unknown>>;
        const edu = (rb?.education || []) as Array<Record<string, unknown>>;
        const [firstFromResume, ...restFromResume] = (basics.name || "").trim().split(/\s+/);

        const parseYear = (s: unknown): number | null => {
          const m = String(s || "").match(/(19|20)\d{2}/);
          return m ? parseInt(m[0], 10) : null;
        };
        const nowYear = new Date().getFullYear();
        let yoe = 0;
        for (const w of work) {
          const sy = parseYear(w.start);
          const ey = /present|current/i.test(String(w.end || "")) ? nowYear : (parseYear(w.end) || nowYear);
          if (sy) yoe += Math.max(0, ey - sy);
        }
        const eduStr = edu.map(e => `${e.degree || ""} ${e.field || ""}`).join(" ").toLowerCase();
        let educationLevel = "";
        if (/ph\.?d|doctor/.test(eduStr)) educationLevel = "PhD";
        else if (/master|m\.?sc|m\.?a\.|mba|m\.?eng/.test(eduStr)) educationLevel = "Master's";
        else if (/bachelor|b\.?sc|b\.?a\.|b\.?eng|undergrad/.test(eduStr)) educationLevel = "Bachelor's";
        else if (/associate|diploma/.test(eduStr)) educationLevel = "Associate's";
        else if (eduStr.trim()) educationLevel = "High School";

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
          computed_years_experience: canonical?.derived?.total_yoe ?? yoe,
          computed_education_level: canonical?.derived?.education_level || educationLevel,
          current_title: canonical?.derived?.current_title || (work[0] as { title?: string })?.title || basics.title || "",
          current_company: canonical?.derived?.current_company || (work[0] as { company?: string })?.company || "",
          seniority: canonical?.derived?.seniority || "",
          primary_function: canonical?.derived?.primary_function || "",
        };

        const r = await callAI({
          model: QUALITY_MODEL,
          system: `You are a senior career coach filling a real job application. The user gave you their profile and resume; do NOT invent anything that isn't there.

For EACH field, READ THE LABEL AND THE "group" HINT before deciding. Output one object per field you choose to fill:
{ "id":"<field id>", "value":"<exact value>", "confidence":<0..1>, "reasoning":"<one short sentence>", "source":"<profile|resume|computed|inferred>" }

DATA PRIORITY: profile -> mergedBasics (incl. computed_years_experience, computed_education_level) -> resume.basics -> resume.work/skills/education.

FIELD-GROUP RULES (use "group", then fall back to LABEL):

identity.first_name / last_name / full_name / email / phone / address / city / state / postal_code / country
  -> Fill from profile + mergedBasics. ALWAYS fill if any source has it.

link.linkedin / link.portfolio / link.github
  -> Full URL with https://. From profile or basics.links.

logic.work_auth
  -> Yes/No from profile.work_authorization or profile.default_answers. Unknown -> skip.

logic.sponsorship
  -> Yes/No from profile.default_answers.requires_sponsorship. Authorized + no flag -> "No".

logic.relocate / logic.work_mode -> Yes/No / mode from profile.default_answers.

logic.years_experience
  -> Use mergedBasics.computed_years_experience. Match closest option text (e.g. "5-7 years"). Never inflate.

logic.education_level
  -> Use mergedBasics.computed_education_level. Match closest option text.

logic.salary -> canonical.preferences.salary_min_usd or profile.default_answers.salary_expectation. Else skip.

logic.start_date -> canonical.preferences.start_date_availability or profile.default_answers.notice_period; else "2 weeks" if employed, "Immediately" otherwise. Match option.

CANONICAL OVERRIDES (Phase 1): canonical.work_auth and canonical.preferences are the user-confirmed source of truth. If canonical says needs_sponsorship_now=true, answer Yes on sponsorship questions. If canonical says work_authorized_us=true, answer Yes on US work auth. If canonical.skills lists a skill with years=N, use N for "How many years of <skill>" questions verbatim. Never override these with guesses.

eeo.* -> profile.default_answers only. Else "Decline to self-identify" / "Prefer not to say" when offered, else skip.

open.about -> 2-3 sentences. Lead with current role + years. ONE concrete achievement from resume.work bullets that maps to the JD. No clichés. No em dashes.

open.why -> 2-3 sentences tying ONE specific JD requirement to ONE concrete resume bullet. Name the company once.

open.cover -> 4-5 sentences, same rules as open.why but longer. Grounded in resume only.

open.source -> "LinkedIn" by default; check url for indeed/glassdoor/jobright hints.

GENERAL:
- For select/radio: "value" must be a substring of one option text. No clear match -> skip.
- Skip silently: SIN/SSN, full DOB, bank info, passwords, anything not in any source.
- confidence: 1.0 exact data match, 0.7-0.9 strong inference, 0.4-0.6 best guess, <0.4 skip.
- reasoning: ONE short sentence ("From profile.email", "Computed from 5 roles since 2019", "Matched PM bullet to JD").`,
          user: JSON.stringify({
            context: { jobTitle, company, ats, url },
            fields,
            mergedBasics: merged,
            profile,
            resume: resume?.content,
            jobDescription: (jobText || "").slice(0, 3500),
          }).slice(0, 38000),
          toolName: "emit_autofill",
          toolSchema: {
            type: "object",
            properties: {
              values: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    value: { type: "string" },
                    confidence: { type: "number" },
                    reasoning: { type: "string" },
                    source: { type: "string" },
                  },
                  required: ["id", "value"],
                },
              },
            },
            required: ["values"],
          },
        });
        const out = (r.structured as { values?: Array<{ id: string; value: string; confidence?: number; reasoning?: string; source?: string }> }) || { values: [] };
        const filtered = (out.values || []).filter(v => v.value && (typeof v.confidence !== 'number' || v.confidence >= 0.4));
        return json({
          values: filtered,
          meta: {
            jobDetected: !!(jobText && jobText.length > 80),
            profileFieldsAvailable: profileFieldsAvailable.length,
            hasResume: !!resume?.content,
            hasAnyData,
            yearsExperience: yoe,
            educationLevel,
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

      // ext_job_score: score a job snippet against the user's resume
      // Returns score 1-10, label, reasons, missingKeywords, matchedSkills, salary
      if (action === "ext_job_score") {
        const { jobTitle, company, jobSnippet } = payload as { jobTitle?: string; company?: string; jobSnippet?: string };
        if (!jobSnippet) return json({ score: 0, matchLabel: "Unknown", reasons: [], salaryEstimate: "", missingKeywords: [], matchedSkills: [] });
        const { data: resume } = await admin.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle();
        if (!resume?.content) return json({ score: 0, matchLabel: "No resume", reasons: [], salaryEstimate: "", missingKeywords: [], matchedSkills: [] });

        const rc = resume.content as Record<string, unknown>;
        const resumeDigest = {
          basics: rc.basics,
          skills: rc.skills,
          work: ((rc.work as Array<Record<string, unknown>>) || []).slice(0, 6).map(w => ({
            title: w.title, company: w.company, start: w.start, end: w.end,
            bullets: ((w.bullets as string[]) || []).slice(0, 4),
          })),
        };

        const r = await callAI({
          model: QUALITY_MODEL,
          system: `You are a senior tech recruiter. Score how well this candidate matches the job. Be honest, calibrated, and concrete.

Return ONLY this JSON (no code fences):
{
  "score": <integer 1-10>,
  "matchLabel": "Poor|Fair|Good|Strong",
  "reasons": ["<reason 1>","<reason 2>","<reason 3>"],
  "mustHaves": [{"text":"<requirement>","met":true|false}, ...],
  "niceToHaves": [{"text":"<nice-to-have>","met":true|false}, ...],
  "matchedSkills": ["<skill>", ...],
  "missingKeywords": ["<keyword>", ...],
  "salaryEstimate": "<$80K-$110K or empty>",
  "verdict": "<one sentence verdict>"
}

Scoring rubric:
- 9-10 Strong: meets ALL must-haves + 2+ strong signals (same domain, scale, tech).
- 7-8 Good: meets most must-haves, 1-2 coachable gaps.
- 4-6 Fair: half the must-haves, real gaps in seniority or core tech.
- 1-3 Poor: missing the core requirement (role, level, critical tech).

Rules:
- mustHaves: 3-5 things the JD lists as required/must (years, degree, core stack). Mark met=true only if the resume clearly shows it.
- niceToHaves: 2-4 preferred items. Mark met based on resume evidence.
- reasons: 3 SHORT phrases (max 6 words each), tied to specific JD requirements.
- matchedSkills: up to 8 skills/tools present in BOTH resume and JD.
- missingKeywords: 4-8 important JD keywords NOT in the resume.
- salaryEstimate: extract from snippet if present; else estimate for the role + seniority + US/Canada market. Format $80K-$110K. Empty if truly unknown.
- verdict: one honest sentence.`,
          user: `JOB TITLE: ${jobTitle || ""}\nCOMPANY: ${company || ""}\n\nJOB DESCRIPTION:\n${(jobSnippet || "").slice(0, 3000)}\n\nRESUME:\n${JSON.stringify(resumeDigest).slice(0, 6000)}`,
        });

        let parsed: { score?: number; matchLabel?: string; reasons?: string[]; salaryEstimate?: string; missingKeywords?: string[]; matchedSkills?: string[]; verdict?: string; mustHaves?: Array<{text:string;met:boolean}>; niceToHaves?: Array<{text:string;met:boolean}> } = {};
        try {
          const raw = r.text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
          const s = raw.indexOf("{"); const e = raw.lastIndexOf("}");
          parsed = JSON.parse(s !== -1 ? raw.slice(s, e+1) : raw);
        } catch { /* keep defaults */ }

        const score = Math.max(1, Math.min(10, Math.round(Number(parsed.score) || 5)));
        const validLabels = ["Poor", "Fair", "Good", "Strong"];
        const matchLabel = validLabels.includes(parsed.matchLabel || "") ? parsed.matchLabel!
          : score >= 9 ? "Strong" : score >= 7 ? "Good" : score >= 4 ? "Fair" : "Poor";

        return json({
          score, matchLabel,
          reasons: (parsed.reasons || []).slice(0, 3),
          mustHaves: (parsed.mustHaves || []).slice(0, 5).map(m => ({ text: String(m.text || ""), met: !!m.met })),
          niceToHaves: (parsed.niceToHaves || []).slice(0, 4).map(m => ({ text: String(m.text || ""), met: !!m.met })),
          matchedSkills: (parsed.matchedSkills || []).slice(0, 8),
          missingKeywords: (parsed.missingKeywords || []).slice(0, 8),
          salaryEstimate: String(parsed.salaryEstimate || ""),
          verdict: String(parsed.verdict || ""),
        });
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

        const candidateBackground = aboutMe.slice(0, 400) || JSON.stringify({
          basics: resume?.content?.basics,
          recent: ((resume?.content?.work as Array<Record<string, unknown>>) || []).slice(0, 2),
        }).slice(0, 700);

        const r = await callAI({
          system: `You help a candidate find the right humans to contact at a company about a specific role. Be CONCRETE — no generic recruiter copy.

Return ONLY this JSON (no code fences):
{
  "contacts": [
    { "role": "<persona title>", "why": "<one sentence>", "linkedinSearchUrl": "<URL>", "titles": ["<variant>", "<variant>"] }
  ],
  "emailFormats": ["firstname.lastname@<domain>", "f.lastname@<domain>"],
  "companyDomain": "<domain.com>",
  "coldOutreach": "<personalized message under 80 words>",
  "subjectLine": "<email subject>"
}

LinkedIn search URL pattern:
https://www.linkedin.com/search/results/people/?keywords=<URL-ENCODED ROLE TITLE>&currentCompany=%5B%22<URL-ENCODED COMPANY>%22%5D&origin=FACETED_SEARCH

Rules:
- Exactly 3 contact personas: (1) Technical/Hiring Recruiter for the role's function, (2) Hiring Manager (use the actual role's likely manager title — e.g. "Engineering Manager" for SWE, "Director of Marketing" for marketing), (3) Team Lead / Senior peer (e.g. "Staff Engineer", "Senior Product Designer").
- For each: 2 title variants real people use at companies of this size.
- emailFormats: 2-3 most likely formats for THIS company size (startups use firstname@, large enterprises use firstname.lastname@).
- companyDomain: best guess from the company name (lowercase, no spaces). If well-known company, use the known domain.
- coldOutreach: written FROM the candidate, addressed to the recruiter. First name reference, the specific role title, ONE concrete reason from candidate's background that maps to the JD, a clear ask (15-min chat). Under 80 words. No "hope this finds you well". No em dashes. Plain text.
- subjectLine: short ("<Role> @ <Company> - <one-line angle>"). Use a dash, not em dash.`,
          user: `COMPANY: ${company}
JOB TITLE: ${jobTitle || "Not specified"}
JOB URL: ${jobUrl || ""}
JOB SNIPPET: ${(jobSnippet || "").slice(0, 1200)}
CANDIDATE NAME: ${userName}
CANDIDATE BACKGROUND: ${candidateBackground}`,
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
        const { resumeText, jdText, tone, company, jobTitle } = payload as {
          resumeText?: string; jdText?: string; tone?: string; company?: string; jobTitle?: string;
        };
        if (!resumeText || !jdText) return json({ error: "resumeText and jdText required" }, 400);
        const r = await callAI({
          model: QUALITY_MODEL,
          system: `Write a cover letter under 280 words. Tone: ${tone || "professional, warm"}. Address ${company || "the hiring team"}${jobTitle ? ` for the ${jobTitle} role` : ""}.

STRUCTURE (4 short paragraphs):
1) Opening: who you are + the specific role + the ONE thing about ${company || "this team"} that pulled you in (from the JD).
2) Proof: ONE concrete achievement from the resume that maps to a JD requirement. Include the number/scale if present in the resume.
3) Skill bridge: 2-3 specific tools/skills from the JD that also appear in the resume. Tie them to outcomes, not lists.
4) Close: clear ask for a conversation + sign off.

RULES:
- Use ONLY facts from the resume. Never invent companies, metrics, or dates.
- No clichés ("I'm excited to apply", "I hope this finds you well", "results-driven", "passionate").
- No em dashes. Use commas or periods.
- Plain text, no markdown.`,
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

      // ext_ask — AI career assistant with full context
      if (action === "ext_ask") {
        const{sessionId,question,jobTitle,company,jobText,url}=payload as{sessionId?:string;question?:string;jobTitle?:string;company?:string;jobText?:string;url?:string};
        if(!question)return json({error:"question required"},400);
        const{data:resume}=await admin.from("resumes").select("content").eq("user_id",userId).eq("is_primary",true).maybeSingle();
        const rb=resume?.content as Record<string,unknown>|undefined;
        const bas=(rb?.basics||{}) as Record<string,string>;
        const works=((rb?.work||[]) as Array<Record<string,unknown>>);
        const skills=((rb?.skills||[]) as string[]);
        const resumeCtx=bas.name?`CANDIDATE: ${bas.name}\nTITLE: ${works[0]?.title||""}\nSKILLS: ${skills.slice(0,15).join(", ")}\nSUMMARY: ${(bas.summary||"").slice(0,300)}`:"No resume loaded.";
        const r = await callAI({
          system:`You are AYN, a smart career assistant in a Chrome extension. See the job page and candidate resume below.\nBe direct and specific — max 4 sentences unless more is needed. Never be vague.\nYou help with: fit analysis, salary ranges, interview prep, cold outreach, application question answers, resume gaps.\nFor salary: ALWAYS give a real number range (e.g. $90K-$130K CAD) based on role + location.\nFor fit: give a clear verdict (Strong/Good/Fair/Poor) + top 2 gaps.\nFor interview prep: give 3 specific questions + brief answer frameworks.\nFor outreach: write the actual message.\n\n${resumeCtx}\n\n${jobText?`JOB: ${jobTitle||""} at ${company||""}\n${jobText.slice(0,2500)}`:"No job page — general career advice."}`,
          user:question,
        });
        return json({answer:r.text,sessionId:sessionId||crypto.randomUUID()});
      }

      // smart_tailor (extension path) — same as JWT smart_tailor below
      if (action === "smart_tailor") {
        const { resumeText, jdText, jobTitle, company } = payload as { resumeText?: string; jdText?: string; jobTitle?: string; company?: string };
        if (!resumeText || !jdText) return json({ error: "resumeText and jdText required" }, 400);
        const r = await callAI({
          model: QUALITY_MODEL,
          system: `You are an ATS resume editor. Tailor the candidate's resume to this job WITHOUT inventing experience.

Return ONLY this JSON (no code fences):
{
  "keywords": [{"text":"<keyword>","inResume": true|false, "importance":"high|medium|low"}],
  "tailoredText": "<full plain-text ATS resume>",
  "changes": ["<change 1>", "<change 2>", "..."],
  "atsScore": <integer 0-100>,
  "scoreReasoning": "<one sentence on the score>"
}

KEYWORDS (10-14): extract the most important hard skills, tools, certs, methodologies from the JD. Mark inResume=true only if the EXACT term (or a very close variant) appears in the resume text. Mark importance: high if mentioned 2+ times or in "must have" / "required"; medium otherwise; low for nice-to-haves.

TAILORED RESUME:
- Keep ALL company names, titles, dates EXACTLY as in original. Never change facts.
- Rewrite bullets to weave in missing JD keywords WHERE the existing experience genuinely supports it. If a keyword is not supported by real work history, do NOT add it.
- Re-order skills to surface JD-matching ones first.
- Strengthen verbs (Led, Shipped, Reduced, Owned). Quantify when numbers exist in original. Never fabricate numbers.
- Output as clean ATS plain text: section headers in CAPS, dashes for bullets, one column, no tables, no emojis.

CHANGES (3-6): plain-language list of edits ("Added 'Kubernetes' to DevOps bullet under Acme — already implied by 'container orchestration'.").

ATS SCORE: weight by keyword coverage (60%), title alignment (20%), seniority match (20%). Honest.`,
          user: `TARGET ROLE: ${jobTitle||""} at ${company||""}\n\nORIGINAL RESUME:\n${resumeText.slice(0,8000)}\n\nJOB DESCRIPTION:\n${jdText.slice(0,6000)}`,
        });
        let parsed: { keywords?: unknown; tailoredText?: unknown; changes?: unknown } = {};
        try {
          const raw = r.text.replace(/```(?:json)?\s*/gi,"").replace(/```/g,"").trim();
          const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
          parsed = JSON.parse(s !== -1 ? raw.slice(s, e+1) : raw);
        } catch { return json({ error: "Failed to parse AI response" }, 500); }
        return json({
          keywords: Array.isArray(parsed.keywords) ? (parsed.keywords as Array<Record<string, unknown>>).slice(0,14).map(k => ({ text: String(k.text||""), inResume: Boolean(k.inResume), importance: String(k.importance||"medium") })) : [],
          tailoredText: String(parsed.tailoredText || ""),
          changes: Array.isArray(parsed.changes) ? (parsed.changes as string[]).slice(0,6) : [],
          atsScore: Math.max(0, Math.min(100, Math.round(Number((parsed as Record<string, unknown>).atsScore) || 0))),
          scoreReasoning: String((parsed as Record<string, unknown>).scoreReasoning || ""),
        });
      }

      // ext_ask: see earlier handler in this block (single source of truth).


      // ──────────────────────────────────────────────────────────────
      // v1.4.0: ANSWER MEMORY — remember good open-text answers
      // so they auto-reuse on future similar questions across apps.
      // ──────────────────────────────────────────────────────────────
      if (action === "ext_save_answer") {
        const { questionText, answerText, company, role } = payload as { questionText?: string; answerText?: string; company?: string; role?: string };
        if (!questionText || !answerText) return json({ error: "questionText + answerText required" }, 400);
        const normalized = questionText.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
        const hash = await sha256Hex(normalized);
        const { error } = await admin.from("ext_answers").upsert({
          user_id: userId, question_hash: hash, question_text: questionText.slice(0, 500), answer_text: answerText.slice(0, 4000),
          last_company: company || null, last_role: role || null, use_count: 1, updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,question_hash" });
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      if (action === "ext_lookup_answer") {
        const { questionText } = payload as { questionText?: string };
        if (!questionText) return json({ error: "questionText required" }, 400);
        const normalized = questionText.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
        const hash = await sha256Hex(normalized);
        const { data } = await admin.from("ext_answers").select("answer_text, use_count, last_company").eq("user_id", userId).eq("question_hash", hash).maybeSingle();
        if (!data) return json({ found: false });
        admin.from("ext_answers").update({ use_count: (data.use_count || 0) + 1, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("question_hash", hash).then(() => {});
        return json({ found: true, answer: data.answer_text, useCount: data.use_count, lastCompany: data.last_company });
      }

      // ──────────────────────────────────────────────────────────────
      // v1.4.0: ext_get_resume_blob — return resume as base64 .txt for programmatic file attach
      // ──────────────────────────────────────────────────────────────
      if (action === "ext_get_resume_blob") {
        const { data: resume } = await admin.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle();
        if (!resume?.content) return json({ error: "No resume on file. Upload one at aynn.io first." }, 404);
        const rc = resume.content as Record<string, unknown>;
        const basics = (rc.basics || {}) as Record<string, string>;
        const work = (rc.work || []) as Array<Record<string, unknown>>;
        const edu = (rc.education || []) as Array<Record<string, unknown>>;
        const skills = (rc.skills || []) as string[];
        const lines: string[] = [];
        if (basics.name) lines.push(basics.name);
        const contact = [basics.email, basics.phone, basics.location].filter(Boolean).join("  |  ");
        if (contact) lines.push(contact);
        if (basics.summary) lines.push("", "SUMMARY", basics.summary);
        if (work.length) {
          lines.push("", "EXPERIENCE");
          work.forEach(w => {
            lines.push("", `${w.title || ""} — ${w.company || ""}   ${w.start || ""} - ${w.end || "Present"}`);
            ((w.bullets as string[]) || []).forEach(b => lines.push(`- ${b}`));
          });
        }
        if (edu.length) {
          lines.push("", "EDUCATION");
          edu.forEach(e => lines.push(`${e.degree || ""} ${e.field ? "in " + e.field : ""} — ${e.school || ""}  ${e.end || ""}`));
        }
        if (skills.length) { lines.push("", "SKILLS", skills.join(", ")); }
        const text = lines.join("\n");
        const bytes = new TextEncoder().encode(text);
        // base64 encode
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const b64 = btoa(bin);
        const filename = `${(basics.name || "Resume").replace(/\s+/g, "_")}_AYN.txt`;
        return json({ base64: b64, filename, mime: "text/plain", size: bytes.length });
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

    // smart_tailor: see EXT_ACTIONS handler above (single source of truth).


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

    // ext_job_score: see EXT_ACTIONS handler above (single source of truth).


    // ext_suggest_roles: see EXT_ACTIONS handler above (single source of truth).


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
