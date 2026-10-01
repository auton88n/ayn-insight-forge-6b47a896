// Resume Hub — unified AI edge function.
// Actions: hub lane (profile, resumes, jobs, proposals, assessments) and
// employer lane.
// Auth: requires the caller's Supabase JWT (Authorization: Bearer ...).
// All DB writes use the caller's JWT so RLS enforces per-user isolation.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

// v3.1.0 — structured sections (no truncation), deterministic gap analysis,
// figure preservation, result cache, company context, AI telemetry.
import { computeGap } from "../_shared/tailoring.ts";

// v3.131.0 — stage 1 of the monolith reorganization: pure, self-contained
// utilities with no dependency on a live request's closure state. See
// lib/utils.ts's own header comment for the full rationale and scope.
import { corsHeaders, json } from "./lib/utils.ts";
// v3.131.0 — stage 2: every "can this request proceed" gate. See
// lib/gates.ts's own header comment.
import { featureGate, ACTION_FLAG, accountGate, logSecurityEvent, shouldEscalate } from "./lib/gates.ts";
// v3.131.0 — stage 3: the AI gateway call and its usage telemetry. See
// lib/ai.ts's own header comment.
import { withAiContext, setAiCtx } from "./lib/ai.ts";

// v3.324.0 — stage 12 of the monolith reorganization: the employer-gate
// helpers (isApprovedEmployer, assertOrgMember, assertOrgProfileComplete,
// and the constants they use) that used to be closures defined inline
// inside the dispatcher. See lib/employerContext.ts's own header comment.
import { isApprovedEmployer as isApprovedEmployerImpl, assertOrgMember as assertOrgMemberImpl, assertOrgProfileComplete as assertOrgProfileCompleteImpl } from "./lib/employerContext.ts";

// v3.324.0 — stage 14: assessment-specific shared logic, including the
// grading function (finaliseAssessment). See lib/assessmentHelpers.ts's
// own header comment.
import { finaliseAssessment as finaliseAssessmentImpl } from "./lib/assessmentHelpers.ts";
// v3.325.0 — stage 15+: the shared ActionCtx type. See lib/actionCtx.ts's
// own header comment.
import type { ActionCtx, BaseCtx } from "./lib/actionCtx.ts";
// Stage 21: the seeker-facing document, per-job and Browse Jobs actions that
// used to be inline blocks in this dispatcher. See each file's header comment.
import { handleParseFile, handleResumeDiagnose, handleRewrite, handleGuidedIntakeExtract, handleResumeGapProbe, handleResumeGenerate } from "./lib/resumeDocumentActions.ts";
import { handleMatch, handleTailor, handleCoverLetter, handleJobFitAdvice } from "./lib/jobDocumentActions.ts";
import { handleJobBoardScore, handleRoleFinder, handleJobBoardTrending, handleResumeCheckPublic } from "./lib/jobBoardActions.ts";
// v3.325.0 — stage 15: plans/billing/admin-employer-queue action handlers.
// See lib/billingAdminActions.ts's own header comment.
import { handlePlansList, handleBillingGet, handleEmployerBillingGet, handleBillingUpgradeIntent, handleAdminEmployerList, handleAdminEmployerDecide } from "./lib/billingAdminActions.ts";
// v3.325.0 — stage 16: canonical-profile CRUD and Talent Pool actions. See
// lib/profileTalentPoolActions.ts's own header comment.
import { handleProfileCanonicalGet, handleProfileCanonicalExtract, handleProfileCanonicalSave, handleTalentPoolGet, handleLegalConsentRecord, handleTalentPoolSet, handleTalentPoolReindexSelf } from "./lib/profileTalentPoolActions.ts";
// v3.326.0 — stage 17: company profile CRUD, intake drafts, spec
// extraction, skill catalog, and the two post-search AI writers. See
// lib/employerOrgActions.ts's own header comment.
import { handleEmployerOrgCreate, handleEmployerOrgGet, handleEmployerOrgUpdate, handleEmployerIntakeDraftGet, handleEmployerIntakeDraftSave, handleEmployerIntakeDraftClear, handleEmployerSpecExtract, handleEmployerSkillCatalog, handleEmployerCardAnswer, handleEmployerDraftProposal } from "./lib/employerOrgActions.ts";
// v3.327.0 — stage 18: employer_match, the candidate-search pipeline
// itself. See lib/employerMatchAction.ts's own header comment.
import { handleEmployerMatch } from "./lib/employerMatchAction.ts";
// v3.328.0 — stage 19: the proposal lifecycle and the two-way inbox. See
// lib/proposalInboxActions.ts's own header comment.
import { handleEmployerRevealRequest, handleRevealList, handleInboxSend, handleInboxListThreads, handleInboxMarkRead, handleInboxSetTwoWay, handleInboxBlockCandidate, handleRevealDecide, handleEmployerRevealStatus } from "./lib/proposalInboxActions.ts";
// v3.329.0 — stage 20: the employer-side assessment generate/send/list
// actions and the candidate-side start/answer/submit/growth-notes
// actions. See lib/assessmentActions.ts's own header comment.
import { handleEmployerAssessmentGenerate, handleEmployerAssessmentSend, handleEmployerAssessmentList, handleAssessmentList, handleAssessmentStart, handleAssessmentAnswer, handleAssessmentSubmit, handleAssessmentGrowthNotes } from "./lib/assessmentActions.ts";

Deno.serve((req) => withAiContext(async () => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // v3.132.0 — error_logs previously only ever heard from the frontend
  // ErrorBoundary; every backend action failure landed here as a console
  // line and nothing else, invisible to error-alert-check's burst check.
  // Captured outside the try so the catch below can still name the action
  // that failed even though `action` itself is scoped inside the try.
  let erroredAction: string | undefined;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json();
    const { action, ...payload } = body;
    erroredAction = typeof action === "string" ? action : undefined;

    // v3.200.0 — the one deliberate, explicit exception to "every action
    // requires a JWT" (see the header comment above). A small, hardcoded
    // allowlist checked before the auth requirement, not a broad bypass --
    // mirrors the same shape the extension's own retired PUBLIC LINK FLOW
    // used for its pre-auth actions. Anything added here must be safe to
    // run with zero cost and zero account, by construction: no AI call, no
    // outbound fetch, no write. resume_check_public is pure text-in,
    // deterministic-logic-out (computeGap, already free elsewhere in this
    // file) -- real accuracy same as the signed-in quick score, zero
    // dollar cost regardless of how many strangers call it.
    const PUBLIC_ACTIONS = new Set(["resume_check_public"]);
    if (PUBLIC_ACTIONS.has(action)) {
      if (action === "resume_check_public") return handleResumeCheckPublic(payload);
    }

    // ============ DASHBOARD ACTIONS (Supabase JWT) ============
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const reqIp = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || null;
    if (!jwt) {
      await logSecurityEvent(createClient(supabaseUrl, serviceKey), null, "api_no_auth", "medium", { action }, reqIp);
      return json({ error: "Missing Authorization" }, 401);
    }

    const supa = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: u } = await supa.auth.getUser();
    const user = u?.user;
    if (!user) {
      await logSecurityEvent(createClient(supabaseUrl, serviceKey), null, "api_invalid_session", "medium", { action }, reqIp);
      return json({ error: "Invalid session" }, 401);
    }


    setAiCtx(createClient(supabaseUrl, serviceKey), user.id, String(action || 'unknown'));

    const baseCtx: BaseCtx = { req, supabaseUrl, anonKey, serviceKey, action, payload, jwt, reqIp, supa, user };

    // Actions extracted into lib/ (see each file's header comment).
    if (action === "parse_file") return await handleParseFile(baseCtx);
    if (action === "resume_diagnose") return await handleResumeDiagnose(baseCtx);
    if (action === "rewrite") return await handleRewrite(baseCtx);
    if (action === "guided_intake_extract") return await handleGuidedIntakeExtract(baseCtx);
    if (action === "resume_gap_probe") return await handleResumeGapProbe(baseCtx);
    if (action === "resume_generate") return await handleResumeGenerate(baseCtx);
    if (action === "match") return await handleMatch(baseCtx);
    if (action === "tailor") return await handleTailor(baseCtx);
    if (action === "cover_letter") return await handleCoverLetter(baseCtx);
    if (action === "job_fit_advice") return await handleJobFitAdvice(baseCtx);
    if (action === "job_board_score") return await handleJobBoardScore(baseCtx);
    if (action === "role_finder") return await handleRoleFinder(baseCtx);
    if (action === "job_board_trending") return await handleJobBoardTrending(baseCtx);

    // ── NEW ACTIONS (JWT auth) ──
    // These run after JWT validation using supa client with RLS
    const userId = user.id;
    const adminForNew = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // isApprovedEmployer/assertOrgMember/assertOrgProfileComplete/
    // finaliseAssessment now live in lib/employerContext.ts and
    // lib/assessmentHelpers.ts (imported at the top of this file). Local
    // wrappers so every call site below (20+ of them, some as early as
    // employer_billing_get just below) keeps its original, shorter call
    // shape instead of threading adminForNew/userId/action through each
    // one by hand. Declared here, immediately after adminForNew/userId
    // exist, not near whichever action handler used to sit next to their
    // old inline definitions -- the originals were hoisted `async
    // function` declarations, callable from anywhere in this scope
    // regardless of where they were textually written; a `const` arrow
    // function is not hoisted the same way, so it has to be declared
    // ahead of literally every call site, including ones earlier in the
    // file than where the old definitions used to sit.
    const isApprovedEmployer = () => isApprovedEmployerImpl(adminForNew, userId, action);
    const assertOrgMember = (orgId: string) => assertOrgMemberImpl(adminForNew, userId, action, orgId);
    const assertOrgProfileComplete = (orgId: string) => assertOrgProfileCompleteImpl(adminForNew, orgId);
    const finaliseAssessment = (assessmentId: string) => finaliseAssessmentImpl(adminForNew, assessmentId);
    // v3.24.0 — every AI call made below is attributed to this person and action.
    setAiCtx(adminForNew, userId, String(action || "unknown"));
    { const off = await featureGate(adminForNew, "platform"); if (off) return off; }
    // v3.25.0 — one place that says which switch owns which action. Reading
    // history (assessment_list, employer_assessment_list) is never gated.
    {
      const owner = ACTION_FLAG[String(action || "")];
      if (owner) { const off = await featureGate(adminForNew, owner); if (off) return off; }
    }
    // v3.28.0 — the same shape, one account at a time. Global switch first,
    // then this person's suspension, then the capability they are restricted from.
    {
      const blocked = await accountGate(adminForNew, userId, String(action || ""));
      if (blocked) return blocked;
    }




    // ─────────────────────────────────────────────────────────────
    // v3.14.0 — Billing
    // ─────────────────────────────────────────────────────────────
    const isPlatformAdmin = async (): Promise<boolean> => {
      const { data } = await adminForNew.from("user_roles")
        .select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      const ok = !!data;
      // Sept 2026 security review — a valid, signed-in but non-admin
      // account calling an admin-gated action is a much stronger signal
      // than a routine denial: it means someone already has a real
      // session and is deliberately probing for admin-only capability.
      // Escalation throttled per (user, reason): the event is always
      // logged, only the real-time email is capped to once per window, so
      // repeated retries can't flood the founder's inbox.
      if (!ok) {
        const escalate = await shouldEscalate(adminForNew, userId, "admin_action_denied");
        await logSecurityEvent(adminForNew, userId, "admin_action_denied", escalate ? "high" : "medium", { action });
      }
      return ok;
    };

    // v3.325.0 — stage 15+: the shared context every extracted "NEW
    // ACTIONS"-era handler file takes as its one explicit parameter,
    // instead of closing over this dispatcher's own scope. See
    // lib/actionCtx.ts's own header comment.
    const ctx: ActionCtx = {
      req, supabaseUrl, anonKey, serviceKey, action, payload, jwt, reqIp,
      supa, user, userId, admin: adminForNew,
      isApprovedEmployer, assertOrgMember, assertOrgProfileComplete, finaliseAssessment,
      isPlatformAdmin,
    };

    // v3.325.0 — plans/billing/admin-employer-queue actions moved to
    // lib/billingAdminActions.ts. See that file's own header comment.
    if (action === "plans_list") return await handlePlansList(ctx);
    if (action === "billing_get") return await handleBillingGet(ctx);
    if (action === "employer_billing_get") return await handleEmployerBillingGet(ctx);
    if (action === "billing_upgrade_intent") return await handleBillingUpgradeIntent(ctx);
    if (action === "admin_employer_list") return await handleAdminEmployerList(ctx);
    if (action === "admin_employer_decide") return await handleAdminEmployerDecide(ctx);





    // ---------------- Canonical Profile (Phase 1) ----------------
    // profile_canonical_get: load the saved canonical profile (empty shell if none)
    // v3.325.0 — canonical-profile CRUD and Talent Pool actions moved to
    // lib/profileTalentPoolActions.ts. See that file's own header comment.
    if (action === "profile_canonical_get") return await handleProfileCanonicalGet(ctx);
    if (action === "profile_canonical_extract") return await handleProfileCanonicalExtract(ctx);
    if (action === "profile_canonical_save") return await handleProfileCanonicalSave(ctx);
    if (action === "talent_pool_get") return await handleTalentPoolGet(ctx);
    if (action === "legal_consent_record") return await handleLegalConsentRecord(ctx);
    if (action === "talent_pool_set") return await handleTalentPoolSet(ctx);
    if (action === "talent_pool_reindex_self") return await handleTalentPoolReindexSelf(ctx);





    // ─────────────────────────────────────────────────────────────
    // v2.9.0-B — Employer marketplace (Phase B)
    // Two-step noise cancellation:
    //   1. Deterministic prefilter: EVERY must-have must match an
    //      'extracted' skill (skill_norm or ≥0.8 token overlap).
    //      Inferred skills cannot rescue a missing must-have.
    //   2. AI rerank on ≤12 vector-recalled candidates, with opaque
    //      refs (no user_id/name/email), scored 1-100, inferred cap
    //      10 pts, "why" grounded in provided fields only.
    // ─────────────────────────────────────────────────────────────

    // v3.326.0 — company profile CRUD, intake-draft autosave, spec
    // extraction, skill catalog, and the two post-search AI writers moved
    // to lib/employerOrgActions.ts. See that file's own header comment.
    if (action === "employer_org_create") return await handleEmployerOrgCreate(ctx);
    if (action === "employer_org_get") return await handleEmployerOrgGet(ctx);
    if (action === "employer_org_update") return await handleEmployerOrgUpdate(ctx);
    if (action === "employer_intake_draft_get") return await handleEmployerIntakeDraftGet(ctx);
    if (action === "employer_intake_draft_save") return await handleEmployerIntakeDraftSave(ctx);
    if (action === "employer_intake_draft_clear") return await handleEmployerIntakeDraftClear(ctx);
    if (action === "employer_spec_extract") return await handleEmployerSpecExtract(ctx);
    if (action === "employer_skill_catalog") return await handleEmployerSkillCatalog(ctx);
    // v3.9.0 — the free-form results chat is gone. It produced a wrong role
    // reference, a self contradiction about years of experience, and it leaked
    // the internal ref "c1" to the employer. Two structured actions replace it:
    // employer_card_answer (four fixed questions, grounded in the stored cards)
    // and employer_draft_proposal (a pre-written proposal message).
    // Neither ever loads PII: the stored cards are opaque refs only.
    if (action === "employer_card_answer") return await handleEmployerCardAnswer(ctx);
    if (action === "employer_draft_proposal") return await handleEmployerDraftProposal(ctx);

    // v3.327.0 — employer_match moved to lib/employerMatchAction.ts.
    // See that file's own header comment.
    if (action === "employer_match") return await handleEmployerMatch(ctx);

    // v3.328.0 — the proposal lifecycle and the inbox built on top of it
    // moved to lib/proposalInboxActions.ts. See that file's own header
    // comment.
    if (action === "employer_reveal_request") return await handleEmployerRevealRequest(ctx);
    if (action === "reveal_list") return await handleRevealList(ctx);
    if (action === "inbox_send") return await handleInboxSend(ctx);
    if (action === "inbox_list_threads") return await handleInboxListThreads(ctx);
    if (action === "inbox_mark_read") return await handleInboxMarkRead(ctx);
    if (action === "inbox_set_two_way") return await handleInboxSetTwoWay(ctx);
    if (action === "inbox_block_candidate") return await handleInboxBlockCandidate(ctx);
    if (action === "reveal_decide") return await handleRevealDecide(ctx);
    if (action === "employer_reveal_status") return await handleEmployerRevealStatus(ctx);

    // ═══════════════════════════════════════════════════════════
    // v3.13.0 — VERIFICATION ASSESSMENTS
    //
    // An employer can send a short assessment before deciding whether to
    // send a proposal. Questions are generated from THAT candidate's own
    // profile and probe depth of lived experience, not textbook knowledge.
    //
    // ISOLATION OF THE RUBRIC AND THE RESULT (the security property):
    //   - assessments.questions stores ONLY {id, type, text, options}.
    //     The rubric is never written into that column.
    //   - Rubrics live in public.assessment_rubrics, which has ALL
    //     privileges revoked from anon and authenticated. Same for
    //     public.assessment_results. Both are service_role only, and RLS
    //     is on with zero policies, so even a leaked grant denies reads.
    //   - No candidate-lane action here ever returns a rubric, a score,
    //     a verdict, or a per-question observation.
    // ═══════════════════════════════════════════════════════════
    // v3.329.0 — the employer-side assessment generate/send/list actions
    // and the candidate-side start/answer/submit/growth-notes actions
    // moved to lib/assessmentActions.ts. See that file's own header
    // comment for the security boundary this whole domain enforces.
    if (action === "employer_assessment_generate") return await handleEmployerAssessmentGenerate(ctx);
    if (action === "employer_assessment_send") return await handleEmployerAssessmentSend(ctx);
    if (action === "employer_assessment_list") return await handleEmployerAssessmentList(ctx);
    if (action === "assessment_list") return await handleAssessmentList(ctx);
    if (action === "assessment_start") return await handleAssessmentStart(ctx);
    if (action === "assessment_answer") return await handleAssessmentAnswer(ctx);
    if (action === "assessment_submit") return await handleAssessmentSubmit(ctx);
    if (action === "assessment_growth_notes") return await handleAssessmentGrowthNotes(ctx);

    return json({ error: "Unknown action" }, 400);

  } catch (e) {
    console.error("resume-hub error", e);
    // Best effort only, same rule as every notify* helper in this file: a
    // logging failure must never mask or replace the real error response.
    try {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await admin.from("error_logs").insert({
        error_message: e instanceof Error ? e.message : String(e),
        error_stack: e instanceof Error ? (e.stack || null) : null,
        source: "backend",
        severity: "error",
        endpoint: erroredAction || null,
      });
    } catch { /* never blocks the real response below */ }
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}));
