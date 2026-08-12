// v3.131.0 — stage 6 of the resume-hub reorganization: job URL/JD
// normalization, AI-based job metadata parsing, and the deterministic
// keyword-overlap fallback scorer used when every LLM call fails.
// Pure code movement, zero logic changes.
import { sha256Hex } from "./utils.ts";
import { callAI } from "./ai.ts";
import type { CanonicalProfile } from "./canonicalProfile.ts";

// ──────────────────────────────────────────────────────────────
// Phase 2 helpers: URL normalization, full-JD parse, fallback score
// ──────────────────────────────────────────────────────────────

export function normalizeUrlForHash(raw: string): string {
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

export async function resolveJobJd(admin: any, url: string | undefined, jdText: string | undefined): Promise<string> {
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

export const JOB_META_SCHEMA = {
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

export type JobParsed = {
  skills: string[];
  seniority: string;
  salary: { min?: number; max?: number; currency?: string; period?: string; source?: string; display?: string };
  location: string;
  work_mode: string;
  must_haves: string[];
  nice_to_haves: string[];
  years_required?: number;
};

export const EMPTY_PARSED: JobParsed = {
  skills: [], seniority: "", salary: {}, location: "",
  work_mode: "unknown", must_haves: [], nice_to_haves: [],
};

export async function parseJobMeta(fullJd: string, urlHint: string, titleHint: string, companyHint: string): Promise<JobParsed> {
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
export function keywordFallbackScore(canonical: CanonicalProfile | null, fullJd: string, parsed: JobParsed) {
  const userSkills = new Set<string>();
  if (canonical) {
    for (const s of canonical.skills) { const n = String(s?.name || "").toLowerCase().trim(); if (n) userSkills.add(n); }
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
