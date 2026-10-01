// v3.330.0 — extracted from ProfileTab.tsx as part of splitting that
// 1,874-line file into focused pieces. The canonical-profile-shaped
// types (mirroring the edge function's own CanonicalProfile), the fixed
// vocabulary lists the form's option rows are built from, and two pure
// mapping functions (normalizeSkills, mapResumeToCareer) that have no
// dependency on the component's own state. Pure code movement, zero
// logic changes.
import type { ResumeContent } from "@/lib/resumeHub";

// ── Types (mirror the edge-function canonical shape) ─────────────────────────
export type SkillLevel = "familiar" | "proficient" | "advanced" | "expert";
export type LastUsed = "this_year" | "within_2_years" | "over_2_years";

export type Skill = { name: string; years?: number | null; level?: SkillLevel | null; last_used?: LastUsed | null };
export type Exp = {
  company: string; title: string; location?: string; start?: string; end?: string; current?: boolean;
  bullets?: string[]; bullets_from_resume?: boolean; industry?: string; team_size?: number | null;
};
export type Edu = { school: string; degree?: string; field?: string; start?: string; end?: string };
export type Cert = { name: string; issuer?: string; year?: string };
export type WorkAuth = {
  citizenship?: string; countries?: string[];
  work_authorized_us?: boolean; work_authorized_ca?: boolean;
  needs_sponsorship_now?: boolean; needs_sponsorship_future?: boolean;
  visa_type?: string; notes?: string; work_permit_expires?: string;
};
export type Prefs = {
  open_to_remote?: boolean; open_to_relocation?: boolean;
  salary_min_usd?: number; salary_currency?: string;
  desired_titles?: string[]; desired_locations?: string[];
  employment_types?: string[]; availability?: string; company_stages?: string[];
};
export type Derived = {
  total_yoe?: number; seniority?: string; primary_function?: string;
  top_skills?: string[]; education_level?: string;
  current_title?: string; current_company?: string;
  known_for?: string[];
};
export type Career = {
  skills: Skill[]; experiences: Exp[]; education: Edu[]; certifications: Cert[];
  work_auth: WorkAuth; preferences: Prefs; derived: Derived;
};

export const EMPTY: Career = { skills: [], experiences: [], education: [], certifications: [], work_auth: {}, preferences: {}, derived: {} };

// v3.185.0 trimmed this to Canada/US only, back when job-board-sync was
// deliberately scoped to those two countries alone (v3.163.0) -- every
// other country was a real dead option, no postings behind it to match
// against. That scope itself was always disclosed as a later expansion,
// not a permanent exclusion, and it since expanded for real (v3.309.0):
// job-board-sync and ats-direct-sync now source real postings across
// North America, Europe, Middle East, and Australia. Widened here to
// match -- the exact same real country set _shared/geoScope.ts's own
// classifyRegion() already checks against, not a new, separate list that
// could quietly drift out of sync with what AYN can actually match a
// person against. Ordered by region so the chip row reads in clusters.
export const WORK_COUNTRIES = [
  // North America
  "Canada", "United States",
  // Europe
  "United Kingdom", "Germany", "France", "Spain", "Italy", "Netherlands",
  "Belgium", "Switzerland", "Ireland", "Portugal", "Poland", "Sweden",
  "Norway", "Denmark", "Austria", "Finland", "Romania", "Greece",
  "Hungary", "Czech Republic",
  // Middle East
  "United Arab Emirates", "Saudi Arabia", "Israel", "Qatar", "Kuwait",
  "Bahrain", "Oman",
  // Australia
  "Australia",
];
export const LEVELS: { value: SkillLevel; label: string }[] = [
  { value: "familiar", label: "Familiar" },
  { value: "proficient", label: "Proficient" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
];
export const LAST_USED: { value: LastUsed; label: string }[] = [
  { value: "this_year", label: "This year" },
  { value: "within_2_years", label: "Within 2 years" },
  { value: "over_2_years", label: "Over 2 years ago" },
];
export const INDUSTRIES = ["Fintech", "Healthcare", "Ecommerce", "Enterprise SaaS", "Government", "Education", "Logistics", "Gaming", "Energy"];
export const EMPLOYMENT_TYPES = ["Full time", "Contract", "Part time", "Internship"];
export const AVAILABILITY = ["Immediately", "2 weeks", "1 month", "3 months", "Just looking"];
export const COMPANY_STAGES = ["Early startup", "Growth", "Large company", "No preference"];
// Same vocabulary the backend's derived.seniority is documented and scored
// against (supabase/functions/resume-hub/index.ts, canonicalDigest / the
// resume-parsing prompt) — a datalist so an existing free-text value is
// never lost, but a fresh pick lines up with what the matcher actually reads.
export const SENIORITY_LEVELS = ["Intern", "Entry", "Mid", "Senior", "Staff", "Principal", "Manager", "Director", "VP", "C-level"];
export const PRIMARY_FUNCTIONS = ["Engineering", "Product", "Design", "Data", "Marketing", "Sales", "Operations", "Finance", "HR", "Customer success", "Legal"];
export const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "AUD", "AED"];

/** Personal fields live in user_profile_data, the user-entered layer. */
export type PersonalKey = "first_name" | "last_name" | "email" | "phone" | "city" | "linkedin" | "github" | "portfolio";
export type Personal = Record<PersonalKey, string>;
export const EMPTY_PERSONAL: Personal = { first_name: "", last_name: "", email: "", phone: "", city: "", linkedin: "", github: "", portfolio: "" };

export function normalizeSkills(raw: unknown): Skill[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(s => {
    if (typeof s === "string") return { name: s, level: null, years: null, last_used: null };
    const o = (s ?? {}) as Record<string, unknown>;
    return {
      name: String(o.name ?? ""),
      level: (o.level as SkillLevel) ?? null,
      years: typeof o.years === "number" ? o.years : null,
      last_used: (o.last_used as LastUsed) ?? null,
    };
  }).filter(s => s.name !== undefined);
}

export function mapResumeToCareer(resume: ResumeContent, prev: Career): Career {
  const work = resume.work || [];
  const edu = resume.education || [];
  const skills = (resume.skills || []).filter(Boolean);
  const startYears = work.map(w => parseInt(String(w.start || "").slice(0, 4))).filter(y => y > 1950 && y < 2100);
  const earliest = startYears.length ? Math.min(...startYears) : undefined;
  const total_yoe = earliest ? Math.max(0, new Date().getFullYear() - earliest) : prev.derived?.total_yoe;
  return {
    ...prev,
    skills: skills.length ? skills.map(name => ({ name, level: null, years: null, last_used: null })) : prev.skills,
    experiences: work.length
      ? work.map(w => ({
          company: w.company || "", title: w.title || "", location: w.location,
          start: w.start, end: w.end, current: !w.end,
          bullets: (w.bullets || []).slice(0, 5),
          bullets_from_resume: (w.bullets || []).length > 0,
        }))
      : prev.experiences,
    education: edu.length
      ? edu.map(e => ({ school: e.school || "", degree: e.degree, field: e.field, start: e.start, end: e.end }))
      : prev.education,
    derived: {
      ...prev.derived,
      current_title: prev.derived?.current_title || resume.basics?.title || work[0]?.title,
      current_company: prev.derived?.current_company || work[0]?.company,
      education_level: prev.derived?.education_level || edu[0]?.degree,
      total_yoe,
      top_skills: skills.length ? skills.slice(0, 8) : prev.derived?.top_skills,
    },
  };
}
