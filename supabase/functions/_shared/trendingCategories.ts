// v3.309.0 — the real repositioning: "I don't want to be for all type of
// jobs I want to be for the most trending jobs each year." AYN stops
// ingesting every category freehire returns and only keeps real,
// verified-clean tech/AI/data categories going forward. Shared by
// job-board-sync and ats-direct-sync so both ingestion paths apply the
// identical filter rather than two copies able to drift.
//
// Every category below was checked against real, live job_postings rows
// before being included — freehire's own `enrichment.category` field is a
// raw taxonomy of real ATS category codes, and several plausible-sounding
// ones turned out to be genuinely mixed with non-tech roles once sampled:
// bare "security" and "security_officer" both return real physical-
// security-guard postings ("Armed Security Officer", "Protective Services
// Officer") alongside real cybersecurity roles, with no way to tell them
// apart from the category alone; bare "architecture" is building/civil/
// industrial architects ("Architect, K-12", "Architectural Designer"),
// not software architecture; bare "engineering" is a genuinely mixed bag
// ("Building Performance Analyst", "Commissioning Authority", "Manager,
// Vehicle Controls" sitting next to real tech titles). All four are
// deliberately left OUT of this list — the software/data/security-adjacent
// categories below are specific enough to not carry that same noise, and
// a real cybersecurity title still reaches AYN through "information_
// technology" or "technology" (both sampled clean: Network Engineer,
// Database Administrator, SRE, Senior Software Engineer). "product" and
// "design" were checked too — "product"/"product_management" sampled
// clean (real Product Manager roles); bare "design" sampled dirty (fire
// alarm/sprinkler designers, industrial design) and is excluded the same
// way "architecture" and bare "security" are.
export const TRENDING_TECH_CATEGORIES = [
  // Software engineering, by discipline
  "software_engineering", "development", "frontend", "backend", "fullstack",
  "mobile", "embedded", "devops", "sre",
  "solutions_engineering", "solution_engineering",
  // Data and AI, the actual "trending" core of this repositioning
  "data_analytics", "data_science", "data_engineering", "ml_ai", "ai_engineering",
  // Quality, hardware, and general tech/IT — sampled and confirmed clean
  "qa", "hardware", "information_technology", "technology",
  // Tech-adjacent product management — sampled clean, real PM titles
  "product", "product_management",
];

// v3.309.0 — ats-direct-sync's own category values are NOT freehire's
// taxonomy: they're each vendor's own real department/team name, slugified
// (see that function's own category mapping). Checked live against real
// production rows before assuming the same list applies: Ashby's own bare
// "engineering" category sampled genuinely clean (Staff Software Engineer,
// SRE, Engineering Manager, Infrastructure) — Ashby is a tech-forward ATS
// and its "Engineering" department really does mean software engineering.
// Greenhouse's own bare "engineering" sampled exactly as mixed as
// freehire's (Building Performance Analyst, Commissioning Authority,
// mechanical/facilities roles) — same underlying real-world noise, a
// different source reading the same kind of company. Source-scoped rather
// than one flat list pretending every vendor's "engineering" means the
// same thing.
const ASHBY_ADDITIONAL_CLEAN_CATEGORIES = ["engineering"];

export function isTrendingTechCategory(category: string | null | undefined, source?: string | null): boolean {
  if (!category) return false;
  const c = category.toLowerCase().trim();
  if (TRENDING_TECH_CATEGORIES.includes(c)) return true;
  if (source === "ashby" && ASHBY_ADDITIONAL_CLEAN_CATEGORIES.includes(c)) return true;
  return false;
}

// v3.310.0 — for a source with no category/department field at all
// (Workday's own public job-search API, confirmed live: neither the list
// nor the detail endpoint returns anything of the kind, unlike Greenhouse/
// Lever/Ashby which all expose a real department). A real title-keyword
// fallback, checked directly against the same "when unsure, leave it out"
// discipline every other classifier in this codebase already follows —
// word-boundary matched so "AI" doesn't fire on "maintain" or "detail",
// and "architect" specifically requires a real software-adjacent qualifier
// right before it (software/solutions/cloud/data/enterprise/security
// architect) since a bare "Architect" is a building architect far more
// often than not, the same finding that kept bare "architecture" out of
// the category allowlist above.
const TRENDING_TITLE_RE = new RegExp(
  "\\b(" + [
    "software engineer", "software developer", "full[- ]?stack", "front[- ]?end",
    "back[- ]?end", "devops", "\\bsre\\b", "site reliability",
    "data engineer", "data scientist", "data analyst", "data analytics",
    "machine learning", "\\bml\\b", "\\bai\\b", "artificial intelligence",
    "cloud engineer", "security engineer", "cybersecurity", "cyber security",
    "platform engineer", "infrastructure engineer", "systems engineer",
    "network engineer", "database administrator", "database engineer",
    "(software|solutions?|cloud|data|enterprise|security) architect",
    "qa engineer", "test engineer", "quality assurance engineer",
    "product manager", "technical program manager",
    "embedded (software|systems)", "mobile (developer|engineer)",
    "ios (developer|engineer)", "android (developer|engineer)", "\\bsdet\\b",
  ].join("|") + ")\\b",
  "i",
);
export function isTrendingTechTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return TRENDING_TITLE_RE.test(title);
}
