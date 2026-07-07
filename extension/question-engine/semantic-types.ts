/**
 * semantic-types.ts
 * Successor to classifyField(). Maps a question's fused text to a namespaced
 * SemanticType. Pure and table-driven so new patterns are data, not branches.
 *
 * Namespaces:
 *   contact.*   — name, email, phone, address, city, state, zip, country
 *   identity.*  — dob, ssn (never auto-filled)
 *   auth.*      — work_authorization, sponsorship
 *   logistics.* — relocation, start_date, salary, notice_period
 *   eeo.*       — gender, race, ethnicity, veteran, disability
 *   open.*      — motivation, why_company, why_role, cover_letter
 *   link.*      — linkedin, github, portfolio, website
 *   resume.*    — resume upload
 *   consent.*   — terms, privacy, marketing opt-in
 */

import type { SemanticType, QuestionKind } from "./question";

export interface ClassifyInput {
  label: string;
  section: string | null;
  optionLabels: string[];
  placeholder: string | null;
  kind: QuestionKind;
}

export interface ClassifyResult {
  semanticType: SemanticType;
  confidence: number;
}

interface Rule {
  type: SemanticType;
  patterns: RegExp[];
  requireKind?: QuestionKind[];
  optionHints?: RegExp[];
  confidence?: number;
}

// Order matters — first match wins. More specific rules first.
const RULES: Rule[] = [
  // ---- contact
  { type: "contact.email", patterns: [/\be-?mail\b/i], confidence: 0.98 },
  { type: "contact.phone", patterns: [/\b(phone|mobile|cell|telephone)\b/i], confidence: 0.98 },
  { type: "contact.first_name", patterns: [/\b(first[\s_-]*name|given[\s_-]*name)\b/i], confidence: 0.98 },
  { type: "contact.last_name", patterns: [/\b(last[\s_-]*name|family[\s_-]*name|surname)\b/i], confidence: 0.98 },
  { type: "contact.full_name", patterns: [/\bfull[\s_-]*name\b/i, /^name$/i], confidence: 0.9 },
  { type: "contact.address", patterns: [/\b(address|street)\b/i], confidence: 0.85 },
  { type: "contact.city", patterns: [/\bcity\b/i], confidence: 0.95 },
  { type: "contact.state", patterns: [/\b(state|province|region)\b/i], confidence: 0.85 },
  { type: "contact.zip", patterns: [/\b(zip|postal[\s_-]*code|postcode)\b/i], confidence: 0.95 },
  { type: "contact.country", patterns: [/\bcountry\b/i], confidence: 0.95 },

  // ---- links
  { type: "link.linkedin", patterns: [/linkedin/i], confidence: 0.98 },
  { type: "link.github", patterns: [/github/i], confidence: 0.98 },
  { type: "link.portfolio", patterns: [/\b(portfolio|personal\s+site)\b/i], confidence: 0.9 },
  { type: "link.website", patterns: [/\b(website|url|homepage)\b/i], confidence: 0.85 },

  // ---- resume
  { type: "resume.file", patterns: [/\b(resume|cv|curriculum)\b/i], requireKind: ["file"], confidence: 0.98 },

  // ---- auth / logistics
  {
    type: "auth.work_authorization",
    patterns: [/\b(authoriz(ed|ation)|legally\s+(able|allowed))\b.*\b(work|employ)/i, /\bright\s+to\s+work\b/i],
    confidence: 0.95,
  },
  {
    type: "auth.sponsorship",
    patterns: [/\bsponsor(ship)?\b/i, /\bvisa\b/i, /\bh-?1b\b/i],
    confidence: 0.95,
  },
  { type: "logistics.relocation", patterns: [/\brelocat/i], confidence: 0.9 },
  { type: "logistics.start_date", patterns: [/\b(start\s+date|available.*start|when.*start)\b/i], confidence: 0.9 },
  {
    type: "logistics.salary",
    patterns: [/\b(salary|compensation|expected\s+pay|desired\s+pay)\b/i],
    confidence: 0.9,
  },
  { type: "logistics.notice_period", patterns: [/\bnotice\s+period\b/i], confidence: 0.95 },

  // ---- EEO
  { type: "eeo.gender", patterns: [/\bgender\b/i, /\bsex\b/i], confidence: 0.95 },
  { type: "eeo.race", patterns: [/\brace\b/i], confidence: 0.95 },
  { type: "eeo.ethnicity", patterns: [/\bethnicit/i, /\bhispanic\b/i, /\blatino\b/i], confidence: 0.95 },
  { type: "eeo.veteran", patterns: [/\bveteran\b/i, /\bprotected\s+veteran\b/i], confidence: 0.98 },
  { type: "eeo.disability", patterns: [/\bdisabilit/i], confidence: 0.98 },

  // ---- consent
  { type: "consent.terms", patterns: [/\b(terms|conditions|agreement)\b/i], confidence: 0.9 },
  { type: "consent.privacy", patterns: [/\bprivacy\s+policy\b/i, /\bdata\s+processing\b/i], confidence: 0.9 },
  { type: "consent.marketing", patterns: [/\b(marketing|newsletter|updates|subscribe)\b/i], confidence: 0.85 },

  // ---- open-ended (last resort)
  { type: "open.why_company", patterns: [/\bwhy\s+(do\s+you\s+want\s+to\s+)?(work|join)\b/i], confidence: 0.85 },
  { type: "open.motivation", patterns: [/\bwhy\s+are\s+you\s+interested\b/i, /\bmotivat/i], confidence: 0.8 },
  { type: "open.cover_letter", patterns: [/\bcover\s+letter\b/i], confidence: 0.95 },
];

export function classify(input: ClassifyInput): ClassifyResult {
  const haystack = [
    input.label,
    input.placeholder ?? "",
    input.section ?? "",
    input.optionLabels.join(" "),
  ]
    .join(" \n ")
    .toLowerCase();

  if (!haystack.trim()) return { semanticType: "unknown", confidence: 0 };

  for (const r of RULES) {
    if (r.requireKind && !r.requireKind.includes(input.kind)) continue;
    for (const p of r.patterns) {
      if (p.test(haystack)) {
        return { semanticType: r.type, confidence: r.confidence ?? 0.85 };
      }
    }
  }
  return { semanticType: "unknown", confidence: 0 };
}
