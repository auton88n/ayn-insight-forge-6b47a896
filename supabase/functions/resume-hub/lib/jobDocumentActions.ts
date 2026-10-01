// Extracted from index.ts as part of the monolith reorganization. Per-job actions: match (score), tailor, cover_letter, job_fit_advice.
// Pure code movement: each handler is the original inline block, unchanged,
// taking the request context it used to close over.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { loadIdentity, identityContactBlock } from "../../_shared/identity.ts";
import { sha256 as sha256b, buildSections, computeGap, renderGapBlock, droppedFigures, cacheGet, cacheSet, logAiCall, fetchCompanyContext, detectKnockoutRisks, verifyWriteQuality, verifyProseQuality, violationsToRetryNote, inventedFigures, verifyKeywordAlignment, resolveTailorTitle } from "../../_shared/tailoring.ts";
import { humanWritingViolations, RESUME_WRITING_STANDARD, COVER_LETTER_WRITING_STANDARD } from "../../_shared/writingPolicy.ts";
import { evaluateResumeDocument, RESUME_EVALUATION_VERSION } from "../../_shared/resumeEvaluation.ts";
import { prepareJobDocument, completeJobDocument } from "./paidJobDocument.ts";
import { json, TAILOR_TTL } from "./utils.ts";
import { featureGate, accountGate, rateLimitGate } from "./gates.ts";
import { DEFAULT_MODEL, QUALITY_MODEL, callAI } from "./ai.ts";
import { RESUME_SCHEMA, groupSkills } from "./resumeScoring.ts";
import { loadCanonical } from "./canonicalProfile.ts";
import { semanticGapRecheck } from "./embeddings.ts";
import { COST_TAILOR, COST_COVER, assertCredits } from "./billing.ts";
import type { BaseCtx } from "./actionCtx.ts";

// ---------------- match ----------------
// v3.72.0 — this used to be a bare prompt handed the client's raw resume
// JSON: no canonical profile (skills with levels, certifications, work
// auth, known_for — everything Profile actually collects), no
// deterministic gap analysis, no honesty rule, no temperature control,
// no cache. Now grounded in the same profile the rest of the app reads.
// Same response shape as before (score 0-100 / breakdown / missing_keywords /
// summary) so JobsTab.tsx needed no changes — only what grounds the
// number changed.
export async function handleMatch(ctx: BaseCtx): Promise<Response> {
  const { supabaseUrl, serviceKey, action, payload, user } = ctx;
  const adminMatch = createClient(supabaseUrl, serviceKey);
  { const off = await featureGate(adminMatch, "tailoring"); if (off) return off; }
  { const blocked = await accountGate(adminMatch, user.id, action); if (blocked) return blocked; }
  { const limited = await rateLimitGate(adminMatch, user.id, action, 30, 15); if (limited) return limited; }
  const matchStarted = Date.now();
  const { jdText } = payload as { jdText: string };
  if (!jdText) return json({ error: "jdText required" }, 400);

  const [identity, canonical] = await Promise.all([
    loadIdentity(adminMatch, user.id, {}).catch(() => null),
    loadCanonical(adminMatch, user.id),
  ]);
  const document = identity?.resume.raw;
  if (!document) return json({ error: "No saved resume available to score" }, 400);
  const assessment = evaluateResumeDocument(document, jdText);
  const { gap, matchPct } = assessment;
  // Profile eligibility is separate; it never changes document coverage.
  const knockoutRisks = detectKnockoutRisks(jdText, canonical);
  return json({
    score: matchPct,
    breakdown: matchPct === null ? {} : { requirement_coverage: matchPct },
    missing_keywords: gap.missing.slice(0, 3).map(r => r.text),
    summary: matchPct === null
      ? "No clear requirements could be extracted. No match percentage is available."
      : `${gap.matched.length} of ${assessment.requirementCount} extracted requirements have matching text in your saved resume. This is document wording coverage, not hiring probability. Up to three gaps are shown.`,
    evaluationVersion: assessment.evaluationVersion,
    knockoutRisks,
  });
}

// v3.72.0 — same rebuild as `match` above. This used to take the
// client's raw resume JSON as its only source of truth: no canonical
// profile (so skill levels, certifications, known_for, work history
// achievements added in Profile were invisible to it), no deterministic
// gap analysis to ground what to surface, no figure-preservation check,
// no cache. Now grounded the same way, and outputs a structured resume
// rather than flat text (JobsTab stores the result as a resume_versions
// row and resumeDocs.ts builds a PDF/DOCX straight from that structure),
// so the output schema stays RESUME_SCHEMA.
// ---------------- tailor ----------------
export async function handleTailor(ctx: BaseCtx): Promise<Response> {
  const { req, supabaseUrl, serviceKey, action, payload, user } = ctx;
  const adminTailor = createClient(supabaseUrl, serviceKey);
  { const off = await featureGate(adminTailor, "tailoring"); if (off) return off; }
  { const blocked = await accountGate(adminTailor, user.id, action); if (blocked) return blocked; }
  { const limited = await rateLimitGate(adminTailor, user.id, action, 20, 15); if (limited) return limited; }
  const tailorStarted = Date.now();
  const pendingTailor = await prepareJobDocument(adminTailor, user.id, action, payload.jobId, payload.idempotency_key);
  if (pendingTailor.replay) return json(pendingTailor.replay);
  const { jdText, jobTitle, idempotency_key: tailorIdemKey } = payload as { jdText: string; jobTitle?: string; idempotency_key?: string };
  if (!jdText) return json({ error: "jdText required" }, 400);

  const [identity, canonical] = await Promise.all([
    loadIdentity(adminTailor, user.id, {}).catch(() => null),
    loadCanonical(adminTailor, user.id),
  ]);
  const bundle = buildSections(identity, canonical);
  if (!bundle.text || bundle.chars < 60) return json({ error: "No resume content available to tailor" }, 400);
  let gap = computeGap(jdText, bundle);
  gap = await semanticGapRecheck(gap, bundle);

  // v3.270.0 — decided in code, before the model ever runs: see
  // resolveTailorTitle's own header comment. Real, same-level title
  // alignment with the posting is automatic now; a seniority bump the
  // candidate's own real title doesn't already carry is refused
  // regardless of what the model or the job description says.
  const resolvedTailorTitle = resolveTailorTitle(identity?.current_title.value || "", jobTitle);

  const jdHash = (await sha256b(jdText)).slice(0, 24);
  const sectionHash = (await sha256b(bundle.text)).slice(0, 16);
  const documentHash = (await sha256b(JSON.stringify(identity?.resume.raw ?? null))).slice(0, 16);
  const cacheKey = `webtailor:${RESUME_EVALUATION_VERSION}:${user.id}:${sectionHash}:${documentHash}:${jdHash}`;
  const cached = await cacheGet<{ resume: unknown }>(adminTailor, cacheKey);
  if (cached) {
    logAiCall(adminTailor, {
      user_id: user.id, purpose: "tailor_web", cache_hit: true, duration_ms: Date.now() - tailorStarted,
      source_map: identity?.sourceMap() || null, gap_matched: gap.matched.length, gap_missing: gap.missing.length,
    });
    return json(await completeJobDocument(adminTailor, user.id, action, pendingTailor, identity?.resume.id, cached, 0));
  }

  // Gate only after a possible cache hit, so a repeat tailor of the same
  // resume against the same JD never costs a second charge.
  const creditGate = await assertCredits(adminTailor, user.id, COST_TAILOR, "tailored resume");
  if (creditGate) return creditGate;

  const applicantBlock = identity ? identityContactBlock(identity) : "";
  const applicantSection = applicantBlock
    ? `\n\nAPPLICANT HEADER (use these exact contact details, never invent alternatives):\n${applicantBlock}`
    : "";
  const droppedNote = bundle.dropped.length
    ? `\n\nNOTE: these sections were omitted to fit the budget and must not be referenced: ${bundle.dropped.join(", ")}.`
    : "";
  const system = `${RESUME_WRITING_STANDARD}\nTailor the document to the job using only applicant evidence. Related experience is not proof of a missing qualification. Preserve employment titles, dates and companies. Use equivalent job terminology only when genuinely equivalent. basics.title must equal ${JSON.stringify(resolvedTailorTitle)}. Use the supplied applicant contact details. Return the RESUME_SCHEMA object.`;
  const userMsg = `APPLICANT SECTIONS (the only source of truth about this person):
${bundle.text}${applicantSection}${droppedNote}

JOB DESCRIPTION:
${jdText.slice(0, 20000)}${renderGapBlock(gap)}`;

  // v3.97.0 — was QUALITY_MODEL (gemini-2.5-pro): a real tailor_web call
  // measured 176s, past this app's own 150s idle timeout. Flash tier.
  let r = await callAI({ model: DEFAULT_MODEL, temperature: 0.2, system, user: userMsg, toolName: "emit_resume", toolSchema: RESUME_SCHEMA });

  // SELF-VERIFICATION — figures, banned phrases, pronouns, dashes, and
  // (v3.159.0) a summary echoing one of the JD's own genuinely missing
  // requirements as if it were evidenced, all checked in code, not just
  // asked for. One retry naming every violation found in a single round
  // trip.
  //
  // v3.267.0 — reported directly, and reproduced: a real tailored
  // resume failed a real ATS keyword scan, because the prompt's own
  // "surface ALREADY EVIDENCED items in the JD's own terminology"
  // instruction (renderGapBlock's preamble) had no code-level check
  // behind it, unlike every other rule here — the model could simply
  // not do it and nothing would ever notice. verifyKeywordAlignment is
  // that missing check: scoped ONLY to gap.matched (a requirement the
  // deterministic gap analysis already confirmed is genuinely present
  // in this person's real background), so it can never push the model
  // toward the "missing" bucket — zero new fabrication risk, same as
  // every other check in this file.
  // v3.312.0 — same loop-and-keep-best-across-all-attempts fix as
  // rewrite/resume_generate's own sibling checks, for the same reason:
  // one retry adopted only if strictly better than the immediately
  // prior attempt has no recovery when the retry also has a violation
  // (a real, live-reproduced case on the sibling cover_letter action —
  // a genuine fabricated figure survived a retry that also fabricated
  // one, and got silently kept since neither was "strictly better").
  const missingReqTexts = gap.missing.map((req) => req.text);
  let writeViolations = humanWritingViolations(verifyWriteQuality(bundle.text, r.structured, missingReqTexts));
  for (const kw of verifyKeywordAlignment(gap, r.structured)) writeViolations.push({ kind: "keyword_gap", detail: kw });
  let tailorBest = writeViolations.length;
  for (let attempt = 0; attempt < 2 && tailorBest > 0; attempt++) {
    const retryNote = violationsToRetryNote(writeViolations);
    const retry = await callAI({
      model: DEFAULT_MODEL, temperature: 0.2, system,
      user: `${userMsg}\n\n${retryNote}`,
      toolName: "emit_resume", toolSchema: RESUME_SCHEMA,
    });
    const retryViolations = humanWritingViolations(verifyWriteQuality(bundle.text, retry.structured, missingReqTexts));
    for (const kw of verifyKeywordAlignment(gap, retry.structured)) retryViolations.push({ kind: "keyword_gap", detail: kw });
    if (retryViolations.length < tailorBest) {
      r = retry; writeViolations = retryViolations; tailorBest = retryViolations.length;
    }
  }
  if (writeViolations.some(v => ['figure', 'invented_figure', 'gap_claim'].includes(v.kind))) {
    return json({ error: 'Tailoring could not preserve the supplied facts. No credits were charged. Review your profile and try again.', code: 'resume_facts_unresolved' }, 422);
  }
  const missingFigures = writeViolations.filter((v) => v.kind === "figure").map((v) => v.detail);

  // v3.268.0 — asked directly for this to be guaranteed, not best-effort:
  // "nothing will stop this process... the resume needs to fix perfectly
  // with the JD... so the ATS accept it." The model got a real chance
  // above to weave a still-missing ALREADY EVIDENCED term into a real
  // bullet naturally; whatever it still misses after that retry is
  // guaranteed here, deterministically, with no AI call and nothing that
  // can fail or time out — appended straight to the skills array. This
  // is not a new promise: it enforces the exact same boundary rule 4b
  // already states to the model (ONLY gap.matched, a requirement the
  // deterministic gap analysis already confirmed this person genuinely
  // has real evidence for — never gap.missing, which stays untouched and
  // reported honestly). Every job, every time, unconditionally.
  const tailoredResumeObj = r.structured as { skills?: string[]; basics?: { title?: string } };
  const stillMisalignedKeywords = verifyKeywordAlignment(gap, r.structured);
  if (stillMisalignedKeywords.length) {
    const existingSkillsLower = new Set((tailoredResumeObj.skills ?? []).map((s) => s.trim().toLowerCase()));
    const toGuarantee = stillMisalignedKeywords.filter((k) => !existingSkillsLower.has(k.trim().toLowerCase()));
    if (toGuarantee.length) tailoredResumeObj.skills = [...(tailoredResumeObj.skills ?? []), ...toGuarantee];
  }

  // v3.270.0 — same guarantee as the skills backstop above, for the
  // title: resolvedTailorTitle was already decided in code before the
  // model ever ran, so whatever the model actually returned is
  // overwritten here unconditionally rather than trusted. This can never
  // drift, and it's the only place this field's final value is set.
  if (resolvedTailorTitle) {
    tailoredResumeObj.basics = { ...(tailoredResumeObj.basics ?? {}), title: resolvedTailorTitle };
  }

  const tailorSkillGroups = await groupSkills(tailoredResumeObj.skills ?? []);
  if (tailorSkillGroups) (tailoredResumeObj as { skillGroups?: unknown }).skillGroups = tailorSkillGroups;


  // v3.99.0 — was computed and logged (gap_matched/gap_missing above)
  // but never actually sent back. JobsTab uses this to let the person
  // decide, on their own, whether to add a genuinely missing skill or
  // align the header title to the job's — nothing here is applied
  // automatically, this is only the raw material for that choice.
  //
  // v3.267.0 — matchPct is a SECOND, independent gap analysis, run
  // against the actual OUTPUT resume's own text rather than the
  // original — the original `gap` above only ever describes the
  // candidate's PROFILE, unaffected by how well this specific tailor
  // call actually turned out. This is the real, honest "did tailoring
  // work" number: a resume that only reworded sentences without
  // aligning any terminology will score close to what the untailored
  // profile already scored; one that correctly surfaced every
  // ALREADY EVIDENCED item in the job's own wording (rule 4b above,
  // now enforced by verifyKeywordAlignment) will score higher.
  const afterAssessment = evaluateResumeDocument(r.structured, jdText);
  const beforeAssessment = identity?.resume.raw ? evaluateResumeDocument(identity.resume.raw, jdText) : null;

  const result = {
    resume: r.structured,
    gapAnalysis: {
      missing: afterAssessment.gap.missing.map(req => req.text),
      matchPct: afterAssessment.matchPct,
      beforeMatchPct: beforeAssessment?.matchPct ?? null,
      evaluationVersion: afterAssessment.evaluationVersion,
    },
  };
  const completedTailor = await completeJobDocument(adminTailor, user.id, action, pendingTailor, identity?.resume.id, result, COST_TAILOR);
  cacheSet(adminTailor, cacheKey, user.id, "tailor_web", result, TAILOR_TTL);
  logAiCall(adminTailor, {
    user_id: user.id, purpose: "tailor_web", model: DEFAULT_MODEL, duration_ms: Date.now() - tailorStarted,
    cache_hit: false, source_map: identity?.sourceMap() || null,
    gap_matched: gap.matched.length, gap_missing: gap.missing.length,
    meta: { jd_chars: jdText.length, section_chars: bundle.chars, figures_ok: missingFigures.length === 0 },
  });
  return json(completedTailor);
}

// ---------------- cover_letter ----------------
export async function handleCoverLetter(ctx: BaseCtx): Promise<Response> {
  const { req, supabaseUrl, serviceKey, action, payload, user } = ctx;
  const adminCover = createClient(supabaseUrl, serviceKey);
  { const off = await featureGate(adminCover, "tailoring"); if (off) return off; }
  { const blocked = await accountGate(adminCover, user.id, action); if (blocked) return blocked; }
  { const limited = await rateLimitGate(adminCover, user.id, action, 20, 15); if (limited) return limited; }
  const coverStarted = Date.now();
  const pendingCover = await prepareJobDocument(adminCover, user.id, action, payload.jobId, payload.idempotency_key);
  if (pendingCover.replay) return json(pendingCover.replay);
  const { jdText, tone, company, idempotency_key: coverIdemKey } = payload as { jdText: string; tone?: string; company?: string; idempotency_key?: string };
  if (!jdText) return json({ error: "jdText required" }, 400);

  const [identity, canonical, companyCtx] = await Promise.all([
    loadIdentity(adminCover, user.id, {}).catch(() => null),
    loadCanonical(adminCover, user.id),
    fetchCompanyContext(adminCover, company || "").catch(() => ({ text: "", source: "" })),
  ]);
  const bundle = buildSections(identity, canonical);
  if (!bundle.text || bundle.chars < 60) return json({ error: "No resume content available" }, 400);
  let gap = computeGap(jdText, bundle);
  gap = await semanticGapRecheck(gap, bundle);

  const jdHash = (await sha256b(jdText)).slice(0, 24);
  const sectionHash = (await sha256b(bundle.text)).slice(0, 16);
  const cacheKey = `webcover:verified-figures-v2:${user.id}:${sectionHash}:${jdHash}:${await sha256b((tone || "") + "|" + (company || ""))}`;
  const cached = await cacheGet<{ body: string }>(adminCover, cacheKey);
  if (cached) {
    logAiCall(adminCover, {
      user_id: user.id, purpose: "cover_letter_web", cache_hit: true, duration_ms: Date.now() - coverStarted,
      source_map: identity?.sourceMap() || null,
    });
    return json(await completeJobDocument(adminCover, user.id, action, pendingCover, identity?.resume.id, cached, 0));
  }

  const creditGate = await assertCredits(adminCover, user.id, COST_COVER, "cover letter");
  if (creditGate) return creditGate;

  const applicantBlock = identity ? identityContactBlock(identity) : "";
  const applicantSection = applicantBlock
    ? `\n\nAPPLICANT (use these exact contact details in the header and signature, never invent alternatives):\n${applicantBlock}`
    : "";
  const companySection = companyCtx.text
    ? `\n\nCOMPANY CONTEXT (from ${companyCtx.source}, the employer's own public page):\n${companyCtx.text}`
    : "";
  const system = `${COVER_LETTER_WRITING_STANDARD}\nTone preference: ${JSON.stringify(tone || "professional, warm")}. Employer: ${JSON.stringify(company || "the hiring team")}. Employer information is context, never evidence of the candidate\'s achievements.`;
  const userMsg = `APPLICANT SECTIONS:\n${bundle.text}${applicantSection}${companySection}\n\nJOB DESCRIPTION:\n${jdText.slice(0, 20000)}${renderGapBlock(gap)}`;

  const r = await callAI({ system, user: userMsg });
  let coverBody = r.text;

  // SELF-VERIFICATION — figures must trace back to the sections, no
  // banned cliches, no em/en dash. Pronouns are fine here; a cover
  // letter is legitimately first person. v3.159.0 — also code-checks
  // the "don't claim a requirement not evidenced" rule above, not just
  // prompt-asked (found live: tailor's summary echoed a genuinely
  // missing requirement as claimed experience; this closes the same
  // gap on the cover letter path before it can happen here too).
  // v3.312.0 — real, live-reproduced gap in this exact check, found by
  // testing the cover letter fix above rather than shipping it
  // untested: a genuine run fabricated a "25%" figure the source never
  // stated. The detection itself was correct (confirmed by rerunning
  // extractFigures/droppedFigures against the real captured text in
  // isolation, before touching this code — it flagged "25%"
  // immediately, first try), so the gap was never that this check
  // missed it, only that a single retry, adopted ONLY if strictly
  // better than the very first draft, has no recovery left when the
  // retry ALSO happens to invent something — the code fell back to the
  // still-flawed original rather than trying again. Rewritten as a
  // real loop, up to two retries, always keeping whichever attempt
  // (across all three) has the fewest total violations seen so far —
  // not just "is this retry better than the one immediately before
  // it," which is what let a tied-or-worse second attempt lose to an
  // already-bad first one.
  const missingReqTexts = gap.missing.map((req) => req.text);
  let coverMissingFigures = inventedFigures(bundle.text, coverBody);
  let coverProseViolations = humanWritingViolations(verifyProseQuality(coverBody, false, missingReqTexts));
  let bestViolationCount = coverMissingFigures.length + coverProseViolations.length;
  for (let attempt = 0; attempt < 2 && bestViolationCount > 0; attempt++) {
    const figureNote = coverMissingFigures.length
      ? `THE PREVIOUS DRAFT CITED FIGURES THAT DO NOT APPEAR IN THE SECTIONS: ${coverMissingFigures.slice(0, 20).join(", ")}\nRewrite the letter using only figures that appear verbatim in the sections, or no figures at all.\n`
      : "";
    const proseNote = coverProseViolations.length ? violationsToRetryNote(coverProseViolations) : "";
    const retry = await callAI({ system, user: `${userMsg}\n\n${figureNote}${proseNote}` });
    const fixed = String(retry.text || "").trim();
    if (!fixed) continue;
    const retryMissing = inventedFigures(bundle.text, fixed);
    const retryProse = humanWritingViolations(verifyProseQuality(fixed, false, missingReqTexts));
    const retryCount = retryMissing.length + retryProse.length;
    if (retryCount < bestViolationCount) {
      coverBody = fixed; coverMissingFigures = retryMissing; coverProseViolations = retryProse;
      bestViolationCount = retryCount;
    }
  }

  if (!coverBody?.trim() || coverMissingFigures.length || coverProseViolations.some(v => v.kind === 'gap_claim')) {
    return json({ error: 'cover_letter_facts_unresolved', message: 'The letter could not be verified against your information. No credits were charged.' }, 422);
  }

  const result = { body: coverBody };
  const completedCover = await completeJobDocument(adminCover, user.id, action, pendingCover, identity?.resume.id, result, COST_COVER);
  cacheSet(adminCover, cacheKey, user.id, "cover_letter_web", result, TAILOR_TTL);
  logAiCall(adminCover, {
    user_id: user.id, purpose: "cover_letter_web", duration_ms: Date.now() - coverStarted, cache_hit: false,
    source_map: identity?.sourceMap() || null, meta: { jd_chars: jdText.length, section_chars: bundle.chars },
  });
  return json(completedCover);
}

// ---------------- job_fit_advice ----------------
// v3.124.0 — real judgment, scoped deliberately. This app already tried
// an open-ended, judgment-giving AI surface once: the original seeker
// product was a free-form career chat, deleted (v3.8.0) for producing
// confident-sounding, ungrounded flattery and offering capabilities the
// product didn't have. This is not that. The verdict category below is
// decided in code from the same deterministic gap analysis tailor/match
// already compute — the model is never asked to judge fit, only to
// explain, in plain words, a verdict it did not choose. Free: this is
// reasoning over facts already computed for free by match/tailor, not
// new AI-written content like a resume or cover letter.
export async function handleJobFitAdvice(ctx: BaseCtx): Promise<Response> {
  const { supabaseUrl, serviceKey, action, payload, user } = ctx;
  const adminFit = createClient(supabaseUrl, serviceKey);
  { const off = await featureGate(adminFit, "tailoring"); if (off) return off; }
  { const blocked = await accountGate(adminFit, user.id, action); if (blocked) return blocked; }
  { const limited = await rateLimitGate(adminFit, user.id, action, 30, 15); if (limited) return limited; }
  const { jdText } = payload as { jdText: string };
  if (!jdText) return json({ error: "jdText required" }, 400);

  const identity = await loadIdentity(adminFit, user.id, {}).catch(() => null);
  // Same document and same evaluation function match/tailor now use --
  // this verdict has to agree with whatever score the person already
  // saw for this same resume and job, not compute its own separate one.
  const document = identity?.resume.raw;
  if (!document) return json({ error: "No saved resume available to score" }, 400);
  const { gap } = evaluateResumeDocument(document, jdText);

  const requiredTotal = gap.matched.length + gap.missing.length;
  const coverage = requiredTotal > 0 ? gap.matched.length / requiredTotal : 1;
  const verdict: "no_stated_requirements" | "strong_fit" | "worth_trying" | "significant_gaps" =
    requiredTotal === 0 ? "no_stated_requirements"
    : coverage >= 0.8 ? "strong_fit"
    : coverage >= 0.5 ? "worth_trying"
    : "significant_gaps";

  const fitSystem = `You explain, in plain honest language, whether this job is worth applying to for this candidate — grounded ONLY in the gap analysis given below, nothing else.

THE VERDICT IS ALREADY DECIDED IN CODE, NOT BY YOU. Yours is only to explain it: "${verdict}".
- strong_fit: most required things are matched. Say so plainly, name 1 or 2 real matched strengths from MATCHED below.
- worth_trying: a real mix. Name something genuinely matched, name something genuinely missing, do not oversell it.
- significant_gaps: more missing than matched. Say this plainly and honestly — do not soften it into false encouragement. It is fine, even useful, to say this one may not be worth the time right now.
- no_stated_requirements: the posting did not list clear, checkable requirements. Say that plainly instead of inventing a verdict from nothing.

RULES:
- Cite only items from MATCHED and MISSING below. Never invent a skill, a number, a company, or a reason not present in this data.
- Never promise an outcome ("you will get this job", "they will love you"). Never invent enthusiasm the data does not support.
- Never suggest a next step outside what this product actually does. No interview coaching, no salary negotiation advice, no general career planning. If real gaps exist, it is fine to note that tailoring the resume or being ready to speak to a specific gap in an interview is the realistic move — nothing beyond that.
- NO EM DASHES, NO EN DASHES, EVER, NO EXCEPTIONS. 3 to 5 sentences, plain language, no clichés. Must not read as AI-generated — no telltale AI phrasing, no uniform sentence rhythm, no overused connector words; write like an actual person would.

MATCHED (required items this resume already evidences): ${JSON.stringify(gap.matched.slice(0, 8).map((r) => r.text))}
MISSING (required items this resume does not evidence): ${JSON.stringify(gap.missing.slice(0, 8).map((r) => r.text))}
NICE TO HAVE, NOT REQUIRED: ${JSON.stringify(gap.niceToHave.slice(0, 5).map((r) => r.text))}`;

  // v3.312.0 — same loop-and-keep-best fix as the sibling checks in
  // rewrite/resume_generate/tailor/cover_letter.
  let r = await callAI({ system: fitSystem, user: "Write the verdict now." });
  let adviceViolations = humanWritingViolations(verifyProseQuality(r.text, false));
  let adviceBest = adviceViolations.length;
  for (let attempt = 0; attempt < 2 && adviceBest > 0; attempt++) {
    const retry = await callAI({ system: fitSystem, user: `Write the verdict now.\n\n${violationsToRetryNote(adviceViolations)}` });
    const retryViolations = humanWritingViolations(verifyProseQuality(retry.text, false));
    if (retryViolations.length < adviceBest) { r = retry; adviceViolations = retryViolations; adviceBest = retryViolations.length; }
  }
  return json({ verdict, coverage: Math.round(coverage * 100), advice: r.text });
}
