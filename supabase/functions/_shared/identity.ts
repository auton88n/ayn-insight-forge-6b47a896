// _shared/identity.ts — v2.13.0 (Slice 2 of "Reliable by construction")
//
// Single Source of Truth for applicant identity across every edge action
// that needs it (tailor, cover_letter, match, job_fit_advice, and more).
//
// WHY THIS EXISTS: per action inline merges used to return an empty
// identity when the user had a resume but no profile row, and never
// consulted auth.users.email as a fallback, so generated documents could
// carry a name and an email that were not the applicant's. This file is
// the structural fix: one function, one priority order, one digest, one
// place to change when a source is added.
//
// PRIORITY (per field, highest first):
//   profile (user_profile_data) > canonical (user_profile_canonical.identity
//   OR .derived) > resume (resumes.content.basics OR resume_versions when
//   a version id was passed) > auth (auth.users.email)
//
// Every returned field carries a source tag so telemetry (Slice 1) and
// future debugging can trace where each value came from.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

export type IdentitySource = "profile" | "canonical" | "resume" | "auth" | "missing";

export interface IdentityField<T = string> {
  value: T;
  source: IdentitySource;
}

export interface Identity {
  user_id: string;
  first_name: IdentityField;
  last_name: IdentityField;
  full_name: IdentityField;
  email: IdentityField;
  phone: IdentityField;
  city: IdentityField;
  region: IdentityField;
  region_full: IdentityField;
  country: IdentityField;
  location: IdentityField;
  postal_code: IdentityField;
  address_line1: IdentityField;
  linkedin_url: IdentityField;
  portfolio_url: IdentityField;
  github_url: IdentityField;
  current_title: IdentityField;
  current_company: IdentityField;
  computed_years_experience: IdentityField<number>;
  computed_education_level: IdentityField;
  seniority: IdentityField;
  primary_function: IdentityField;

  /** Structured resume content (basics/work/education/skills/projects). */
  resume: {
    id: string | null;
    source: "version" | "primary" | "none";
    basics: Record<string, unknown>;
    work: Array<Record<string, unknown>>;
    education: Array<Record<string, unknown>>;
    skills: unknown[];
    projects: Array<Record<string, unknown>>;
    raw: Record<string, unknown> | null;
  };

  /** Raw pass-through for edge actions that still need work_auth / prefs. */
  profile: Record<string, any> | null;
  canonical: Record<string, any> | null;

  /**
   * True when there's enough to safely run a fill:
   * (first_name || full_name) AND (email || phone).
   */
  isComplete(): boolean;

  /** List of missing basics for the sidepanel to display. */
  missing(): string[];

  /**
   * Provenance haystack for the v2.12.2 client-side gate. Concatenates
   * every legitimate personal fact (identity + resume) into a single
   * whitespace-delimited string. Normalized substring matching happens
   * client-side in extension/background.js.
   */
  sourceDigest(): string;

  /**
   * Compact per-field source map for telemetry — one line per identity
   * field, showing which source produced the value or "missing".
   */
  sourceMap(): Record<string, IdentitySource>;
}

const CA_PROV: Record<string, string> = {
  ON: "Ontario", BC: "British Columbia", AB: "Alberta", QC: "Quebec",
  MB: "Manitoba", SK: "Saskatchewan", NS: "Nova Scotia", NB: "New Brunswick",
  NL: "Newfoundland and Labrador", PE: "Prince Edward Island",
  NT: "Northwest Territories", YT: "Yukon", NU: "Nunavut",
};

// v3.272.0 — real, live gap found and reproduced: a resume whose basics
// only ever holds a single combined "location" string ("Halifax, NS", the
// common shape when someone typed their location as free text rather than
// separate city/region/country fields) left country.value permanently
// null, even though the country is a real, knowable fact sitting right
// there in that same string, just not split apart. This is the identical
// "same real fact, different shape" reasoning already used for skill
// terminology alignment elsewhere in this app -- reads the trailing
// province code against the same CA_PROV table region_full already uses,
// or a country name actually spelled out, never guesses beyond that.
function inferCountryFromLocationString(loc: string): string {
  const trailing = (loc.trim().split(",").pop() || "").trim().toUpperCase();
  if (CA_PROV[trailing]) return "Canada";
  if (/\bcanada\b/i.test(loc)) return "Canada";
  if (/\b(usa|u\.s\.a\.|united states)\b/i.test(loc)) return "United States";
  return "";
}

function field<T>(value: T, source: IdentitySource, fallback: T): IdentityField<T> {
  const isEmpty = value == null || (typeof value === "string" && value.trim() === "");
  return isEmpty
    ? { value: fallback, source: "missing" }
    : { value: (typeof value === "string" ? (value as unknown as string).trim() : value) as T, source };
}

/**
 * Pick the first non-empty value across sources, tag the chosen source.
 * String values are trimmed. Empty strings, null, undefined are skipped.
 */
function pick(sources: Array<[IdentitySource, unknown]>): IdentityField<string> {
  for (const [src, raw] of sources) {
    if (raw == null) continue;
    const s = String(raw).trim();
    if (s) return { value: s, source: src };
  }
  return { value: "", source: "missing" };
}

function parseYear(s: unknown): number | null {
  const m = String(s || "").match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : null;
}

function computeYoE(work: Array<Record<string, unknown>>): number {
  const now = new Date().getFullYear();
  let yoe = 0;
  for (const w of work) {
    const sy = parseYear(w.start);
    const ey = /present|current/i.test(String(w.end || "")) ? now : (parseYear(w.end) || now);
    if (sy) yoe += Math.max(0, ey - sy);
  }
  return yoe;
}

function inferEducationLevel(edu: Array<Record<string, unknown>>): string {
  const s = edu.map(e => `${e.degree || ""} ${e.field || ""}`).join(" ").toLowerCase();
  if (/ph\.?d|doctor/.test(s)) return "PhD";
  if (/master|m\.?sc|m\.?a\.|mba|m\.?eng/.test(s)) return "Master's";
  if (/bachelor|b\.?sc|b\.?a\.|b\.?eng|undergrad/.test(s)) return "Bachelor's";
  if (/associate|diploma/.test(s)) return "Associate's";
  if (s.trim()) return "High School";
  return "";
}

/**
 * Load a fully merged Identity for the given user, in ONE round trip.
 *
 * Reads: auth.users (email), user_profile_data, user_profile_canonical,
 * and either resume_versions (when resume_version_id is passed and owned
 * by user) OR the primary resume.
 */
export async function loadIdentity(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  opts?: { resume_version_id?: string },
): Promise<Identity> {
  const [profRes, canonRes, primaryRes, versionRes, authRes] = await Promise.all([
    admin.from("user_profile_data").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("user_profile_canonical")
      .select("skills, experiences, education, certifications, work_auth, preferences, derived")
      .eq("user_id", userId).maybeSingle(),
    admin.from("resumes").select("id, content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
    (opts?.resume_version_id
      ? admin.from("resume_versions").select("id, resume_id, content, user_id").eq("id", opts.resume_version_id).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null } as { data: null })),
    admin.auth.admin.getUserById(userId),
  ]);

  const profile = (profRes?.data as Record<string, any>) || null;
  const canonical = (canonRes?.data as Record<string, any>) || null;
  const authUser = (authRes?.data as any)?.user;
  const authEmail = authUser?.email || "";
  // The name typed at signup (AuthModal.tsx passes it as user_metadata.full_name)
  // was already the fix for resume_generate's own "Ayn User" placeholder bug
  // (v3.120.0), but that fix only ever lived in resume_generate's bespoke
  // prompt code, not here. Every other action that shares this file (tailor,
  // cover_letter, match, rewrite) had no name fallback at all beyond the
  // resume/profile/canonical sources above — a brand-new account with a
  // resume but no user_profile_data row yet (that table is only written the
  // first time someone edits "About you") left full_name completely empty,
  // and the model filled the required basics.name field with an invented
  // placeholder instead. Reproduced live: "A. Developer" for a real signup.
  const authFullName = (authUser?.user_metadata as { full_name?: string } | undefined)?.full_name || "";

  // Choose resume: caller-requested version (if it belongs to this user) wins.
  let resumeSource: "version" | "primary" | "none" = "none";
  let resumeId: string | null = null;
  let resumeContent: Record<string, unknown> | null = null;
  const v = (versionRes?.data as any);
  if (v?.content) { resumeSource = "version"; resumeId = v.resume_id as string; resumeContent = v.content as Record<string, unknown>; }
  else {
    const p = (primaryRes?.data as any);
    if (p?.content) { resumeSource = "primary"; resumeId = p.id as string; resumeContent = p.content as Record<string, unknown>; }
  }

  const basics = ((resumeContent as any)?.basics || {}) as Record<string, string>;
  const work = ((resumeContent as any)?.work || []) as Array<Record<string, unknown>>;
  const education = ((resumeContent as any)?.education || []) as Array<Record<string, unknown>>;
  const skills = ((resumeContent as any)?.skills || []) as unknown[];
  const projects = ((resumeContent as any)?.projects || []) as Array<Record<string, unknown>>;

  const [firstFromResume, ...restFromResume] = String(basics.name || "").trim().split(/\s+/);
  const lastFromResume = restFromResume.join(" ");

  const addr = (profile?.address || {}) as Record<string, string>;
  const plinks = (profile?.links || {}) as Record<string, string>;
  const bLinks = (basics.links as unknown as Array<{ label?: string; url?: string }>) || [];
  const linkedinFromResume = bLinks.find(l => /linkedin\.com/i.test(l?.url || ""))?.url || "";
  const otherFromResume = bLinks.find(l => l?.url && !/linkedin\.com/i.test(l.url))?.url || "";

  // canonical.identity is the future home for a normalized identity block;
  // for now we look at canonical.derived and canonical.identity if present.
  const cIdent = (canonical?.identity || {}) as Record<string, any>;
  const cDerived = (canonical?.derived || {}) as Record<string, any>;

  const [firstFromAuth, ...restFromAuth] = authFullName.trim().split(/\s+/);
  const lastFromAuth = restFromAuth.join(" ");

  const first_name = pick([
    ["profile", profile?.legal_first_name],
    ["canonical", cIdent.first_name || cIdent.legal_first_name],
    ["resume", firstFromResume],
    ["auth", firstFromAuth],
  ]);
  const last_name = pick([
    ["profile", profile?.legal_last_name],
    ["canonical", cIdent.last_name || cIdent.legal_last_name],
    ["resume", lastFromResume],
    ["auth", lastFromAuth],
  ]);
  const full_from_parts = [first_name.value, last_name.value].filter(Boolean).join(" ");
  const full_name = pick([
    ["profile", full_from_parts && (first_name.source === "profile" || last_name.source === "profile") ? full_from_parts : ""],
    ["canonical", cIdent.legal_name || cIdent.full_name],
    ["resume", basics.name],
    ["profile", full_from_parts],
    ["auth", authFullName],
  ]);

  const email = pick([
    ["profile", profile?.email],
    ["canonical", cIdent.email],
    ["resume", basics.email],
    ["auth", authEmail], // <— the missing fallback that made "Isha Sharma" possible
  ]);
  const phone = pick([
    ["profile", profile?.phone],
    ["canonical", cIdent.phone],
    ["resume", basics.phone],
  ]);

  // Same reasoning as inferCountryFromLocationString: the part before the
  // first comma of a combined "Halifax, NS" string is the real city, just
  // not split into its own field. A field asking specifically for "City"
  // (not the combined "Location (City)" role, which already falls back to
  // the full location string below) gets the precise value instead.
  const cityFromLocationString = (basics.location || "").trim().split(",")[0]?.trim() || "";
  const city = pick([
    ["profile", addr.city], ["canonical", cIdent.city], ["resume", (basics as any).city],
    ["resume", cityFromLocationString],
  ]);
  const regionRaw = pick([["profile", addr.state || addr.province], ["canonical", cIdent.region || cIdent.state], ["resume", (basics as any).region]]);
  const region_full_value = CA_PROV[regionRaw.value.toUpperCase()] || regionRaw.value;
  const region_full: IdentityField<string> = regionRaw.value ? { value: region_full_value, source: regionRaw.source } : { value: "", source: "missing" };
  const country = pick([
    ["profile", addr.country], ["canonical", cIdent.country], ["resume", (basics as any).country],
    ["resume", inferCountryFromLocationString(basics.location || "")],
  ]);
  const postal_code = pick([
    ["profile", (addr as any).postal || (addr as any).postal_code || (addr as any).zip],
    ["canonical", cIdent.postal_code || cIdent.zip],
  ]);
  const address_line1 = pick([
    ["profile", (addr as any).line1 || (addr as any).street],
    ["canonical", cIdent.address_line1 || cIdent.street],
  ]);
  const location_str = [city.value, region_full.value, country.value].filter(Boolean).join(", ");
  const location: IdentityField<string> = location_str
    ? { value: location_str, source: city.source !== "missing" ? city.source : (regionRaw.source !== "missing" ? regionRaw.source : country.source) }
    : pick([["resume", basics.location]]);

  const linkedin_url = pick([
    ["profile", /linkedin\.com\//i.test(plinks.linkedin || "") ? plinks.linkedin : ""],
    ["canonical", cIdent.linkedin_url],
    ["resume", /linkedin\.com\//i.test(linkedinFromResume) ? linkedinFromResume : ""],
  ]);
  const portfolio_url = pick([
    ["profile", plinks.portfolio || plinks.website],
    ["canonical", cIdent.portfolio_url || cIdent.website],
    ["resume", otherFromResume && !/linkedin\.com/i.test(otherFromResume) ? otherFromResume : ""],
  ]);
  const github_url = pick([
    ["profile", plinks.github],
    ["canonical", cIdent.github_url],
    ["resume", bLinks.find(l => /github\.com/i.test(l?.url || ""))?.url || ""],
  ]);

  const yoeComputed = computeYoE(work);
  const eduLevelComputed = inferEducationLevel(education);
  const cyoe = cDerived.total_yoe;
  const computed_years_experience: IdentityField<number> = (typeof cyoe === "number" && cyoe > 0)
    ? { value: cyoe, source: "canonical" }
    : (yoeComputed > 0 ? { value: yoeComputed, source: "resume" } : { value: 0, source: "missing" });
  const computed_education_level = pick([
    ["canonical", cDerived.education_level],
    ["resume", eduLevelComputed],
  ]);
  const current_title = pick([
    ["canonical", cDerived.current_title],
    ["resume", (work[0] as any)?.title || basics.title],
  ]);
  const current_company = pick([
    ["canonical", cDerived.current_company],
    ["resume", (work[0] as any)?.company],
  ]);
  const seniority = pick([["canonical", cDerived.seniority]]);
  const primary_function = pick([["canonical", cDerived.primary_function]]);

  const identity: Identity = {
    user_id: userId,
    first_name, last_name, full_name, email, phone,
    city, region: regionRaw, region_full, country, location,
    postal_code, address_line1,
    linkedin_url, portfolio_url, github_url,
    current_title, current_company,
    computed_years_experience, computed_education_level,
    seniority, primary_function,
    resume: {
      id: resumeId, source: resumeSource,
      basics, work, education, skills, projects,
      raw: resumeContent,
    },
    profile,
    canonical,

    isComplete() {
      const hasName = !!(first_name.value || full_name.value);
      const hasReach = !!(email.value || phone.value);
      return hasName && hasReach;
    },
    missing() {
      const gaps: string[] = [];
      if (!first_name.value && !full_name.value) gaps.push("name");
      if (!email.value) gaps.push("email");
      if (!phone.value) gaps.push("phone");
      return gaps;
    },
    sourceDigest() {
      const parts: string[] = [];
      const push = (v: unknown) => { const s = String(v == null ? "" : v).trim(); if (s) parts.push(s); };
      push(first_name.value); push(last_name.value); push(full_name.value);
      push(email.value); push(phone.value);
      push(city.value); push(regionRaw.value); push(region_full.value);
      push(country.value); push(location.value);
      push(linkedin_url.value); push(portfolio_url.value); push(github_url.value);
      push(address_line1.value); push(postal_code.value);
      // Resume basics + work + education + skills — every legitimate PII fact.
      push(basics.name); push(basics.email); push(basics.phone);
      push(basics.title); push(basics.location); push(basics.summary);
      for (const w of work) {
        const wa = w as any;
        push(wa.company); push(wa.title); push(wa.location);
        push(wa.start); push(wa.end); push(wa.summary);
        if (Array.isArray(wa.highlights)) wa.highlights.forEach(push);
        if (Array.isArray(wa.bullets)) wa.bullets.forEach(push);
      }
      for (const e of education) {
        const ea = e as any;
        push(ea.institution); push(ea.school); push(ea.degree);
        push(ea.field); push(ea.area); push(ea.start); push(ea.end);
      }
      if (Array.isArray(skills)) skills.forEach(push);
      try { if (canonical) push(JSON.stringify(canonical)); } catch { /* ignore */ }
      return parts.join(" \n ");
    },
    sourceMap() {
      return {
        first_name: first_name.source,
        last_name: last_name.source,
        full_name: full_name.source,
        email: email.source,
        phone: phone.source,
        city: city.source,
        region: regionRaw.source,
        country: country.source,
        postal_code: postal_code.source,
        linkedin_url: linkedin_url.source,
        portfolio_url: portfolio_url.source,
        github_url: github_url.source,
        current_title: current_title.source,
        current_company: current_company.source,
      };
    },
  };

  return identity;
}

/**
 * Plain-text applicant contact block for cover letter / tailored resume
 * headers. Ensures generated documents carry the real applicant's
 * identity instead of whatever the model would otherwise invent from
 * the resume `basics.name` alone.
 */
export function identityContactBlock(id: Identity): string {
  const lines: string[] = [];
  if (id.full_name.value) lines.push(id.full_name.value);
  const contact = [id.email.value, id.phone.value].filter(Boolean).join(" | ");
  if (contact) lines.push(contact);
  const loc = id.location.value;
  if (loc) lines.push(loc);
  const links = [id.linkedin_url.value, id.portfolio_url.value, id.github_url.value].filter(Boolean).join(" | ");
  if (links) lines.push(links);
  return lines.join("\n");
}
