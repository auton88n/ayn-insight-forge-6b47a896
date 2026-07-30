// Resume Hub — unified AI edge function.
// Actions: parse, rewrite, tailor, match, cover-letter, autofill
// Auth: requires the caller's Supabase JWT (Authorization: Bearer ...).
// All DB writes use the caller's JWT so RLS enforces per-user isolation.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
// v2.13.0 — unified identity source of truth. See docs/map/resume-hub.md
// "Identity" section. Every action that reads applicant PII goes through
// loadIdentity() so a new source (canonical.identity, auth.users) is
// picked up everywhere at once, not re-derived per action.
import { loadIdentity, identityToLegacyMerged, identityContactBlock, type Identity } from "../_shared/identity.ts";
// v3.1.0 — structured sections (no truncation), deterministic gap analysis,
// figure preservation, result cache, company context, AI telemetry.
import {
  sha256 as sha256b, buildSections, computeGap, renderGapBlock, droppedFigures,
  cacheGet, cacheSet, logAiCall, fetchCompanyContext,
  type GapAnalysis, type SectionBundle,
} from "../_shared/tailoring.ts";

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
  "ext_bootstrap", "ext_ingest_job", "ext_cover_letter_text",
  "ext_job_score", "ext_suggest_roles", "ext_find_contacts",
  "ext_download_resume_text", "smart_tailor", "ext_ask",
  // v1.5.0: canonical profile read for extension
  "ext_profile_canonical_get",
  // v2.8.0: JD resolver — fetch previously-ingested JD by host+path
  "ext_job_lookup",
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
  // v3.5.0 — skills carry level and recency because a bare name is unmatchable.
  skills: Array<{ name: string; years?: number | null; last_used?: string | null; level?: string | null; evidence?: string }>;
  experiences: Array<{ company: string; title: string; location?: string; start?: string; end?: string; current?: boolean; bullets?: string[]; tech?: string[]; industry?: string; team_size?: number | null; bullets_from_resume?: boolean }>;
  education: Array<{ school: string; degree?: string; field?: string; start?: string; end?: string; gpa?: string }>;
  certifications: Array<{ name: string; issuer?: string; year?: string }>;
  work_auth: {
    citizenship?: string;
    countries?: string[];
    work_authorized_us?: boolean;
    work_authorized_ca?: boolean;
    needs_sponsorship_now?: boolean;
    needs_sponsorship_future?: boolean;
    visa_type?: string;
    notes?: string;
    work_permit_expires?: string;
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
    employment_types?: string[];
    availability?: string;
    company_stages?: string[];
  };
  derived: {
    total_yoe?: number;
    seniority?: string;
    primary_function?: string;
    top_skills?: string[];
    education_level?: string;
    current_title?: string;
    current_company?: string;
    known_for?: string[];
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

    // ============ EXTENSION-AUTH ACTIONS (x-ayn-ext-token) ============
    // v2.8.4 — DUAL_AUTH_ACTIONS may also be reached from the web dashboard
    // with a session JWT (no ext token). All other EXT_ACTIONS keep the
    // strict ext-token requirement.
    const DUAL_AUTH_ACTIONS = new Set(["ext_ingest_job"]);
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
        // v2.13.0 — bootstrap now returns identity completeness so the
        // sidepanel can prompt the user to fix the profile BEFORE they
        // trigger a fill (instead of learning about it via a mid-fill
        // "no_profile" abort). See docs/map/extension.md sidepanel status.
        const id = await loadIdentity(admin, userId);
        const { data: resume } = await admin.from("resumes")
          .select("id, title, content").eq("user_id", userId).eq("is_primary", true).maybeSingle();
        return json({
          user: { id: userId, email: id.email.value || null, device: tok.device_label },
          profile: id.profile,
          resume,
          identity: {
            complete: id.isComplete(),
            missing: id.missing(),
            sources: id.sourceMap(),
          },
        });
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

        const scoreStarted = Date.now();
        // v2.8.2 — honor tailored resume selection.
        // v3.1.0 — identity is loaded here too, so scoring sees the same
        // applicant view as tailor and cover letter.
        const [resolvedResume, canonical, identity] = await Promise.all([
          resolveResumeContent(admin, userId, resume_version_id),
          loadCanonical(admin, userId),
          loadIdentity(admin, userId, { resume_version_id }).catch(() => null),
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

        // v3.1.0 — parseJobMeta used to block the scoring call. It now runs
        // concurrently with it; the score prompt is grounded on the
        // deterministic gap analysis instead of JOB_PARSED, and parsedJob is
        // awaited afterwards for salary and the honesty safety net.
        let parsedJobPromise: Promise<JobParsed> | null = null;
        if (!cachedRow && fullJd && fullJd.length >= 40) {
          fullJdResolved = fullJd.slice(0, 30000);
          const ingestHash = hash || await sha256Hex(fullJd.slice(0, 400));
          parsedJobPromise = parseJobMeta(fullJd, url || "", jobTitle || "", company || "");
          parsedJobPromise.then((pj) => {
            const row = {
              url_hash: ingestHash,
              url: normalized || url || null,
              title: jobTitle || null, company: company || null,
              full_jd: fullJdResolved, parsed: pj,
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            };
            return admin.from("job_cache").upsert(row, { onConflict: "url_hash" });
          }).then((r: any) => {
            if (r?.error) console.warn("job_cache inline-ingest upsert failed", r.error.message);
          }, () => {});
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

        // 3. Score against the full JD. v3.1.0: structured sections instead
        // of a sliced digest, plus a deterministic gap analysis.
        const scoreBundle = buildSections(identity, canonical);
        const scoreGap = computeGap(fullJdResolved, scoreBundle);
        const canonText = canonicalDigest(canonical);

        // Result cache: (jd, resume selection, applicant snapshot).
        const scoreCacheKey = `score:${userId}:${resume_version_id || "primary"}:${(await sha256Hex(fullJdResolved)).slice(0, 24)}:${(await sha256Hex(scoreBundle.text + canonText)).slice(0, 16)}`;
        const scoreCached = await cacheGet<Record<string, unknown>>(admin, scoreCacheKey);
        if (scoreCached) {
          logAiCall(admin, {
            user_id: userId, purpose: "job_score", cache_hit: true,
            duration_ms: Date.now() - scoreStarted, source_map: identity?.sourceMap() || null,
            gap_matched: scoreGap.matched.length, gap_missing: scoreGap.missing.length,
          });
          return json({ ...scoreCached, cached: true });
        }

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

CURRENCY: infer from the JD text or the posting hostname. NEVER hardcode USD. Format ranges with the word "to": "$90K to $120K CAD" or "£55K to £70K". Never use dashes for ranges.

VOICE: write reasons and verdict the way a thoughtful person writes. Vary sentence length, plain natural language, no AI clichés ("leverage", "passionate", "in today's fast-paced"), no em dashes, no en dashes, never use ' - ' as a connector.

SCORING RUBRIC:
- 9 to 10 Strong: meets all must-haves + senior signals matching the job's stated seniority.
- 7 to 8 Good: meets most must-haves, 1 to 2 coachable gaps.
- 4 to 6 Fair: half the must-haves, real gaps in seniority or core tech.
- 1 to 3 Poor: missing the core requirement.

SENIORITY_FIT: compare canonical.derived.seniority to the seniority the job asks for. "under"/"match"/"over"/"unknown".

OUTPUT RULES: reasons = 3 phrases max 6 words. mustHaves 3-5. niceToHaves 2-4. matchedSkills up to 8. missingSkills up to 8.`,
            user: `CANONICAL_SKILLS: ${Array.from(userSkillIndex.values()).slice(0, 60).join(", ")}
CANONICAL_PROFILE_SUMMARY:
${canonText}

APPLICANT SECTIONS:
${scoreBundle.text}

JOB_TITLE: ${jobTitle || cachedRow?.title || ""}
COMPANY: ${company || cachedRow?.company || ""}
URL: ${url || ""}

FULL_JD:
${fullJdResolved.slice(0, 15000)}${renderGapBlock(scoreGap)}`,
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
        // Job metadata was parsed concurrently with the scoring call above.
        if (parsedJobPromise) { try { parsedJob = await parsedJobPromise; } catch { /* keep EMPTY_PARSED */ } }

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

        const scoreResult = {
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
          gapAnalysis: {
            method: scoreGap.method,
            alreadyStrong: scoreGap.matched.map(r => r.text).slice(0, 15),
            stillMissing: scoreGap.missing.map(r => r.text).slice(0, 15),
            niceToHave: scoreGap.niceToHave.map(r => ({ text: r.text, met: r.status === "matched" })).slice(0, 10),
          },
        };
        cacheSet(admin, scoreCacheKey, userId, "job_score", scoreResult, 24 * 60 * 60 * 1000);
        logAiCall(admin, {
          user_id: userId, purpose: "job_score", model: DEFAULT_MODEL,
          duration_ms: Date.now() - scoreStarted, cache_hit: false,
          source_map: identity?.sourceMap() || null,
          gap_matched: scoreGap.matched.length, gap_missing: scoreGap.missing.length,
          meta: { jd_chars: fullJdResolved.length, section_chars: scoreBundle.chars, jd_source: source },
        });
        return json(scoreResult);
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

      // ext_cover_letter_text — v3.1.0: identity + structured sections (no
      // truncation), real company context, two-pass on the detailed tier,
      // verified figure preservation, cached, logged.
      if (action === "ext_cover_letter_text") {
        return await handleCoverLetter(admin, userId, payload as Record<string, unknown>);
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

      // smart_tailor — v3.1.0: identity-grounded, section-based (no character
      // truncation), deterministic gap analysis, two-pass quality, verified
      // figure preservation, cached, logged. See handleSmartTailor below.
      if (action === "smart_tailor") {
        return await handleSmartTailor(admin, userId, payload as Record<string, unknown>);
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
    // v2.9.0-A — Talent Pool (Phase A: data layer)
    // Seeker-side consent + indexing. Employer search lives in Phase B
    // and runs via the service role, gated on opted_in.
    // ─────────────────────────────────────────────────────────────
    if (action === "talent_pool_get") {
      // v3.2.0 — the Hub now renders the anonymized employer preview, skills
      // split by provenance, and a freshness line, so this returns everything
      // needed for that in one round trip.
      const [{ data: consent }, { data: idx }, { data: skillRows }, { data: resumeRow }, { data: canonRow }] = await Promise.all([
        adminForNew.from("talent_pool_consent").select("opted_in, consented_at").eq("user_id", userId).maybeSingle(),
        adminForNew.from("candidate_index")
          .select("headline, summary, seniority, location, years_experience, indexed_at, embedding_model")
          .eq("user_id", userId).maybeSingle(),
        adminForNew.from("candidate_skills").select("id, skill, provenance, source").eq("user_id", userId).order("provenance"),
        adminForNew.from("resumes").select("updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        adminForNew.from("user_profile_canonical").select("updated_at").eq("user_id", userId).maybeSingle(),
      ]);
      const skills = (skillRows ?? []) as Array<{ id: string; skill: string; provenance: string; source: string }>;
      return json({
        opted_in: !!consent?.opted_in,
        consented_at: consent?.consented_at ?? null,
        indexed: !!idx,
        skills_count: skills.length,
        preview: idx
          ? {
              headline: idx.headline ?? "",
              seniority: idx.seniority ?? "",
              location: idx.location ?? "",
              years_experience: idx.years_experience ?? null,
              indexed_at: idx.indexed_at ?? null,
              embedding_model: idx.embedding_model ?? null,
            }
          : null,
        skills,
        indexed_at: idx?.indexed_at ?? null,
        resume_updated_at: resumeRow?.updated_at ?? null,
        profile_updated_at: canonRow?.updated_at ?? null,
      });
    }

    // v3.2.0 — let a seeker remove an inferred skill they disagree with.
    // Extracted skills are evidence-backed and are rebuilt on every index,
    // so only inferred rows are deletable here.
    if (action === "talent_pool_skill_delete") {
      const { id } = payload as { id?: string };
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await adminForNew.from("candidate_skills")
        .delete().eq("id", id).eq("user_id", userId).eq("provenance", "inferred");
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
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

// ══════════════════════════════════════════════════════════════
// v3.1.0 — Tailor and Cover Letter
//
// These two are THE product now that autofill is gone, so they get the
// full treatment: identity everywhere, structured sections instead of
// character slices, a DETERMINISTIC gap analysis computed in code (the
// model never discovers what is missing, it only decides what to surface
// and how to phrase it), a self-critique revision pass, and programmatic
// verification that no number, percentage, currency figure or year was
// altered. Results are cached by (user, resume version, jd hash) and one
// telemetry row is written per AI call.
// ══════════════════════════════════════════════════════════════

const TAILOR_TTL = 7 * 24 * 60 * 60 * 1000;

function parseJsonLoose<T>(text: string): T | null {
  try {
    const raw = String(text || "").replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
    return JSON.parse(s !== -1 ? raw.slice(s, e + 1) : raw) as T;
  } catch { return null; }
}

interface TailorOut {
  keywords?: Array<Record<string, unknown>>;
  tailoredText?: string;
  changes?: string[];
  atsScore?: number;
  scoreReasoning?: string;
}

function normalizeTailorOut(p: TailorOut | null) {
  return {
    keywords: Array.isArray(p?.keywords)
      ? p!.keywords.slice(0, 14).map((k) => ({
        text: String(k.text || ""), inResume: Boolean(k.inResume), importance: String(k.importance || "medium"),
      }))
      : [],
    tailoredText: String(p?.tailoredText || ""),
    changes: Array.isArray(p?.changes) ? p!.changes.map(String).slice(0, 6) : [],
    atsScore: Math.max(0, Math.min(100, Math.round(Number(p?.atsScore) || 0))),
    scoreReasoning: String(p?.scoreReasoning || ""),
  };
}

const TAILOR_RULES = `
TAILORED RESUME:
- Start with the APPLICANT HEADER lines verbatim if provided (name, contact, location, links). Never invent a name, email, or phone number. If no APPLICANT HEADER is provided, use the header from the sections unchanged.
- Keep ALL company names, titles, dates EXACTLY as in the sections. Never change facts.
- Never alter numbers. Every metric, percentage, dollar figure, headcount, timeframe, date, and job title must appear in the output exactly as it appears in the input. Do not round, scale, add, or remove figures.
- For each requirement under "REQUIRED BUT NOT EVIDENCED": look for genuinely related experience already present in the sections and surface it in the job description's own terminology. If there is no real basis in the sections, leave it out entirely and do not imply it.
- Never add a skill to the skills section that is not supported by the sections.
- Re-order skills to surface the job's terms first, among skills the candidate actually has.
- Strengthen verbs (Led, Shipped, Reduced, Owned). Quantify only with numbers already present.
- Output as clean ATS plain text: section headers in CAPS, dashes for bullets, one column, no tables, no emojis.

KEYWORDS (10 to 14): the most important hard skills, tools, certs and methodologies from the job description. Mark inResume=true only if the term (or a very close variant) is present in the sections. importance: high if it is a stated must have or repeated; medium otherwise; low for nice to haves.

CHANGES (3 to 6): plain-language list of edits, each naming the requirement it addresses and the existing experience it drew on.

ATS SCORE: keyword coverage (60%), title alignment (20%), seniority match (20%). Honest.

VOICE: write the way a thoughtful person writes. Vary sentence length, plain natural language, no AI clichés ("leverage", "passionate", "in today's fast-paced"), no em dashes, no en dashes, never use ' - ' as a connector. Write ranges with the word 'to'.`;

async function handleSmartTailor(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const started = Date.now();
  const resumeText = String(payload.resumeText || "");
  const jobTitle = String(payload.jobTitle || "");
  const company = String(payload.company || "");
  const url = payload.url ? String(payload.url) : undefined;
  const resumeVersionId = payload.resume_version_id ? String(payload.resume_version_id) : undefined;
  const matchedSkills = Array.isArray(payload.matched_skills) ? (payload.matched_skills as unknown[]).map(String).slice(0, 20) : [];
  const missingSkills = Array.isArray(payload.missing_skills) ? (payload.missing_skills as unknown[]).map(String).slice(0, 20) : [];

  const jd = await resolveJobJd(admin, url, payload.jdText ? String(payload.jdText) : undefined);
  if (!jd || jd.length < 40) return json({ error: "jd required" }, 400);

  const [identity, canonical] = await Promise.all([
    loadIdentity(admin, userId, { resume_version_id: resumeVersionId }).catch(() => null),
    loadCanonical(admin, userId),
  ]);

  const bundle = buildSections(identity, canonical, resumeText);
  if (!bundle.text || bundle.chars < 60) return json({ error: "No resume content available to tailor" }, 400);

  const gap = computeGap(jd, bundle, { jdSkills: [...matchedSkills, ...missingSkills] });

  const jdHash = (await sha256b(jd)).slice(0, 24);
  const sectionHash = (await sha256b(bundle.text)).slice(0, 16);
  const cacheKey = `tailor:${userId}:${resumeVersionId || "primary"}:${sectionHash}:${jdHash}`;
  const cached = await cacheGet<Record<string, unknown>>(admin, cacheKey);
  if (cached) {
    logAiCall(admin, {
      user_id: userId, purpose: "tailor", cache_hit: true, duration_ms: Date.now() - started,
      source_map: identity?.sourceMap() || null,
      gap_matched: gap.matched.length, gap_missing: gap.missing.length,
      gap_surfaced: Number((cached as any).gapAnalysis?.surfacedCount || 0),
      meta: { jd_chars: jd.length, section_chars: bundle.chars },
    });
    return json({ ...cached, cached: true });
  }

  const applicantBlock = identity ? identityContactBlock(identity) : "";
  const applicantSection = applicantBlock
    ? `\n\nAPPLICANT HEADER (use these exact lines at the top of the tailored resume, never invent alternatives, never omit):\n${applicantBlock}`
    : "";
  const droppedNote = bundle.dropped.length
    ? `\n\nNOTE: these sections were omitted from the payload to fit the budget and must not be referenced: ${bundle.dropped.join(", ")}.`
    : "";

  const userMsg = `TARGET ROLE: ${jobTitle} at ${company}${applicantSection}

APPLICANT SECTIONS (the only source of truth about this person):
${bundle.text}${droppedNote}

JOB DESCRIPTION:
${jd.slice(0, 20000)}${renderGapBlock(gap)}`;

  const system = `You are an ATS resume editor. Tailor the candidate's resume to this job WITHOUT inventing experience.

Return ONLY this JSON (no code fences):
{
  "keywords": [{"text":"<keyword>","inResume": true|false, "importance":"high|medium|low"}],
  "tailoredText": "<full plain-text ATS resume>",
  "changes": ["<change 1>", "<change 2>"],
  "atsScore": <integer 0-100>,
  "scoreReasoning": "<one sentence on the score>"
}
${TAILOR_RULES}`;

  // PASS 1 — draft.
  const draftRes = await callAI({ model: QUALITY_MODEL, system, user: userMsg });
  let out = normalizeTailorOut(parseJsonLoose<TailorOut>(draftRes.text));
  if (!out.tailoredText) return json({ error: "Failed to parse AI response" }, 500);

  // PASS 2 — self critique, then revise. Always for tailoring.
  const critiqueRes = await callAI({
    model: QUALITY_MODEL,
    system: `You are a strict reviewer of a tailored resume. Check the DRAFT against the SECTIONS and the GAP ANALYSIS on four points:
1. Every claim is grounded in the SECTIONS. Flag anything that is not.
2. Every number, percentage, currency figure, date and year is unchanged from the SECTIONS.
3. No skill appears in the skills section that the SECTIONS do not support.
4. The draft addresses the top items under "REQUIRED BUT NOT EVIDENCED" wherever real related evidence exists, and stays silent where it does not.

Then output the CORRECTED version. Return ONLY the same JSON shape as the draft:
{"keywords":[...],"tailoredText":"...","changes":[...],"atsScore":0,"scoreReasoning":"..."}
Keep everything that was already correct. Do not add new claims to fix a gap.${TAILOR_RULES}`,
    user: `${userMsg}\n\nDRAFT TO REVIEW:\n${JSON.stringify(out).slice(0, 40000)}`,
  });
  const revised = normalizeTailorOut(parseJsonLoose<TailorOut>(critiqueRes.text));
  if (revised.tailoredText && revised.tailoredText.length > out.tailoredText.length * 0.5) out = revised;

  // FIGURE PRESERVATION — verified in code, not asked for.
  let missingFigures = droppedFigures(bundle.text, out.tailoredText);
  if (missingFigures.length) {
    const retry = await callAI({
      model: QUALITY_MODEL,
      system,
      user: `${userMsg}\n\nPREVIOUS ATTEMPT DROPPED OR ALTERED THESE FIGURES: ${missingFigures.slice(0, 30).join(", ")}\nProduce the tailored resume again with every one of those figures present, unchanged, in the bullet it belongs to.`,
    });
    const fixed = normalizeTailorOut(parseJsonLoose<TailorOut>(retry.text));
    if (fixed.tailoredText) {
      const stillMissing = droppedFigures(bundle.text, fixed.tailoredText);
      if (stillMissing.length < missingFigures.length) { out = fixed; missingFigures = stillMissing; }
    }
  }

  // SURFACED — recompute the gap against the tailored output. Requirements
  // that were missing before and are evidenced now were genuinely surfaced.
  const afterBundle: SectionBundle = { sections: bundle.sections, text: out.tailoredText, dropped: [], chars: out.tailoredText.length };
  const afterGap = computeGap(jd, afterBundle, { jdSkills: [...matchedSkills, ...missingSkills] });
  const afterMatched = new Set(afterGap.requirements.filter((r) => r.status === "matched").map((r) => r.text));
  const surfaced = gap.missing.filter((r) => afterMatched.has(r.text)).map((r) => r.text);

  const result = {
    ...out,
    gapAnalysis: {
      method: gap.method,
      alreadyStrong: gap.matched.map((r) => ({ text: r.text, evidence: r.evidence })),
      surfaced,
      surfacedCount: surfaced.length,
      stillMissing: gap.missing.filter((r) => !afterMatched.has(r.text)).map((r) => r.text),
      niceToHave: gap.niceToHave.map((r) => ({ text: r.text, met: r.status === "matched" })),
      counts: { matched: gap.matched.length, missing: gap.missing.length, surfaced: surfaced.length },
    },
    figuresVerified: missingFigures.length === 0,
    figuresAltered: missingFigures.slice(0, 20),
    sectionsUsed: { chars: bundle.chars, dropped: bundle.dropped },
  };

  cacheSet(admin, cacheKey, userId, "tailor", result, TAILOR_TTL);
  logAiCall(admin, {
    user_id: userId, purpose: "tailor", model: QUALITY_MODEL, duration_ms: Date.now() - started,
    cache_hit: false, source_map: identity?.sourceMap() || null,
    gap_matched: gap.matched.length, gap_missing: gap.missing.length, gap_surfaced: surfaced.length,
    meta: { jd_chars: jd.length, section_chars: bundle.chars, dropped: bundle.dropped, figures_ok: missingFigures.length === 0, passes: 2 },
  });

  return json(result);
}

async function handleCoverLetter(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const started = Date.now();
  const resumeText = String(payload.resumeText || "");
  const tone = String(payload.tone || "professional, warm");
  const company = String(payload.company || "");
  const jobTitle = String(payload.jobTitle || "");
  const url = payload.url ? String(payload.url) : undefined;
  const resumeVersionId = payload.resume_version_id ? String(payload.resume_version_id) : undefined;
  const lengthKey = String(payload.length || "standard");
  const wordCap = lengthKey === "short" ? 180 : lengthKey === "detailed" ? 400 : 280;
  const guidanceRaw = String(payload.guidance || "").trim().slice(0, 200);
  const guidanceLine = guidanceRaw
    ? `\n- The applicant asked you to emphasize: ${guidanceRaw}. Honour this only where the sections support it; if it is not supported, ignore the request rather than inventing anything.`
    : "";

  const jd = await resolveJobJd(admin, url, payload.jdText ? String(payload.jdText) : undefined);
  if (!jd || jd.length < 40) return json({ error: "jd required" }, 400);

  const [identity, canonical, companyCtx] = await Promise.all([
    loadIdentity(admin, userId, { resume_version_id: resumeVersionId }).catch(() => null),
    loadCanonical(admin, userId),
    fetchCompanyContext(admin, company, url).catch(() => ({ text: "", source: "" })),
  ]);

  const bundle = buildSections(identity, canonical, resumeText);
  if (!bundle.text || bundle.chars < 60) return json({ error: "No resume content available" }, 400);
  const gap = computeGap(jd, bundle);

  const jdHash = (await sha256b(jd)).slice(0, 24);
  const sectionHash = (await sha256b(bundle.text)).slice(0, 16);
  const cacheKey = `cover:${userId}:${resumeVersionId || "primary"}:${sectionHash}:${jdHash}:${lengthKey}:${await sha256b(tone + guidanceRaw)}`.slice(0, 200);
  const cached = await cacheGet<Record<string, unknown>>(admin, cacheKey);
  if (cached) {
    logAiCall(admin, {
      user_id: userId, purpose: "cover_letter", cache_hit: true, duration_ms: Date.now() - started,
      source_map: identity?.sourceMap() || null, meta: { length: lengthKey },
    });
    return json({ ...cached, cached: true });
  }

  const applicantBlock = identity ? identityContactBlock(identity) : "";
  const applicantSection = applicantBlock
    ? `\n\nAPPLICANT (use these exact contact details in the header and signature, never invent alternatives):\n${applicantBlock}`
    : "";
  const companySection = companyCtx.text
    ? `\n\nCOMPANY CONTEXT (from ${companyCtx.source}, the employer's own public page):\n${companyCtx.text}`
    : "";

  const system = `Write a cover letter under ${wordCap} words. Tone: ${tone}. Address ${company || "the hiring team"}${jobTitle ? ` for the ${jobTitle} role` : ""}.

STRUCTURE (4 short paragraphs):
1) Opening: who you are, the specific role, and one specific thing about this employer drawn from COMPANY CONTEXT. If COMPANY CONTEXT is absent or says nothing concrete, open with the role and the candidate's most relevant strength instead. Never invent enthusiasm or facts about the company.
2) Proof: one concrete achievement from the sections that maps to a stated requirement. Include the number or scale if it is present in the sections.
3) Skill bridge: two or three specific tools or skills the job asks for that the sections genuinely support. Tie them to outcomes, not lists.
4) Close: a clear ask for a conversation, then sign off.

RULES:
- Use ONLY facts from the APPLICANT SECTIONS, the APPLICANT block, and COMPANY CONTEXT. Never invent companies, metrics, dates, names, emails, or phone numbers.
- Never alter numbers. Every metric, percentage, currency figure, headcount, timeframe, date and job title must appear exactly as in the sections.
- Do not claim any requirement listed as not evidenced in the GAP ANALYSIS unless real related experience is in the sections.
- The signature MUST use the applicant's real name from the APPLICANT block if provided. Never invent a name.
- No clichés ("I'm excited to apply", "I hope this finds you well", "results-driven", "passionate", "leverage", "in today's fast-paced").
- Write the way a thoughtful person writes: vary sentence length, plain natural language, no em dashes, no en dashes, never use ' - ' as a connector. Write ranges with the word 'to'.
- Plain text, no markdown.${guidanceLine}`;

  const userMsg = `APPLICANT SECTIONS:\n${bundle.text}${applicantSection}${companySection}\n\nJOB DESCRIPTION:\n${jd.slice(0, 20000)}${renderGapBlock(gap)}`;

  const draft = await callAI({ model: QUALITY_MODEL, system, user: userMsg });
  let body = String(draft.text || "").trim();
  let passes = 1;

  // Two-pass quality on the detailed tier only.
  if (lengthKey === "detailed" && body) {
    const critique = await callAI({
      model: QUALITY_MODEL,
      system: `${system}\n\nYou are now revising a draft. Check it on four points: every claim is grounded in the sections, every number and date is unchanged, no skill is claimed without support, and it addresses the top requirements where real evidence exists. Return ONLY the corrected letter as plain text, nothing else.`,
      user: `${userMsg}\n\nDRAFT TO REVISE:\n${body}`,
    });
    const revised = String(critique.text || "").trim();
    if (revised.length > body.length * 0.5) { body = revised; passes = 2; }
  }

  // A cover letter only cites a handful of figures, so we verify the other
  // direction: every figure IN the letter must exist verbatim in the sections.
  let missingFigures = droppedFigures(body, bundle.text).filter((f) => f.length > 1);
  if (missingFigures.length) {
    const retry = await callAI({
      model: QUALITY_MODEL,
      system,
      user: `${userMsg}\n\nTHE PREVIOUS DRAFT CITED FIGURES THAT DO NOT APPEAR IN THE SECTIONS: ${missingFigures.slice(0, 20).join(", ")}\nRewrite the letter using only figures that appear verbatim in the sections, or no figures at all.`,
    });
    const fixed = String(retry.text || "").trim();
    if (fixed) {
      const still = droppedFigures(fixed, bundle.text).filter((f) => f.length > 1);
      if (still.length < missingFigures.length) { body = fixed; missingFigures = still; }
    }
  }

  const result = {
    body,
    companyContext: companyCtx.text ? { source: companyCtx.source, chars: companyCtx.text.length } : null,
    figuresVerified: missingFigures.length === 0,
    figuresUnsupported: missingFigures.slice(0, 20),
    sectionsUsed: { chars: bundle.chars, dropped: bundle.dropped },
  };

  cacheSet(admin, cacheKey, userId, "cover_letter", result, TAILOR_TTL);
  logAiCall(admin, {
    user_id: userId, purpose: "cover_letter", model: QUALITY_MODEL, duration_ms: Date.now() - started,
    cache_hit: false, source_map: identity?.sourceMap() || null,
    gap_matched: gap.matched.length, gap_missing: gap.missing.length,
    meta: { jd_chars: jd.length, section_chars: bundle.chars, length: lengthKey, passes, company_ctx: !!companyCtx.text, figures_ok: missingFigures.length === 0 },
  });

  return json(result);
}

