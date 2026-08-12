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

// A fixed point rubric, not a vibe. Without this, two runs on the exact same
// resume produced meaningfully different scores (reported directly: 75 then
// 65 on a re-run with no real change in quality) because the model was
// asked to "score 0-100" with no arithmetic to anchor it to. Every deduction
// below is a concrete, checkable fact about the resume, so the score is
// something the model computes the same way each time rather than feels
// out fresh. Shared by resume_diagnose and rewrite so a diagnosis and an
// optimize's own reported score are never answering two different
// questions.
export const ATS_RUBRIC = `Score out of 100, starting at 100 and subtracting only for what is actually true of this resume:
- No summary or profile section: -10
- Summary's first sentence does not name the candidate's own current or most recent job title: -5
- No dedicated skills section: -10
- Dates not written consistently as "Month YYYY" throughout: -5
- Each work bullet that neither contains a number/percentage/scale NOR leads with a specific action verb: -5 each, capped at -40 total for this category
- Summary reads generic enough to apply to any candidate (buzzwords, no specifics from this actual background): -10
- Fewer than 2 roles listed, or bullets so thin they show no real scope: -10
- A gap of 6 months or more between the end of one role and the start of the next, with nothing in the resume accounting for it: -10, once per gap, capped at -20 total for this category
- First-person pronouns anywhere ("I", "me", "my", "we"): -5, once regardless of how many appear
- A role with no end date (current) written with past-tense verbs, or a role with an end date written with present-tense verbs: -5, once regardless of how many bullets are affected
Floor the result at 0. Do not deduct for anything not listed here. State the score as the literal result of this subtraction, not an impression.`;

// Scoring lives in exactly one place, called by both resume_diagnose and
// rewrite. Before this, rewrite generated new resume content AND graded its
// own writing in the same completion — two stochastic jobs at once, so a
// re-run could bounce the score around even at low temperature (measured:
// 90 then 70 on identical input). A dedicated low-temperature call that only
// ever reads a fixed, already-written resume and applies the rubric is the
// same shape of call resume_diagnose already makes, which measured far more
// consistent in isolation. This also guarantees a diagnosis and an
// optimize's reported score always mean the exact same thing, since they
// are now, literally, the same function call.
export async function scoreResumeContent(resume: unknown): Promise<{ ats_score: number; verdict: string; issues: string[] }> {
  const r = await callAI({
    temperature: 0.1,
    system: `You assess resume writing quality, not visual layout. ${ATS_RUBRIC}
verdict is derived directly from ats_score: "Strong" 85+, "Good" 70+, "Fair" 50+, else "Poor". issues: one line per point actually deducted above, but write each as a plain sentence a person would say out loud, not the rubric's own wording — name the actual weak bullet or missing thing, e.g. "The bullet 'Responsible for various marketing tasks' has no number and no strong verb" rather than quoting the rubric category.`,
    user: JSON.stringify({ resume }).slice(0, 30000),
    toolName: "emit_diagnosis",
    toolSchema: {
      type: "object",
      properties: {
        ats_score: { type: "integer" },
        verdict: { type: "string", enum: ["Poor", "Fair", "Good", "Strong"] },
        issues: { type: "array", items: { type: "string" } },
      },
      required: ["ats_score", "verdict", "issues"],
    },
  });
  const s = r.structured as { ats_score?: number; verdict?: string; issues?: string[] } | undefined;
  return { ats_score: s?.ats_score ?? 0, verdict: s?.verdict ?? "Poor", issues: s?.issues ?? [] };
}

