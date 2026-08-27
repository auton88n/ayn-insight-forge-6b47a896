// v3.265.0 — the auto-apply answer matcher. Maps an arbitrary ATS's own
// screening-question wording onto a real, already-known fact (work_auth,
// preferences, certifications, screening_answers) and returns that fact
// verbatim, or null when nothing real is on file. This function never asks
// a model to phrase or infer an answer to a factual/legal/preference
// question — see the KNOWN_QUESTIONS resolvers below, every one of them
// reads a stored value and formats it, nothing more. Narrative/open-ended
// questions ("why do you want this role") are a deliberately separate,
// out-of-scope concern — those are safe for a model to write from real
// resume facts, this file is only for the class of question that isn't.
import type { CanonicalProfile } from "./canonicalProfile.ts";
import { embedText } from "./embeddings.ts";
import { cosineSimilarity } from "../../_shared/tailoring.ts";

export type AnswerResult = {
  fieldId: string;
  label: string;
  matchedType: string | null;
  answer: string | null; // null = no real ground truth, caller must ask the user
  confidence: number; // 0 when regex-matched (certain), else cosine similarity
};

type QuestionType = {
  slug: string;
  // Deterministic, cheap first pass -- covers the common, near-universal
  // phrasings verbatim. Checked before any embedding call.
  keywords: RegExp;
  // A few canonical phrasings used only as an embedding fallback for
  // wording the keyword regex doesn't catch.
  examples: string[];
  resolve: (c: CanonicalProfile) => string | null;
};

function yesNo(v: boolean | undefined | null): string | null {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return null;
}

const KNOWN_QUESTIONS: QuestionType[] = [
  {
    slug: "work_authorized_no_sponsorship",
    keywords: /authoriz\w* to work.*(united states|u\.?s\.?|canada).*(without|now and in the future)|now or in the future.*(require|need).*sponsorship/i,
    examples: [
      "Are you legally authorized to work in the United States now and in the future without employer sponsorship?",
      "Will you now or in the future require sponsorship for employment visa status?",
    ],
    resolve: (c) => {
      const wa = c.work_auth;
      if (wa.needs_sponsorship_now == null && wa.needs_sponsorship_future == null) return null;
      const needsAny = !!wa.needs_sponsorship_now || !!wa.needs_sponsorship_future;
      return needsAny ? "No" : "Yes";
    },
  },
  {
    slug: "desired_salary",
    keywords: /desired salary|salary expectation|expected (compensation|salary|pay)|compensation expectation/i,
    examples: ["What is your desired salary?", "What are your salary expectations?"],
    resolve: (c) => {
      const p = c.preferences;
      if (p.salary_min_usd == null) return null;
      const currency = p.salary_currency || "USD";
      return `$${p.salary_min_usd.toLocaleString()} ${currency}`.trim();
    },
  },
  {
    slug: "open_to_relocation",
    keywords: /willing to relocate|open to relocat/i,
    examples: ["Are you willing to relocate?"],
    resolve: (c) => yesNo(c.preferences.open_to_relocation),
  },
  {
    slug: "open_to_remote",
    keywords: /open to (a )?remote|willing to work remote/i,
    examples: ["Are you open to remote work?"],
    resolve: (c) => yesNo(c.preferences.open_to_remote),
  },
  {
    slug: "non_compete",
    keywords: /non[- ]?compete|restrictive covenant|non[- ]?solicit/i,
    examples: ["Are you currently subject to a restrictive covenant agreement (e.g., non-compete, non-solicitation, or confidentiality agreement)?"],
    resolve: (c) => c.screening_answers["non_compete"] || null,
  },
  {
    slug: "related_to_employees",
    keywords: /related to (any )?(current )?employees?/i,
    examples: ["Are you related to any current employees? If yes, please state their name."],
    resolve: (c) => c.screening_answers["related_to_employees"] || null,
  },
  {
    slug: "outside_employment",
    keywords: /outside (or )?self[- ]?employment|continue working for another employer/i,
    examples: ["If hired, would you continue working for another employer or engage in any outside or self-employment?"],
    resolve: (c) => c.screening_answers["outside_employment"] || null,
  },
  {
    slug: "referral_source",
    keywords: /how did you (learn|hear) about this/i,
    examples: ["How did you learn about this opportunity?"],
    resolve: (c) => c.screening_answers["referral_source"] || null,
  },
  {
    slug: "referral_name",
    keywords: /referred by.*(name|employee)|if referred/i,
    examples: ["If referred by a current or past employee, please state their name."],
    resolve: (c) => c.screening_answers["referral_name"] || null,
  },
  {
    slug: "eighteen_or_older",
    keywords: /at least 18 years/i,
    examples: ["Are you at least 18 years or older?"],
    resolve: (c) => c.screening_answers["eighteen_or_older"] || null,
  },
];

// Any single license/certification question ("Do you hold a NMLS
// License?") is resolved by checking the user's own real certifications
// list for a name match -- absence is a safe default ("No"), since it can
// only ever correctly report "not evidenced," never fabricate a license
// that isn't there.
function tryLicenseMatch(label: string, c: CanonicalProfile): string | null {
  const m = label.match(/do you (hold|have) an?\s+([A-Za-z0-9 .\/-]{2,40}?)\s*(license|licence|certification)?\??$/i);
  if (!m) return null;
  const wanted = m[2].trim().toLowerCase();
  const has = c.certifications.some((cert) => cert.name.toLowerCase().includes(wanted) || wanted.includes(cert.name.toLowerCase()));
  return has ? "Yes" : "No";
}

const SIMILARITY_THRESHOLD = 0.72;

export async function matchApplicationAnswers(
  questions: Array<{ id: string; label: string }>,
  canonical: CanonicalProfile,
): Promise<AnswerResult[]> {
  const results: AnswerResult[] = [];

  // Pass 1: cheap, deterministic keyword matches -- covers the vast
  // majority of real ATS phrasings, zero AI cost.
  const unresolved: Array<{ id: string; label: string }> = [];
  for (const q of questions) {
    const license = tryLicenseMatch(q.label, canonical);
    if (license !== null) {
      results.push({ fieldId: q.id, label: q.label, matchedType: "license", answer: license, confidence: 0 });
      continue;
    }
    const kw = KNOWN_QUESTIONS.find((k) => k.keywords.test(q.label));
    if (kw) {
      const answer = kw.resolve(canonical);
      results.push({ fieldId: q.id, label: q.label, matchedType: kw.slug, answer, confidence: 0 });
      continue;
    }
    unresolved.push(q);
  }

  // Pass 2: embedding fallback for wording the regexes didn't catch.
  // Only runs on whatever pass 1 couldn't already resolve, so a form full
  // of standard phrasing costs nothing extra.
  if (unresolved.length > 0) {
    const exampleFlat: Array<{ slug: string; text: string }> = [];
    for (const qt of KNOWN_QUESTIONS) for (const ex of qt.examples) exampleFlat.push({ slug: qt.slug, text: ex });
    const exampleVectors = await Promise.all(exampleFlat.map((e) => embedText(e.text)));
    const realEmbeddings = exampleVectors.every((v) => v.model !== "deterministic-v1");

    for (const q of unresolved) {
      if (!realEmbeddings) {
        results.push({ fieldId: q.id, label: q.label, matchedType: null, answer: null, confidence: 0 });
        continue;
      }
      const { vector } = await embedText(q.label);
      let best: { slug: string; sim: number } | null = null;
      exampleVectors.forEach((ev, i) => {
        const sim = cosineSimilarity(vector, ev.vector);
        if (!best || sim > best.sim) best = { slug: exampleFlat[i].slug, sim };
      });
      if (best && best.sim >= SIMILARITY_THRESHOLD) {
        const qt = KNOWN_QUESTIONS.find((k) => k.slug === best!.slug)!;
        results.push({ fieldId: q.id, label: q.label, matchedType: qt.slug, answer: qt.resolve(canonical), confidence: best.sim });
      } else {
        results.push({ fieldId: q.id, label: q.label, matchedType: null, answer: null, confidence: best?.sim ?? 0 });
      }
    }
  }

  return results;
}
