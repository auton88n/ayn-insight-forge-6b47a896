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
export const RESUME_QUALITY_VERSION = "quality-2026-09-28";
export const ATS_RUBRIC = `Writing-quality assessment, not an employer ATS score or hiring probability. Score out of 100, starting at 100 and subtracting only for what is actually true of this resume:
- No dedicated skills section: -10
- First-person pronouns anywhere ("I", "me", "my", "we"): -5, once regardless of how many appear
- Inconsistent date notation at the same known precision: -5. Year-only dates are valid; never invent missing months.
- Each work bullet that neither contains a number/percentage/scale NOR leads with a specific action verb: -5 each, capped at -40 total for this category
- Summary reads generic enough to apply to any candidate (buzzwords, no specifics from this actual background): -10
- Past employment described as ongoing: -5 once. Completed achievements in a current role correctly use past tense.
- The same opening word used to start 3 or more bullets across the resume (e.g. "Managed" leading four different lines): -5, once regardless of how many words repeat this way
Do not deduct for an absent optional summary, fewer than two roles, career breaks, or a lack of numerical metrics when a contribution is clear. Floor the result at 0.`;

const POINTS = {
  no_skills_section: 10, pronouns_present: 5,
  date_format_inconsistent: 5, weak_bullet: 5, weak_bullet_cap: 40,
  generic_summary: 10, tense_mismatch: 5,
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
// v3.312.0 — real, reported bug: asking the model to judge "is this date in
// the future" and "is there a real gap in this timeline" was unreliable
// even once given today's real date explicitly — verified live, the exact
// same resume content got a correct answer on some calls and a wrong one
// ("a 2025 start date is in the future," when today is genuinely 2026) on
// others, at temperature 0.1, five runs, roughly a 40% wrong rate. Dates
// are checkable arithmetic, not a judgment call — moved to pure code,
// matching every other objectively-checkable rubric line already handled
// this way. A parse failure on any one entry's dates is skipped, never
// guessed at, so an unusual date format never produces a false accusation.
const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A loosely-formatted resume date string -> {year, month}, month 1-12 or
 * null when only a bare year is given. Returns null (not a guess) for
 * "Present"/empty/unparseable text — the caller decides what that means
 * for a start vs. an end date. */
function parseResumeDate(raw: unknown): { year: number; month: number | null } | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || /^(present|current|now|ongoing|to date)$/i.test(t)) return null;
  let m = t.match(/^(\d{1,2})[/.](\d{4})$/); // "MM/YYYY" or "MM.YYYY"
  if (m) return { year: +m[2], month: Math.min(12, Math.max(1, +m[1])) };
  m = t.match(/^([A-Za-z]+)\.?\s+(\d{4})$/); // "Month YYYY" / "Mon YYYY"
  if (m) {
    const idx = MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase());
    if (idx >= 0) return { year: +m[2], month: idx + 1 };
  }
  m = t.match(/^(\d{4})$/); // bare "YYYY"
  if (m) return { year: +m[1], month: null };
  return null;
}

/** year/month -> a single comparable month-index. Unknown month is resolved
 * charitably in whichever direction can't produce a false accusation:
 * January for a start date (a bare "2026" only ever counts as "already
 * started" once 2026 itself has begun, never flagged as future just because
 * a specific month wasn't given), December for an end date (a bare "2022"
 * covers the whole year, so it can't manufacture a gap against a role that
 * genuinely started somewhere later that same year). */
function monthIndex(d: { year: number; month: number | null } | null, atStart: boolean): number | null {
  if (!d) return null;
  const month = d.month ?? (atStart ? 1 : 12);
  return d.year * 12 + (month - 1);
}

export function deterministicDeductions(resume: unknown): { points: number; issues: string[] } {
  const r = (resume || {}) as Record<string, unknown>;
  const work = Array.isArray(r.work) ? (r.work as unknown[]) : [];
  const skills = Array.isArray(r.skills) ? (r.skills as unknown[]) : [];
  let points = 0;
  const issues: string[] = [];
  if (!skills.length) {
    points += POINTS.no_skills_section;
    issues.push("There's no dedicated skills section.");
  }
  if (/\b(I|me|my|we)\b/.test(extractResumeProse(resume))) {
    points += POINTS.pronouns_present;
    issues.push('The resume uses a first-person pronoun ("I", "me", "my", or "we"); implied first person is usually more concise.');
  }
  const repeated = mostRepeatedOpeningWord(work);
  if (repeated) {
    points += POINTS.repeated_opening_word;
    issues.push(`"${repeated.word}" opens ${repeated.count} different bullets — try varying the verbs so the resume doesn't read repetitively.`);
  }

  const now = new Date();
  const todayIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();

  // A start date genuinely after today, unambiguously (even the charitable
  // January-of-that-year reading still lands after today) — a real,
  // checkable contradiction, never a judgment call.
  for (const w of work) {
    const wr = (w || {}) as Record<string, unknown>;
    const startIdx = monthIndex(parseResumeDate(wr.start), true);
    if (startIdx !== null && startIdx > todayIdx) {
      points += POINTS.date_format_inconsistent; // reuses the existing "date problem" point value, not a new category
      const company = typeof wr.company === "string" && wr.company ? ` at ${wr.company}` : "";
      issues.push(`The role${company} has a start date that is genuinely after today — check it's not a typo.`);
    }
  }

  // Employment gaps are not writing defects. The work array alone cannot
  // establish whether a break is explained by education, caregiving or prose.

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
  // v3.312.0 — a real, reported bug: asking the model to judge "is this date
  // in the future" and "is there a real gap in this timeline" was
  // unreliable even once given today's real date explicitly in the prompt —
  // verified live, the exact same resume content got a correct read on some
  // calls and a wrong one on others (a 2025 start date called "in the
  // future" when today is genuinely 2026), at temperature 0.1, roughly 40%
  // wrong across five runs. Both are now pure, checkable arithmetic in
  // deterministicDeductions above (parseResumeDate/monthIndex), never left
  // to the model's own judgment — the two fields below are gone from what
  // the model is asked for entirely, not just reworded a second time.
  const r = await callAI({
    temperature: 0.1,
    system: `You judge specific, checkable facts about this resume's writing — you do NOT compute a score, code does that from what you report here. Report only what is actually true, nothing invented.
- date_format_inconsistent: true only for inconsistent notation at the same known precision. Year-only dates are valid, including alongside month/year dates when months are unknown. Never request invented months or judge whether a date is in the future.
- weak_bullet_count: the number of work bullets that neither contain a number/percentage/scale NOR lead with a specific, strong action verb.
- generic_summary: true only if an existing nonempty summary makes generic claims without specifics. An absent summary is valid and must return false.
- tense_mismatch: true only if completed employment is described as ongoing. Current roles can correctly mix present tense for ongoing duties and past tense for completed achievements.
Do not flag career breaks, the number of roles, ordinary punctuation, or alleged AI authorship. Do not demand metrics when a bullet already describes a specific contribution.
issues: one plain sentence a person would say out loud for EACH true boolean or nonzero count above, and nothing else — name the actual weak bullet or missing thing, e.g. "The bullet 'Responsible for various marketing tasks' has no number and no strong verb" rather than the rubric's own wording.`,
    user: JSON.stringify({ resume }).slice(0, 30000),
    toolName: "emit_diagnosis",
    toolSchema: {
      type: "object",
      properties: {
        date_format_inconsistent: { type: "boolean" },
        weak_bullet_count: { type: "integer" },
        generic_summary: { type: "boolean" },
        tense_mismatch: { type: "boolean" },
        issues: { type: "array", items: { type: "string" } },
      },
      required: ["date_format_inconsistent", "weak_bullet_count", "generic_summary", "tense_mismatch", "issues"],
    },
  });
  const s = r.structured as {
    date_format_inconsistent?: boolean; weak_bullet_count?: number; generic_summary?: boolean;
    tense_mismatch?: boolean; issues?: string[];
  } | undefined;

  let modelPoints = 0;
  if (s?.date_format_inconsistent) modelPoints += POINTS.date_format_inconsistent;
  modelPoints += Math.min(Math.max(0, s?.weak_bullet_count ?? 0) * POINTS.weak_bullet, POINTS.weak_bullet_cap);
  if (s?.generic_summary) modelPoints += POINTS.generic_summary;
  if (s?.tense_mismatch) modelPoints += POINTS.tense_mismatch;

  const ats_score = Math.max(0, 100 - (det.points + modelPoints));
  const verdict = ats_score >= 85 ? "Strong" : ats_score >= 70 ? "Good" : ats_score >= 50 ? "Fair" : "Poor";
  return { ats_score, verdict, issues: [...det.issues, ...(s?.issues ?? [])] };
}
