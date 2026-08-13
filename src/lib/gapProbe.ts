/**
 * gapProbe.ts — v3.133.0
 *
 * A resume can honestly score below 100 because AYN refuses to invent a
 * number, a metric, or an explanation the person never gave it. This turns
 * a specific flagged weak point into a targeted, honest follow-up question
 * — never an open-ended chat — so the person can close the gap themselves
 * with a real fact instead of guessing what "add more detail" means.
 *
 * Only three of the rubric's issue kinds are fixable this way (a real
 * follow-up question makes sense): a generic summary, a weak bullet
 * (no number, no strong verb), and an unexplained gap. Everything else
 * (too few roles, a stray pronoun, inconsistent dates, repeated verbs) is a
 * wording/structure fix, not a missing-fact fix — those are better solved
 * by clicking Optimize, so classifyProbableIssue deliberately returns null
 * for them rather than offering a question that can't actually help.
 */
import type { ResumeContent } from "./resumeHub";

export type ProbeTarget =
  | { kind: "gap" }
  | { kind: "weak_bullet"; workIndex: number; bulletIndex: number }
  | { kind: "generic_summary" };

export interface ProbeMatch {
  question: string;
  target: ProbeTarget;
}

const QUOTE_RE = /["'‘’“”]([^"'‘’“”]{6,})["'‘’“”]/;

export function classifyProbableIssue(issue: string, resume: ResumeContent): ProbeMatch | null {
  const lower = issue.toLowerCase();

  if (lower.includes("gap")) {
    return {
      question: "What were you doing during this time — freelance work, education, caregiving, a job search, something else? Tell me what's actually true; if there's nothing worth adding, that's fine too.",
      target: { kind: "gap" },
    };
  }

  if (lower.includes("generic") && lower.includes("summary")) {
    return {
      question: "What's one specific, real thing about your career — an employer name, a number, or a skill you're actually known for?",
      target: { kind: "generic_summary" },
    };
  }

  if (lower.includes("no number") || lower.includes("strong verb")) {
    const quoted = issue.match(QUOTE_RE);
    if (quoted) {
      const text = quoted[1].trim();
      const work = resume.work ?? [];
      for (let w = 0; w < work.length; w++) {
        const bullets = work[w].bullets ?? [];
        for (let b = 0; b < bullets.length; b++) {
          const bulletText = bullets[b].trim();
          if (bulletText === text || bulletText.includes(text) || text.includes(bulletText)) {
            return {
              question: "Did this have a measurable result — time saved, money saved or earned, a percentage, a team or volume size? What actually happened?",
              target: { kind: "weak_bullet", workIndex: w, bulletIndex: b },
            };
          }
        }
      }
    }
  }

  return null;
}
