// v3.131.0 — stage 4 of the resume-hub reorganization: resume-quality
// scoring (resume_diagnose and rewrite's own post-write grading both call
// this). Pure code movement, zero logic changes.
import { callAI } from "./ai.ts";

export const RESUME_SCHEMA = {
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

// A fixed point rubric, not a vibe — this is the FULL rubric for reference;
// see the v3.133.0 comment on scoreResumeContent below for which half of it
// is actually code-computed now. Every deduction is a concrete, checkable
// fact about the resume, never an impression.
export const ATS_RUBRIC = `Score out of 100, starting at 100 and subtracting only for what is actually true of this resume:
- No summary or profile section: -10
- No dedicated skills section: -10
- Fewer than 2 roles listed: -10
- First-person pronouns anywhere ("I", "me", "my", "we"): -5, once regardless of how many appear
- Dates not written consistently as "Month YYYY" throughout: -5
- Each work bullet that neither contains a number/percentage/scale NOR leads with a specific action verb: -5 each, capped at -40 total for this category
- Summary reads generic enough to apply to any candidate (buzzwords, no specifics from this actual background): -10
- A gap of 6 months or more between the end of one role and the start of the next, with nothing in the resume accounting for it: -10, once per gap, capped at -20 total for this category
- A role with no end date (current) written with past-tense verbs, or a role with an end date written with present-tense verbs: -5, once regardless of how many bullets are affected
- The same opening word used to start 3 or more bullets across the resume (e.g. "Managed" leading four different lines): -5, once regardless of how many words repeat this way
Floor the result at 0.`;

const POINTS = {
  no_summary: 10, no_skills_section: 10, too_few_roles: 10, pronouns_present: 5,
  date_format_inconsistent: 5, weak_bullet: 5, weak_bullet_cap: 40,
  generic_summary: 10, unexplained_gap: 10, unexplained_gap_cap: 20, tense_mismatch: 5,
  repeated_opening_word: 5,
};

/** Only the prose a person actually reads — summary and bullets — so a company name can never trip the pronoun check. */
function extractResumeProse(resume: unknown): string {
  const r = (resume || {}) as Record<string, unknown>;
  const basics = (r.basics || {}) as Record<string, unknown>;
  const work = Array.isArray(r.work) ? (r.work as Array<Record<string, unknown>>) : [];
  const parts: string[] = [];
  if (typeof basics.summary === "string") parts.push(basics.summary);
  for (const w of work) {
    const bullets = Array.isArray(w?.bullets) ? (w.bullets as unknown[]) : [];
    for (const b of bullets) if (typeof b === "string") parts.push(b);
  }
  return parts.join("\n");
}

// v3.133.0 — four of the ten rubric lines never needed a model's judgment at
// all (a role count, a summary field being empty, a skills array being
// empty, a pronoun regex) — checkable with zero ambiguity in code, so they
// can never vary between two calls on the same resume the way an LLM's
// judgment can. Pulled out of the graded call entirely.
function deterministicDeductions(resume: unknown): { points: number; issues: string[] } {
  const r = (resume || {}) as Record<string, unknown>;
  const basics = (r.basics || {}) as Record<string, unknown>;
  const work = Array.isArray(r.work) ? (r.work as unknown[]) : [];
  const skills = Array.isArray(r.skills) ? (r.skills as unknown[]) : [];
  let points = 0;
  const issues: string[] = [];
  if (!(typeof basics.summary === "string" && basics.summary.trim())) {
    points += POINTS.no_summary;
    issues.push("There's no summary section at the top of the resume.");
  }
  if (!skills.length) {
    points += POINTS.no_skills_section;
    issues.push("There's no dedicated skills section.");
  }
  if (work.length < 2) {
    points += POINTS.too_few_roles;
    issues.push("The resume lists fewer than 2 roles.");
  }
  if (/\b(I|me|my|we)\b/.test(extractResumeProse(resume))) {
    points += POINTS.pronouns_present;
    issues.push('The resume uses a first-person pronoun ("I", "me", "my", or "we") somewhere — resumes should stay in implied third person.');
  }
  const repeated = mostRepeatedOpeningWord(work);
  if (repeated) {
    points += POINTS.repeated_opening_word;
    issues.push(`"${repeated.word}" opens ${repeated.count} different bullets — try varying the verbs so the resume doesn't read repetitively.`);
  }
  return { points, issues };
}

/** Every bullet is supposed to open with a strong, specific action verb —
 * counting the first word of each one is a reliable, zero-ambiguity proxy
 * for verb variety without needing real part-of-speech tagging. Returns the
 * single most-repeated opening word if it appears 3+ times anywhere in the
 * resume, or null if nothing repeats that much. */
function mostRepeatedOpeningWord(work: unknown[]): { word: string; count: number } | null {
  const counts = new Map<string, string>(); // lowercase -> original-cased first occurrence
  const tally = new Map<string, number>();
  for (const w of work) {
    const bullets = Array.isArray((w as Record<string, unknown>)?.bullets) ? ((w as Record<string, unknown>).bullets as unknown[]) : [];
    for (const b of bullets) {
      if (typeof b !== "string") continue;
      const match = b.trim().match(/^[A-Za-z][A-Za-z'-]*/);
      if (!match) continue;
      const key = match[0].toLowerCase();
      tally.set(key, (tally.get(key) ?? 0) + 1);
      if (!counts.has(key)) counts.set(key, match[0]);
    }
  }
  let best: { word: string; count: number } | null = null;
  for (const [key, count] of tally) {
    if (count >= 3 && (!best || count > best.count)) best = { word: counts.get(key) ?? key, count };
  }
  return best;
}

// v3.133.0 — the schema's skills field has always been a flat string[] on
// purpose (every consumer — tailoring's deterministic gap matcher, the ATS
// rubric, employer candidate indexing — treats each entry as one atomic
// skill, and none of that should change). But that meant the ONLY way a
// downloaded resume could ever show skills was one comma-joined wall of
// text under a single "SKILLS" header, no matter how many there were or how
// unrelated they were to each other — reported directly as "low quality...
// bad format and structure". Rather than ask the generative call to also
// invent category labels (which risks an inconsistent or duplicated
// grouping baked into the one high-temperature call that's also writing
// prose), this is a separate, low-temperature, single-purpose call — same
// "generation and grading never share a call" principle scoreResumeContent
// already established — that only ever relabels the skills it's given.
// Verified in code before being trusted: every input skill must appear in
// exactly one output group, worded exactly as given, nothing renamed,
// merged, dropped, or invented. Any mismatch returns null so the caller
// falls back to the existing flat rendering rather than risk a skill
// silently disappearing from someone's resume.
export async function groupSkills(skills: string[]): Promise<Array<{ category: string; skills: string[] }> | null> {
  const clean = (skills || []).filter((s): s is string => typeof s === "string" && !!s.trim());
  if (clean.length < 4) return null; // too few to meaningfully group
  try {
    const r = await callAI({
      temperature: 0.1,
      system: `Group this specific person's skill list into 2 to 5 short, natural category labels that genuinely fit their field (e.g. "Applied AI & Engineering", "Product & Delivery", "Languages" — pick whatever labels actually fit what's given, do not force a fixed template onto every resume). Every single skill given must appear in exactly one group, worded EXACTLY as given, character for character — never rename, merge, split, drop, or add a skill. Order groups by how central they are to the person's work.`,
      user: JSON.stringify({ skills: clean }),
      toolName: "emit_skill_groups",
      toolSchema: {
        type: "object",
        properties: {
          groups: {
            type: "array",
            items: {
              type: "object",
              properties: { category: { type: "string" }, skills: { type: "array", items: { type: "string" } } },
              required: ["category", "skills"],
            },
          },
        },
        required: ["groups"],
      },
    });
    const groups = (r.structured as { groups?: Array<{ category: string; skills: string[] }> } | undefined)?.groups;
    if (!Array.isArray(groups) || !groups.length) return null;
    const outFlat = groups.flatMap((g) => (Array.isArray(g.skills) ? g.skills : []));
    if (outFlat.length !== clean.length) return null;
    const inSet = new Set(clean.map((s) => s.trim().toLowerCase()));
    const outSet = new Set(outFlat.map((s) => String(s).trim().toLowerCase()));
    if (outSet.size !== inSet.size) return null;
    for (const s of inSet) if (!outSet.has(s)) return null;
    const cleaned = groups
      .map((g) => ({ category: String(g.category || "").trim(), skills: (g.skills || []).map((s) => String(s)) }))
      .filter((g) => g.category && g.skills.length);
    return cleaned.length ? cleaned : null;
  } catch {
    return null; // never let a presentation-only step fail the whole write action
  }
}

// Scoring lives in exactly one place, called by resume_diagnose, rewrite,
// and resume_generate. Before v3.66.0, rewrite generated new resume content
// AND graded its own writing in the same completion — two stochastic jobs
// at once, so a re-run could bounce the score around even at low
// temperature (measured: 90 then 70 on identical input). Splitting scoring
// into its own dedicated call fixed that mostly, not completely — reported
// directly, live-reproduced: two separate scoreResumeContent calls on
// byte-identical resume content (one generated, the other the same content
// run back through Optimize with zero real changes) returned 85 and 90, and
// the 85 didn't even equal 100 minus its own single listed issue (should
// have been 90). The model was still doing two jobs in the same call —
// judging what's wrong AND doing the subtraction — and only the judging
// half is genuinely something an LLM needs to do.
//
// v3.133.0 — the model is no longer asked for a score at all, only for the
// handful of genuinely fuzzy judgment calls (five of the ten rubric lines;
// the other four are deterministicDeductions above). Code sums the fixed
// point value for every triggered item — code-checked or model-flagged —
// and the score is a literal, auditable `100 - sum`, never something the
// model states independently. Two calls on the same resume can still
// disagree about whether a summary "reads generic" (a real judgment call),
// but they can no longer disagree about how many points that's worth, and
// the reported score can no longer silently fail to match its own reasons.
export async function scoreResumeContent(resume: unknown): Promise<{ ats_score: number; verdict: string; issues: string[] }> {
  const det = deterministicDeductions(resume);
  const r = await callAI({
    temperature: 0.1,
    system: `You judge specific, checkable facts about this resume's writing — you do NOT compute a score, code does that from what you report here. Report only what is actually true, nothing invented:
- date_format_inconsistent: true if dates are not written consistently as "Month YYYY" throughout.
- weak_bullet_count: the number of work bullets that neither contain a number/percentage/scale NOR lead with a specific, strong action verb.
- generic_summary: true if the summary reads generic enough to apply to any candidate (buzzwords, no specifics from this actual background).
- unexplained_gap_count: the number of gaps of 6 months or more between the end of one role and the start of the next, with nothing in the resume accounting for it.
- tense_mismatch: true if a role with no end date (current) is written with past-tense verbs, or a role with an end date is written with present-tense verbs.
issues: one plain sentence a person would say out loud for EACH true boolean or nonzero count above, and nothing else — name the actual weak bullet or missing thing, e.g. "The bullet 'Responsible for various marketing tasks' has no number and no strong verb" rather than the rubric's own wording.`,
    user: JSON.stringify({ resume }).slice(0, 30000),
    toolName: "emit_diagnosis",
    toolSchema: {
      type: "object",
      properties: {
        date_format_inconsistent: { type: "boolean" },
        weak_bullet_count: { type: "integer" },
        generic_summary: { type: "boolean" },
        unexplained_gap_count: { type: "integer" },
        tense_mismatch: { type: "boolean" },
        issues: { type: "array", items: { type: "string" } },
      },
      required: ["date_format_inconsistent", "weak_bullet_count", "generic_summary", "unexplained_gap_count", "tense_mismatch", "issues"],
    },
  });
  const s = r.structured as {
    date_format_inconsistent?: boolean; weak_bullet_count?: number; generic_summary?: boolean;
    unexplained_gap_count?: number; tense_mismatch?: boolean; issues?: string[];
  } | undefined;

  let modelPoints = 0;
  if (s?.date_format_inconsistent) modelPoints += POINTS.date_format_inconsistent;
  modelPoints += Math.min(Math.max(0, s?.weak_bullet_count ?? 0) * POINTS.weak_bullet, POINTS.weak_bullet_cap);
  if (s?.generic_summary) modelPoints += POINTS.generic_summary;
  modelPoints += Math.min(Math.max(0, s?.unexplained_gap_count ?? 0) * POINTS.unexplained_gap, POINTS.unexplained_gap_cap);
  if (s?.tense_mismatch) modelPoints += POINTS.tense_mismatch;

  const ats_score = Math.max(0, 100 - (det.points + modelPoints));
  const verdict = ats_score >= 85 ? "Strong" : ats_score >= 70 ? "Good" : ats_score >= 50 ? "Fair" : "Poor";
  return { ats_score, verdict, issues: [...det.issues, ...(s?.issues ?? [])] };
}

