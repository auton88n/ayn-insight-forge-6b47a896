// v3.324.0 — extracted from index.ts (part of the ~58-action dispatcher
// split into per-domain files). Assessment-specific shared logic used by
// both the seeker lane (assessment_start/assessment_answer/
// assessment_submit) and the employer lane (employer_assessment_generate/
// employer_assessment_send/employer_assessment_list).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { loadCanonical } from "./canonicalProfile.ts";
import { buildCandidateProfile } from "./candidateIndex.ts";
import { callAI, DEFAULT_MODEL } from "./ai.ts";
import { parseJsonLoose } from "./utils.ts";
import { notifyOrgMembers } from "./notifications.ts";
import { cleanEmployerText, VOICE_RULES } from "./employerText.ts";
import { escapeHtml, heading, para, ctaButton } from "../../_shared/emailTemplate.ts";

// ═══════════════════════════════════════════════════════════
// SECURITY BOUNDARY, documented once here since both publicQuestion and
// finaliseAssessment enforce opposite halves of the same guarantee:
//   - A candidate never sees a rubric, a score, a verdict, or a
//     per-question observation. The rubric is never written into any
//     candidate-readable column.
//   - Rubrics live in public.assessment_rubrics, which has ALL
//     privileges revoked from anon and authenticated. Same for
//     public.assessment_results. Both are service_role only, and RLS
//     is on with zero policies, so even a leaked grant denies reads.
//   - No candidate-lane action here ever returns a rubric, a score,
//     a verdict, or a per-question observation.
// ═══════════════════════════════════════════════════════════
export type PubQuestion = { id: string; type: "mc" | "short"; text: string; options?: string[] };

/** Strip a question down to what the candidate is allowed to see. */
export function publicQuestion(q: Record<string, unknown>): PubQuestion {
  const type = q.type === "short" ? "short" : "mc";
  return {
    id: String(q.id || ""),
    type,
    text: String(q.text || ""),
    ...(type === "mc"
      ? { options: (Array.isArray(q.options) ? q.options : []).map(String).slice(0, 5) }
      : {}),
  };
}

export function assessmentDeadline(a: Record<string, unknown>): number | null {
  if (!a.started_at) return null;
  return new Date(String(a.started_at)).getTime() + Number(a.time_limit_seconds || 1800) * 1000;
}

export async function finaliseAssessment(admin: SupabaseClient, assessmentId: string): Promise<void> {
  const { data: a } = await admin.from("assessments")
    .select("id, org_id, candidate_user_id, job_title, questions, answers, started_at, submitted_at, time_limit_seconds")
    .eq("id", assessmentId).maybeSingle();
  if (!a || a.submitted_at) return;
  const submittedAt = new Date().toISOString();
  await admin.from("assessments")
    .update({ status: "submitted", submitted_at: submittedAt }).eq("id", assessmentId);

  const { data: rubricRows } = await admin.from("assessment_rubrics")
    .select("question_id, rubric").eq("assessment_id", assessmentId);
  const rubricById = new Map((rubricRows || []).map(r => [r.question_id, r.rubric]));
  const questions = (a.questions as Array<Record<string, unknown>>) || [];
  const answers = (a.answers as Record<string, { answer?: string; ms?: number }>) || {};

  const canon = await loadCanonical(admin, a.candidate_user_id);
  const claims = canon ? buildCandidateProfile(canon) : null;

  const items = questions.map(q => {
    const id = String(q.id);
    const ans = answers[id] || {};
    return {
      id,
      type: q.type,
      question: q.text,
      options: q.options ?? null,
      private_rubric: rubricById.get(id) || "",
      candidate_answer: String(ans.answer ?? ""),
      seconds_spent: Math.round(Number(ans.ms || 0) / 1000),
      // v3.154.0 — set only on a live follow-up (see assessment_answer),
      // pointing back at the id of the question it was generated from.
      is_follow_up_to: q.parent_id ? String(q.parent_id) : null,
    };
  });

  const sys = `You grade a verification assessment for an employer. The candidate never sees any of this.

WHAT YOU ARE JUDGING: whether the answers read like someone who actually did the work they claim, or like someone reciting general knowledge.
Use each question's private rubric. Reward specific constraints, real tradeoffs, named failure modes, and honest uncertainty about details. Penalise generic best practice prose, restated question text, and confident claims with no texture.

Some questions carry is_follow_up_to, naming the id of the question they were generated from live, right after the candidate answered it -- these could not have been prepared in advance. Grade a follow-up two ways: does the specific detail it asked for sound genuine on its own, AND is it consistent with what they said in the question it follows up on. A real answer builds on itself naturally. A fabricated one often drifts, adds a detail that does not quite fit what was claimed a moment earlier, or turns vague exactly where it should now be most specific.

Also note timing where it is informative: a long, flawless short answer written in under twenty seconds is worth mentioning as an observation. State it as an observation, never as an accusation.

Separately from all of the above, judge writing_signal: does the ANSWER PROSE ITSELF read like it was generated by an AI rather than typed by a person under time pressure -- comprehensively structured, textbook-even phrasing, no false start, no rough edge, every clause perfectly balanced. This is a real but uncertain signal on its own, never proof by itself -- report "human", "ai_assisted", or "unclear", with one honest sentence, and never let it alone drive the verdict.

Scores: overall_score 0 to 100. verification_verdict is exactly one of "consistent", "partly consistent", "inconsistent", judged against what the candidate claims on their profile.
employer_summary: 2 to 4 sentences, plain prose, what the employer should take away.
seeker_growth_note: ONE sentence the candidate may later be shown. It must be about how their RESUME presents their work, never about the assessment, never about what they got wrong, never a score. Example shape: "Your resume undersells your work on data pipelines."
${VOICE_RULES}`;

  const schema = {
    type: "object",
    properties: {
      overall_score: { type: "number" },
      verification_verdict: { type: "string", enum: ["consistent", "partly consistent", "inconsistent"] },
      per_question: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            score: { type: "number" },
            observed: { type: "string" },
          },
          required: ["id", "score", "observed"],
        },
      },
      strengths: { type: "array", items: { type: "string" } },
      concerns: { type: "array", items: { type: "string" } },
      employer_summary: { type: "string" },
      seeker_growth_note: { type: "string" },
      writing_signal: { type: "string", enum: ["human", "ai_assisted", "unclear"] },
      writing_signal_note: { type: "string" },
    },
    required: ["overall_score", "verification_verdict", "per_question", "employer_summary"],
  };

  let out: Record<string, unknown> = {};
  try {
    // v3.129.0 — reproduced live: this call measured 143.9s on
    // QUALITY_MODEL, right at the edge of this app's own documented
    // 150s idle timeout that has already caused real failures on three
    // other call sites (v3.96.0/v3.97.0, tailor/rewrite/smart_tailor,
    // all fixed the same way). Assessment grading was deliberately left
    // on QUALITY_MODEL in that pass ("not flagged as slow, not tested")
    // — now it's both. Swapped to the flash tier already proven safe
    // for the other three.
    const r = await callAI({
      model: DEFAULT_MODEL,
      system: sys,
      user: `WHAT THE CANDIDATE CLAIMS ON THEIR PROFILE:
${JSON.stringify(claims, null, 1)}

THE ASSESSMENT, WITH PRIVATE RUBRICS AND THEIR ANSWERS:
${JSON.stringify(items, null, 1)}

Grade it now.`,
      toolName: "grade_assessment",
      toolSchema: schema,
    });
    out = (r.structured as Record<string, unknown>) || parseJsonLoose<Record<string, unknown>>(r.text) || {};
  } catch (e) {
    console.error("assessment grading failed", e);
  }

  // v3.129.0 — a thrown/timed-out/malformed grading call used to fall
  // straight through into an unconditional upsert, writing a real-looking
  // overall_score: 0, verification_verdict: "partly consistent" row —
  // indistinguishable from a genuinely poor result, with a real hiring
  // decision attached and no flag anywhere that grading never actually
  // ran. Only write a result when the model actually returned one;
  // employer_assessment_list already renders `result: null` as "no
  // result yet" (the same state a normal in-flight grading call is in
  // for the few seconds before this code runs), so leaving it unwritten
  // on failure is an honest, already-handled state, not a new one.
  const gradingSucceeded = typeof out.overall_score !== "undefined" && Array.isArray(out.per_question);
  if (!gradingSucceeded) {
    console.error("assessment grading produced no usable output, leaving ungraded", { assessmentId });
  } else {
    const verdicts = ["consistent", "partly consistent", "inconsistent"];
    const perQ = out.per_question as Array<Record<string, unknown>>;
    const byQ = new Map(perQ.map(p => [String(p.id), p]));
    const finalScore = Math.max(0, Math.min(100, Math.round(Number(out.overall_score) || 0)));
    const finalVerdict = verdicts.includes(String(out.verification_verdict))
      ? String(out.verification_verdict) : "partly consistent";
    const concerns = (Array.isArray(out.concerns) ? out.concerns : []).map(s => cleanEmployerText(String(s))).slice(0, 5);

    // v3.153.0 — reproduced live, side by side in the same test pass: a
    // genuinely well-answered assessment (85/100, consistent) came back
    // with a real, complete 2-4 sentence employer_summary; the identical
    // call shape on a poorly-answered one (20/100, inconsistent) came
    // back with employer_summary literally "This candidate" and nothing
    // else, while that same response's per_question/concerns were fully
    // intact. Rather than show a real employer a sentence that stops
    // mid-thought, fall back to a plain line built only from numbers
    // this same call already produced and this function already trusts
    // enough to store -- same "never show a broken half-result" rule
    // the ungraded-call branch just above already follows.
    const rawSummary = cleanEmployerText(String(out.employer_summary || "")).slice(0, 1200);
    const summaryLooksComplete = rawSummary.length >= 30 && /[.!?]$/.test(rawSummary);
    const verdictPhrase = finalVerdict === "consistent" ? "consistent with"
      : finalVerdict === "inconsistent" ? "inconsistent with"
      : "partly consistent with";
    const employerSummary = summaryLooksComplete
      ? rawSummary
      : `This candidate scored ${finalScore} out of 100. Their answers were ${verdictPhrase} what they claim on their profile.${concerns.length ? " See the concerns below for specifics." : ""}`;

    await admin.from("assessment_results").upsert({
      assessment_id: assessmentId,
      overall_score: finalScore,
      verification_verdict: finalVerdict,
      per_question: items.map(it => {
        const p = byQ.get(it.id);
        return {
          id: it.id,
          question: it.question,
          answer: it.candidate_answer,
          seconds_spent: it.seconds_spent,
          score: Math.max(0, Math.min(100, Math.round(Number(p?.score) || 0))),
          observed: cleanEmployerText(String(p?.observed || "No observation available.")),
          is_follow_up: !!it.is_follow_up_to,
        };
      }),
      strengths: (Array.isArray(out.strengths) ? out.strengths : []).map(s => cleanEmployerText(String(s))).slice(0, 5),
      concerns,
      employer_summary: employerSummary,
      seeker_growth_note: cleanEmployerText(String(out.seeker_growth_note || "")).slice(0, 300),
      writing_signal: ["human", "ai_assisted", "unclear"].includes(String(out.writing_signal))
        ? String(out.writing_signal) : "unclear",
      writing_signal_note: cleanEmployerText(String(out.writing_signal_note || "")).slice(0, 400),
    }, { onConflict: "assessment_id" });
  }

  // No score, no candidate identity in the email body — same rule the
  // product's own UI already follows (v3.13.0), just a heads up to go look.
  if (a.org_id) {
    const roleTitle = a.job_title ? escapeHtml(String(a.job_title)) : "your role";
    await notifyOrgMembers(
      admin,
      a.org_id,
      "An assessment was completed | AYN",
      `${heading("An assessment was completed")}
      ${para(`A candidate for ${roleTitle} finished the assessment you sent. Results and observations are ready to review.`)}`,
      "assessment_completed",
      ctaButton("https://ayn.careers/", "View results"),
    );
  }
}
