// _shared/tailoring.ts — v3.1.0 "Copilot Consolidation"
//
// Everything the tailor / cover letter / score actions need in common:
//   1. Structured resume sections (no character truncation).
//   2. DETERMINISTIC gap analysis (JD requirements vs evidenced experience).
//   3. Figure preservation verification (numbers, percentages, money, years).
//   4. Result cache + company context fetch + one-row-per-call telemetry.
//
// Design rule: the model never *discovers* what is missing. Code does that.
// The model only decides what to surface and how to phrase it.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import type { Identity } from "./identity.ts";

// ──────────────────────────────────────────────────────────────
// hashing
// ──────────────────────────────────────────────────────────────

export async function sha256(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ──────────────────────────────────────────────────────────────
// 1. Structured sections — replaces resumeText.slice(0, N)
// ──────────────────────────────────────────────────────────────

export interface ResumeSections {
  basics: Record<string, unknown>;
  work: Array<Record<string, unknown>>;
  education: Array<Record<string, unknown>>;
  skills: string[];
  projects: Array<Record<string, unknown>>;
  certifications: string[];
}

export interface SectionBundle {
  sections: ResumeSections;
  /** Rendered prompt text. Never cut mid-item. */
  text: string;
  /** Sections deliberately dropped to fit the budget, in drop order. */
  dropped: string[];
  chars: number;
}

const SECTION_BUDGET = 24000; // chars; far above the old 6k/8k slices

function asStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function bulletsOf(w: Record<string, unknown>): string[] {
  const b = (w.bullets as unknown[]) || (w.highlights as unknown[]) || [];
  const out = Array.isArray(b) ? b.map(asStr).filter(Boolean) : [];
  const summary = asStr(w.summary || w.description);
  if (summary && !out.length) out.push(summary);
  return out;
}

function skillsOf(raw: unknown[]): string[] {
  const out: string[] = [];
  for (const s of raw || []) {
    if (typeof s === "string") { const t = s.trim(); if (t) out.push(t); continue; }
    if (s && typeof s === "object") {
      const o = s as Record<string, unknown>;
      const name = asStr(o.name || o.skill || o.text);
      if (name) out.push(o.years ? `${name} (${o.years}y)` : name);
      const items = o.keywords || o.items;
      if (Array.isArray(items)) for (const k of items) { const t = asStr(k); if (t) out.push(t); }
    }
  }
  return Array.from(new Set(out));
}

/**
 * Build one structured, complete view of the applicant from identity +
 * canonical profile, with the raw pasted resume text used only to fill
 * gaps (extension users can paste a resume we never stored).
 */
export function buildSections(
  identity: Identity | null,
  canonical: Record<string, any> | null,
  fallbackResumeText?: string,
): SectionBundle {
  const r = identity?.resume;
  const basics: Record<string, unknown> = { ...(r?.basics || {}) };
  if (identity) {
    if (identity.full_name.value) basics.name = identity.full_name.value;
    if (identity.email.value) basics.email = identity.email.value;
    if (identity.phone.value) basics.phone = identity.phone.value;
    if (identity.location.value) basics.location = identity.location.value;
    if (identity.current_title.value && !basics.title) basics.title = identity.current_title.value;
    const links = [identity.linkedin_url.value, identity.portfolio_url.value, identity.github_url.value].filter(Boolean);
    if (links.length) basics.links = links;
  }

  // Work: canonical experiences win (user-curated), resume work fills in.
  const canonExp = Array.isArray(canonical?.experiences) ? canonical!.experiences : [];
  const resumeWork = (r?.work || []) as Array<Record<string, unknown>>;
  const work = (canonExp.length >= resumeWork.length ? canonExp : resumeWork) as Array<Record<string, unknown>>;

  const canonEdu = Array.isArray(canonical?.education) ? canonical!.education : [];
  const resumeEdu = (r?.education || []) as Array<Record<string, unknown>>;
  const education = (canonEdu.length >= resumeEdu.length ? canonEdu : resumeEdu) as Array<Record<string, unknown>>;

  const skills = Array.from(new Set([
    ...skillsOf((canonical?.skills as unknown[]) || []),
    ...skillsOf((r?.skills as unknown[]) || []),
  ]));

  const projects = (r?.projects || []) as Array<Record<string, unknown>>;
  const certifications = Array.from(new Set([
    ...((canonical?.certifications as Array<Record<string, unknown>>) || []).map((c) => asStr(c?.name)).filter(Boolean),
    ...(((r?.raw as any)?.certifications as unknown[]) || []).map(asStr).filter(Boolean),
  ]));

  const sections: ResumeSections = { basics, work, education, skills, projects, certifications };

  const empty = !work.length && !skills.length && !education.length;
  const fallback = (fallbackResumeText || "").trim();

  let text = renderSections(sections);
  const dropped: string[] = [];

  if (empty && fallback) {
    // We have nothing structured. Use the pasted resume whole, uncut.
    text = `RESUME (verbatim, unstructured):\n${fallback.slice(0, SECTION_BUDGET)}`;
    if (fallback.length > SECTION_BUDGET) dropped.push("verbatim resume tail beyond 24000 chars");
    return { sections, text, dropped, chars: text.length };
  }

  // Deliberate drop order if genuinely oversized — least relevant first,
  // whole sections only, and we say which.
  const dropOrder: Array<keyof ResumeSections> = ["projects", "certifications", "education"];
  const working: ResumeSections = { ...sections };
  let i = 0;
  while (text.length > SECTION_BUDGET && i < dropOrder.length) {
    const key = dropOrder[i++];
    if ((working[key] as unknown[]).length) {
      (working[key] as unknown[]) = [];
      dropped.push(String(key));
      text = renderSections(working);
    }
  }
  if (text.length > SECTION_BUDGET) {
    // Last resort: drop the oldest roles, whole roles only.
    while (text.length > SECTION_BUDGET && working.work.length > 3) {
      working.work = working.work.slice(0, working.work.length - 1);
      text = renderSections(working);
    }
    if (!dropped.includes("oldest work entries")) dropped.push("oldest work entries");
  }

  if (fallback && !dropped.length && text.length + fallback.length < SECTION_BUDGET && fallback.length > 200) {
    text += `\n\nRESUME AS PASTED BY THE APPLICANT (use for wording and any detail missing above):\n${fallback}`;
  }

  return { sections: working, text, dropped, chars: text.length };
}

export function renderSections(s: ResumeSections): string {
  const out: string[] = [];
  const b = s.basics as Record<string, unknown>;
  out.push("BASICS");
  for (const k of ["name", "title", "email", "phone", "location", "summary"]) {
    const v = asStr(b[k]); if (v) out.push(`${k}: ${v}`);
  }
  const links = Array.isArray(b.links)
    ? (b.links as unknown[]).map((l) => (typeof l === "string" ? l : asStr((l as any)?.url))).filter(Boolean)
    : [];
  if (links.length) out.push(`links: ${links.join(" | ")}`);

  if (s.work.length) {
    out.push("\nWORK EXPERIENCE");
    for (const w of s.work) {
      const head = [asStr(w.title), asStr(w.company)].filter(Boolean).join(" at ");
      const when = [asStr(w.start), asStr(w.end) || (w.current ? "Present" : "")].filter(Boolean).join(" to ");
      out.push(`- ${head}${when ? ` (${when})` : ""}${asStr(w.location) ? `, ${asStr(w.location)}` : ""}`);
      for (const bl of bulletsOf(w)) out.push(`  * ${bl}`);
      const tech = Array.isArray(w.tech) ? (w.tech as unknown[]).map(asStr).filter(Boolean) : [];
      if (tech.length) out.push(`  tech: ${tech.join(", ")}`);
    }
  }
  if (s.education.length) {
    out.push("\nEDUCATION");
    for (const e of s.education) {
      const deg = [asStr(e.degree), asStr(e.field || e.area)].filter(Boolean).join(" in ");
      const when = [asStr(e.start), asStr(e.end)].filter(Boolean).join(" to ");
      out.push(`- ${[deg, asStr(e.school || e.institution)].filter(Boolean).join(", ")}${when ? ` (${when})` : ""}`);
    }
  }
  if (s.skills.length) out.push(`\nSKILLS\n${s.skills.join(", ")}`);
  if (s.certifications.length) out.push(`\nCERTIFICATIONS\n${s.certifications.join(", ")}`);
  if (s.projects.length) {
    out.push("\nPROJECTS");
    for (const p of s.projects) {
      out.push(`- ${asStr(p.name)}${asStr(p.description) ? `: ${asStr(p.description)}` : ""}`);
    }
  }
  return out.join("\n");
}

// ──────────────────────────────────────────────────────────────
// 2. DETERMINISTIC gap analysis
// ──────────────────────────────────────────────────────────────

export interface Requirement {
  text: string;
  kind: "required" | "nice_to_have";
  status: "matched" | "missing";
  /** Which resume terms evidenced it (empty when missing). */
  evidence: string[];
  coverage: number; // 0..1 term overlap
}

export interface GapAnalysis {
  requirements: Requirement[];
  matched: Requirement[];
  missing: Requirement[];
  niceToHave: Requirement[];
  method: "deterministic";
}

const STOP = new Set(("a an the and or of to in on for with as at by from is are be been being you your our we they " +
  "will would should must have has had can could may might this that these these those it its their his her " +
  "experience experiences work working ability able strong excellent good years year plus using use used " +
  "knowledge understanding skills skill including include includes etc other others related similar role " +
  "candidate candidates who what when where how team teams within across into about over under more most " +
  "such well also than then them there here very much many any all not no if while during per each both").split(/\s+/));

// Generic quals/soft-skill filler that shows up as its own bullet in almost
// every JD ("5+ years of experience", "Bachelor's degree preferred", "Strong
// team player") but is not a real, addable skill -- surfacing it as a
// "missing skill" in the UI would read as nonsensical. Checked as a whole
// line, not per term, since none of its individual words are unusual enough
// to blocklist on their own without also blocking real requirements.
const GENERIC_QUAL =
  /\b(years?\s+of\s+experience|degree\s*(preferred|required)?|bachelor'?s?|master'?s?(\s+degree)?|communication\s+skills?|team\s*player|problem[- ]solving|self[- ]starter|fast[- ]paced|detail[- ]oriented|work(ing)?\s+independently|interpersonal\s+skills?|time\s+management|organi[sz]ational\s+skills?|leadership\s+skills?|analytical\s+skills?|people\s+skills?|multi[- ]?task)\b/i;

function norm(s: string): string {
  return s.toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// minLen defaults to 3 for extracting requirement LINES out of prose, where
// a stray short fragment is more likely noise than a real requirement. The
// coverage computation in computeGap() below deliberately calls this with
// minLen 1 instead -- "Go", "C#", "R", "AI", "ML", "UX" are all real, short
// tech terms, and hasTerm()'s own word-boundary check already guards
// against false-positive substring matches for them.
function terms(s: string, minLen = 3): string[] {
  return norm(s).split(" ").map((t) => t.replace(/^[-.]+|[-.]+$/g, "")).filter((t) => t.length >= minLen && !STOP.has(t));
}

/** Split a JD into requirement-ish items with a required / nice-to-have tag. */
function extractRequirements(jd: string): Array<{ text: string; kind: "required" | "nice_to_have" }> {
  const lines = jd.split(/\r?\n/).map((l) => l.trim());
  const out: Array<{ text: string; kind: "required" | "nice_to_have" }> = [];
  let bucket: "required" | "nice_to_have" | null = null;
  let inReqSection = false;

  for (const raw of lines) {
    if (!raw) continue;
    const low = raw.toLowerCase();
    const isHeading = raw.length < 90 && !/[.!?]$/.test(raw);
    if (isHeading) {
      if (/(nice to have|preferred|bonus|plus(es)?|desirable|good to have)/.test(low)) { bucket = "nice_to_have"; inReqSection = true; continue; }
      if (/(requirement|qualification|must have|what you.{0,10}(bring|need|have)|who you are|about you|skills|we.{0,5}re looking for|you have)/.test(low)) { bucket = "required"; inReqSection = true; continue; }
      if (/(benefit|perk|about (us|the company)|why join|compensation|salary|equal opportunity|how to apply|responsibilit|what you.{0,10}(do|ll do))/.test(low)) { bucket = null; inReqSection = false; continue; }
    }
    const bulletish = /^[-*•·‣◦o]\s+|^\d+[.)]\s+/.test(raw);
    if (!bulletish && !inReqSection) continue;
    const text = raw.replace(/^[-*•·‣◦o]\s+|^\d+[.)]\s+/, "").trim();
    if (text.length > 320) continue;
    if (GENERIC_QUAL.test(text)) continue;
    // A bullet is already a deliberate, single item -- "- Kubernetes" or
    // "- AWS" is exactly as real a requirement as a full sentence, so it
    // gets a lower bar than free-flowing prose in a requirements section.
    // The stricter minimums (8 chars, 2+ real terms) stay for prose lines,
    // where a short fragment is more likely a heading or noise than a
    // genuine one-word requirement.
    if (bulletish) {
      if (!terms(text, 1).length) continue;
    } else {
      if (text.length < 8 || terms(text).length < 2) continue;
    }
    const lineKind: "required" | "nice_to_have" =
      /(nice to have|preferred|a plus|bonus|desirable|ideally)/.test(text.toLowerCase())
        ? "nice_to_have"
        : (bucket || "required");
    out.push({ text, kind: lineKind });
    if (out.length >= 40) break;
  }
  return out;
}

/**
 * Compute matched / missing / nice-to-have deterministically by testing JD
 * requirement terms against the structured resume sections. No model call.
 */
export function computeGap(
  jd: string,
  bundle: SectionBundle,
  extra?: { jdSkills?: string[]; mustHaves?: string[]; niceToHaves?: string[] },
): GapAnalysis {
  const haystack = " " + norm(bundle.text) + " ";
  const hasTerm = (t: string) => {
    const n = norm(t);
    if (!n) return false;
    if (haystack.includes(` ${n} `)) return true;
    // token-boundary-ish containment for things like "node.js" / "ci/cd"
    return haystack.includes(n.length >= 4 ? n : ` ${n} `);
  };

  const items: Array<{ text: string; kind: "required" | "nice_to_have" }> = [
    ...(extra?.mustHaves || []).map((t) => ({ text: t, kind: "required" as const })),
    ...(extra?.jdSkills || []).map((t) => ({ text: t, kind: "required" as const })),
    ...(extra?.niceToHaves || []).map((t) => ({ text: t, kind: "nice_to_have" as const })),
    ...extractRequirements(jd),
  ];

  const seen = new Set<string>();
  const requirements: Requirement[] = [];
  for (const it of items) {
    const key = norm(it.text).slice(0, 80);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const ts = terms(it.text, 1);
    if (!ts.length) continue;
    const evidence = ts.filter(hasTerm);
    const coverage = evidence.length / ts.length;
    // Short skill phrases (1 to 3 terms) need full presence; long sentences
    // are considered evidenced at 60 percent term overlap.
    const matched = ts.length <= 3 ? coverage >= 0.99 : coverage >= 0.6;
    requirements.push({
      text: it.text,
      kind: it.kind,
      status: matched ? "matched" : "missing",
      evidence: matched ? Array.from(new Set(evidence)).slice(0, 8) : [],
      coverage: Math.round(coverage * 100) / 100,
    });
    if (requirements.length >= 45) break;
  }

  const matched = requirements.filter((r) => r.status === "matched" && r.kind === "required");
  const missing = requirements.filter((r) => r.status === "missing" && r.kind === "required");
  const niceToHave = requirements.filter((r) => r.kind === "nice_to_have");
  return { requirements, matched, missing, niceToHave, method: "deterministic" };
}

export function renderGapBlock(gap: GapAnalysis): string {
  const fmt = (rs: Requirement[]) => rs.length
    ? rs.map((r) => `- ${r.text}${r.evidence.length ? `  [evidence: ${r.evidence.join(", ")}]` : ""}`).join("\n")
    : "- (none)";
  return [
    "\n\nGAP ANALYSIS (computed deterministically from the sections above, do not re-derive it):",
    "ALREADY EVIDENCED (surface these in the JD's own terminology):",
    fmt(gap.matched.slice(0, 15)),
    "REQUIRED BUT NOT EVIDENCED (only mention if genuinely related experience exists above; otherwise leave out entirely):",
    fmt(gap.missing.slice(0, 15)),
    "NICE TO HAVE:",
    fmt(gap.niceToHave.slice(0, 10)),
  ].join("\n");
}

// ──────────────────────────────────────────────────────────────
// 3. Figure preservation
// ──────────────────────────────────────────────────────────────

const FIGURE_RE = /(?:[$€£¥]\s?\d[\d,.]*\s?(?:k|m|b|bn|million|billion)?|\d[\d,.]*\s?%|\b(?:19|20)\d{2}\b|\b\d[\d,.]*\s?(?:k|m|x|\+)?\b)/gi;

export function extractFigures(text: string): string[] {
  const raw = String(text || "").match(FIGURE_RE) || [];
  const out = new Set<string>();
  for (const f of raw) {
    const t = f.trim().toLowerCase().replace(/\s+/g, "");
    if (!t) continue;
    if (/^\d$/.test(t)) continue;            // bare single digits are noise
    if (/^[.,]+$/.test(t)) continue;
    out.add(t);
  }
  return Array.from(out);
}

/** Figures present in the input but absent from the output. */
export function droppedFigures(input: string, output: string): string[] {
  const outNorm = String(output || "").toLowerCase().replace(/\s+/g, "");
  return extractFigures(input).filter((f) => !outNorm.includes(f));
}

// ──────────────────────────────────────────────────────────────
// 4. Cache, company context, telemetry
// ──────────────────────────────────────────────────────────────

export async function cacheGet<T>(admin: SupabaseClient<any, any, any>, key: string): Promise<T | null> {
  try {
    const { data } = await admin.from("ai_result_cache")
      .select("payload, expires_at").eq("cache_key", key).maybeSingle();
    if (!data) return null;
    if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
    return data.payload as T;
  } catch { return null; }
}

export async function cacheSet(
  admin: SupabaseClient<any, any, any>,
  key: string, userId: string | null, purpose: string, payload: unknown, ttlMs: number,
): Promise<void> {
  try {
    await admin.from("ai_result_cache").upsert({
      cache_key: key, user_id: userId, purpose, payload,
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    }, { onConflict: "cache_key" });
  } catch { /* cache is best effort */ }
}

export async function logAiCall(
  admin: SupabaseClient<any, any, any>,
  row: {
    user_id?: string | null; purpose: string; model?: string; duration_ms?: number;
    cache_hit?: boolean; source_map?: Record<string, unknown> | null;
    gap_matched?: number; gap_missing?: number; gap_surfaced?: number;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from("ai_call_telemetry").insert({
      user_id: row.user_id ?? null,
      purpose: row.purpose,
      model: row.model ?? null,
      duration_ms: row.duration_ms ?? null,
      cache_hit: !!row.cache_hit,
      source_map: row.source_map ?? null,
      gap_matched: row.gap_matched ?? null,
      gap_missing: row.gap_missing ?? null,
      gap_surfaced: row.gap_surfaced ?? null,
      meta: row.meta ?? null,
    });
  } catch { /* telemetry never blocks a response */ }
}

const COMPANY_CTX_TTL = 7 * 24 * 60 * 60 * 1000;

function companyCandidates(company: string, url?: string): string[] {
  const out: string[] = [];
  try {
    if (url) {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      // Only the employer's own site. ATS hosts are not the company site.
      if (!/(greenhouse|lever|ashbyhq|workday|myworkdayjobs|smartrecruiters|jobvite|bamboohr|indeed|linkedin|glassdoor|ziprecruiter|workable|recruitee|teamtailor)\./.test(host)) {
        out.push(`${u.protocol}//${host}/about`, `${u.protocol}//${host}/`);
      }
    }
  } catch { /* ignore */ }
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (slug.length >= 3) out.push(`https://www.${slug}.com/about`, `https://www.${slug}.com/`);
  return out.slice(0, 4);
}

async function robotsAllows(origin: string, path: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`${origin}/robots.txt`, { signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    if (!r.ok) return true;
    const txt = (await r.text()).slice(0, 20000);
    let applies = false;
    for (const line of txt.split(/\r?\n/)) {
      const l = line.trim().toLowerCase();
      if (l.startsWith("user-agent:")) applies = l.slice(11).trim() === "*";
      else if (applies && l.startsWith("disallow:")) {
        const p = l.slice(9).trim();
        if (p && path.startsWith(p)) return false;
      }
    }
    return true;
  } catch { return true; }
}

/**
 * Fetch 500 to 1000 chars of the employer's own public About / home page.
 * Server side, robots-respecting, 3.5s timeout, cached 7 days, fails open.
 * Never touches LinkedIn or anything behind a login.
 */
export async function fetchCompanyContext(
  admin: SupabaseClient<any, any, any>,
  company: string,
  jobUrl?: string,
): Promise<{ text: string; source: string }> {
  const name = (company || "").trim();
  if (!name) return { text: "", source: "" };
  const key = `company_ctx:${await sha256(name.toLowerCase())}`;
  const hit = await cacheGet<{ text: string; source: string }>(admin, key);
  if (hit) return hit;

  let result = { text: "", source: "" };
  for (const candidate of companyCandidates(name, jobUrl)) {
    try {
      const u = new URL(candidate);
      if (!(await robotsAllows(u.origin, u.pathname))) continue;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3500);
      const r = await fetch(candidate, { signal: ctrl.signal, redirect: "follow", headers: { "user-agent": "AYNBot/1.0 (+https://ayn.careers)" } });
      clearTimeout(t);
      if (!r.ok) continue;
      const html = (await r.text()).slice(0, 400000);
      const meta = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || "";
      const body = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
        .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      const text = `${meta} ${body}`.trim().slice(0, 1000);
      if (text.length >= 200) { result = { text, source: candidate }; break; }
    } catch { /* try the next candidate */ }
  }
  await cacheSet(admin, key, null, "company_ctx", result, COMPANY_CTX_TTL);
  return result;
}
