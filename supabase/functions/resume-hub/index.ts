// Resume Hub — unified AI edge function.
// Actions: parse, rewrite, tailor, match, cover-letter, autofill
// Auth: requires the caller's Supabase JWT (Authorization: Bearer ...).
// All DB writes use the caller's JWT so RLS enforces per-user isolation.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ──────────────────────────────────────────────────────────────
// humanize(): strip em/en dashes and " - " connectors from every
// user-facing string AYN generates. Ranges become "X to Y", any
// other dash becomes a comma. Phone numbers and hyphenated words
// (Saudi-Korean, ATS-friendly) keep their hyphens because they
// have no surrounding spaces.
// ──────────────────────────────────────────────────────────────
function humanize(s: unknown): unknown {
  if (typeof s !== "string" || !s) return s;
  return s
    // money ranges with $ on the left: $90K-$120K, $110K – $140K  -> "to"
    .replace(/(\$[ \t]?\d[\d,.]*[ \t]?[KkMm]?)[ \t]*[\u2014\u2013-][ \t]*(\$?[ \t]?\d[\d,.]*[ \t]?[KkMm]?)/g, "$1 to $2")
    // magnitude ranges where BOTH sides carry a K/M suffix: 90K-120K, 1.2M–1.5M -> "to"
    .replace(/(\d[\d,.]*[KkMm])[ \t]*[\u2014\u2013-][ \t]*(\d[\d,.]*[KkMm])/g, "$1 to $2")
    // any em or en dash anywhere -> comma (safe: never appears in dates, phones, ids, urls)
    .replace(/[ \t]*[\u2014\u2013][ \t]*/g, ", ")
    // " - " spaced ASCII hyphen used as a connector -> comma
    // (bare hyphens with no surrounding spaces are LEFT ALONE on purpose:
    //  protects 2023-2025, 416-660-9926, Saudi-Korean, ISO dates, UUIDs, URLs)
    .replace(/[ \t]+-[ \t]+/g, ", ")
    .replace(/ ,/g, ",")
    .replace(/,[ \t]*,/g, ", ")
    .trim();
}
function humanizeAny<T>(v: T): T {
  if (v == null) return v;
  if (typeof v === "string") return humanize(v) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => humanizeAny(x)) as unknown as T;
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = k === "optionValue" || k === "optionLabel" || k === "optionLabels" ? val : humanizeAny(val);
    }
    return out as unknown as T;
  }
  return v;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(humanizeAny(data)), {
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
        const choice = data?.choices?.[0];
        const finishReason = choice?.finish_reason || choice?.finishReason || data?.stop_reason;
        if (finishReason === "length" || finishReason === "max_tokens") {
          throw new Error("AI response truncated. Retry with fewer fields or more output tokens.");
        }
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
        // 1s, 2s, 4s
        await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt)));
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

// v2.7.0 — resolve the resume content the extension should use.
// If a specific tailored version was requested (resume_version_id) and it
// belongs to this user, use that; otherwise fall back to the primary resume.
async function resolveResumeContent(
  admin: ReturnType<typeof createClient>,
  userId: string,
  resumeVersionId?: string,
): Promise<{ id: string | null; content: Record<string, unknown> | null; source: "version" | "primary" | "none" }> {
  if (resumeVersionId && typeof resumeVersionId === "string" && resumeVersionId.length > 0) {
    const { data: v } = await admin
      .from("resume_versions")
      .select("id, resume_id, content, user_id")
      .eq("id", resumeVersionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (v?.content) return { id: v.resume_id as string, content: v.content as Record<string, unknown>, source: "version" };
  }
  const { data: primary } = await admin
    .from("resumes")
    .select("id, content")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  if (primary?.content) return { id: primary.id as string, content: primary.content as Record<string, unknown>, source: "primary" };
  return { id: null, content: null, source: "none" };
}

const EXT_ACTIONS = new Set([
  "ext_bootstrap", "ext_ingest_job", "ext_autofill",
  "ext_cover_letter_text",
  "ext_job_score", "ext_suggest_roles", "ext_find_contacts",
  "ext_save_application", "ext_get_applications", "ext_update_application",
  "ext_download_resume_text", "smart_tailor", "ext_ask",
  // v1.4.0: smarter AI
  "ext_get_resume_blob",
  // v1.5.0 Phase 1: canonical profile read for extension
  "ext_profile_canonical_get",
  // v1.9.19: autofill telemetry
  "ext_log_result",
  // v1.9.30 Phase 3: vision fallback for custom (non-native) option controls
  "ext_vision_fill",
  // v1.9.55: two-lane resolver — client-side profile vector
  "ext_profile",
  // v2.7.0: learned answers CRUD
  "answers_list", "answers_update", "answers_delete",
  // v2.8.0: JD resolver — fetch previously-ingested JD by host+path
  "ext_job_lookup",
  // v2.10.0: server-driven adapter config for the question engine.
  "ats_config_get",
]);


// ──────────────────────────────────────────────────────────────
// Phase 2 helpers: URL normalization, full-JD parse, fallback score
// ──────────────────────────────────────────────────────────────

function normalizeUrlForHash(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    // Keep only stable job-identifying query params; drop tracking/session noise.
    const KEEP = new Set([
      "jk", "vjk", "currentJobId", "jobId", "job_id", "id",
      "gh_jid", "lever-source", "postingId", "requisitionId",
    ]);
    const sp = new URLSearchParams();
    for (const [k, v] of u.searchParams) {
      if (KEEP.has(k)) sp.append(k, v);
    }
    const qs = sp.toString();
    const path = u.pathname.replace(/\/+$/, "").replace(/\/(application|apply)$/i, "");
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}${qs ? "?" + qs : ""}`;
  } catch {
    return (raw || "").trim().toLowerCase();
  }
}

async function resolveJobJd(admin: any, url: string | undefined, jdText: string | undefined): Promise<string> {
  const jd = (jdText || "").trim();
  try {
    if (!url) return jd;
    const hash = await sha256Hex(normalizeUrlForHash(url));
    const { data: c } = await admin.from("job_cache").select("full_jd, expires_at").eq("url_hash", hash).maybeSingle();
    const fresh = c && new Date(c.expires_at).getTime() > Date.now();
    const cached = (fresh && c?.full_jd) ? String(c.full_jd) : "";
    if (cached && cached.length > jd.length) return cached;
    if (!cached && jd.length >= 400) {
      const row = { url_hash: hash, url, title: "", company: "", full_jd: jd.slice(0, 30000), parsed: {}, expires_at: new Date(Date.now() + 24*60*60*1000).toISOString() };
      admin.from("job_cache").upsert(row, { onConflict: "url_hash" }).then(() => {}, () => {});
    }
    return jd;
  } catch { return jd; }
}

const JOB_META_SCHEMA = {
  type: "object",
  properties: {
    skills: { type: "array", items: { type: "string" } },
    seniority: { type: "string" },        // intern|entry|mid|senior|staff|principal|manager|director|vp|cxo
    salary: {
      type: "object",
      properties: {
        min: { type: "number" }, max: { type: "number" },
        currency: { type: "string" },     // USD|CAD|EUR|GBP|...
        period: { type: "string" },       // year|hour|month
        source: { type: "string" },       // "posting" if printed in JD, "estimate" otherwise
        display: { type: "string" },      // e.g. "$90K-$120K CAD"
      },
    },
    location: { type: "string" },
    work_mode: { type: "string" },        // remote|hybrid|onsite|unknown
    must_haves: { type: "array", items: { type: "string" } },
    nice_to_haves: { type: "array", items: { type: "string" } },
    years_required: { type: "number" },
  },
  required: ["skills", "seniority", "work_mode"],
};

type JobParsed = {
  skills: string[];
  seniority: string;
  salary: { min?: number; max?: number; currency?: string; period?: string; source?: string; display?: string };
  location: string;
  work_mode: string;
  must_haves: string[];
  nice_to_haves: string[];
  years_required?: number;
};

const EMPTY_PARSED: JobParsed = {
  skills: [], seniority: "", salary: {}, location: "",
  work_mode: "unknown", must_haves: [], nice_to_haves: [],
};

async function parseJobMeta(fullJd: string, urlHint: string, titleHint: string, companyHint: string): Promise<JobParsed> {
  if (!fullJd || fullJd.trim().length < 40) return EMPTY_PARSED;
  // Currency detection hint from URL — never default to USD.
  const host = (() => { try { return new URL(urlHint).hostname.toLowerCase(); } catch { return ""; } })();
  const ccHint = /\.ca\b|workopolis|jobbank\.gc\.ca/.test(host) ? "CAD"
    : /\.co\.uk|reed\.co\.uk/.test(host) ? "GBP"
    : /\.com\.au/.test(host) ? "AUD"
    : /\.de|\.fr|\.es|\.it|\.nl/.test(host) ? "EUR"
    : "";
  try {
    const r = await callAI({
      system: `Extract structured metadata from a job posting. Be faithful to the text.

CURRENCY RULES:
- If the JD prints a salary, use the printed currency exactly (CAD, USD, EUR, GBP, etc.). Look for $ near "CAD"/"USD", "C$", "US$", "£", "€", or the words "Canadian dollars" / "USD".
- If no currency symbol but the posting hostname suggests a country (e.g. ".ca" = Canada), prefer that country's currency.
- Hostname hint for this posting: ${host || "unknown"} → ${ccHint || "no hint"}.
- Set salary.source = "posting" only when the number came from the JD text; otherwise "estimate".

SENIORITY: one of intern|entry|mid|senior|staff|principal|manager|director|vp|cxo. Read titles + years language.
WORK_MODE: remote|hybrid|onsite|unknown.
SKILLS: 8-20 hard skills/tools/methodologies actually named in the JD. No fluff ("teamwork", "communication").
MUST_HAVES: 3-6 short phrases the JD lists under "Requirements"/"Must have"/"You have".
NICE_TO_HAVES: 2-5 short phrases under "Nice to have"/"Bonus"/"Preferred".
YEARS_REQUIRED: integer if the JD says "X+ years"; omit otherwise.`,
      user: `URL: ${urlHint}\nTITLE: ${titleHint}\nCOMPANY: ${companyHint}\n\nJOB DESCRIPTION:\n${fullJd.slice(0, 18000)}`,
      toolName: "emit_job_meta",
      toolSchema: JOB_META_SCHEMA,
    });
    const p = (r.structured as Partial<JobParsed>) || {};
    return {
      skills: Array.isArray(p.skills) ? p.skills.slice(0, 30).map(String) : [],
      seniority: String(p.seniority || ""),
      salary: (p.salary && typeof p.salary === "object") ? p.salary : {},
      location: String(p.location || ""),
      work_mode: String(p.work_mode || "unknown"),
      must_haves: Array.isArray(p.must_haves) ? p.must_haves.slice(0, 8).map(String) : [],
      nice_to_haves: Array.isArray(p.nice_to_haves) ? p.nice_to_haves.slice(0, 8).map(String) : [],
      years_required: typeof p.years_required === "number" ? p.years_required : undefined,
    };
  } catch (e) {
    console.warn("parseJobMeta failed", (e as Error).message);
    return EMPTY_PARSED;
  }
}

// Last-resort scorer when every LLM call fails. Uses the user's canonical
// skills + JD keywords to produce a calibrated number rather than an error.
function keywordFallbackScore(canonical: CanonicalProfile | null, fullJd: string, parsed: JobParsed) {
  const userSkills = new Set<string>();
  if (canonical) {
    for (const s of canonical.skills) userSkills.add(s.name.toLowerCase().trim());
    for (const t of (canonical.derived.top_skills || [])) userSkills.add(String(t).toLowerCase().trim());
  }
  const jdLower = (fullJd || "").toLowerCase();
  const jdSkills = (parsed.skills || []).map(s => s.toLowerCase().trim()).filter(Boolean);
  const haves = jdSkills.length ? jdSkills : Array.from(jdLower.matchAll(/\b([a-z][a-z0-9+.#-]{1,24})\b/g)).map(m => m[1]).slice(0, 60);

  const matched: string[] = [];
  const missing: string[] = [];
  for (const sk of (jdSkills.length ? jdSkills : haves)) {
    if (userSkills.has(sk)) matched.push(sk);
    else if (jdSkills.length) missing.push(sk);
  }
  // matchedSkills must use the original casing from canonical/jd, not lowercase.
  const matchedDisplay = matched.map(m => {
    const canon = canonical?.skills.find(s => s.name.toLowerCase().trim() === m)?.name;
    const jdOrig = (parsed.skills || []).find(s => s.toLowerCase().trim() === m);
    return canon || jdOrig || m;
  });
  const coverage = jdSkills.length ? matched.length / jdSkills.length : 0;
  const score = Math.max(1, Math.min(10, Math.round(2 + coverage * 8)));
  const label = score >= 9 ? "Strong" : score >= 7 ? "Good" : score >= 4 ? "Fair" : "Poor";
  return {
    score, matchLabel: label,
    matchedSkills: matchedDisplay.slice(0, 8),
    missingSkills: missing.slice(0, 8),
    missingKeywords: missing.slice(0, 8),
    seniorityFit: "unknown",
    salaryEstimate: parsed.salary?.display || "",
    reasons: [`Approximate keyword score (${matched.length}/${jdSkills.length || "?"} skills matched)`],
    verdict: "Approximate score from keyword overlap (AI unavailable).",
    mustHaves: [], niceToHaves: [],
    source: "approximate_keyword_overlap",
  };
}

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

async function loadCanonical(admin: SupabaseClient<any, any, any>, userId: string): Promise<CanonicalProfile | null> {
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
  const waLine = `citizenship=${wa.citizenship || "?"}, us_auth=${wa.work_authorized_us ?? "?"}, ca_auth=${wa.work_authorized_ca ?? "?"}, needs_sponsorship_now=${wa.needs_sponsorship_now ?? "?"}, needs_sponsorship_future=${wa.needs_sponsorship_future ?? "?"}, visa=${wa.visa_type || "n/a"}`;
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

// ─────────────────────────────────────────────────────────────
// v2.9.0-A / v2.9.1 — Talent Pool indexing.
// Anonymous profile_text (no email/phone/name), 768-dim embedding,
// candidate_skills rebuilt with provenance ('extracted' vs 'inferred').
//
// v2.9.1: real embeddings via the AI gateway (768-dim), with a
// deterministicEmbed fallback and model tagging so employer_match
// never cosine-compares vectors across different models.
// ─────────────────────────────────────────────────────────────
const EMBED_DIMS = 768;
const REAL_EMBED_MODEL = "openai/text-embedding-3-small";
const FALLBACK_EMBED_MODEL = "deterministic-v1";
const EMBED_ENDPOINT = "https://ai.gateway.lovable.dev/v1/embeddings";

function tokenizeForEmbed(text: string): string[] {
  return (text || "").toLowerCase().match(/[a-z0-9+.#-]{2,}/g) || [];
}

async function hashToken(tok: string): Promise<number> {
  const bytes = new TextEncoder().encode(tok);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
  return ((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 0;
}

async function deterministicEmbed(text: string): Promise<number[]> {
  const v = new Array<number>(EMBED_DIMS).fill(0);
  for (const tok of tokenizeForEmbed(text)) {
    const h = await hashToken(tok);
    const dim = h % EMBED_DIMS;
    const sign = ((h >>> 16) & 1) === 0 ? 1 : -1;
    v[dim] += sign;
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] = v[i] / norm;
  return v;
}

/**
 * Call the AI gateway embeddings endpoint with a 768-dim OpenAI model
 * (text-embedding-3-small supports the `dimensions` param so we don't
 * need to change the vector(768) column). On any failure — missing key,
 * network, non-2xx, malformed body — fall back to deterministicEmbed
 * and tag the row with 'deterministic-v1' so employer_match knows not
 * to mix these vectors with real ones.
 */
async function embedText(text: string): Promise<{ vector: number[]; model: string }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const input = (text || "").slice(0, 8000);
  if (!apiKey || !input) {
    console.log(`[embedText] fallback path (${apiKey ? "empty input" : "no LOVABLE_API_KEY"})`);
    return { vector: await deterministicEmbed(input), model: FALLBACK_EMBED_MODEL };
  }
  try {
    const r = await fetch(EMBED_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: REAL_EMBED_MODEL,
        input,
        dimensions: EMBED_DIMS,
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.log(`[embedText] fallback path (gateway ${r.status}: ${body.slice(0, 200)})`);
      return { vector: await deterministicEmbed(input), model: FALLBACK_EMBED_MODEL };
    }
    const data = await r.json() as { data?: Array<{ embedding?: number[] }> };
    const vec = data?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBED_DIMS) {
      console.log(`[embedText] fallback path (bad response shape, len=${vec?.length ?? "n/a"})`);
      return { vector: await deterministicEmbed(input), model: FALLBACK_EMBED_MODEL };
    }
    console.log(`[embedText] real path (${REAL_EMBED_MODEL}, ${vec.length}d)`);
    return { vector: vec, model: REAL_EMBED_MODEL };
  } catch (e) {
    console.log(`[embedText] fallback path (exception: ${(e as Error).message})`);
    return { vector: await deterministicEmbed(input), model: FALLBACK_EMBED_MODEL };
  }
}


function buildProfileText(c: CanonicalProfile, resumeContent: Record<string, unknown> | null): string {
  const skills = c.skills.map(s => s.name).filter(Boolean).join(", ");
  const exp = c.experiences.map(e => {
    const bullets = (e.bullets || []).slice(0, 4).join(" | ");
    return `${e.title || ""} at ${e.company || ""} ${e.start || ""}-${e.end || (e.current ? "Now" : "")} ${bullets}`.trim();
  }).join("\n");
  const edu = c.education.map(e => `${e.degree || ""} ${e.field || ""} at ${e.school || ""}`.trim()).join("; ");
  const certs = c.certifications.map(c => c.name).filter(Boolean).join(", ");
  const derived = `Seniority: ${c.derived.seniority || ""}. Function: ${c.derived.primary_function || ""}. YoE: ${c.derived.total_yoe ?? ""}. Current title: ${c.derived.current_title || ""}.`;
  const resumeSummary = ((resumeContent as { basics?: { summary?: string } })?.basics?.summary || "").toString();
  // Deliberately excludes name, email, phone, address, links to keep matching anonymous.
  return [derived, `Skills: ${skills}`, `Experience:\n${exp}`, `Education: ${edu}`, certs ? `Certifications: ${certs}` : "", resumeSummary ? `Summary: ${resumeSummary}` : ""]
    .filter(Boolean).join("\n\n");
}

async function indexCandidate(admin: SupabaseClient<any, any, any>, userId: string): Promise<{ model: string; skills_count: number } | null> {
  const [canonical, { data: primary }] = await Promise.all([
    loadCanonical(admin, userId),
    admin.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
  ]);
  if (!canonical) return null;
  const resumeContent = (primary?.content as Record<string, unknown> | null) || null;
  const profile_text = buildProfileText(canonical, resumeContent);
  const { vector: embedding, model: embedding_model } = await embedText(profile_text);

  const headline = canonical.derived.current_title || canonical.experiences[0]?.title || "";
  const summary = (resumeContent as { basics?: { summary?: string } })?.basics?.summary?.toString().slice(0, 2000) || "";
  const location = (resumeContent as { basics?: { location?: string } })?.basics?.location?.toString() || "";

  const { error: upErr } = await admin.from("candidate_index").upsert({
    user_id: userId,
    headline,
    summary,
    seniority: canonical.derived.seniority || null,
    location,
    years_experience: canonical.derived.total_yoe ?? null,
    embedding: embedding as unknown as number[],
    embedding_model,
    embedded_at: new Date().toISOString(),
    profile_text,
    indexed_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (upErr) throw upErr;


  // Rebuild candidate_skills. Extracted = literally present in canonical
  // skills or the primary resume skills. Inferred = in derived.top_skills
  // but NOT in either extracted set. Must-have matching in Phase B is
  // restricted to extracted edges.
  const norm = (s: string) => s.toLowerCase().trim();
  const canonicalSkillNames = canonical.skills.map(s => s.name).filter(Boolean);
  const resumeSkills = Array.isArray((resumeContent as { skills?: unknown })?.skills)
    ? ((resumeContent as { skills: unknown[] }).skills.filter(x => typeof x === "string") as string[])
    : [];

  const extracted = new Map<string, { skill: string; source: string }>();
  for (const s of canonicalSkillNames) {
    const n = norm(s);
    if (n && !extracted.has(n)) extracted.set(n, { skill: s, source: "canonical_profile" });
  }
  for (const s of resumeSkills) {
    const n = norm(s);
    if (n && !extracted.has(n)) extracted.set(n, { skill: s, source: "resume" });
  }

  const inferred = new Map<string, { skill: string; source: string }>();
  for (const s of (canonical.derived.top_skills || [])) {
    const name = String(s);
    const n = norm(name);
    if (n && !extracted.has(n) && !inferred.has(n)) inferred.set(n, { skill: name, source: "canonical_profile" });
  }

  await admin.from("candidate_skills").delete().eq("user_id", userId);
  const rows = [
    ...Array.from(extracted.entries()).map(([skill_norm, v]) => ({
      user_id: userId, skill: v.skill, skill_norm, provenance: "extracted", source: v.source,
    })),
    ...Array.from(inferred.entries()).map(([skill_norm, v]) => ({
      user_id: userId, skill: v.skill, skill_norm, provenance: "inferred", source: v.source,
    })),
  ];
  if (rows.length) {
    const { error: sErr } = await admin.from("candidate_skills").insert(rows);
    if (sErr) throw sErr;
  }
  return { model: embedding_model, skills_count: rows.length };
}


function reindexIfOptedIn(admin: SupabaseClient<any, any, any>, userId: string): void {
  // Non-blocking. Employer pool freshness is best-effort; caller shouldn't wait.
  admin.from("talent_pool_consent").select("opted_in").eq("user_id", userId).maybeSingle()
    .then(({ data }) => {
      if (data?.opted_in) return indexCandidate(admin, userId);
    })
    .then(undefined, (e: unknown) => console.error("reindexIfOptedIn failed", (e as Error)?.message));
}

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

    // v2.10.0 — public read of ats_config. Available BEFORE the ext-auth gate
    // because the payload is non-sensitive server-driven adapter config that
    // both the extension and (potentially) an anon caller need. Still listed
    // in EXT_ACTIONS so scripts/check-wiring.mjs sees the registration.
    if (action === "ats_config_get") {
      try {
        const admin = createClient(supabaseUrl, serviceKey);
        const { data, error } = await admin
          .from("ats_config")
          .select("config, version")
          .eq("id", "registry")
          .maybeSingle();
        if (error || !data) return json({ config: null, version: 0 });
        return json({ config: data.config, version: data.version });
      } catch (e) {
        return json({ config: null, version: 0, error: (e as Error).message });
      }
    }

    // ============ EXTENSION-AUTH ACTIONS (x-ayn-ext-token) ============
    // v2.8.4 — DUAL_AUTH_ACTIONS may also be reached from the web dashboard
    // with a session JWT (no ext token). All other EXT_ACTIONS keep the
    // strict ext-token requirement.
    const DUAL_AUTH_ACTIONS = new Set([
      "answers_list", "answers_update", "answers_delete", "ext_ingest_job",
    ]);
    if (typeof action === "string" && EXT_ACTIONS.has(action)) {
      const token = req.headers.get("x-ayn-ext-token");
      const authHeader = req.headers.get("Authorization") ?? "";
      const bearerJwt = authHeader.replace(/^Bearer\s+/i, "");
      const admin = createClient(supabaseUrl, serviceKey);
      let userId: string | null = null;
      let deviceLabel: string | null = null;

      if (token) {
        const tokenHash = await sha256Hex(token);
        const { data: tok } = await admin
          .from("extension_tokens")
          .select("user_id, revoked_at, device_label")
          .eq("token_hash", tokenHash)
          .maybeSingle();
        if (!tok) return json({ error: "Invalid token" }, 401);
        if (tok.revoked_at) return json({ error: "Token revoked" }, 401);
        userId = tok.user_id as string;
        deviceLabel = (tok.device_label as string) ?? null;
        admin.from("extension_tokens").update({ last_used_at: new Date().toISOString() }).eq("token_hash", tokenHash).then(() => {});
      } else if (DUAL_AUTH_ACTIONS.has(action) && bearerJwt) {
        const supaWeb = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: `Bearer ${bearerJwt}` } },
        });
        const { data: u } = await supaWeb.auth.getUser();
        if (!u?.user) return json({ error: "Invalid session" }, 401);
        userId = u.user.id;
        deviceLabel = "web-session";
      } else {
        return json({ error: "x-ayn-ext-token required" }, 401);
      }

      const tok = { device_label: deviceLabel };


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

      if (action === "ext_profile") {
        // v1.9.55: compact profile vector for the extension's local resolver.
        // Excludes any work_auth / EEO / salary facts — those must stay AI-side.
        const [{ data: profile }, { data: resume }, canonical] = await Promise.all([
          admin.from("user_profile_data").select("*").eq("user_id", userId).maybeSingle(),
          admin.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
          loadCanonical(admin, userId),
        ]);
        const rb = (resume?.content as { basics?: Record<string, unknown>; work?: Array<Record<string, unknown>>; education?: Array<Record<string, unknown>> } | null) || null;
        const basics = (rb?.basics || {}) as Record<string, string>;
        const work = (rb?.work || []) as Array<Record<string, unknown>>;
        const edu = (rb?.education || []) as Array<Record<string, unknown>>;
        const [firstFromResume, ...restFromResume] = (basics.name || "").trim().split(/\s+/);
        const addr = (profile?.address || {}) as Record<string, string>;
        const plinks = (profile?.links || {}) as Record<string, string>;
        const linkedin = plinks.linkedin || (basics.links as unknown as Array<{ url: string }>)?.find?.(l => /linkedin\.com/i.test(l?.url || ""))?.url || "";
        const website = plinks.portfolio || plinks.website || (basics.links as unknown as Array<{ url: string }>)?.find?.(l => !/linkedin\.com/i.test(l?.url || ""))?.url || "";
        const eduTop = edu[0] || {};
        const gradYear = (() => { const m = String((eduTop as any).end || "").match(/(19|20)\d{2}/); return m ? m[0] : ""; })();
        const parseYear = (s: unknown): number | null => { const m = String(s || "").match(/(19|20)\d{2}/); return m ? parseInt(m[0], 10) : null; };
        const nowYear = new Date().getFullYear();
        let yoe = 0;
        for (const w of work) {
          const sy = parseYear(w.start);
          const ey = /present|current/i.test(String(w.end || "")) ? nowYear : (parseYear(w.end) || nowYear);
          if (sy) yoe += Math.max(0, ey - sy);
        }
        const first_name = String(profile?.legal_first_name || firstFromResume || "");
        const last_name = String(profile?.legal_last_name || restFromResume.join(" ") || "");
        const facts = {
          first_name,
          last_name,
          full_name: [first_name, last_name].filter(Boolean).join(" ") || basics.name || "",
          email: String(profile?.email || basics.email || ""),
          phone: String(profile?.phone || basics.phone || ""),
          linkedin: /linkedin\.com\//i.test(linkedin) ? linkedin : "",
          website: website && !/linkedin\.com/i.test(website) ? website : "",
          city: String(addr.city || ""),
          region: String(addr.state || addr.province || ""),
          country: String(addr.country || ""),
          current_title: String(canonical?.derived?.current_title || (work[0] as { title?: string })?.title || basics.title || ""),
          current_company: String(canonical?.derived?.current_company || (work[0] as { company?: string })?.company || ""),
          years_experience: String(canonical?.derived?.total_yoe ?? yoe ?? ""),
          school: String((eduTop as any).school || (eduTop as any).institution || ""),
          degree: String((eduTop as any).degree || ""),
          grad_year: gradYear,
        };
        const aliases = {
          first_name: ["first name","given name","forename","prenom","prénom","nombre"],
          last_name: ["last name","surname","family name","nom","nom de famille","apellido"],
          full_name: ["full name","name","your name","legal name","nom complet","nombre completo"],
          email: ["email","e-mail","email address","courriel","adresse courriel","correo","correo electronico"],
          phone: ["phone","phone number","mobile","cell","cellphone","telephone","mobile number","téléphone","telefono","numero de telephone"],
          linkedin: ["linkedin","linkedin url","linkedin profile","profil linkedin"],
          website: ["website","portfolio","personal website","portfolio url","site web","sitio web"],
          city: ["city","town","ville","ciudad"],
          region: ["state","province","region","state/province","région","provincia"],
          country: ["country","pays","pais","país"],
          current_title: ["current title","job title","current role","title","poste actuel","puesto actual"],
          current_company: ["current company","employer","company","current employer","entreprise actuelle","empresa actual"],
          years_experience: ["years of experience","total experience","years experience","annees d'experience","anos de experiencia"],
          school: ["school","university","college","institution","universite","université","universidad"],
          degree: ["degree","qualification","diplome","diplôme","titulo"],
          grad_year: ["graduation year","year of graduation","annee de diplome","ano de graduacion"],
        };
        const digest = await sha256Hex(JSON.stringify(facts));
        return json({ facts, aliases, digest });
      }

      if (action === "ext_autofill") {
        const { fields, jobText, jobTitle, company, ats, url, extVersion, scanDiag, resolved, resume_version_id } = payload as {
          fields?: unknown; jobText?: string; jobTitle?: string; company?: string; ats?: string; url?: string; extVersion?: string; scanDiag?: unknown;
          resolved?: Array<{ id: string; source: string; confidence?: number }>;
          resume_version_id?: string;
        };
        const jd = await resolveJobJd(admin, url, jobText);
        if (!Array.isArray(fields)) return json({ error: "fields required" }, 400);
        const resolvedArr = Array.isArray(resolved) ? resolved : [];
        const resolvedBySrc = resolvedArr.reduce((acc: Record<string, number>, r) => { const k = String(r.source || "unknown"); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
        if (fields.length === 0) {
          // v1.9.55: nothing left for AI. Still record a telemetry row so
          // resolved-by-profile/memory runs show up in autofill_runs.
          let earlyRunId: string | null = null;
          try {
            const { data: runRow } = await admin.from("autofill_runs").insert({
              user_id: userId || null,
              url: url || null,
              ats: ats || null,
              company: company || null,
              job_title: jobTitle || null,
              ext_version: extVersion || "",
              fields_total: resolvedArr.length,
              ai_answered: 0,
              fields_scanned: [],
              ai_values: [],
              skipped: [],
              meta: { reason: "all_resolved_locally", resolved_by: { ...resolvedBySrc, ai: 0 }, scanDiag: Array.isArray(scanDiag) ? (scanDiag as unknown[]).slice(0, 30) : [] },
            }).select("id").single();
            earlyRunId = runRow?.id || null;
          } catch (e) { console.warn("autofill_runs early insert failed", e); }
          return json({ values: [], skipped: [], run_id: earlyRunId, meta: { reason: "no_form_fields", resolved_by: { ...resolvedBySrc, ai: 0 } } });
        }
        const [{ data: profile }, resumeResolved, canonical] = await Promise.all([
          admin.from("user_profile_data").select("*").eq("user_id", userId).maybeSingle(),
          resolveResumeContent(admin, userId, resume_version_id),
          loadCanonical(admin, userId),
        ]);
        const resume = resumeResolved.content ? { content: resumeResolved.content } : null;
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

        const addr = (profile?.address || {}) as Record<string, string>;
        const plinks = (profile?.links || {}) as Record<string, string>;
        const rawLinkedin = plinks.linkedin || (basics.links as unknown as Array<{ label: string; url: string }>)?.find?.(l => /linkedin\.com/i.test(l?.url || ""))?.url || "";
        const rawPortfolio = plinks.portfolio || plinks.website || (basics.links as unknown as Array<{ label: string; url: string }>)?.find?.(l => !/linkedin\.com/i.test(l?.url || ""))?.url || "";
        const linkedinSafe = /linkedin\.com\//i.test(rawLinkedin) ? rawLinkedin : "";
        const portfolioSafe = rawPortfolio && !/linkedin\.com/i.test(rawPortfolio) ? rawPortfolio : "";

        const merged: Record<string, unknown> = {
          first_name: profile?.legal_first_name || firstFromResume || "",
          last_name: profile?.legal_last_name || restFromResume.join(" ") || "",
          full_name: [profile?.legal_first_name, profile?.legal_last_name].filter(Boolean).join(" ") || basics.name || "",
          email: profile?.email || basics.email || "",
          phone: profile?.phone || basics.phone || "",
          location: [addr.city, addr.state || addr.province, addr.country].filter(Boolean).join(", ") || basics.location || "",
          city: addr.city || "",
          region: addr.state || addr.province || "",
          country: addr.country || "",
          summary: basics.summary || "",
          computed_years_experience: canonical?.derived?.total_yoe ?? yoe,
          computed_education_level: canonical?.derived?.education_level || educationLevel,
          current_title: canonical?.derived?.current_title || (work[0] as { title?: string })?.title || basics.title || "",
          current_company: canonical?.derived?.current_company || (work[0] as { company?: string })?.company || "",
          seniority: canonical?.derived?.seniority || "",
          primary_function: canonical?.derived?.primary_function || "",
        };
        if (linkedinSafe) merged.linkedin_url = linkedinSafe;
        if (portfolioSafe) merged.portfolio_url = portfolioSafe;
        if (plinks.github) merged.github_url = plinks.github;

        const cwa = (canonical?.work_auth || {}) as Record<string, any>;
        const pwa = (profile?.work_auth || {}) as Record<string, any>;
        const CA_PROV: Record<string,string> = { ON:"Ontario", BC:"British Columbia", AB:"Alberta", QC:"Quebec", MB:"Manitoba", SK:"Saskatchewan", NS:"Nova Scotia", NB:"New Brunswick", NL:"Newfoundland and Labrador", PE:"Prince Edward Island", NT:"Northwest Territories", YT:"Yukon", NU:"Nunavut" };
        const regionRaw = (addr.state || addr.province || "") as string;
        merged.region_full = CA_PROV[regionRaw.toUpperCase()] || regionRaw;
        merged.work_auth = {
          citizenship: cwa.citizenship || (String(pwa.type||"").toLowerCase()==="citizen" ? (addr.country||"") : "") || "",
          authorized_us: (typeof cwa.work_authorized_us === "boolean") ? cwa.work_authorized_us : undefined,
          authorized_ca: (typeof cwa.work_authorized_ca === "boolean") ? cwa.work_authorized_ca : undefined,
          needs_sponsorship: (typeof cwa.needs_sponsorship_now === "boolean") ? cwa.needs_sponsorship_now
                            : (typeof cwa.needs_sponsorship_future === "boolean") ? cwa.needs_sponsorship_future
                            : (typeof pwa.requires_sponsorship === "boolean") ? pwa.requires_sponsorship : undefined,
        };

        // v1.9.62 — deterministic answer layer before AI.
        // The root reliability issue was AI-first routing for fields that should
        // never be guessed: EEO decline, work authorization, sponsorship,
        // legal-age, required consent, and direct identity fields. These values
        // are now produced from profile/canonical facts first, then only the
        // unresolved fields are sent to the model.
        const fieldArr = (fields as Array<{ id: string; label?: string; required?: boolean; group?: string; currentValue?: unknown; labelSource?: string; type?: string; kind?: string; name?: string; options?: Array<{ label?: string; value?: string }>; fingerprint?: string; section?: string; helperText?: string; placeholder?: string; siblingLabels?: string[]; richEditor?: boolean; richDetector?: string }>);
        const hasPrefilledValue = (v: unknown) => typeof v === "string" && v.trim().length > 0;
        const normText = (s: unknown) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
        const optText = (o: { label?: string; value?: string }) => `${o.label || ""} ${o.value || ""}`;
        const fieldBlob = (f: typeof fieldArr[number]) => normText([f.group, f.label, f.name, f.section, f.helperText, f.placeholder, ...(f.options || []).map(optText)].join(" "));
        const isOptionLike = (f: typeof fieldArr[number]) => /select|radio|checkbox|buttongroup/i.test(String(f.kind || f.type || "")) || ((f.options || []).length > 0);
        const chooseOpt = (f: typeof fieldArr[number], re: RegExp) => (f.options || []).find(o => re.test(normText(optText(o))));
        const emitOpt = (f: typeof fieldArr[number], o: { label?: string; value?: string }, reasoning: string, confidence = 0.95, source = "computed") => ({ id: f.id, optionValue: o.value || o.label || "", optionLabel: o.label || o.value || "", skip: false, confidence, reasoning, source });
        const chooseYesNo = (f: typeof fieldArr[number], yes: boolean, reasoning: string, confidence = 0.85) => {
          const opts = f.options || [];
          const yesOpt = opts.find(o => /^(yes|oui|si|ja)\b/.test(normText(o.label || o.value))) || opts.find(o => /\byes\b|\boui\b|\bsi\b|\bja\b/.test(normText(optText(o))));
          const noOpt = opts.find(o => /^(no|non|nein)\b/.test(normText(o.label || o.value))) || opts.find(o => /\bno\b|\bnon\b|\bnein\b|not at this time|do not|will not/.test(normText(optText(o))));
          const chosen = yes ? yesOpt : noOpt;
          if (chosen) return emitOpt(f, chosen, reasoning, confidence);
          if (/checkbox/i.test(String(f.kind || f.type || ""))) return { id: f.id, value: yes ? "yes" : "no", skip: false, confidence, reasoning, source: "computed" };
          return null;
        };
        const directValueFor = (group: string) => {
          const g = normText(group);
          if (g.includes("identity.first_name")) return String(merged.first_name || "");
          if (g.includes("identity.last_name")) return String(merged.last_name || "");
          if (g.includes("identity.full_name")) return String(merged.full_name || "");
          if (g.includes("identity.preferred_name")) return String((profile as any)?.preferred_name || merged.first_name || "");
          if (g.includes("identity.email")) return String(merged.email || "");
          if (g.includes("identity.phone")) return String(merged.phone || "");
          if (g.includes("identity.city")) return String(merged.city || "");
          if (g.includes("identity.state")) return String(merged.region || "");
          if (g.includes("identity.country")) return String(merged.country || "");
          if (g.includes("link.linkedin")) return String((merged as any).linkedin_url || "");
          if (g.includes("link.portfolio")) return String((merged as any).portfolio_url || "");
          if (g.includes("link.github")) return String((merged as any).github_url || "");
          if (g.includes("logic.years_experience")) return String(merged.computed_years_experience || "");
          if (g.includes("logic.hours_per_week")) return "40";
          if (g.includes("logic.notice_period")) return String((profile as any)?.default_answers?.notice_period || "2 weeks");
          return "";
        };
        const anyAuthorized = (merged.work_auth as any)?.authorized_us === true || (merged.work_auth as any)?.authorized_ca === true;
        const openToRelocate = (canonical as any)?.preferences?.open_to_relocation === true || /^(yes|true)$/i.test(String((profile as any)?.default_answers?.willing_to_relocate || ""));
        const ruleAnswer = (f: typeof fieldArr[number]) => {
          if (!f?.id || hasPrefilledValue(f.currentValue)) return null;
          const blob = fieldBlob(f);
          const group = String(f.group || "");
          const kind = String(f.kind || f.type || "").toLowerCase();
          const isEeo = /^eeo\./.test(group) || /\b(gender|race|ethnic|veteran|disability status|self identify|self-identify|voluntary self identification|visible minority|indigenous|aboriginal)\b/.test(blob);
          if (isEeo && isOptionLike(f)) {
            // v2.0.1 — the user's saved EEO answers (profile.default_answers.eeo)
            // win. Decline remains the fallback for anything not stored, and for
            // question types with no stored key (pronouns, orientation, etc).
            const eeoPrefs = ((((profile as any)?.default_answers || {}).eeo) || {}) as Record<string, unknown>;
            const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const matchOpt = (want: unknown) => {
              const w = normText(String(want || ""));
              if (!w) return undefined;
              const opts = f.options || [];
              return opts.find(o => normText(o.label || o.value || "") === w)
                || opts.find(o => new RegExp(`(^|[^a-z0-9])${escRe(w)}([^a-z0-9]|$)`).test(normText(optText(o))));
            };
            const firstMatch = (v: unknown) => {
              const wants = Array.isArray(v) ? v : [v];
              for (const w of wants) { const m = matchOpt(w); if (m) return m; }
              return undefined;
            };
            const lblBlob = normText([f.label, f.group, f.section].filter(Boolean).join(" "));
            let saved;
            if (/veteran/.test(lblBlob)) saved = firstMatch((eeoPrefs as any).veteran);
            else if (/disab/.test(lblBlob)) saved = firstMatch((eeoPrefs as any).disability);
            else if (/visible minority/.test(lblBlob)) saved = firstMatch((eeoPrefs as any).visible_minority);
            else if (/indigenous|aboriginal/.test(lblBlob)) saved = firstMatch((eeoPrefs as any).indigenous);
            else if (/gender|\bsex\b/.test(lblBlob)) saved = firstMatch((eeoPrefs as any).gender);
            else if (/race|ethnic/.test(lblBlob)) saved = firstMatch((eeoPrefs as any).race);
            // v2.2.0 — multi-select race/ethnicity (Ashby "Select all that apply").
            // Field.kind === 'checkbox' with options[] and multi:true → return
            // optionLabels[] with every stored race value that matches, or the
            // decline option as a single-item list.
            const isMulti = (f as any).multi === true || (/checkbox/i.test(kind) && (f.options || []).length >= 3);
            if (isMulti && /race|ethnic/.test(lblBlob)) {
              const stored = (eeoPrefs as any).race;
              const wants = Array.isArray(stored) ? stored : (stored ? [stored] : []);
              const picked: string[] = [];
              for (const w of wants) { const m = matchOpt(w); if (m && m.label) { picked.push(m.label); break; } }
              if (picked.length) return { id: f.id, optionLabels: picked, skip: false, confidence: 0.95, reasoning: "Race/ethnicity from saved profile", source: "profile" };
              const dOpt = chooseOpt(f, /decline|prefer not|do not wish|choose not|rather not|not disclose|no answer/);
              if (dOpt && dOpt.label) return { id: f.id, optionLabels: [dOpt.label], skip: false, confidence: 0.99, reasoning: "EEO multi-select; declined per policy", source: "computed" };
            }
            if (saved) return emitOpt(f, saved, "EEO answered from your saved profile", 0.98, "profile");
            const decline = chooseOpt(f, /decline|prefer not|do not wish|choose not|rather not|not disclose|no answer/);
            if (decline) return emitOpt(f, decline, "EEO question; declined per policy", 0.99, "computed");
          }
          if (isOptionLike(f) && (/logic\.legal_age/.test(group) || /over 18|18 years|legal working age|age of majority/.test(blob))) return chooseYesNo(f, true, "Applicant is a working professional", 0.9);
          if (/consent\.marketing/.test(group)) return chooseYesNo(f, false, "Optional marketing opt-in left off", 0.95);
          if (/consent\.agree/.test(group) && (f.required || /required|certify|acknowledge|agree|privacy|terms|personal information|data processing/.test(blob))) return chooseYesNo(f, true, "Required application consent", 0.9);
          if (/logic\.sponsorship/.test(group) || /sponsor|visa sponsorship/.test(blob)) {
            const needs = (merged.work_auth as any)?.needs_sponsorship;
            if (needs === true) return chooseYesNo(f, true, "Profile says sponsorship is needed", 0.95);
            if (needs === false || anyAuthorized) return chooseYesNo(f, false, "Work authorization indicates no sponsorship needed", 0.95);
          }
          if (/logic\.work_auth|logic\.citizenship/.test(group) || /authorized to work|legally authorized|right to work|work authorization/.test(blob)) {
            const authStatement = anyAuthorized ? chooseOpt(f, /authorized|eligible|right to work|any employer|permitted/) : null;
            const countryOpt = (merged.work_auth as any)?.authorized_ca === true ? chooseOpt(f, /canada|canadian|\bca\b/) : (merged.work_auth as any)?.authorized_us === true ? chooseOpt(f, /united states|\bu\.?s\.?\b|usa|american/) : null;
            if (authStatement) return emitOpt(f, authStatement, "Work authorization from profile", 0.95);
            if (countryOpt) return emitOpt(f, countryOpt, "Work authorization country from profile", 0.95);
            if (anyAuthorized) return chooseYesNo(f, true, "Work authorization from profile", 0.95);
            if ((merged.work_auth as any)?.authorized_us === false || (merged.work_auth as any)?.authorized_ca === false) return chooseYesNo(f, false, "Work authorization not available for this country", 0.75);
          }
          if (/reside|currently based|currently located|location eligibility|relocat/.test(blob)) {
            const locationParts = normText([merged.city, merged.region, merged.region_full, merged.country].join(" ")).split(" ").filter(p => p.length > 2);
            const matchesPlace = locationParts.some(p => blob.includes(p));
            if (matchesPlace) return chooseYesNo(f, true, "Current location matches the question", 0.85) || (chooseOpt(f, /currently reside|currently live|currently based|eligible/) ? emitOpt(f, chooseOpt(f, /currently reside|currently live|currently based|eligible/)!, "Current location matches the question", 0.85) : null);
            if (openToRelocate) {
              const relocateOpt = chooseOpt(f, /relocat|open to moving|willing to move/);
              if (relocateOpt) return emitOpt(f, relocateOpt, "Open to relocation", 0.8);
            }
          }
          if (isOptionLike(f) && /logic\.(company_current_employee|company_past_employee|prior_relationship|noncompete|accommodation)/.test(group)) return chooseYesNo(f, false, "Default no unless profile says otherwise", 0.7);
          const direct = directValueFor(group);
          if (direct && !isOptionLike(f) && !/textarea|richedit|opentext/.test(kind)) return { id: f.id, value: direct, skip: false, confidence: 0.95, reasoning: "From profile or resume", source: "profile" };
          return null;
        };
        const ruleValues = fieldArr.map(ruleAnswer).filter(Boolean) as Array<{ id: string; value?: string; optionValue?: string; optionLabel?: string; optionLabels?: string[]; skip?: boolean; confidence?: number; reasoning?: string; source?: string; suggestion?: string }>;
        const ruleAnsweredIds = new Set(ruleValues.map(v => v.id));
        const fieldsForAI = fieldArr.filter(f => !ruleAnsweredIds.has(f.id));

        const r = await callAI({
          model: DEFAULT_MODEL,
          system: `You are a senior career coach filling a real job application. Use ONLY the user's profile, resume, and canonical data. Never invent personal facts.

You receive an array of "fields". Each field has: id, kind (text|textarea|select|radio|checkbox|buttongroup|typeahead), label, name, group, required, currentValue, options[{label,value}], and optionally singleChoice:true (means the checkbox group is really "pick exactly one" — return optionLabels with a single element). Fields may also carry CONTEXT: section (the surrounding section heading, e.g. "References", "Salary expectations", "Emergency contact"), siblingLabels (labels of neighbor fields in the same row/group, e.g. ["First name","Last name"] tells you this is likely a middle-name slot), helperText (aria-describedby text — often decisive), placeholder. Use CONTEXT to disambiguate short/ambiguous labels ("Name" inside a "References" section = a reference contact's name, not the applicant's). NEVER guess when siblingLabels + section still don't clarify — skip with a suggestion.

LANGUAGE RULES: Field labels may be in any language, or bilingual (e.g. 'Name/Nom', 'What are your salary expectations?/Quelles sont vos attentes salariales?'). Treat non-English questions exactly like English ones: apply the same field-group rules and answer, never skip a question only because it is not in English. For open free-text questions, write the answer in the language of the question; for bilingual labels that include English, answer in English. For select/radio/buttongroup, optionValue and optionLabel must still be copied verbatim from options[] regardless of language. Never change a page-language or locale selector (labels like Language, Langue, Idioma, or names like defaultLanguageOverride) when it already has a currentValue; skip those.

RESUME-BASED INFERENCE (be smart, not silent): Many screening questions are not stored in the profile but ARE answerable from the resume. For questions about industry background, domain exposure, or familiarity ('Do you have experience in/with X', 'Do you have an academic background and/or working experience in X', 'Have you worked in a regulated/startup/enterprise environment', 'Are you familiar with X'): scan the resume work history, education, and skills for reasonable evidence. If any real evidence exists, answer Yes with confidence 0.6 to 0.8, source 'inferred', and cite the evidence in reasoning (e.g. 'Pharmaceutical project management at BritPharm 2020 to 2022 counts as life sciences working experience'). If the resume clearly shows no connection and the question is a routine screening question, answer No with confidence 0.6 rather than skipping. An evidence-based answer on a background question is always better than leaving a required screening question blank. This inference rule NEVER applies to: licenses or certifications the user has not listed, security clearance, citizenship or work authorization (use mergedBasics.work_auth only), criminal or background checks, medical questions, or EEO/demographic questions; those keep their existing rules.

OUTPUT one object per field you choose to answer:

{ "id":"<field id>", "value":"<for text/textarea/typeahead>", "optionValue":"<exact option.value for select/radio/buttongroup>", "optionLabel":"<exact option.label>", "optionLabels":["..."] (only for checkbox multi-select), "skip":false, "confidence":0..1, "reasoning":"one short sentence", "source":"profile|resume|canonical|computed|inferred" }

CRITICAL RULES:
- For select/radio/buttongroup: SINGLE CHOICE. optionValue AND optionLabel MUST be copied verbatim from the field's options array. NEVER put a "value" string for these. If none of the offered options fits with high confidence, set skip:true. NEVER default to "No" just because you are unsure — skip instead, UNLESS the RESUME-BASED INFERENCE rule applies (routine background/industry/familiarity screening questions), in which case give the evidence-based answer.
- For checkbox group: use optionLabels (array). Single checkbox: value "yes" or "no". If a single checkbox's label is actually a Yes/No question (work authorization, sponsorship, residence, or any "Are you…", "Do you…", "Will you…", "Have you…" question), DO NOT treat it as a passive tick. Apply the WORK AUTHORIZATION, SPONSORSHIP, RESIDENCE, EDUCATION rules below to decide, then return value "yes" or "no" accordingly. NEVER default to "no" out of caution — if the rule yields Yes, return "yes".
- For typeahead: put a plain string in value (e.g. a city) the page can match against its suggestion list. For LOCATION typeaheads (city/location/where you live/where you're based), always emit the full "City, Region, Country" (e.g. "Toronto, ON, Canada") so the dropdown can match — a bare city name often fails.
- For text/textarea: put the answer in value. No dashes of any kind ("-", "–", "—"). Use "to" for ranges and a comma for connectors.
- Skip silently (skip:true) anything not derivable from the data, especially: SIN/SSN, full DOB, bank info, passwords, security questions.

DATA PRIORITY: canonical -> profile -> mergedBasics (with computed_years_experience, computed_education_level) -> resume.basics/work/skills/education.

FIELD-GROUP GUIDANCE:
identity.*  → Fill from profile + mergedBasics whenever available.
link.*      → Full URL with https://. STRICT URL MATCHING:
  - link.linkedin → output ONLY a URL whose host contains "linkedin.com/". The only acceptable source is mergedBasics.linkedin_url (it is pre-validated). If mergedBasics.linkedin_url is missing or empty, set skip:true. NEVER substitute mergedBasics.portfolio_url, profile.portfolio_url, a personal website, github, or any other URL into a LinkedIn field — even if it is the only URL you have. Skipping is correct.
  - link.portfolio / link.website → output mergedBasics.portfolio_url (or another personal site). NEVER output a linkedin.com URL here.
  - link.github → only a github.com URL; else skip.
logic.years_experience → Use mergedBasics.computed_years_experience and match the closest option ("5-7 years" etc.). Never inflate.
logic.education_level  → Use mergedBasics.computed_education_level and match the closest option.
logic.salary           → Only if canonical.preferences.salary_min_usd or profile.default_answers.salary_expectation exists; otherwise skip.

logic.citizenship      → Use canonical.work_auth.citizenship / work_authorized_ca / work_authorized_us. For a Yes/No "are you a citizen or permanent resident of {country}", answer from work_auth. If unknown, skip with a suggestion to add citizenship/PR status to the profile.
logic.legal_age        → "Are you 18 or older / of legal working age?" Answer "yes" (the applicant is a working professional). confidence 0.9.
logic.travel           → canonical.preferences.open_to_travel === true ⇒ Yes; else profile.default_answers.willing_to_travel ("yes"/true ⇒ Yes); if it asks a percentage and the user is willing, answer "yes" or the stored value; else skip with a suggestion.
logic.languages        → Use profile.default_answers.other_languages plus English. If asked which languages, list them; if nothing beyond English is known, answer "English" and suggest adding languages to the profile.
logic.background       → Criminal/background/drug questions: use profile.default_answers.criminal_record. If it indicates none, answer "no". If unknown, skip with a suggestion. For "do you consent to a background check" that is required to proceed, answer "yes".
logic.prior_relationship → "Current/former employee of {company}? Previously worked/applied here?" Default "no" unless the profile says otherwise. confidence 0.7.
logic.noncompete       → "Do you have an NDA/non-compete preventing this role?" Default "no" unless the profile says otherwise.
logic.clearance        → Use profile data if present; otherwise skip with a suggestion to add security clearance status.
logic.drivers_license  → Answer from profile if present; otherwise skip with a suggestion.
logic.accommodation    → "Do you require accommodation?" Default "no" unless the profile says otherwise. Stay neutral.
logic.references       → Use profile.default_answers.references_available. "Are references available?" → "yes" if set. If it asks for reference contact details that aren't stored, skip with a suggestion to add references.
logic.preferred_location → If the role has a single location, mirror it; otherwise use the user's city/region; if neither fits, skip with a suggestion.
logic.preferred_city   → A checkbox or radio group of city names ("Preferred office location"). Match mergedBasics.city (case-insensitive, accent-insensitive) against option labels; return the matching option. When the field is a checkbox with singleChoice:true, return optionLabels as a SINGLE-element array containing the exact matched label (the injector will uncheck other cities). If the user's city does not match ANY option AND canonical.preferences.open_to_relocation === true, pick the first available option in this order: Toronto, Montréal, Vancouver, Ottawa, Calgary, Halifax, Québec, then any other listed office; reasoning "nearest office (relocation enabled)". Pick a "not interested in working in {country}" option ONLY when authorized_ca === false AND open_to_relocation === false AND no option matches. Never leave blank when at least one option can be justified.
logic.salary_min       → If canonical.preferences.salary_min_usd exists, emit that number as a plain integer string in value (e.g. "80000"). No currency symbol, no thousands separators. If profile.default_answers.salary_expectation has a min, use it. Otherwise skip:true with suggestion "Add a salary expectation to your Profile".
logic.salary_max       → If canonical.preferences.salary_max_usd exists, emit it. Else if only salary_min is known, emit round(salary_min * 1.2 / 5000) * 5000 as plain integer. Else skip:true with suggestion "Add a salary expectation to your Profile".
logic.languages_multi  → Checkbox group of languages. Return optionLabels as an array. Always include "English" if it appears as an option. Add "French" if profile.default_answers.other_languages contains French/Français OR mergedBasics.country === "Canada". Add any other listed language that appears in profile.default_answers.other_languages. If the user has languages beyond those listed AND an "Other" option exists, include "Other". Never invent a language not backed by profile data. Never leave the field blank when English is an option.
logic.company_current_employee → "Are you currently employed by {company}?" — check if the resume's most recent work entry (work[0]) has a company name that matches {company} (case-insensitive, ignoring "Inc/Ltd/Corp/Company/Compagnie"). Return "Yes" only when it matches AND the work entry has no end date. Otherwise "No". Never skip — this is always answerable.
logic.company_past_employee    → "Are you a past/former employee of {company}?" — Yes if ANY work[] entry's company matches {company} (same normalization) AND has an end date. Otherwise "No". Never skip.
logic.dependent_followup       → A free-text follow-up like "Which agency", "Please specify", "If yes, ...". If you can find an obvious answer in the profile.default_answers or resume, provide it. Otherwise skip:true with suggestion "Only needed if the previous question was Yes".
logic.employment_type  → Default to full-time unless canonical.preferences or the profile indicate otherwise.
logic.notice_period    → Use profile.default_answers.notice_period (e.g. "2 weeks", "1 month"). If missing, answer "2 weeks" with confidence 0.6 and suggestion "Add your notice period to Profile".
logic.start_date       → Use canonical.preferences.start_date_availability or profile.default_answers.start_date. If missing and the field is a date picker, emit today + 14 days in the field's format with confidence 0.6. If free text, "Two weeks after offer" with confidence 0.7. Never skip a required start-date question.
logic.hours_per_week   → Default "40" for full-time, adjust from profile.default_answers if present.
logic.current_salary   → NEVER volunteer. Only answer if canonical.preferences.current_salary or profile.default_answers.current_salary is set; else skip with suggestion "Optional — you can leave blank".
logic.reference_name / logic.reference_email / logic.reference_phone → Use profile.default_answers.references[]. Match by index using siblingLabels + section (Reference 1 vs Reference 2). If not stored, skip with suggestion "Add references in Profile".
identity.middle_name   → Only if present in the profile; never invent. Otherwise skip.
identity.preferred_name→ Use the profile's preferred name; if absent, use the first name.
consent.agree          → Consent/terms/privacy/attestation/personal-information checkboxes that are REQUIRED to submit (including "I certify the information is true", "Personal information", "Informations personnelles", "Renseignements personnels", "I acknowledge", "I accept", "I agree", GDPR/CCPA notices, data-processing consent for THIS application): answer "yes"/tick the box, since the user initiated this application. Do not tick anything that is optional marketing.
consent.marketing      → Optional marketing/newsletter opt-ins: leave OFF. Return value "no" (or skip). Never opt the user in.
open.referral          → If the profile names a referral, use it; otherwise skip with a suggestion. Never invent a referrer.
open.behavioral        → Write a concise STAR-style answer grounded ONLY in the resume's real experience, under 120 words.
logic.relocate → canonical.preferences.open_to_relocation === true ⇒ Yes; else profile.default_answers.willing_to_relocate ("yes"/true ⇒ Yes); else skip.
logic.work_mode / remote → canonical.preferences.open_to_remote === true ⇒ remote-friendly/Yes; else profile.default_answers.remote_preference; else skip.


BUTTONGROUP YES/NO ROUTING:
A buttongroup whose options reduce to Yes/No (case-insensitive) is a real single-choice question — NOT a "should I tick this checkbox" decision. Apply the WORK AUTHORIZATION, SPONSORSHIP, RESIDENCE, EDUCATION, and EEO rules below to decide Yes vs No, then return the exact optionLabel/optionValue from the field's options[]. If the rule says skip, return skip:true. Never default to "No" out of caution.

WORK AUTHORIZATION & SPONSORSHIP (logic.work_auth, logic.sponsorship, and similar) — DRIVEN BY THIS USER'S DATA, NEVER HARDCODED:
Read work authorization ONLY from mergedBasics.work_auth: { citizenship, authorized_us (true|false|undefined), authorized_ca (true|false|undefined), needs_sponsorship (true|false|undefined) }. Read where the user lives ONLY from mergedBasics.city, mergedBasics.region, mergedBasics.region_full, mergedBasics.country. IGNORE any other work_auth object on canonical or profile — mergedBasics.work_auth is the single source of truth.

Generic decision rules (apply to ANY user, no country baked in):
1. Determine the role's eligible countries from context.url, context.company, jobDescription text, and any locations listed in the field's own options[] or label (e.g. "US or Canada", "United States only", "Ontario, Toronto, Remote-Canada").
2. "Are you legally authorized to work in COUNTRY(s)?" → Yes if the user has authorization in ANY ONE of the role's eligible countries: authorized_us === true ⇒ authorized in the United States; authorized_ca === true ⇒ authorized in Canada; citizenship clearly names a listed country. Otherwise No. If none of the relevant authorized_* fields are set AND citizenship does not clearly cover any listed country → skip:true. Do NOT guess from the resume location, name, or language.
3. Combined-country phrasing ("X or Y", "one of: …", "U.S. or Canada", "Canada or the United States") → Yes if rule #2 returns Yes for ANY listed country. Example: question "authorized to work in the U.S. or Canada?" with authorized_ca true OR authorized_us true ⇒ Yes. Do NOT answer No when authorized_us or authorized_ca is true.
4. SPONSORSHIP — "Will you (now or in the future) require visa sponsorship?" → No if authorized_us or authorized_ca is true for any eligible country, OR needs_sponsorship === false. Yes only if not authorized in any eligible country AND needs_sponsorship === true. Else skip.
5. If the role's country is genuinely unclear, skip these questions.
 6. RESIDENCE / LOCATION ELIGIBILITY — questions like "Do you currently reside in / live in [places]?" or "Are you currently based in a location where {company} can employ you?", often listing specific cities, states, or countries in the label or in the options. Match mergedBasics.city, region, region_full, AND country against ANY place named in the question label OR in the options (e.g. the label lists "Toronto" and mergedBasics.city is "Toronto" ⇒ the user qualifies; option "Ontario" matches region_full "Ontario" / region "ON" / country "Canada"). When the options are descriptive sentences, pick by MEANING: if the user's location matches ⇒ choose the "Yes, I currently reside in one of them" option; if it does not match but relocation is allowed (open_to_relocation true or willing_to_relocate yes) ⇒ choose the "No, but I am open to relocating" option; choose the "not an option / will not relocate" option only if relocation is explicitly false. Return the exact optionLabel/optionValue. Skip only if there is no location data at all.
 7. "Open to relocating?" → Yes if canonical.preferences.open_to_relocation === true OR profile.default_answers.willing_to_relocate is "yes"/true; No if either is explicitly false/"no"; else skip.
 8. "Do you have a degree?" → Yes if mergedBasics.computed_education_level is set; match the closest option.
 9. MULTI-OPTION WORK-AUTH RADIOS (descriptive statements or a country/location list, NOT plain Yes/No) — you MUST still answer by selecting the option whose MEANING fits this user, never skip just because the options are long sentences:
    - Statement options such as "I am authorized to work for any employer in {country}" vs "I require / will require sponsorship now or in the future" vs "My status is unknown": if authorized_us OR authorized_ca is true for an eligible country AND needs_sponsorship is not true ⇒ pick the "authorized to work for any employer" statement. Pick the sponsorship statement ONLY if the user genuinely needs sponsorship. NEVER pick "unknown" when authorization is known.
    - Country / location list (e.g. options "US", "Canada", "Ireland"): pick the country where the user is authorized (authorized_ca true ⇒ "Canada"; authorized_us true ⇒ "US"); if authorized in more than one listed, pick the one matching the user's country/residence.
    - Return the exact optionLabel/optionValue copied from the field's options[].
 10. REQUIRED SCREENING RADIOS: for any required work-authorization, sponsorship, residence, or location-eligibility radio/select, apply rules 1 to 9 and choose the best-matching option from options[]. Do not leave it blank when the user's data yields an answer.

DEMOGRAPHIC / EEO / VOLUNTARY SELF-IDENTIFICATION (eeo.*: race, ethnicity, gender, gender identity, pronouns, sexual orientation, disability status, veteran status):
- NEVER guess or infer from the name, resume, or anything else.
- EXCEPTION: profile.default_answers.eeo holds the user's OWN stored answers (keys: gender, race, veteran, disability, visible_minority, indigenous). When the question type has a stored answer, pick the option matching that stored value, optionLabel/optionValue copied verbatim from options[], source "profile". race may be an ordered list of preferences; use the first that matches an option.
- If an option exists meaning "Decline to self-identify" / "Prefer not to answer" / "I do not wish to disclose" / "Choose not to disclose", pick that (return its exact optionLabel/optionValue).
- Otherwise set skip:true. Do not pick any specific demographic option.

OPEN-ENDED (open.* and clear free-text prompts):
open.about  → 2-3 sentences. Current role + years, then ONE concrete resume achievement that maps to the JD. Plain natural language.
open.why    → 2-3 sentences tying ONE JD requirement to ONE resume bullet. Name the company once.
open.cover  → 4-5 sentences, same rules.
open.source → "LinkedIn" by default; check context.url for indeed/glassdoor/jobright hints.
ALWAYS answer motivation / "why" / "tell us about" free-text questions with 2-3 sentences grounded in the user's profile and the job. NEVER skip an open free-text question that has a clear prompt — produce a real answer.
If kind is text/textarea/richedit/opentext and label, section, helperText, or placeholder clearly asks an application question, answer it even when group is "other" or required is false. This includes prompts like "Why are you interested in working at {company}?", "What interests you about this role?", "Is there anything you'd like to clarify or expand on regarding your work history, gaps, or career transitions?", and "Additional information".

HARD RULE — OPEN-TEXT MUST NEVER BE SKIPPED (v1.9.59): For any field with kind in {textarea, richedit, opentext} whose label/section/helperText/placeholder matches /interest|why|motivat|excite|passion|about (this|the) (company|role|position)|tell us|share/i, you MUST return a 2-4 sentence answer, source "inferred", confidence 0.6. Use context.company + context.jobTitle + one real resume achievement. If context.company is missing, say "this role". skip:true is FORBIDDEN on these fields — regardless of required flag.

HARD RULE — WORK-HISTORY CLARIFICATION/GAPS (v1.9.59): For any textarea/richedit/opentext whose label matches /gap|clarify|expand|explain|anything (else|you'd|you would)|additional (info|context|notes)|work history/i, you MUST return a value. If the resume shows no explicit gap: return exactly "There is nothing significant to clarify. My background reflects a consistent progression across the roles listed in my resume, and I am happy to discuss any part of my experience in more detail." If a real gap exists in the resume, cover it in 2-3 sentences. skip:true is FORBIDDEN on these fields.

For company-interest prompts: use context.company, context.jobTitle, jobDescription, and one real resume/profile strength. If company is missing, refer to "this role" instead of inventing a company.

CONFIDENCE: 1.0 exact data; 0.7-0.9 strong inference; 0.4-0.6 weak; <0.4 → set skip:true instead.
REASONING: one short sentence citing the actual source ("From profile.email"; "work_authorized_ca=true, Canada in role list"; "no linkedin_url in profile, skipped"; "EEO question; declined per policy").

NEVER-EMPTY SAFETY NET (v1.9.57): Empty application text fields are the #1 failure. Before returning skip:true on a REQUIRED field, run this ladder:
1. If the field is a select/radio/buttongroup with options and NONE of the domain rules above yielded an answer: pick the most neutral option in this order — an option whose label matches /prefer not|decline|do not wish|rather not|no answer/i; else an option matching /no|none|n\/a|not applicable/i for screening questions; else skip only if truly no option is defensible. Set confidence 0.4-0.5 and reasoning "neutral fallback for required field".
2. If the field is a required text/textarea with a clear prompt (open.*) and you have ANY relevant resume content, produce a short 1-2 sentence answer rather than skipping. Set source "inferred", confidence 0.5.
3. If the field is an OPTIONAL text/textarea but has a clear open application prompt from label/section/helperText/placeholder, answer it unless it asks for sensitive information. Optional open-ended company, motivation, work-history, cover-letter, and additional-information prompts should not be left empty.
4. Never apply this ladder to EEO/demographic, salary, SIN/SSN, DOB, or clearance fields — those keep their strict rules.
This ladder fires when required===true OR when a text/textarea has a clear open application prompt, and no other rule produced an answer.
SUGGESTION: when skip:true ONLY because the needed info is missing from the profile/resume/canonical, set "suggestion" to a short specific instruction (under 12 words) telling the user what to add to fix it, e.g. "Add your LinkedIn URL in Profile, Professional Links". Leave suggestion empty for sensitive fields (SIN, DOB, bank) and for EEO/demographic questions.`,
          user: JSON.stringify({
            context: { jobTitle, company, ats, url },
            fields: fieldsForAI,
            mergedBasics: merged,
            canonical,
            canonicalSummary: canonicalText,
            profile,
            resume: resume?.content,
            jobDescription: (jd || "").slice(0, 3500),
          }).slice(0, 45000),
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
                    optionValue: { type: "string" },
                    optionLabel: { type: "string" },
                    optionLabels: { type: "array", items: { type: "string" } },
                    skip: { type: "boolean" },
                    confidence: { type: "number" },
                    reasoning: { type: "string" },
                    source: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: ["id"],
                },
              },
            },
            required: ["values"],
          },
        });
        const out = (r.structured as { values?: Array<{ id: string; value?: string; optionValue?: string; optionLabel?: string; optionLabels?: string[]; skip?: boolean; confidence?: number; reasoning?: string; source?: string; suggestion?: string }> }) || { values: [] };
        // v2.2.1 — HARD id whitelist. The model occasionally invents field ids
        // (or carries ids from prior context) that were never in this scan's
        // fields[]. Those ids reach the injector, resolve to nothing, and log
        // "not found or disabled". Drop any AI value whose id is not a real
        // scanned field before it can leave the function. Rule values are always
        // built from fieldArr, so they are inherently valid.
        const knownIds = new Set(fieldArr.map(f => f.id));
        const aiValuesRaw = (out.values || []).filter(v => {
          if (v && knownIds.has(v.id)) return true;
          try { console.warn("dropped hallucinated field id", v?.id); } catch (_) {}
          return false;
        });
        const allValues = [...ruleValues, ...aiValuesRaw];
        const filtered = allValues.filter(v => {
          if (v.skip) return false;
          const hasAny = (v.value && v.value.trim()) || (v.optionValue && v.optionValue.trim()) || (v.optionLabel && v.optionLabel.trim()) || (Array.isArray(v.optionLabels) && v.optionLabels.length);
          if (!hasAny) return false;
          if (typeof v.confidence === 'number' && v.confidence < 0.4) return false;
          return true;
        });
        const fieldMap2 = new Map(fieldArr.map(f => [f.id, f]));
        const answeredIds = new Set(filtered.map(v => v.id));
        const skippedFromAI = allValues
          .filter(v => v.skip && v.suggestion && v.suggestion.trim())
          .map(v => ({ id: v.id, label: fieldMap2.get(v.id)?.label || v.id, reason: v.reasoning || "", suggestion: (v.suggestion || "").trim() }));
        const skippedIds = new Set(skippedFromAI.map(s => s.id));
        const isSensitive = (s: string) => /eeo|gender|race|ethnic|veteran|disab|sexual|pronoun|salary expectation|ssn|\bsin\b|social security|date of birth|\bdob\b/i.test(s || "");
        const requiredMissing = fieldArr
          .filter(f => f.required && !answeredIds.has(f.id) && !skippedIds.has(f.id) && !hasPrefilledValue(f.currentValue) && !isSensitive(((f.group || "") + " " + (f.label || ""))))
          .map(f => ({ id: f.id, label: f.label || f.id, reason: "No matching info in your profile.", suggestion: "Add this answer in your AYN profile." }));
        const skipped = [...skippedFromAI, ...requiredMissing].slice(0, 12);
        const meta = {
          jobDetected: !!(jd && jd.length > 80),
          profileFieldsAvailable: profileFieldsAvailable.length,
          hasResume: !!resume?.content,
          hasAnyData,
          yearsExperience: yoe,
          educationLevel,
        };
        let runId: string | null = null;
        try {
          const fieldsScanned = fieldArr.map(f => ({
            id: f.id,
            label: String(f.label || "").slice(0, 240),
            type: f.type || f.kind || "",
            group: f.group || "",
            required: !!f.required,
            options: Array.isArray(f.options) ? f.options.map(o => String(o.label || o.value || "").slice(0, 80)).slice(0, 15) : [],
            currentValue: String((f.currentValue as unknown) || "").slice(0, 60),
            labelSource: f.labelSource || "",
            fingerprint: String((f as any).fingerprint || "").slice(0, 120),
          }));
          const aiValues = allValues.map((v: { id: string; value?: string; optionValue?: string; optionLabel?: string; skip?: boolean; confidence?: number; reasoning?: string; source?: string; suggestion?: string }) => ({
            id: v.id,
            value: String(v.value || "").slice(0, 300),
            optionLabel: v.optionLabel || "",
            optionValue: v.optionValue || "",
            skip: !!v.skip,
            confidence: v.confidence,
            reasoning: String(v.reasoning || "").slice(0, 200),
            source: v.source || "",
            suggestion: String(v.suggestion || "").slice(0, 160),
          }));
          const { data: runRow } = await admin.from("autofill_runs").insert({
            user_id: userId || null,
            url: url || null,
            ats: ats || null,
            company: company || null,
            job_title: jobTitle || null,
            ext_version: extVersion || "",
            fields_total: fieldArr.length,
            ai_answered: filtered.length,
            fields_scanned: fieldsScanned,
            ai_values: aiValues,
            skipped,
            meta: (() => { try { return { ...(meta || {}), resolved_by: { ...resolvedBySrc, ai: filtered.length }, scanDiag: Array.isArray(scanDiag) ? (scanDiag as unknown[]).slice(0, 30) : [] }; } catch { return meta; } })(),
          }).select("id").single();
          runId = runRow?.id || null;
        } catch (e) {
          console.warn("autofill_runs insert failed", e);
        }
        return json({
          values: filtered,
          skipped,
          run_id: runId,
          meta,
        });
      }

      if (action === "ext_log_result") {
        try {
          const { run_id, inject_results, filled, total, retry_count, failure_classes, resolved_by, human_typing_used, human_typed_count, memory_exact_count, memory_fuzzy_count, ai_resolved_count } = payload as {
            run_id?: string;
            inject_results?: unknown;
            filled?: number;
            total?: number;
            retry_count?: number;
            failure_classes?: unknown;
            resolved_by?: unknown;
            human_typing_used?: boolean;
            human_typed_count?: number;
            memory_exact_count?: number;
            memory_fuzzy_count?: number;
            ai_resolved_count?: number;
          };
          if (!run_id) return json({ ok: false, error: "run_id required" });
          const f = Number(filled || 0);
          const t = Number(total || 0);
          await admin.from("autofill_runs").update({
            inject_results: inject_results ?? [],
            filled: f,
            failed: Math.max(0, t - f),
            retry_count: Number(retry_count || 0),
            failure_classes: Array.isArray(failure_classes) ? failure_classes : [],
            resolved_by: resolved_by && typeof resolved_by === "object" ? resolved_by : {},
            human_typing_used: !!human_typing_used,
            human_typed_count: Number(human_typed_count || 0),
            memory_exact_count: Math.max(0, Number(memory_exact_count || 0)),
            memory_fuzzy_count: Math.max(0, Number(memory_fuzzy_count || 0)),
            ai_resolved_count: Math.max(0, Number(ai_resolved_count || 0)),
            completed_at: new Date().toISOString(),
          }).eq("id", run_id);
          return json({ ok: true });
        } catch (e) {
          console.warn("ext_log_result failed", e);
          return json({ ok: false });
        }
      }


      if (action === "ext_vision_fill") {
        try {
          const { image, candidates, url, jobTitle, company } = payload as {
            image?: string;
            candidates?: { questions?: string[]; options?: string[] } | unknown;
            url?: string; jobTitle?: string; company?: string;
          };
          if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
            return json({ decisions: [] });
          }

          const [{ data: profile }, canonical] = await Promise.all([
            admin.from("user_profile_data").select("*").eq("user_id", userId).maybeSingle(),
            loadCanonical(admin, userId),
          ]);
          const addr = (profile?.address || {}) as Record<string, string>;
          const cwa = (canonical?.work_auth || {}) as Record<string, any>;
          const pwa = (profile?.work_auth || {}) as Record<string, any>;
          const CA_PROV: Record<string, string> = { ON: "Ontario", BC: "British Columbia", AB: "Alberta", QC: "Quebec", MB: "Manitoba", SK: "Saskatchewan", NS: "Nova Scotia", NB: "New Brunswick", NL: "Newfoundland and Labrador", PE: "Prince Edward Island", NT: "Northwest Territories", YT: "Yukon", NU: "Nunavut" };
          const regionRaw = (addr.state || addr.province || "") as string;
          const region_full = CA_PROV[regionRaw.toUpperCase()] || regionRaw;
          const authorized_us = (typeof cwa.work_authorized_us === "boolean") ? cwa.work_authorized_us : undefined;
          const authorized_ca = (typeof cwa.work_authorized_ca === "boolean") ? cwa.work_authorized_ca : undefined;
          const needs_sponsorship = (typeof cwa.needs_sponsorship_now === "boolean") ? cwa.needs_sponsorship_now
            : (typeof cwa.needs_sponsorship_future === "boolean") ? cwa.needs_sponsorship_future
            : (typeof pwa.requires_sponsorship === "boolean") ? pwa.requires_sponsorship : undefined;

          const facts = {
            city: addr.city || "",
            region: regionRaw || "",
            region_full,
            country: addr.country || "",
            authorized_us,
            authorized_ca,
            needs_sponsorship,
            citizenship: cwa.citizenship || "",
            eeo: (((profile?.default_answers as Record<string, unknown>) || {}) as any).eeo || {},
          };

          const cands = (candidates && typeof candidates === "object") ? candidates as { questions?: string[]; options?: string[] } : {};
          const qList = Array.isArray(cands.questions) ? cands.questions.slice(0, 30) : [];
          const optList = Array.isArray(cands.options) ? cands.options.slice(0, 40) : [];

          const system = `You are AYN, an application autofill vision assistant. You see a screenshot of a job application form containing custom (styled) radio/checkbox controls with no native <input>. Your job is to pick the correct visible option text for each unresolved question, using the user's facts.

DECISION RULES (STRICT):
- Work authorization / "authorized to work in {country}": if authorized_ca=true for a Canada question, or authorized_us=true for a US question, or the combined list includes an authorized country → pick the option meaning "authorized to work" or the specific country name.
- Sponsorship: if authorized in any listed country and needs_sponsorship is not true → pick the "do not require sponsorship" / "authorized for any employer" option.
- Residence / location eligibility: if the user's city, region, region_full, or country matches any place mentioned in the question or its options → pick the "Yes, I currently reside" option.
- EEO / demographics (gender, race, ethnicity, veteran, disability, sexual orientation): if USER FACTS eeo stores an answer for that question type (gender, race, veteran, disability, visible_minority, indigenous), pick the visible option matching the stored value (race may be an ordered preference list; use the first that matches). Otherwise pick "Decline to self-identify" / "Prefer not to disclose" / "I do not wish to answer". NEVER guess a demographic value that is not stored.
- Otherwise: pick the option that best matches the profile. If nothing fits with high confidence, OMIT that question.
- chosenOptionText MUST be copied verbatim from the visible options list so the extension can click it. No dashes; use plain text.

Return ONLY JSON, no code fences, no prose:
{"decisions":[{"question":"...","chosenOptionText":"...","reasoning":"short"}]}`;

          const userText = `USER FACTS (JSON):\n${JSON.stringify(facts)}\n\nJOB:\n${JSON.stringify({ url: url || "", jobTitle: jobTitle || "", company: company || "" })}\n\nUNRESOLVED QUESTIONS (labels):\n${JSON.stringify(qList)}\n\nVISIBLE OPTION STRINGS ON PAGE (pick chosenOptionText verbatim from this list when possible):\n${JSON.stringify(optList)}\n\nUse the screenshot to disambiguate which option belongs to which question. Respond with JSON only.`;

          let text = "";
          try {
            const r = await callAI({
              model: DEFAULT_MODEL,
              system,
              user: [
                { type: "text", text: userText },
                { type: "image_url", image_url: { url: image } },
              ],
            });
            text = r?.text || "";
          } catch (e) {
            console.warn("ext_vision_fill callAI failed", e);
            return json({ decisions: [] });
          }

          let decisions: Array<{ question: string; chosenOptionText: string; reasoning?: string }> = [];
          try {
            let raw = String(text || "").trim();
            raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
            const m = raw.match(/\{[\s\S]*\}$/);
            const jsonStr = m ? m[0] : raw;
            const parsed = JSON.parse(jsonStr);
            if (parsed && Array.isArray(parsed.decisions)) {
              decisions = parsed.decisions
                .filter((d: any) => d && typeof d.chosenOptionText === "string" && d.chosenOptionText.trim())
                .slice(0, 20)
                .map((d: any) => ({
                  question: String(d.question || "").slice(0, 240),
                  chosenOptionText: String(d.chosenOptionText).slice(0, 240),
                  reasoning: d.reasoning ? String(d.reasoning).slice(0, 240) : "",
                }));
            }
          } catch (e) {
            console.warn("ext_vision_fill parse failed", e);
            return json({ decisions: [] });
          }

          return json({ decisions });
        } catch (e) {
          console.warn("ext_vision_fill failed", e);
          return json({ decisions: [] });
        }
      }

      // v2.12.0 — ext_tailor, ext_cover_letter, ext_job_ingest removed.
      // Live twins are smart_tailor (tailoring) and ext_cover_letter_text
      // (cover letters). JD ingest/cache lives inline in ext_job_score.


      // ext_job_score: full-JD scoring with HONESTY rule + AI-failure fallback.
      // Inputs: { urlHash?, url?, jobTitle?, company?, fullJd?, jobSnippet? }
      // Lookup order: cache by urlHash → ingest inline using fullJd → snippet-only fallback.
      if (action === "ext_job_score") {
        const { urlHash, url, jobTitle, company, fullJd, jobSnippet, resume_version_id } = payload as {
          urlHash?: string; url?: string; jobTitle?: string; company?: string;
          fullJd?: string; jobSnippet?: string; resume_version_id?: string;
        };

        // v2.8.2 — honor tailored resume selection (same path as ext_autofill).
        const [resolvedResume, canonical] = await Promise.all([
          resolveResumeContent(admin, userId, resume_version_id),
          loadCanonical(admin, userId),
        ]);
        const resume = resolvedResume.content ? { content: resolvedResume.content } : null;
        if (!resume?.content && !canonical) {
          return json({ score: 0, matchLabel: "No resume", reasons: [], salaryEstimate: "", missingSkills: [], missingKeywords: [], matchedSkills: [], source: "no_profile" });
        }

        // v2.8.2 — human-readable label for what resume was actually scored.
        let resumeLabel = "Resume";
        if (resolvedResume.source === "primary") resumeLabel = "Primary resume";
        else if (resolvedResume.source === "version") {
          resumeLabel = "Resume version";
          try {
            if (resume_version_id) {
              const { data: v } = await admin
                .from("resume_versions")
                .select("created_for_job_id")
                .eq("id", resume_version_id)
                .eq("user_id", userId)
                .maybeSingle();
              const jobRef = (v?.created_for_job_id as string | undefined) || "";
              if (jobRef) {
                const { data: j } = await admin.from("jobs").select("title").eq("id", jobRef).maybeSingle();
                const t = (j?.title as string | undefined)?.trim();
                if (t) resumeLabel = `Tailored for ${t}`;
              }
            }
          } catch { /* keep default */ }
        }

        // 1. Resolve full JD: cache → inline ingest → snippet-only fallback.
        const normalized = normalizeUrlForHash(url || "");
        const hash = (urlHash && urlHash.length >= 16) ? urlHash
          : normalized ? await sha256Hex(normalized)
          : (fullJd || jobSnippet) ? await sha256Hex((fullJd || jobSnippet || "").slice(0, 400))
          : "";

        let cachedRow: { full_jd: string; parsed: JobParsed; title?: string; company?: string } | null = null;
        if (hash) {
          const { data: c } = await admin.from("job_cache")
            .select("full_jd, parsed, title, company, expires_at")
            .eq("url_hash", hash).maybeSingle();
          if (c && new Date(c.expires_at).getTime() > Date.now()) {
            cachedRow = { full_jd: c.full_jd, parsed: (c.parsed || EMPTY_PARSED) as JobParsed, title: c.title, company: c.company };
          }
        }

        let fullJdResolved = cachedRow?.full_jd || "";
        let parsedJob: JobParsed = cachedRow?.parsed || EMPTY_PARSED;
        let source: "full" | "snippet" | "approximate_keyword_overlap" = "full";

        if (!cachedRow && fullJd && fullJd.length >= 40) {
          // Inline ingest on miss.
          parsedJob = await parseJobMeta(fullJd, url || "", jobTitle || "", company || "");
          fullJdResolved = fullJd.slice(0, 30000);
          const row = {
            url_hash: hash || await sha256Hex(fullJd.slice(0, 400)),
            url: normalized || url || null,
            title: jobTitle || null, company: company || null,
            full_jd: fullJdResolved, parsed: parsedJob,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          };
          admin.from("job_cache").upsert(row, { onConflict: "url_hash" }).then(({ error }) => {
            if (error) console.warn("job_cache inline-ingest upsert failed", error.message);
          });
        } else if (!cachedRow) {
          // No full JD available — fall back to the snippet (card-badge path).
          fullJdResolved = (jobSnippet || "").slice(0, 4000);
          source = "snippet";
          // v2.8.2 — refuse to guess from tiny snippets; ask for JD instead.
          if (fullJdResolved.length < 300) {
            return json({
              needsJd: true,
              score: 0,
              matchLabel: "Needs JD",
              reasons: [],
              source: "no_jd",
              scoredAgainst: {
                jobTitle: jobTitle || cachedRow?.title || "",
                company: company || cachedRow?.company || "",
                jdChars: fullJdResolved.length,
                jdSource: source,
                resumeLabel,
                skillsCount: 0,
              },
            });
          }
        }

        // 2. Build honest user-skill index for the HONESTY rule.
        const userSkillIndex = new Map<string, string>();
        if (canonical) {
          for (const s of canonical.skills) {
            const k = s.name.toLowerCase().trim();
            if (k) userSkillIndex.set(k, s.name);
          }
          for (const t of (canonical.derived.top_skills || [])) {
            const k = String(t).toLowerCase().trim();
            if (k && !userSkillIndex.has(k)) userSkillIndex.set(k, String(t));
          }
        }
        // Resume skills as secondary signal.
        const rc = (resume?.content || {}) as Record<string, unknown>;
        for (const s of ((rc.skills as string[]) || [])) {
          const k = String(s).toLowerCase().trim();
          if (k && !userSkillIndex.has(k)) userSkillIndex.set(k, String(s));
        }

        // 3. Try AI scoring against the full JD.
        const resumeDigest = {
          basics: rc.basics,
          work: ((rc.work as Array<Record<string, unknown>>) || []).slice(0, 6).map(w => ({
            title: w.title, company: w.company, start: w.start, end: w.end,
            bullets: ((w.bullets as string[]) || []).slice(0, 4),
          })),
        };
        const canonText = canonicalDigest(canonical);

        let parsedAI: {
          score?: number; matchLabel?: string; reasons?: string[];
          salaryEstimate?: string; missingKeywords?: string[]; missingSkills?: string[];
          matchedSkills?: string[]; verdict?: string; seniorityFit?: string;
          mustHaves?: Array<{text:string;met:boolean}>;
          niceToHaves?: Array<{text:string;met:boolean}>;
        } = {};
        let aiOk = false;
        try {
          const r = await callAI({
            model: DEFAULT_MODEL,
            system: `You are a senior recruiter. Score the candidate against the FULL job description below.

Return ONLY this JSON (no code fences):
{
  "score": <integer 1-10>,
  "matchLabel": "Poor|Fair|Good|Strong",
  "reasons": ["<reason 1>","<reason 2>","<reason 3>"],
  "mustHaves": [{"text":"<requirement>","met":true|false}, ...],
  "niceToHaves": [{"text":"<nice-to-have>","met":true|false}, ...],
  "matchedSkills": ["<skill exactly as it appears in CANONICAL_SKILLS>"],
  "missingSkills": ["<JD skill not in CANONICAL_SKILLS>"],
  "seniorityFit": "under|match|over|unknown",
  "salaryEstimate": "<e.g. $90K to $120K CAD, follow JD currency>",
  "verdict": "<one sentence>"
}

HONESTY RULE (HARD): Only put a skill in matchedSkills if it appears in CANONICAL_SKILLS (case-insensitive). Anything in JD_SKILLS that is NOT in CANONICAL_SKILLS goes to missingSkills. Never fabricate a matched skill the candidate doesn't have. If unsure, mark it missing.

CURRENCY: Read JOB_PARSED.salary first — if it has a currency, use it. Otherwise infer from the JD text or the posting hostname. NEVER hardcode USD. Format ranges with the word "to": "$90K to $120K CAD" or "£55K to £70K". Never use dashes for ranges.

VOICE: write reasons and verdict the way a thoughtful person writes. Vary sentence length, plain natural language, no AI clichés ("leverage", "passionate", "in today's fast-paced"), no em dashes, no en dashes, never use ' - ' as a connector.

SCORING RUBRIC:
- 9 to 10 Strong: meets all must-haves + senior signals matching JOB_PARSED.seniority.
- 7 to 8 Good: meets most must-haves, 1 to 2 coachable gaps.
- 4 to 6 Fair: half the must-haves, real gaps in seniority or core tech.
- 1 to 3 Poor: missing the core requirement.

SENIORITY_FIT: compare canonical.derived.seniority to JOB_PARSED.seniority. "under"/"match"/"over"/"unknown".

OUTPUT RULES: reasons = 3 phrases max 6 words. mustHaves 3-5. niceToHaves 2-4. matchedSkills up to 8. missingSkills up to 8.`,
            user: `CANONICAL_SKILLS: ${Array.from(userSkillIndex.values()).slice(0, 60).join(", ")}
CANONICAL_PROFILE_SUMMARY:
${canonText}

RESUME_DIGEST:
${JSON.stringify(resumeDigest).slice(0, 5000)}

JOB_TITLE: ${jobTitle || cachedRow?.title || ""}
COMPANY: ${company || cachedRow?.company || ""}
URL: ${url || ""}
JOB_PARSED: ${JSON.stringify(parsedJob).slice(0, 2500)}

FULL_JD:
${fullJdResolved.slice(0, 15000)}`,
          });
          try {
            const raw = r.text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
            const s = raw.indexOf("{"); const e = raw.lastIndexOf("}");
            parsedAI = JSON.parse(s !== -1 ? raw.slice(s, e+1) : raw);
            aiOk = true;
          } catch { aiOk = false; }
        } catch (e) {
          console.warn("ext_job_score AI failed; using keyword fallback:", (e as Error).message);
          aiOk = false;
        }

        // v2.8.2 — grounding metadata so the UI can show WHAT was scored.
        const scoredAgainst = {
          jobTitle: jobTitle || cachedRow?.title || "",
          company: company || cachedRow?.company || "",
          jdChars: fullJdResolved.length,
          jdSource: source === "full" ? "full" : source === "snippet" ? "snippet" : "snippet",
          resumeLabel,
          skillsCount: userSkillIndex.size,
        };

        if (!aiOk) {
          const fb = keywordFallbackScore(canonical, fullJdResolved, parsedJob);
          return json({ ...fb, scoredAgainst });
        }

        // 4. HONESTY enforcement (server-side, never trust the model alone).
        const cleanedMatched: string[] = [];
        const seenMatch = new Set<string>();
        for (const m of (parsedAI.matchedSkills || [])) {
          const k = String(m || "").toLowerCase().trim();
          if (!k || seenMatch.has(k)) continue;
          if (userSkillIndex.has(k)) {
            cleanedMatched.push(userSkillIndex.get(k)!); // canonical casing
            seenMatch.add(k);
          }
        }
        // Anything in matched that didn't pass = move to missing.
        const droppedMatches = (parsedAI.matchedSkills || [])
          .filter(m => !seenMatch.has(String(m || "").toLowerCase().trim()))
          .map(String);
        const missingFromAI = (parsedAI.missingSkills || parsedAI.missingKeywords || []).map(String);
        const missingMerged = Array.from(new Set([...droppedMatches, ...missingFromAI]
          .map(s => s.trim()).filter(Boolean)));
        // Also add JD skills not in user skills (safety net).
        for (const sk of (parsedJob.skills || [])) {
          const k = sk.toLowerCase().trim();
          if (!userSkillIndex.has(k) && !missingMerged.some(x => x.toLowerCase().trim() === k)) {
            missingMerged.push(sk);
          }
        }

        // Salary: prefer the JD-printed currency from parsedJob.salary; else AI; never default USD.
        const salaryDisplay = parsedJob.salary?.display
          || String(parsedAI.salaryEstimate || "").trim();

        const score = Math.max(1, Math.min(10, Math.round(Number(parsedAI.score) || 5)));
        const validLabels = ["Poor", "Fair", "Good", "Strong"];
        const matchLabel = validLabels.includes(parsedAI.matchLabel || "") ? parsedAI.matchLabel!
          : score >= 9 ? "Strong" : score >= 7 ? "Good" : score >= 4 ? "Fair" : "Poor";
        const seniorityFit = ["under","match","over","unknown"].includes(parsedAI.seniorityFit || "")
          ? parsedAI.seniorityFit! : "unknown";

        return json({
          score, matchLabel,
          reasons: (parsedAI.reasons || []).slice(0, 3),
          mustHaves: (parsedAI.mustHaves || []).slice(0, 5).map(m => ({ text: String(m.text || ""), met: !!m.met })),
          niceToHaves: (parsedAI.niceToHaves || []).slice(0, 4).map(m => ({ text: String(m.text || ""), met: !!m.met })),
          matchedSkills: cleanedMatched.slice(0, 8),
          missingSkills: missingMerged.slice(0, 8),
          missingKeywords: missingMerged.slice(0, 8), // back-compat alias for the side panel
          seniorityFit,
          salaryEstimate: salaryDisplay,
          verdict: String(parsedAI.verdict || ""),
          source,
          scoredAgainst,
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
- coldOutreach: written FROM the candidate, addressed to the recruiter. First name reference, the specific role title, ONE concrete reason from candidate's background that maps to the JD, a clear ask (15-min chat). Under 80 words. No "hope this finds you well", no "I am excited to", no "passionate", no "leverage". Write the way a thoughtful person writes: vary sentence length, plain natural language, no AI clichés, no em dashes, no en dashes, never use ' - ' as a connector, and write ranges with the word 'to'. Plain text.
- subjectLine: short, formatted as "Role at Company" or "Role at Company: one-line angle". Use a colon if you need a separator. Never use a dash, em dash, or en dash.`,
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
        const { resumeText, jdText, tone, company, jobTitle, url } = payload as {
          resumeText?: string; jdText?: string; tone?: string; company?: string; jobTitle?: string; url?: string;
        };
        const lengthKey = String((payload as { length?: string }).length || "standard");
        const wordCap = lengthKey === "short" ? 180 : lengthKey === "detailed" ? 400 : 280;
        const guidanceRaw = String((payload as { guidance?: string }).guidance || "").trim().slice(0, 200);
        const guidanceLine = guidanceRaw
          ? `\n- The applicant asked you to emphasize: ${guidanceRaw}. Honour this only where the resume supports it; if it is not supported, ignore the request rather than inventing anything.`
          : "";
        const jd = await resolveJobJd(admin, url, jdText);
        if (!resumeText || !jd) return json({ error: "resumeText and jd required" }, 400);
        const r = await callAI({
          model: QUALITY_MODEL,
          system: `Write a cover letter under ${wordCap} words. Tone: ${tone || "professional, warm"}. Address ${company || "the hiring team"}${jobTitle ? ` for the ${jobTitle} role` : ""}.

STRUCTURE (4 short paragraphs):
1) Opening: who you are + the specific role + the ONE thing about ${company || "this team"} that pulled you in (from the JD).
2) Proof: ONE concrete achievement from the resume that maps to a JD requirement. Include the number/scale if present in the resume.
3) Skill bridge: 2-3 specific tools/skills from the JD that also appear in the resume. Tie them to outcomes, not lists.
4) Close: clear ask for a conversation + sign off.

RULES:
- Use ONLY facts from the resume. Never invent companies, metrics, or dates.
- Never alter numbers. Every metric, percentage, dollar figure, headcount, timeframe, date, and job title must appear exactly as in the resume.
- No clichés ("I'm excited to apply", "I hope this finds you well", "results-driven", "passionate", "leverage", "in today's fast-paced").
- Write the way a thoughtful person writes: vary sentence length, plain natural language, no em dashes, no en dashes, never use ' - ' as a connector. Write ranges with the word 'to' (for example $90K to $120K CAD).
- Plain text, no markdown.${guidanceLine}`,
          user: `RESUME:\n${resumeText.slice(0, 8000)}\n\nJOB DESCRIPTION:\n${jd.slice(0, 6000)}`,
        });
        return json({ body: r.text });
      }

      // ext_save_application — save to tracker via extension token
      if (action === "ext_save_application") {
        const { jobTitle, company, jobUrl, status, score, match_score, job_id, salaryEstimate, notes } = payload as {
          jobTitle?: string; company?: string; jobUrl?: string;
          status?: string; score?: number; match_score?: number; job_id?: string;
          salaryEstimate?: string; notes?: string;
        };
        if (!company || !jobTitle) return json({ error: "company and jobTitle required" }, 400);
        // v2.8.0 — accept match_score / job_id from AUTO_TRACK_SUBMIT so the
        // tracker row is enriched at capture time (previously we upserted just
        // the URL and had to rely on later manual edits).
        const finalScore = typeof match_score === "number" ? match_score
                         : typeof score === "number" ? score : null;
        const row: Record<string, unknown> = {
          user_id: userId, job_title: jobTitle, company,
          job_url: jobUrl || "", status: status || "saved",
          match_score: finalScore, salary_estimate: salaryEstimate || "",
          notes: notes || "",
          applied_at: status === "applied" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        };
        if (job_id) row.job_id = job_id;
        const { data, error } = await admin.from("job_applications").upsert(row,
          { onConflict: "user_id,job_url", ignoreDuplicates: false }).select("id").single();
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, id: data.id });
      }

      // v2.8.0 — ext_job_lookup: JD Resolver's backend branch. Given host+path
      // (or a URL), returns the most recent jobs-row with jd_text ≥ 400 chars.
      if (action === "ext_job_lookup") {
        const { host_path, url } = payload as { host_path?: string; url?: string };
        let key = String(host_path || "").trim();
        if (!key && url) {
          try {
            const u = new URL(url);
            key = `${u.hostname.replace(/^www\./,"").toLowerCase()}${u.pathname.replace(/\/+$/,"")}`;
          } catch { /* ignore */ }
        }
        if (!key) return json({ ok: true, job: null });
        // Match jobs whose source_url contains this host+path (any protocol/query).
        const like = `%${key}%`;
        const { data } = await admin.from("jobs")
          .select("id,title,company,source_url,jd_text,created_at")
          .ilike("source_url", like)
          .order("created_at", { ascending: false })
          .limit(5);
        const best = (data || []).find(j => (j.jd_text || "").length >= 400) || null;
        return json({ ok: true, job: best });
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

      // ext_download_resume_text — returns primary or tailored resume as ATS plain text
      if (action === "ext_download_resume_text") {
        const { resume_version_id } = payload as { resume_version_id?: string };
        const resolved = await resolveResumeContent(admin, userId, resume_version_id);
        if (!resolved.content) return json({ error: "No primary resume saved in AYN" }, 404);
        const resume = { content: resolved.content };
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
        const jd = await resolveJobJd(admin, url, jobText);
        const r = await callAI({
          system:`You are AYN, a smart career assistant in a Chrome extension. See the job page and candidate resume below.\nBe direct and specific (max 4 sentences unless more is needed). Never be vague.\nYou help with: fit analysis, salary ranges, interview prep, cold outreach, application question answers, resume gaps.\nFor salary: ALWAYS give a real number range using the word 'to' (e.g. $90K to $130K CAD) based on role + location. Never write the range with a dash.\nFor fit: give a clear verdict (Strong/Good/Fair/Poor) + top 2 gaps.\nFor interview prep: give 3 specific questions + brief answer frameworks.\nFor outreach: write the actual message.\nOUTPUT FORMAT (strict): write plain conversational prose. Never use markdown syntax: no asterisks, no ** bold markers, no bullet characters (*, -, •), no headers (#), no code fences. Use short paragraphs and full sentences instead of bullet lists. No em dashes, no en dashes.\nVoice: write the way a thoughtful person writes. Vary sentence length, plain natural language, no AI clichés ("I am excited to", "leverage", "passionate", "in today's fast-paced"), never use ' - ' as a connector.\n\n${resumeCtx}\n\n${jd?`JOB: ${jobTitle||""} at ${company||""}\n${jd.slice(0,2500)}`:"No job page, general career advice."}`,
          user:question,
        });
        return json({answer:r.text,sessionId:sessionId||crypto.randomUUID()});
      }

      // smart_tailor (extension path) — same as JWT smart_tailor below
      if (action === "smart_tailor") {
        const { resumeText, jdText, jobTitle, company, url } = payload as { resumeText?: string; jdText?: string; jobTitle?: string; company?: string; url?: string };
        const matchedSkills = Array.isArray((payload as { matched_skills?: unknown }).matched_skills)
          ? ((payload as { matched_skills?: string[] }).matched_skills as string[]).map(String).slice(0, 20) : undefined;
        const missingSkills = Array.isArray((payload as { missing_skills?: unknown }).missing_skills)
          ? ((payload as { missing_skills?: string[] }).missing_skills as string[]).map(String).slice(0, 20) : undefined;
        const jd = await resolveJobJd(admin, url, jdText);
        if (!resumeText || !jd) return json({ error: "resumeText and jd required" }, 400);
        const gapBlock = (matchedSkills || missingSkills)
          ? `\n\nGAP HINTS (from scorer):\nmatchedSkills: ${JSON.stringify(matchedSkills || [])}\nmissingSkills: ${JSON.stringify(missingSkills || [])}\nFor each missingSkill, look for genuinely related experience already present in the resume and surface it using the JD's terminology, but ONLY when the underlying work is really there. If there is no real basis, leave it out. Never add a skill to the skills section that is not supported by the resume.`
          : "";
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
- Never alter numbers. Every metric, percentage, dollar figure, headcount, timeframe, date, and job title must appear in the output exactly as it appears in the input. If a bullet says 40 percent, the rewritten bullet still says 40 percent. Do not round, scale, add, or remove figures.
- Rewrite bullets to weave in missing JD keywords WHERE the existing experience genuinely supports it. If a keyword is not supported by real work history, do NOT add it.
- Re-order skills to surface JD-matching ones first.
- Strengthen verbs (Led, Shipped, Reduced, Owned). Quantify when numbers exist in original. Never fabricate numbers.
- Output as clean ATS plain text: section headers in CAPS, dashes for bullets, one column, no tables, no emojis.

CHANGES (3-6): plain-language list of edits ("Added 'Kubernetes' to DevOps bullet under Acme, already implied by 'container orchestration'.").

ATS SCORE: weight by keyword coverage (60%), title alignment (20%), seniority match (20%). Honest.

VOICE: write bullets and changes the way a thoughtful person writes. Vary sentence length, plain natural language, no AI clichés ("leverage", "passionate", "in today's fast-paced"), no em dashes, no en dashes, never use ' - ' as a connector. Write ranges with the word 'to'.`,
          user: `TARGET ROLE: ${jobTitle||""} at ${company||""}\n\nORIGINAL RESUME:\n${resumeText.slice(0,8000)}\n\nJOB DESCRIPTION:\n${jd.slice(0,6000)}${gapBlock}`,
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




      // ──────────────────────────────────────────────────────────────
      // v1.4.0: ANSWER MEMORY — remember good open-text answers
      // so they auto-reuse on future similar questions across apps.
      // ──────────────────────────────────────────────────────────────
      if (action === "ext_save_answer") {
        const { questionText, answerText, company, role, fieldKind } = payload as { questionText?: string; answerText?: string; company?: string; role?: string; fieldKind?: string };
        if (!questionText || !answerText) return json({ error: "questionText + answerText required" }, 400);
        const normalized = questionText.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
        const hash = await sha256Hex(normalized);
        const { error } = await admin.from("ext_answers").upsert({
          user_id: userId, question_hash: hash, question_text: questionText.slice(0, 500), answer_text: answerText.slice(0, 4000),
          last_company: company || null, last_role: role || null, use_count: 1, updated_at: new Date().toISOString(),
          field_kind: fieldKind ? String(fieldKind).slice(0, 32) : null,
        }, { onConflict: "user_id,question_hash" });
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      // v2.11.0 — fuzzy answer memory. Never fuzzy-match on sensitive
      // discrete questions (work auth, sponsorship, EEO, salary, notice
      // period). Only compare rows whose stored field kind matches the
      // incoming one (legacy rows with a null kind are treated as text).
      if (action === "ext_lookup_answer") {
        const { questionText, fieldKind } = payload as { questionText?: string; fieldKind?: string };
        if (!questionText) return json({ error: "questionText required" }, 400);
        const normalize = (s: string) =>
          s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
        const normalized = normalize(questionText).slice(0, 240);
        const incomingKind = fieldKind ? String(fieldKind).toLowerCase() : "text";
        const hash = await sha256Hex(normalized);

        // Exact hash match first — cheapest, no kind check needed since
        // identical normalized text is definitionally the same question.
        const { data: exact } = await admin.from("ext_answers")
          .select("answer_text, use_count, last_company, question_text, field_kind")
          .eq("user_id", userId).eq("question_hash", hash).maybeSingle();
        if (exact) {
          admin.from("ext_answers").update({ use_count: (exact.use_count || 0) + 1, updated_at: new Date().toISOString() })
            .eq("user_id", userId).eq("question_hash", hash).then(() => {});
          return json({ found: true, matchType: "exact", answer: exact.answer_text, useCount: exact.use_count, lastCompany: exact.last_company, sourceQuestion: exact.question_text });
        }

        const SENSITIVE_RE = /work\s*auth|authoriz|sponsor|visa|eeo|gender|race|ethnic|veteran|disabil|salary|compensat|desired\s*pay|notice\s*period/i;
        if (SENSITIVE_RE.test(questionText)) return json({ found: false });

        const incomingTokens = new Set(normalized.split(" ").filter((t) => t.length >= 3));
        if (incomingTokens.size < 3) return json({ found: false });

        const { data: candidates } = await admin.from("ext_answers")
          .select("answer_text, use_count, last_company, question_text, field_kind, question_hash")
          .eq("user_id", userId)
          .order("use_count", { ascending: false })
          .limit(200);

        let best: { row: typeof exact; score: number; overlap: number } | null = null;
        for (const row of candidates || []) {
          const rowKind = (row.field_kind || "text").toLowerCase();
          if (rowKind !== incomingKind) continue;
          const rowNorm = normalize(row.question_text || "");
          if (!rowNorm) continue;
          const rowTokens = new Set(rowNorm.split(" ").filter((t) => t.length >= 3));
          if (rowTokens.size === 0) continue;
          let overlap = 0;
          for (const t of incomingTokens) if (rowTokens.has(t)) overlap++;
          const smaller = Math.min(incomingTokens.size, rowTokens.size);
          const score = smaller === 0 ? 0 : overlap / smaller;
          if (overlap >= 3 && score >= 0.7 && (!best || score > best.score)) {
            best = { row: row as typeof exact, score, overlap };
          }
        }
        if (!best || !best.row) return json({ found: false });
        admin.from("ext_answers").update({ use_count: (best.row.use_count || 0) + 1, updated_at: new Date().toISOString() })
          .eq("user_id", userId).eq("question_hash", (best.row as { question_hash: string }).question_hash).then(() => {});
        return json({
          found: true,
          matchType: "fuzzy",
          answer: best.row.answer_text,
          useCount: best.row.use_count,
          lastCompany: best.row.last_company,
          sourceQuestion: best.row.question_text,
          fuzzyScore: Number(best.score.toFixed(3)),
        });
      }


      // ──────────────────────────────────────────────────────────────
      // v1.4.0: ext_get_resume_blob — return resume as base64 .txt for programmatic file attach
      // ──────────────────────────────────────────────────────────────
      if (action === "ext_get_resume_blob") {
        const { resume_version_id } = payload as { resume_version_id?: string };
        const resolved = await resolveResumeContent(admin, userId, resume_version_id);
        if (!resolved.content) return json({ error: "No resume on file. Upload one at aynn.io first." }, 404);
        const resume = { content: resolved.content };
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

      if (action === "ext_profile_canonical_get") {
        const canonical = await loadCanonical(admin, userId);
        return json({ canonical: canonical || EMPTY_CANONICAL, hasProfile: !!canonical });
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
          const { value } = await mammoth.extractRawText({ buffer: b64ToBytes(fileBase64) as any });
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




    // ---------------- cover_letter ----------------
    if (action === "cover_letter") {
      const { resume, jdText, tone, company } = payload as { resume: unknown; jdText: string; tone?: string; company?: string };
      const r = await callAI({
        system: `Write a concise, specific cover letter (under 280 words). Tone: ${tone || "professional, warm"}. Address ${company || "the hiring team"}. No clichés ("I am excited to", "leverage", "passionate"). Pull concrete achievements from the resume. Voice: write the way a thoughtful person writes. Vary sentence length, plain natural language, no em dashes, no en dashes, never use ' - ' as a connector. Write ranges with the word 'to'.`,
        user: JSON.stringify({ resume, jdText }).slice(0, 30000),
      });
      return json({ body: r.text });
    }

    // ── NEW ACTIONS (JWT auth) ──
    // These run after JWT validation using supa client with RLS
    const userId = user.id;
    const adminForNew = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);



    // ---------------- Canonical Profile (Phase 1) ----------------
    // profile_canonical_get: load the saved canonical profile (empty shell if none)
    if (action === "profile_canonical_get") {
      const canonical = await loadCanonical(adminForNew, userId);
      return json({ canonical: canonical || EMPTY_CANONICAL, hasProfile: !!canonical });
    }

    // profile_canonical_extract: run AI to (re)build canonical from primary resume + user_profile_data.
    // Does NOT save automatically; UI shows the result for confirmation/edit.
    if (action === "profile_canonical_extract") {
      const [{ data: resume }, { data: profile }] = await Promise.all([
        adminForNew.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
        adminForNew.from("user_profile_data").select("*").eq("user_id", userId).maybeSingle(),
      ]);
      if (!resume?.content && !profile) return json({ error: "No primary resume or profile to extract from" }, 404);
      const canonical = await extractCanonical({
        resumeContent: resume?.content || null,
        profileExtras: profile || null,
      });
      return json({ canonical });
    }

    // profile_canonical_save: persist user-edited canonical profile (upsert by user_id).
    if (action === "profile_canonical_save") {
      const { canonical } = payload as { canonical?: Partial<CanonicalProfile> };
      if (!canonical || typeof canonical !== "object") return json({ error: "canonical required" }, 400);
      const row = {
        user_id: userId,
        skills: canonical.skills ?? [],
        experiences: canonical.experiences ?? [],
        education: canonical.education ?? [],
        certifications: canonical.certifications ?? [],
        work_auth: canonical.work_auth ?? {},
        preferences: canonical.preferences ?? {},
        derived: canonical.derived ?? {},
        updated_at: new Date().toISOString(),
      };
      const { error } = await adminForNew.from("user_profile_canonical")
        .upsert(row, { onConflict: "user_id" });
      if (error) return json({ error: error.message }, 500);
      // v2.9.0-A: re-index this user for the talent pool if they've opted in.
      reindexIfOptedIn(adminForNew, userId);
      return json({ ok: true });
    }

    // ─────────────────────────────────────────────────────────────
    // v2.7.0 — Learned Answers UI (dashboard, JWT-auth).
    // Lets the user view / edit / delete the answers the extension
    // memorised on their behalf (ext_answers table).
    // ─────────────────────────────────────────────────────────────
    if (action === "answers_list") {
      const { data, error } = await adminForNew
        .from("ext_answers")
        .select("id, question_text, answer_text, use_count, last_company, last_used_at, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) return json({ error: error.message }, 500);
      return json({ answers: data ?? [] });
    }
    if (action === "answers_update") {
      const { id, answer_text } = payload as { id?: string; answer_text?: string };
      if (!id || typeof answer_text !== "string") return json({ error: "id and answer_text required" }, 400);
      const { error } = await adminForNew
        .from("ext_answers")
        .update({ answer_text: answer_text.slice(0, 4000), updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }
    if (action === "answers_delete") {
      const { id } = payload as { id?: string };
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await adminForNew
        .from("ext_answers")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ─────────────────────────────────────────────────────────────
    // v2.9.0-A — Talent Pool (Phase A: data layer)
    // Seeker-side consent + indexing. Employer search lives in Phase B
    // and runs via the service role, gated on opted_in.
    // ─────────────────────────────────────────────────────────────
    if (action === "talent_pool_get") {
      const [{ data: consent }, { data: idx }, { count: skillsCount }] = await Promise.all([
        adminForNew.from("talent_pool_consent").select("opted_in, consented_at").eq("user_id", userId).maybeSingle(),
        adminForNew.from("candidate_index").select("indexed_at").eq("user_id", userId).maybeSingle(),
        adminForNew.from("candidate_skills").select("id", { count: "exact", head: true }).eq("user_id", userId),
      ]);
      return json({
        opted_in: !!consent?.opted_in,
        consented_at: consent?.consented_at ?? null,
        indexed: !!idx,
        skills_count: skillsCount ?? 0,
      });
    }

    if (action === "talent_pool_set") {
      const { opted_in } = payload as { opted_in?: boolean };
      if (typeof opted_in !== "boolean") return json({ error: "opted_in required" }, 400);
      const now = new Date().toISOString();
      const row = {
        user_id: userId,
        opted_in,
        consented_at: opted_in ? now : null,
        revoked_at: opted_in ? null : now,
        updated_at: now,
      };
      const { error } = await adminForNew.from("talent_pool_consent").upsert(row, { onConflict: "user_id" });
      if (error) return json({ error: error.message }, 500);
      if (opted_in) {
        try { await indexCandidate(adminForNew, userId); }
        catch (e) { console.error("indexCandidate failed", (e as Error).message); }
      } else {
        await Promise.all([
          adminForNew.from("candidate_index").delete().eq("user_id", userId),
          adminForNew.from("candidate_skills").delete().eq("user_id", userId),
        ]);
      }
      return json({ ok: true, opted_in });
    }

    // v2.9.1 — manual re-index (Talent Pool card "Re-index my profile" link).
    // Only useful when opted in; refreshes the caller's candidate_index row
    // with the current embedding model.
    if (action === "talent_pool_reindex_self") {
      const { data: consent } = await adminForNew.from("talent_pool_consent")
        .select("opted_in").eq("user_id", userId).maybeSingle();
      if (!consent?.opted_in) return json({ error: "Opt in first" }, 400);
      try {
        const result = await indexCandidate(adminForNew, userId);
        if (!result) return json({ error: "No profile to index" }, 400);
        return json(result);
      } catch (e) {
        return json({ error: (e as Error).message }, 500);
      }
    }





    // ─────────────────────────────────────────────────────────────
    // v2.9.0-B — Employer marketplace (Phase B)
    // Two-step noise cancellation:
    //   1. Deterministic prefilter: EVERY must-have must match an
    //      'extracted' skill (skill_norm or ≥0.8 token overlap).
    //      Inferred skills cannot rescue a missing must-have.
    //   2. AI rerank on ≤12 vector-recalled candidates, with opaque
    //      refs (no user_id/name/email), scored 1-100, inferred cap
    //      10 pts, "why" grounded in provided fields only.
    // ─────────────────────────────────────────────────────────────
    async function assertOrgMember(orgId: string): Promise<boolean> {
      const { data } = await adminForNew.from("org_members")
        .select("org_id").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
      return !!data;
    }

    if (action === "employer_org_create") {
      const { name, website } = payload as { name?: string; website?: string };
      if (!name || !name.trim()) return json({ error: "name required" }, 400);
      const { data: org, error } = await adminForNew.from("orgs").insert({
        name: name.trim(), website: website?.trim() || null, created_by: userId,
      }).select("id, name, website").single();
      if (error || !org) return json({ error: error?.message || "insert failed" }, 500);
      const { error: mErr } = await adminForNew.from("org_members").insert({
        org_id: org.id, user_id: userId, role: "admin",
      });
      if (mErr) return json({ error: mErr.message }, 500);
      return json({ org });
    }

    if (action === "employer_org_get") {
      const { data: mem } = await adminForNew.from("org_members")
        .select("org_id, role").eq("user_id", userId).limit(1).maybeSingle();
      if (!mem) return json({ org: null });
      const { data: org } = await adminForNew.from("orgs")
        .select("id, name, website").eq("id", mem.org_id).maybeSingle();
      return json({ org: org || null, role: mem.role });
    }

    if (action === "employer_intake_chat") {
      const { org_id, messages } = payload as { org_id?: string; messages?: Array<{ role: string; content: string }> };
      if (!org_id || !Array.isArray(messages)) return json({ error: "org_id and messages required" }, 400);
      if (!(await assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
      const sys = `You are AYN's recruiting intake assistant. The user is an employer describing a role they need to fill. Ask AT MOST 3 short clarifying questions, one at a time, ONLY about genuinely missing fields (title, seniority, must-have skills, nice-to-have skills, location/remote, min years, notes). When you have enough to search, output ONLY JSON: {"done":true,"job_spec":{"title":"","seniority":"","must_have_skills":[],"nice_to_have_skills":[],"location_preference":"","remote_ok":false,"min_years":0,"notes":""}}. seniority must be one of: intern, entry, mid, senior, staff, principal, manager, director. Cap must_have_skills and nice_to_have_skills at 6 each. Otherwise output ONLY JSON: {"done":false,"question":"..."}. Questions must be plain prose. Never use em dashes, en dashes, or markdown symbols. Use the word "to" for ranges.`;
      const userTurn = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
      const r = await callAI({ system: sys, user: userTurn });
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(r.text); }
      catch {
        const m = r.text.match(/\{[\s\S]*\}/);
        try { parsed = m ? JSON.parse(m[0]) : { done: false, question: "Could you tell me a bit more about the role?" }; }
        catch { parsed = { done: false, question: "Could you tell me a bit more about the role?" }; }
      }
      return json(parsed);
    }

    if (action === "employer_match") {
      const { org_id, job_spec } = payload as { org_id?: string; job_spec?: Record<string, unknown> };
      if (!org_id || !job_spec) return json({ error: "org_id and job_spec required" }, 400);
      if (!(await assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);

      const mustHaves = Array.isArray(job_spec.must_have_skills) ? (job_spec.must_have_skills as string[]).map(s => String(s).toLowerCase().trim()).filter(Boolean) : [];
      const niceToHaves = Array.isArray(job_spec.nice_to_have_skills) ? (job_spec.nice_to_have_skills as string[]).map(s => String(s).toLowerCase().trim()).filter(Boolean) : [];

      // Load opted-in candidates.
      const { data: consented } = await adminForNew.from("talent_pool_consent")
        .select("user_id").eq("opted_in", true);
      const candidateIds = (consented || []).map(r => r.user_id);
      if (candidateIds.length === 0) {
        return json({ search_id: null, results: [], pool_note: "No candidates are in the pool yet." });
      }

      // Load their extracted skills (only extracted can satisfy must-haves).
      const { data: skillRows } = await adminForNew.from("candidate_skills")
        .select("user_id, skill_norm, provenance").in("user_id", candidateIds);
      const extractedByUser = new Map<string, Set<string>>();
      const inferredByUser = new Map<string, Set<string>>();
      for (const r of (skillRows || [])) {
        const bag = r.provenance === "extracted" ? extractedByUser : inferredByUser;
        if (!bag.has(r.user_id)) bag.set(r.user_id, new Set());
        bag.get(r.user_id)!.add(r.skill_norm);
      }

      const tokenOverlap = (a: string, b: string): number => {
        const ta = new Set(a.split(/[^a-z0-9]+/).filter(t => t.length >= 2));
        const tb = new Set(b.split(/[^a-z0-9]+/).filter(t => t.length >= 2));
        if (!ta.size || !tb.size) return 0;
        let inter = 0;
        for (const t of ta) if (tb.has(t)) inter++;
        return inter / Math.max(ta.size, tb.size);
      };
      const hasMust = (mh: string, bag: Set<string>): boolean => {
        if (bag.has(mh)) return true;
        for (const s of bag) if (tokenOverlap(mh, s) >= 0.8) return true;
        return false;
      };
      const eligibleIds = candidateIds.filter(uid => {
        const bag = extractedByUser.get(uid) || new Set<string>();
        return mustHaves.every(mh => hasMust(mh, bag));
      });
      if (eligibleIds.length === 0) {
        return json({ search_id: null, results: [], pool_note: "No candidates in the pool cover every must-have skill yet. The pool grows as job seekers opt in." });
      }

      // v2.9.1 — embed the spec with the real model when available and
      // ONLY cosine-compare against candidate_index rows produced by that
      // same model. Mixing models yields meaningless scores. If some
      // eligible candidates are still on the fallback model, re-index up
      // to 25 of them inline before ranking; the rest will catch up on
      // their next profile save or manual re-index (non-blocking to the
      // user, nothing surfaced in the UI).
      const specText = [job_spec.title, job_spec.notes, mustHaves.join(", "), niceToHaves.join(", ")].filter(Boolean).join("\n");
      const { vector: specEmbedding, model: specModel } = await embedText(String(specText || ""));

      const { data: rawIndexRows } = await adminForNew.from("candidate_index")
        .select("user_id, headline, seniority, years_experience, location, profile_text, embedding, embedding_model")
        .in("user_id", eligibleIds);
      let indexRows = rawIndexRows || [];

      if (specModel !== FALLBACK_EMBED_MODEL) {
        const stale = indexRows.filter(r => (r.embedding_model || FALLBACK_EMBED_MODEL) !== specModel).slice(0, 25);
        for (const r of stale) {
          try { await indexCandidate(adminForNew, r.user_id); }
          catch (e) { console.error("inline reindex failed", r.user_id, (e as Error).message); }
        }
        if (stale.length) {
          const { data: refreshed } = await adminForNew.from("candidate_index")
            .select("user_id, headline, seniority, years_experience, location, profile_text, embedding, embedding_model")
            .in("user_id", eligibleIds);
          if (refreshed) indexRows = refreshed;
        }
      }

      const cosine = (a: number[], b: number[]): number => {
        let dot = 0, na = 0, nb = 0;
        const n = Math.min(a.length, b.length);
        for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
        const d = Math.sqrt(na) * Math.sqrt(nb);
        return d === 0 ? 0 : dot / d;
      };
      const parseEmbedding = (v: unknown): number[] => {
        if (Array.isArray(v)) return v as number[];
        if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
        return [];
      };
      // Same-model filter — never compare vectors across different embedding models.
      const comparable = indexRows.filter(r => (r.embedding_model || FALLBACK_EMBED_MODEL) === specModel);
      const ranked = comparable.map(r => ({
        ...r,
        sim: cosine(parseEmbedding(r.embedding), specEmbedding),
      })).sort((a, b) => b.sim - a.sim).slice(0, 12);


      // Build anonymized rerank input.
      const refMap: Record<string, string> = {};
      const rerankInput = ranked.map((row, i) => {
        const ref = `c${i + 1}`;
        refMap[ref] = row.user_id;
        return {
          ref,
          profile_text: (row.profile_text || "").slice(0, 4000),
          seniority: row.seniority || "",
          years_experience: row.years_experience ?? null,
          location: row.location || "",
          skills: {
            extracted: Array.from(extractedByUser.get(row.user_id) || []),
            inferred: Array.from(inferredByUser.get(row.user_id) || []),
          },
          headline: row.headline || "",
        };
      });

      const rerankSys = `You are AYN's employer-side hiring judge. Score each candidate 1-100 for THIS job_spec. Rules, strict:
- must_have coverage may ONLY cite skills from candidate.skills.extracted. Never let an inferred skill satisfy a must-have.
- Inferred skills may contribute AT MOST 10 total points across nice-to-haves.
- Every sentence in "why" must reference something literally present in the candidate's provided data (profile_text, seniority, years_experience, location, or extracted/inferred skills). No speculation.
- If fewer than 3 candidates are genuinely strong, return fewer and explain in pool_note. Do not pad.
- Never mention refs, ids, names, or emails you were not given. Never invent skills.
- Output ONLY JSON: {"results":[{"ref":"c1","score":87,"why":["...","...","..."],"matched_must_haves":[],"gaps":[]}],"pool_note":""}
- Plain prose only. No markdown, no em dashes, no en dashes. Use the word "to" for ranges.`;
      const rerankUser = JSON.stringify({ job_spec: { title: job_spec.title, seniority: job_spec.seniority, must_have_skills: mustHaves, nice_to_have_skills: niceToHaves, min_years: job_spec.min_years, location_preference: job_spec.location_preference, remote_ok: job_spec.remote_ok, notes: job_spec.notes }, candidates: rerankInput });
      const rr = await callAI({ system: rerankSys, user: rerankUser.slice(0, 40000) });
      let rrParsed: { results?: Array<{ ref: string; score: number; why?: string[]; matched_must_haves?: string[]; gaps?: string[] }>; pool_note?: string } = {};
      try { rrParsed = JSON.parse(rr.text); }
      catch {
        const m = rr.text.match(/\{[\s\S]*\}/);
        try { rrParsed = m ? JSON.parse(m[0]) : { results: [], pool_note: "The rerank step returned an unreadable response." }; }
        catch { rrParsed = { results: [], pool_note: "The rerank step returned an unreadable response." }; }
      }
      const rrResults = Array.isArray(rrParsed.results) ? rrParsed.results : [];

      // Merge with anonymized card data, take top 3.
      const cardByRef = new Map(rerankInput.map(r => [r.ref, r]));
      const top = rrResults
        .filter(r => cardByRef.has(r.ref))
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 3)
        .map(r => {
          const c = cardByRef.get(r.ref)!;
          return {
            ref: r.ref,
            score: r.score,
            headline: c.headline,
            seniority: c.seniority,
            years_experience: c.years_experience,
            location: c.location,
            matched_must_haves: r.matched_must_haves || [],
            gaps: r.gaps || [],
            why: r.why || [],
          };
        });

      const { data: search, error: sErr } = await adminForNew.from("employer_searches").insert({
        org_id, created_by: userId, job_spec, results: top, ref_map: refMap,
      }).select("id").single();
      if (sErr) return json({ error: sErr.message }, 500);

      return json({ search_id: search.id, results: top, pool_note: rrParsed.pool_note || "" });
    }

    if (action === "employer_reveal_request") {
      const { search_id, ref } = payload as { search_id?: string; ref?: string };
      if (!search_id || !ref) return json({ error: "search_id and ref required" }, 400);
      const { data: search } = await adminForNew.from("employer_searches")
        .select("id, org_id, ref_map").eq("id", search_id).maybeSingle();
      if (!search) return json({ error: "search not found" }, 404);
      if (!(await assertOrgMember(search.org_id))) return json({ error: "not an org member" }, 403);
      const candidateUserId = (search.ref_map as Record<string, string> | null)?.[ref];
      if (!candidateUserId) return json({ error: "unknown ref" }, 400);
      // Idempotent: skip if a pending or approved row exists for this (search, candidate).
      const { data: existing } = await adminForNew.from("reveal_requests")
        .select("id, status").eq("search_id", search_id).eq("candidate_user_id", candidateUserId).maybeSingle();
      if (existing) return json({ ok: true, status: existing.status, already: true });
      const { error: iErr } = await adminForNew.from("reveal_requests").insert({
        org_id: search.org_id, candidate_user_id: candidateUserId, search_id, candidate_ref: ref,
      });
      if (iErr) return json({ error: iErr.message }, 500);
      return json({ ok: true, status: "pending" });
    }

    if (action === "reveal_list") {
      const { data: rows } = await adminForNew.from("reveal_requests")
        .select("id, org_id, search_id, status, created_at, decided_at")
        .eq("candidate_user_id", userId)
        .order("created_at", { ascending: false });
      const enriched: Array<Record<string, unknown>> = [];
      for (const r of (rows || [])) {
        const [{ data: org }, { data: s }] = await Promise.all([
          adminForNew.from("orgs").select("name").eq("id", r.org_id).maybeSingle(),
          r.search_id
            ? adminForNew.from("employer_searches").select("job_spec").eq("id", r.search_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        enriched.push({
          id: r.id,
          org_name: org?.name || "A company",
          job_title: (s?.job_spec as { title?: string } | null)?.title || "",
          status: r.status,
          created_at: r.created_at,
          decided_at: r.decided_at,
        });
      }
      return json({ requests: enriched });
    }

    if (action === "reveal_decide") {
      const { id, approve } = payload as { id?: string; approve?: boolean };
      if (!id || typeof approve !== "boolean") return json({ error: "id and approve required" }, 400);
      const status = approve ? "approved" : "declined";
      const { error } = await adminForNew.from("reveal_requests")
        .update({ status, decided_at: new Date().toISOString() })
        .eq("id", id).eq("candidate_user_id", userId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, status });
    }

    if (action === "employer_reveal_status") {
      const { search_id } = payload as { search_id?: string };
      if (!search_id) return json({ error: "search_id required" }, 400);
      const { data: search } = await adminForNew.from("employer_searches")
        .select("org_id, ref_map").eq("id", search_id).maybeSingle();
      if (!search) return json({ error: "not found" }, 404);
      if (!(await assertOrgMember(search.org_id))) return json({ error: "not an org member" }, 403);
      const { data: rows } = await adminForNew.from("reveal_requests")
        .select("id, candidate_user_id, candidate_ref, status, created_at, decided_at")
        .eq("search_id", search_id);
      const refByUser = new Map<string, string>();
      for (const [ref, uid] of Object.entries((search.ref_map as Record<string, string> | null) || {})) refByUser.set(uid, ref);
      const enriched: Array<Record<string, unknown>> = [];
      for (const r of (rows || [])) {
        const base: Record<string, unknown> = {
          id: r.id, ref: r.candidate_ref || refByUser.get(r.candidate_user_id) || "",
          status: r.status, created_at: r.created_at, decided_at: r.decided_at,
        };
        if (r.status === "approved") {
          const { data: prof } = await adminForNew.from("user_profile_data")
            .select("legal_first_name, legal_last_name, email").eq("user_id", r.candidate_user_id).maybeSingle();
          const { data: authUser } = await adminForNew.auth.admin.getUserById(r.candidate_user_id);
          base.name = [prof?.legal_first_name, prof?.legal_last_name].filter(Boolean).join(" ") || null;
          base.email = prof?.email || authUser?.user?.email || null;
        }
        enriched.push(base);
      }
      return json({ requests: enriched });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("resume-hub error", e);
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
