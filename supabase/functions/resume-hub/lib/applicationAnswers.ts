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
import { callAI, DEFAULT_MODEL } from "./ai.ts";

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
  // v3.305.0 -- label added as a second, optional param: work_authorized_
  // plain is the first resolver that needs the real question text itself
  // (to tell which country it's asking about), not just the stored
  // profile facts every earlier resolver already had all it needed from.
  resolve: (c: CanonicalProfile, label?: string) => string | null;
};

function yesNo(v: boolean | undefined | null): string | null {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return null;
}

const KNOWN_QUESTIONS: QuestionType[] = [
  {
    // "Are you authorized... WITHOUT sponsorship" -- Yes means sponsorship
    // is NOT needed. Kept strictly separate from requires_sponsorship
    // below: the two are opposite-polarity phrasings of the identical
    // underlying fact, and a shared regex once matched both to this single
    // resolver, silently answering the inverted-polarity question backwards
    // (confirmed live: "Will you require sponsorship?" came back "Yes" for
    // an account that does not need one). Never merge these two again.
    slug: "work_authorized_no_sponsorship",
    keywords: /authoriz\w* to work.*(united states|u\.?s\.?|canada).*without/i,
    examples: [
      "Are you legally authorized to work in the United States now and in the future without employer sponsorship?",
    ],
    resolve: (c) => {
      const wa = c.work_auth;
      if (wa.needs_sponsorship_now == null && wa.needs_sponsorship_future == null) return null;
      const needsAny = !!wa.needs_sponsorship_now || !!wa.needs_sponsorship_future;
      return needsAny ? "No" : "Yes";
    },
  },
  {
    // v3.305.0 -- a real, live gap found while directly testing the
    // extension's own real end-to-end fill flow against a real Trakstar
    // application: the single most common real screening question on a
    // US/Canada job application, "Are you authorized to work in
    // Canada?" (no sponsorship clause at all, the bare, plain form),
    // matched NEITHER of the two sponsorship-specific resolvers above
    // (both correctly require the word "without"/"sponsor" to exist at
    // all) -- confirmed live, a real seeded profile with
    // work_authorized_ca: true still came back answer: null, because
    // there was never a resolver for the plain phrasing to begin with,
    // not because the embedding fallback failed. Pass 2's own closest
    // match was, correctly, "...without employer sponsorship" at 0.588
    // similarity -- below the 0.72 threshold, and rightly so: a country-
    // specific, sponsorship-qualified question is not semantically
    // interchangeable with a bare authorization question, so declining
    // rather than guessing was the correct behavior of the EXISTING
    // system. The real fix is a dedicated resolver, not a loosened
    // threshold, which would have risked false-answering unrelated
    // questions elsewhere.
    // Deliberately excludes "sponsor" from its own keyword match (kept
    // even though array order already puts the two sponsorship-specific
    // resolvers first) so a label mentioning both ideas together always
    // defers to the more specific fact those resolvers actually answer,
    // not this coarser one.
    slug: "work_authorized_plain",
    keywords: /authoriz\w* to work.*(united states|u\.?s\.?a?\.?|canada)(?!.*sponsor)/i,
    examples: ["Are you authorized to work in Canada?", "Are you legally authorized to work in the United States?"],
    resolve: (c, label) => {
      const wa = c.work_auth;
      const l = (label || "").toLowerCase();
      // Belt and suspenders on top of the keyword regex's own negative
      // lookahead: that lookahead only checks text AFTER the country
      // match, so a phrasing with "sponsor" appearing BEFORE the
      // country mention ("If you require sponsorship, are you still
      // authorized to work in Canada...") could slip past it. Checked
      // again here, unconditionally, against the whole label.
      if (/sponsor/.test(l)) return null;
      const mentionsCanada = /canada/.test(l);
      const mentionsUs = /united states|\bu\.?s\.?a?\.?\b/.test(l);
      // Both mentioned, or neither clearly mentioned: only answer if
      // exactly one of the two fields is actually on file -- a
      // single-country candidate profile can only ever have meant that
      // one country, a real, safe inference, not a guess about which
      // country the question meant.
      if (mentionsCanada === mentionsUs) {
        if (wa.work_authorized_ca != null && wa.work_authorized_us == null) return yesNo(wa.work_authorized_ca);
        if (wa.work_authorized_us != null && wa.work_authorized_ca == null) return yesNo(wa.work_authorized_us);
        return null;
      }
      return yesNo(mentionsCanada ? wa.work_authorized_ca : wa.work_authorized_us);
    },
  },
  {
    // Opposite polarity from the one above on purpose -- "Will you...
    // REQUIRE sponsorship" -- Yes means sponsorship IS needed.
    slug: "requires_sponsorship",
    keywords: /now or in the future.*(require|need).*sponsorship|require.*sponsorship.*(visa|work)/i,
    examples: [
      "Will you now or in the future require sponsorship for employment visa status?",
      "Do you now, or will you in the future, require sponsorship for a work visa?",
    ],
    resolve: (c) => {
      const wa = c.work_auth;
      if (wa.needs_sponsorship_now == null && wa.needs_sponsorship_future == null) return null;
      const needsAny = !!wa.needs_sponsorship_now || !!wa.needs_sponsorship_future;
      return needsAny ? "Yes" : "No";
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
  // v3.281.0 -- reported directly, a real screenshot: "Please list your
  // highest level of education achieved?" showed as "not on file" even
  // though the person's real education IS on file. There was never a
  // KNOWN_QUESTIONS entry for this at all -- canonicalProfile.ts already
  // computes derived.education_level (one of "High School",
  // "Associate's", "Bachelor's", "Master's", "PhD", picked as the
  // highest completed) for exactly this purpose, it was just never read
  // here.
  {
    slug: "highest_education",
    keywords: /highest level of education|education level|highest degree/i,
    examples: ["What is the highest level of education you have completed?"],
    resolve: (c) => c.derived.education_level || null,
  },
  // v3.284.0 -- asked directly, "add all questions to the profile" --
  // six more resolvers matching the six new Profile screening questions,
  // covering the rest of the common ATS screening set found live this
  // session. Every one reads a stored value verbatim, same as every
  // resolver above.
  {
    slug: "legal_drinking_age",
    keywords: /legal drinking age|of drinking age/i,
    examples: ["Are you of legal drinking age where required for the role?"],
    resolve: (c) => c.screening_answers["legal_drinking_age"] || null,
  },
  {
    slug: "background_check",
    keywords: /background check/i,
    examples: ["Are you willing to complete a background check?"],
    resolve: (c) => c.screening_answers["background_check"] || null,
  },
  {
    slug: "drug_test",
    keywords: /drug (test|screen)/i,
    examples: ["Are you willing to complete a drug test?"],
    resolve: (c) => c.screening_answers["drug_test"] || null,
  },
  {
    slug: "notice_period",
    keywords: /notice period|how much notice/i,
    examples: ["What is your notice period at your current job?"],
    resolve: (c) => c.screening_answers["notice_period"] || null,
  },
  {
    slug: "preferred_name",
    keywords: /preferred name|nickname|name you go by/i,
    examples: ["What name do you go by?"],
    resolve: (c) => c.screening_answers["preferred_name"] || null,
  },
  {
    slug: "hr_contact_consent",
    keywords: /contact you (about|regarding) other|other (open )?(positions|roles)/i,
    examples: ["May Human Resources contact you regarding other positions?"],
    resolve: (c) => c.screening_answers["hr_contact_consent"] || null,
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
      const answer = kw.resolve(canonical, q.label);
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
        results.push({ fieldId: q.id, label: q.label, matchedType: qt.slug, answer: qt.resolve(canonical, q.label), confidence: best.sim });
      } else {
        results.push({ fieldId: q.id, label: q.label, matchedType: null, answer: null, confidence: best?.sim ?? 0 });
      }
    }
  }

  // v3.284.0 -- asked directly: "make the AI intelligent to give the
  // known question the most close answer that profile will suggest."
  // Passes 1-2 only ever recognize one of KNOWN_QUESTIONS' own fixed
  // phrasings (a literal keyword, or close to one of a small handful of
  // example sentences) -- a real question worded very differently from
  // both, but that a person has genuinely already answered once (their
  // own screening_answers), still came back null. This pass closes that
  // gap the way this app closes every gap like it: the model is never
  // allowed to WRITE an answer, only to SELECT one, verbatim, from a
  // bank of the person's own real, already-typed answers -- and code
  // verifies the claim against that same real bank before ever trusting
  // it, discarding anything that isn't an exact match. Skipped entirely
  // when there's nothing real to match against, so it costs nothing for
  // an account that hasn't answered anything yet.
  const stillUnresolved = results.filter((r) => r.answer === null);
  const answeredEntries = Object.entries(canonical.screening_answers || {}).filter(([, v]) => v && v.trim());
  if (stillUnresolved.length > 0 && answeredEntries.length > 0) {
    const slugLabel = (slug: string) => KNOWN_QUESTIONS.find((k) => k.slug === slug)?.examples[0] || slug;
    const bank = answeredEntries.map(([slug, value]) => ({ question: slugLabel(slug), answer: value }));
    try {
      const { structured } = await callAI({
        model: DEFAULT_MODEL,
        system:
          "You match a real job application question to one of a candidate's own, already-given real answers.\n" +
          "Rules:\n" +
          "- Only ever select the exact \"answer\" text of one bank entry, verbatim, character for character. Never write a new answer, never combine two, never paraphrase.\n" +
          "- Only select an entry if it genuinely answers the same real-world question, even if worded completely differently.\n" +
          "- If nothing in the bank genuinely answers a question, that result must be null. A wrong guess is worse than leaving it blank.\n" +
          "Return exactly one result per question, in the same order given.",
        user: JSON.stringify({ bank, questions: stillUnresolved.map((r) => r.label) }),
        toolName: "match_answers",
        toolSchema: {
          type: "object",
          properties: {
            results: {
              type: "array",
              items: { type: "object", properties: { answer: { type: ["string", "null"] } }, required: ["answer"] },
            },
          },
          required: ["results"],
        },
        temperature: 0,
      });
      const out = (structured as { results?: Array<{ answer: string | null }> })?.results || [];
      const realValues = new Set(answeredEntries.map(([, v]) => v));
      stillUnresolved.forEach((r, i) => {
        const claimed = out[i]?.answer;
        if (claimed && realValues.has(claimed)) {
          r.answer = claimed;
          r.matchedType = "ai_closest_match";
          r.confidence = 0.5;
        }
      });
    } catch {
      // A failed AI pass must never break the deterministic result passes
      // 1-2 already computed -- results simply stay exactly as they were.
    }
  }

  return results;
}
