// v3.329.0 — extracted from index.ts, part of the ~58-action dispatcher
// split into per-domain files. The employer-side assessment generate/
// send/list actions and the candidate-side start/answer/submit/growth-
// notes actions. finaliseAssessment/publicQuestion/assessmentDeadline
// themselves were already extracted in stage 14 (lib/assessmentHelpers.ts)
// and reached here via ctx.finaliseAssessment / a direct import. Pure
// code movement, zero logic changes.
//
// ═══════════════════════════════════════════════════════════
// SECURITY BOUNDARY (repeated from the original inline comment, since
// every handler below either enforces or depends on it):
//   - assessments.questions stores ONLY {id, type, text, options}.
//     The rubric is never written into that column.
//   - Rubrics live in public.assessment_rubrics, which has ALL
//     privileges revoked from anon and authenticated. Same for
//     public.assessment_results. Both are service_role only, and RLS
//     is on with zero policies, so even a leaked grant denies reads.
//   - No candidate-lane action here ever returns a rubric, a score,
//     a verdict, or a per-question observation.
// ═══════════════════════════════════════════════════════════
import type { ActionCtx } from "./actionCtx.ts";
import { json } from "./utils.ts";
import { featureGate, rateLimitGate } from "./gates.ts";
import { callAI, DEFAULT_MODEL } from "./ai.ts";
import { loadCanonical } from "./canonicalProfile.ts";
import { buildCandidateProfile } from "./candidateIndex.ts";
import { employerBilling, planLimitReached } from "./billing.ts";
import { notifyCandidate } from "./notifications.ts";
import { cleanEmployerText, VOICE_RULES } from "./employerText.ts";
import { type PubQuestion, publicQuestion, assessmentDeadline } from "./assessmentHelpers.ts";
import { parseJsonLoose } from "./utils.ts";
import { ctaButton, heading, para, escapeHtml } from "../../_shared/emailTemplate.ts";

// ---- Employer: generate a draft assessment from the candidate profile ----
export async function handleEmployerAssessmentGenerate(ctx: ActionCtx): Promise<Response> {
  { const off = await featureGate(ctx.admin, "assessments"); if (off) return off; }
  { const limited = await rateLimitGate(ctx.admin, ctx.userId, ctx.action, 20, 15); if (limited) return limited; }
  const { org_id, search_id, ref } = ctx.payload as { org_id?: string; search_id?: string; ref?: string };
  if (!org_id || !search_id || !ref) return json({ error: "org_id, search_id and ref required" }, 400);
  if (!(await ctx.assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
  const gate = await ctx.assertOrgProfileComplete(org_id);
  if (gate) return gate;

  const { data: search } = await ctx.admin.from("employer_searches")
    .select("id, org_id, job_spec, ref_map").eq("id", search_id).maybeSingle();
  if (!search || search.org_id !== org_id) return json({ error: "search not found" }, 404);
  const candidateUserId = (search.ref_map as Record<string, string> | null)?.[ref];
  if (!candidateUserId) return json({ error: "unknown ref" }, 400);

  const canon = await loadCanonical(ctx.admin, candidateUserId);
  if (!canon) return json({ error: "This candidate has no structured profile to build questions from." }, 409);
  const block = buildCandidateProfile(canon);
  const spec = (search.job_spec as Record<string, unknown>) || {};
  const jobTitle = String(spec.title || "").trim() || block.current_title || "the role";

  // v3.129.0 — CanonicalProfile's experience entries have never had an
  // `achievements` field (it's `bullets`, confirmed against the type at
  // loadCanonical's own definition); this always read undefined, so
  // every assessment was generated with zero real detail to anchor
  // questions to, despite the prompt below explicitly requiring one.
  const achievements = canon.experiences.slice(0, 4).map(e => ({
    title: e.title, company: e.company,
    dates: [e.start, e.end || (e.current ? "Now" : "")].filter(Boolean).join(" to "),
    achievements: (e.bullets || []).slice(0, 3),
  }));


  const sys = `You write short verification assessments that check whether what a candidate claims on their profile is real.

WHAT YOU ARE CHECKING: depth of lived experience. Not textbook knowledge.
A question that a general language model can answer well without knowing this person is a WASTED question. Do not write one.

FORBIDDEN QUESTION SHAPES:
- Definitions, "what is X", "which of these best describes X"
- Anything answerable from a job description
- Anything about general best practice, frameworks or tooling in the abstract

REQUIRED QUESTION SHAPES, use a mix of these, always anchored to something THIS person actually claims:
- A specific decision or tradeoff on work they list, and why they chose it over the alternative
- What went wrong on a specific project they list, and what they changed after
- Reconstructing a number they cite in an achievement bullet: how it was measured, what the baseline was
- The constraint or messy detail only someone who did the work would know
- Their specific role when a claim is team shaped, separating what they did from what the team did
- A named real constraint from their own claimed work (their actual stack, scale, team size, or industry) and how they would adapt one of their own decisions if that specific constraint changed — a generic model can produce a plausible-sounding answer to this shape without knowing this person, but it cannot produce the SPECIFIC adaptation someone who actually lived that constraint would give, so the rubric must require an answer that could only come from having actually worked inside it

FORMAT: exactly 4 multiple choice questions and 2 short answer questions. Keep every question and rubric tight, no preamble.
Multiple choice: scenario based, four options, plausible distractors drawn from realistic alternative choices. No obviously silly option. The correct option must be the one consistent with how the work is actually done under the constraints described.
Short answer: ask for 2 to 4 sentences.

Each question also carries a PRIVATE rubric: what a person who genuinely did this work would say, what a bluffer says instead, and for multiple choice which option index is correct and why. The rubric is never shown to the candidate.
${VOICE_RULES}`;

  const schema = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["mc", "short"] },
            text: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            rubric: { type: "string" },
            anchor: { type: "string" },
          },
          required: ["type", "text", "rubric"],
        },
      },
    },
    required: ["questions"],
  };

  // Generation sits on the employer's waiting path, so it runs on the fast
  // model. Grading and growth notes stay on QUALITY_MODEL.
  const r = await callAI({
    model: DEFAULT_MODEL,

    system: sys,
    user: `ROLE BEING HIRED FOR: ${JSON.stringify({ title: jobTitle, seniority: spec.seniority, must_have_skills: spec.must_have_skills })}

THE CANDIDATE'S OWN CLAIMS (build every question from these):
${JSON.stringify({ profile: block, work: achievements, education: block.education }, null, 1)}

Write the assessment now.`,
    toolName: "write_assessment",
    toolSchema: schema,
  });

  const parsed = (r.structured as { questions?: Array<Record<string, unknown>> } | undefined)
    || parseJsonLoose<{ questions?: Array<Record<string, unknown>> }>(r.text)
    || {};
  const raw = Array.isArray(parsed.questions) ? parsed.questions : [];
  if (raw.length < 3) return json({ error: "Could not generate an assessment for this candidate. Try again." }, 502);

  const questions: PubQuestion[] = [];
  const rubrics: Array<{ question_id: string; rubric: string }> = [];
  raw.slice(0, 9).forEach((q, i) => {
    const id = `q${i + 1}`;
    const type = q.type === "short" ? "short" : "mc";
    const opts = (Array.isArray(q.options) ? q.options : []).map(String).filter(Boolean).slice(0, 5);
    if (type === "mc" && opts.length < 2) return;
    questions.push({ id, type, text: cleanEmployerText(String(q.text || "")), ...(type === "mc" ? { options: opts } : {}) });
    rubrics.push({ question_id: id, rubric: String(q.rubric || "").slice(0, 2000) });
  });
  if (!questions.length) return json({ error: "Could not generate an assessment for this candidate. Try again." }, 502);

  const { data: row, error: aErr } = await ctx.admin.from("assessments").insert({
    org_id, candidate_user_id: candidateUserId, search_id,
    candidate_ref: ref, job_title: jobTitle, status: "draft",
    questions, created_by: ctx.userId,
  }).select("id").single();
  if (aErr || !row) return json({ error: aErr?.message || "insert failed" }, 500);

  await ctx.admin.from("assessment_rubrics")
    .insert(rubrics.map(x => ({ assessment_id: row.id, ...x })));

  return json({ assessment_id: row.id, job_title: jobTitle, questions });
}

// ---- Employer: send the draft, minus any question they removed ----
export async function handleEmployerAssessmentSend(ctx: ActionCtx): Promise<Response> {
  { const off = await featureGate(ctx.admin, "assessments"); if (off) return off; }
  const { assessment_id, keep_ids, time_limit_seconds, expires_days } = ctx.payload as {
    assessment_id?: string; keep_ids?: string[];
    time_limit_seconds?: number; expires_days?: number;
  };
  if (!assessment_id) return json({ error: "assessment_id required" }, 400);
  const { data: a } = await ctx.admin.from("assessments")
    .select("id, org_id, status, questions, candidate_user_id, job_title").eq("id", assessment_id).maybeSingle();
  if (!a) return json({ error: "assessment not found" }, 404);
  if (!(await ctx.assertOrgMember(a.org_id))) return json({ error: "not an org member" }, 403);
  if (a.status !== "draft") return json({ error: "This assessment was already sent." }, 409);

  // v3.14.0 — assessments limit per billing period.
  const assBilling = await employerBilling(ctx.admin, ctx.userId, a.org_id);
  const assGate = planLimitReached(assBilling, "assessment");
  if (assGate) return assGate;


  const all = (a.questions as Array<Record<string, unknown>>) || [];
  const keep = Array.isArray(keep_ids) && keep_ids.length
    ? all.filter(q => keep_ids.map(String).includes(String(q.id)))
    : all;
  if (keep.length < 3) return json({ error: "Keep at least three questions." }, 400);

  // v3.157.0 — fallback only: the real caller (AssessmentDialog.tsx)
  // always sends an explicit value derived from the same per-question
  // caps (2 min mc, 3 min short) the candidate actually sees. This
  // mirrors that formula so a caller that omits it still gets a
  // sensible number instead of a flat 30 minutes regardless of length.
  const derivedDefault = keep.reduce(
    (sum, q) => sum + (String((q as Record<string, unknown>).type) === "short" ? 180 : 120), 0,
  );
  const limit = Math.max(300, Math.min(7200, Math.round(Number(time_limit_seconds) || derivedDefault || 1800)));
  const days = Math.max(1, Math.min(30, Math.round(Number(expires_days) || 7)));
  const { error } = await ctx.admin.from("assessments").update({
    questions: keep.map(publicQuestion),
    status: "sent",
    time_limit_seconds: limit,
    sent_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + days * 86400000).toISOString(),
  }).eq("id", assessment_id);
  if (error) return json({ error: error.message }, 500);
  if (a.candidate_user_id) {
    const { data: sendOrg } = await ctx.admin.from("orgs").select("name").eq("id", a.org_id).maybeSingle();
    const sendOrgName = sendOrg?.name || "A company";
    const minutes = Math.round(limit / 60);
    await notifyCandidate(
      ctx.admin,
      a.candidate_user_id,
      `New assessment from ${sendOrgName} | AYN`,
      `${heading("A company wants to verify your background")}
      ${para(`${escapeHtml(sendOrgName)} sent you a short assessment${a.job_title ? ` for ${escapeHtml(a.job_title)}` : ""}. It takes about ${minutes} minutes once you start.`)}`,
      "assessment_received",
      ctaButton("https://ayn.careers/", "View assessment"),
    );
  }
  return json({ ok: true, status: "sent" });
}

// ---- Employer: sent assessments with results once submitted ----
export async function handleEmployerAssessmentList(ctx: ActionCtx): Promise<Response> {
  const { search_id } = ctx.payload as { search_id?: string };
  const { data: memberships } = await ctx.admin.from("org_members")
    .select("org_id").eq("user_id", ctx.userId);
  const orgIds = (memberships || []).map(m => m.org_id);
  if (!orgIds.length) return json({ assessments: [] });

  let q = ctx.admin.from("assessments")
    .select("id, org_id, search_id, candidate_ref, candidate_user_id, job_title, status, questions, answers, time_limit_seconds, started_at, submitted_at, sent_at, expires_at, created_at")
    .in("org_id", orgIds).neq("status", "draft")
    .order("created_at", { ascending: false }).limit(100);
  if (search_id) q = q.eq("search_id", search_id);
  const { data: rows } = await q;

  const ids = (rows || []).map(r => r.id);
  const { data: results } = ids.length
    ? await ctx.admin.from("assessment_results")
      .select("assessment_id, overall_score, verification_verdict, per_question, strengths, concerns, employer_summary, writing_signal, writing_signal_note")
      .in("assessment_id", ids)
    : { data: [] };
  const byId = new Map((results || []).map(r => [r.assessment_id, r]));

  // First name only, so a list of assessments for one role is readable.
  const candIds = [...new Set((rows || []).map(r => r.candidate_user_id).filter(Boolean))];
  const { data: profs } = candIds.length
    ? await ctx.admin.from("user_profile_data")
      .select("user_id, legal_first_name").in("user_id", candIds)
    : { data: [] };
  const nameByUser = new Map(
    (profs || []).map(p => [p.user_id, String(p.legal_first_name || "").trim().split(/\s+/)[0] || null]),
  );

  const out = (rows || []).map(r => {
    const expired = r.status !== "submitted" && r.expires_at && new Date(r.expires_at).getTime() < Date.now();
    const res = byId.get(r.id) || null;
    return {
      id: r.id, ref: r.candidate_ref, search_id: r.search_id, job_title: r.job_title,
      first_name: nameByUser.get(r.candidate_user_id) || null,
      status: expired ? "expired" : r.status,
      question_count: ((r.questions as unknown[]) || []).length,
      time_limit_seconds: r.time_limit_seconds,
      sent_at: r.sent_at, started_at: r.started_at, submitted_at: r.submitted_at, expires_at: r.expires_at,
      result: res
        ? {
          overall_score: res.overall_score,
          verification_verdict: res.verification_verdict,
          per_question: res.per_question,
          strengths: res.strengths,
          concerns: res.concerns,
          employer_summary: res.employer_summary,
          writing_signal: res.writing_signal || "unclear",
          writing_signal_note: res.writing_signal_note || "",
        }
        : null,
    };
  });
  return json({ assessments: out });
}

// ---- Candidate: list assessments addressed to me (no scores, ever) ----
export async function handleAssessmentList(ctx: ActionCtx): Promise<Response> {
  const { data: rows } = await ctx.admin.from("assessments")
    .select("id, org_id, job_title, status, questions, time_limit_seconds, started_at, submitted_at, sent_at, expires_at")
    .eq("candidate_user_id", ctx.userId).neq("status", "draft")
    .order("sent_at", { ascending: false }).limit(50);
  const out: Array<Record<string, unknown>> = [];
  for (const r of (rows || [])) {
    const { data: org } = await ctx.admin.from("orgs").select("name, logo_url").eq("id", r.org_id).maybeSingle();
    const expired = r.status !== "submitted" && r.expires_at && new Date(r.expires_at).getTime() < Date.now();
    out.push({
      id: r.id,
      org_name: org?.name || "A company",
      org_logo_url: org?.logo_url || null,
      job_title: r.job_title || "",
      status: expired ? "expired" : r.status,
      question_count: ((r.questions as unknown[]) || []).length,
      time_limit_seconds: r.time_limit_seconds,
      sent_at: r.sent_at, expires_at: r.expires_at,
      started_at: r.started_at, submitted_at: r.submitted_at,
      deadline_at: r.started_at ? new Date(assessmentDeadline(r)!).toISOString() : null,
    });
  }
  return json({ assessments: out });
}

// ---- Candidate: start (server enforced timer) ----
export async function handleAssessmentStart(ctx: ActionCtx): Promise<Response> {
  const { id } = ctx.payload as { id?: string };
  if (!id) return json({ error: "id required" }, 400);
  const { data: a } = await ctx.admin.from("assessments")
    .select("id, org_id, job_title, status, questions, answers, time_limit_seconds, started_at, expires_at")
    .eq("id", id).eq("candidate_user_id", ctx.userId).maybeSingle();
  if (!a) return json({ error: "assessment not found" }, 404);
  if (a.status === "submitted") return json({ error: "You already submitted this assessment." }, 409);
  if (a.status === "expired") return json({ error: "This assessment expired." }, 409);
  if (a.expires_at && new Date(a.expires_at).getTime() < Date.now()) {
    await ctx.admin.from("assessments").update({ status: "expired" }).eq("id", id);
    return json({ error: "This assessment expired." }, 409);
  }

  let started = a.started_at as string | null;
  if (!started) {
    started = new Date().toISOString();
    await ctx.admin.from("assessments").update({ status: "started", started_at: started }).eq("id", id);
  }
  const deadline = new Date(started).getTime() + Number(a.time_limit_seconds || 1800) * 1000;
  if (deadline < Date.now()) {
    await ctx.finaliseAssessment(id);
    return json({ error: "Your time on this assessment ran out. It has been submitted." }, 409);
  }
  // v3.155.0 — the moment a question is actually shown is the real
  // start of thinking time for it, whether this is a fresh start or a
  // resume after a reload. assessment_answer below reads this back to
  // compute real elapsed time server side, closing a real integrity
  // gap: seconds_spent used to be whatever the client chose to report.
  await ctx.admin.from("assessments").update({ current_question_started_at: new Date().toISOString() }).eq("id", id);
  const { data: org } = await ctx.admin.from("orgs").select("name").eq("id", a.org_id).maybeSingle();
  return json({
    id: a.id,
    org_name: org?.name || "A company",
    job_title: a.job_title || "",
    // Only the public shape. The rubric is in another table entirely.
    questions: ((a.questions as Array<Record<string, unknown>>) || []).map(publicQuestion),
    answers: a.answers || {},
    deadline_at: new Date(deadline).toISOString(),
    seconds_left: Math.max(0, Math.round((deadline - Date.now()) / 1000)),
  });
}

// ---- Candidate: autosave one answer, with time spent on it ----
export async function handleAssessmentAnswer(ctx: ActionCtx): Promise<Response> {
  const { id, question_id, answer, ms } = ctx.payload as {
    id?: string; question_id?: string; answer?: string; ms?: number;
  };
  if (!id || !question_id) return json({ error: "id and question_id required" }, 400);
  const { data: a } = await ctx.admin.from("assessments")
    .select("id, status, answers, started_at, time_limit_seconds, questions, current_question_started_at")
    .eq("id", id).eq("candidate_user_id", ctx.userId).maybeSingle();
  if (!a) return json({ error: "assessment not found" }, 404);
  if (a.status !== "started") return json({ error: "This assessment is not open." }, 409);
  const deadline = assessmentDeadline(a as Record<string, unknown>);
  if (deadline && deadline < Date.now()) {
    await ctx.finaliseAssessment(id);
    return json({ error: "Time ran out. Your answers were submitted." }, 409);
  }
  // v3.155.0 — seconds_spent used to be whatever ms the client chose to
  // report, never checked against anything -- a self-timed exam.
  // current_question_started_at was stamped server side the moment this
  // question was actually shown (assessment_start, or the end of the
  // previous assessment_answer call), so real elapsed time is now
  // computed here instead of trusted from the payload. ms is still
  // accepted and clamped as a defensive fallback for the edge case
  // where that stamp is somehow missing, never as the primary source.
  const questionStartedAt = a.current_question_started_at ? new Date(a.current_question_started_at as string).getTime() : null;
  const realMs = questionStartedAt
    ? Math.max(0, Date.now() - questionStartedAt)
    : Math.max(0, Math.min(3600000, Math.round(Number(ms) || 0)));
  const answers = { ...((a.answers as Record<string, unknown>) || {}) };
  const answerText = String(answer ?? "").slice(0, 3000);
  answers[String(question_id)] = {
    answer: answerText,
    ms: realMs,
    at: new Date().toISOString(),
  };

  // v3.154.0 — asked directly to build something that actually raises
  // the bar against an AI-assisted answer, not a prompt tweak. Live
  // tested first: given only the question and the candidate's own
  // resume bullets (exactly what someone pasting into a chatbot would
  // have), an AI scored 90/100 "consistent" against the original
  // one-shot design -- a capable model reasons to the same
  // textbook-correct MC choice a genuine engineer would, and invents
  // plausible specifics on demand for short answers. A live follow-up,
  // generated only after the first answer exists and graded below for
  // consistency against it, closes part of that gap: it can't be
  // pre-drafted, and a fabricated backstory has to stay coherent under
  // a second, unplanned probe. Scoped to the two short-answer
  // questions -- MC has no natural "dig deeper" shape -- and generated
  // at most once per question, so the added AI cost is capped at 2
  // calls per assessment regardless of how this action gets retried.
  const questions = (a.questions as Array<Record<string, unknown>>) || [];
  const thisQ = questions.find(q => String(q.id) === String(question_id));
  const alreadyHasFollowUp = questions.some(q => String(q.parent_id || "") === String(question_id));
  let followUp: { id: string; type: "short"; text: string } | null = null;

  // v3.154.0 — reproduced live: a follow-up (itself type "short", no
  // parent_id check here originally) could spawn a follow-up of its
  // own, and that one another, an unbounded chain. A follow-up must
  // never generate a follow-up -- one probe per original question.
  const isItselfAFollowUp = !!thisQ?.parent_id;
  // v3.157.0 — this call had no ceiling: a slow or congested AI gateway
  // meant every short-answer submission blocked on however long that
  // one request took, with no cap. Under real load (more concurrent
  // candidates, gateway congestion) that tail has no bound, so it gets
  // worse exactly when it matters most. Racing it against a fixed 3s
  // timeout means a candidate is never held up past that regardless of
  // gateway load; past it, this answer just skips the follow-up, the
  // same honest "best effort, never blocks the real action" rule this
  // file already applies to notification emails.
  if (thisQ && String(thisQ.type) === "short" && !isItselfAFollowUp && !alreadyHasFollowUp && answerText.trim().length >= 20) {
    try {
      const canon = await loadCanonical(ctx.admin, ctx.userId);
      const claims = canon ? buildCandidateProfile(canon) : null;
      const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 3000));
      const fr = await Promise.race([callAI({
        model: DEFAULT_MODEL,
        system: `You write ONE live follow-up question for a verification assessment, based on an answer someone just gave.

GOAL: ask for a specific, concrete detail (a real number, a name, a precise mechanism) that a person who genuinely did the work would know without hesitation, and that was NOT already stated in their answer. Something a fabricated answer would have to invent on the spot, with no chance to have prepared it in advance.

RULES:
- Ask about something THEY just claimed in their own answer below. Never introduce a new unrelated topic.
- Never ask something answerable from the job description or general knowledge alone.
- One question only. Plain, direct, one or two sentences.
- Do not explain why you are asking. Do not soften it. Just ask.
${VOICE_RULES}`,
        user: `THE ORIGINAL QUESTION: ${String(thisQ.text || "")}

WHAT THEY JUST ANSWERED: ${answerText}

WHAT THEY CLAIM ON THEIR PROFILE (for grounding only): ${JSON.stringify(claims)}

Write the one follow-up question now.`,
        toolName: "write_followup",
        toolSchema: {
          type: "object",
          properties: {
            question: { type: "string" },
            rubric: { type: "string", description: "What a genuine, consistent answer looks like versus a vague or invented one, judged specifically against what they already said." },
          },
          required: ["question", "rubric"],
        },
      }), timeout]);
      const parsedFollowUp = fr
        ? ((fr.structured as { question?: string; rubric?: string } | undefined)
          || parseJsonLoose<{ question?: string; rubric?: string }>(fr.text) || {})
        : {};
      const qText = cleanEmployerText(String(parsedFollowUp.question || "")).trim();
      if (qText) {
        const fid = `${question_id}f`;
        followUp = { id: fid, type: "short", text: qText };
        const nextQuestions = [...questions, { id: fid, type: "short", text: qText, parent_id: String(question_id) }];
        await ctx.admin.from("assessments").update({ questions: nextQuestions }).eq("id", id);
        await ctx.admin.from("assessment_rubrics").insert({
          assessment_id: id, question_id: fid, rubric: String(parsedFollowUp.rubric || "").slice(0, 2000),
        });
      }
    } catch (e) {
      console.error("follow-up generation failed, continuing without one", e);
    }
  }

  // Whatever question the candidate sees next -- the next fixed
  // question, or the follow-up just generated above -- starts being
  // shown right as this response goes out. That is the real, honest
  // start-of-thinking-time marker for it, regardless of which one it
  // turns out to be; the next assessment_answer call reads it back.
  const { error } = await ctx.admin.from("assessments")
    .update({ answers, current_question_started_at: new Date().toISOString() }).eq("id", id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, follow_up: followUp });
}

// ---- Candidate: submit. Returns a plain confirmation and nothing else ----
export async function handleAssessmentSubmit(ctx: ActionCtx): Promise<Response> {
  const { id } = ctx.payload as { id?: string };
  if (!id) return json({ error: "id required" }, 400);
  const { data: a } = await ctx.admin.from("assessments")
    .select("id, org_id, status").eq("id", id).eq("candidate_user_id", ctx.userId).maybeSingle();
  if (!a) return json({ error: "assessment not found" }, 404);
  if (a.status === "submitted") return json({ error: "Already submitted." }, 409);
  const { data: org } = await ctx.admin.from("orgs").select("name").eq("id", a.org_id).maybeSingle();
  await ctx.finaliseAssessment(id);
  // No score, no verdict, no feedback. Deliberately.
  return json({ ok: true, org_name: org?.name || "the company" });
}

// ---- Candidate: the growth note, and only the growth note ----
export async function handleAssessmentGrowthNotes(ctx: ActionCtx): Promise<Response> {
  const { data: rows } = await ctx.admin.from("assessments")
    .select("id").eq("candidate_user_id", ctx.userId).eq("status", "submitted").limit(20);
  const ids = (rows || []).map(r => r.id);
  if (!ids.length) return json({ notes: [] });
  const { data: res } = await ctx.admin.from("assessment_results")
    .select("assessment_id, seeker_growth_note, created_at").in("assessment_id", ids)
    .order("created_at", { ascending: false }).limit(3);
  // Only the note text travels. No score, no verdict, no observation.
  const notes = (res || [])
    .map(r => String(r.seeker_growth_note || "").trim())
    .filter(Boolean);
  return json({ notes });
}
