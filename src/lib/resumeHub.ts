import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL } from "@/config";
import { maintenanceErrorFrom } from "@/lib/featureError";

const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  return {
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    "Content-Type": "application/json",
  };
}

async function call<T>(fn: string, body: unknown): Promise<T> {
  const headers = await authHeaders();
  const r = await fetch(`${FUNCTIONS_BASE}/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = { error: text }; }
  if (!r.ok) {
    const maintenance = maintenanceErrorFrom(data);
    if (maintenance) throw maintenance;
    // v3.28.0 — suspension and per account restrictions answer with a code and
    // a written message. Show the message, not the code.
    const coded = data as { code?: string; message?: string; error?: string };
    if (coded?.code === "account_suspended" || coded?.code === "account_restricted" || coded?.code === "insufficient_credits") {
      throw new Error(coded.message || "This account cannot do that right now.");
    }
    throw new Error(coded?.error || `Request failed (${r.status})`);
  }
  return data as T;
}

// v3.200.0 — the one action on this whole page that deliberately works
// with no session: resume_check_public. Calling call() would throw "Not
// signed in" before the request ever goes out, so this is its own small
// helper -- same fetch, same apikey header every call already needs, just
// no Authorization header to omit.
export interface ResumeCheckPublicResult {
  matched: string[];
  missing: string[];
  niceToHave: string[];
  matchPct: number | null;
}

export async function resumeCheckPublic(resumeText: string, jdText: string): Promise<ResumeCheckPublicResult> {
  const r = await fetch(`${FUNCTIONS_BASE}/resume-hub`, {
    method: "POST",
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "resume_check_public", resumeText, jdText }),
  });
  const text = await r.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = { error: text }; }
  if (!r.ok) {
    const coded = data as { error?: string };
    throw new Error(coded?.error || `Request failed (${r.status})`);
  }
  return data as ResumeCheckPublicResult;
}

// v3.265.0 — the auto-apply answer bank matcher. Takes the real question
// labels read off a job application form and gets back, per question,
// either the user's own already-stored real answer or null (meaning no
// real ground truth exists and the person has to type it themselves —
// never a guessed one). See supabase/functions/resume-hub/lib/applicationAnswers.ts.
export interface ApplicationAnswerResult {
  fieldId: string;
  label: string;
  matchedType: string | null;
  answer: string | null;
  confidence: number;
}

export async function applicationAnswerMatch(
  questions: Array<{ id: string; label: string }>,
): Promise<ApplicationAnswerResult[]> {
  const r = await call<{ results: ApplicationAnswerResult[] }>("resume-hub", {
    action: "application_answer_match",
    questions,
  });
  return r.results;
}

// v3.266.0 — auto-apply. Two real, honest outcomes per job, decided by the
// employer's own application form, not guessed at up front: a real,
// fillable form (the normal case, returns fields/matches), or a wall this
// can't cross (signinRequired: the employer's own site needs the person's
// own account; extractionFailed: the form couldn't be read at all, usually
// active bot-blocking). Neither is an error — both are shown to the person
// with an "open it yourself" fallback, never silently dropped.
export interface AutoApplyIdentityMatch { fieldId: string; label: string; role: string; value: string | null }
export interface AutoApplyRadioMatch {
  groupName: string; groupLabel: string;
  resolvedAnswer: string | null; chosenFieldId: string | null; chosenOptionLabel: string | null;
}
export interface AutoApplyExtractResult {
  signinRequired?: boolean;
  extractionFailed?: boolean;
  reason?: string;
  job?: { id: string; company: string; title: string; url: string };
  applyUrl?: string;
  radioMatches?: AutoApplyRadioMatch[];
  identityMatches?: Record<string, AutoApplyIdentityMatch>;
  answerMatches?: ApplicationAnswerResult[];
  fileFields?: Array<{ id: string; label: string }>;
}
export function autoApplyExtract(jobId: string): Promise<AutoApplyExtractResult> {
  return call<AutoApplyExtractResult>("resume-hub", { action: "auto_apply_extract", jobId });
}

export interface AutoApplyFillResult {
  ok: boolean;
  filled?: number;
  failed?: string[];
  submitted?: boolean;
  submitError?: string;
  finalUrl?: string;
  screenshotBase64?: string;
  chargedCredits: number;
}
export function autoApplyFill(params: {
  jobId: string;
  applyUrl?: string;
  textValues: Array<{ label: string; value: string; isIdentity?: boolean }>;
  radioSelections?: Array<{ groupLabel: string; optionLabel: string }>;
  resumeLabel?: string; resumeFileUrl?: string;
  coverLetterLabel?: string; coverLetterFileUrl?: string;
  submit?: boolean;
}): Promise<AutoApplyFillResult> {
  return call<AutoApplyFillResult>("resume-hub", { action: "auto_apply_fill", ...params });
}

export interface GuidedIntakeExtraction {
  experiences: Array<{ company: string; title: string; location?: string; start?: string; end?: string; current?: boolean; bullets: string[] }>;
  education: Array<{ school: string; degree?: string; field?: string; start?: string; end?: string }>;
  skills: string[];
  certifications?: string[];
  derived?: { current_title?: string; current_company?: string; total_yoe?: number };
}

/** applicable:false covers both "the answer was too vague to use" and "the
 * result was blocked for containing a number/company the person never
 * actually said" — both cases mean nothing changed, the caller doesn't
 * need to distinguish them beyond an honest "didn't apply". */
export interface GapProbeResult {
  applicable: boolean;
  kind?: "bullet" | "new_work_entry" | "summary" | "none";
  revised_bullet?: string;
  new_work_entry?: { company?: string; title?: string; start?: string; end?: string; bullets?: string[] };
  revised_summary?: string;
}

export interface ResumeContent {
  basics?: {
    name?: string; title?: string; email?: string; phone?: string;
    location?: string; summary?: string;
    links?: Array<{ label: string; url: string }>;
  };
  work?: Array<{ company: string; title: string; location?: string; start?: string; end?: string; bullets: string[] }>;
  education?: Array<{ school: string; degree?: string; field?: string; start?: string; end?: string }>;
  skills?: string[];
  /** Presentation-only grouping of `skills` into category labels for a
   * nicer downloaded document — every skill here must also appear in the
   * flat `skills` array above verbatim, since that's what tailoring's gap
   * matcher, the ATS rubric, and candidate search all still read. Optional:
   * older resumes and a resume with too few skills to group won't have it. */
  skillGroups?: Array<{ category: string; skills: string[] }>;
  projects?: Array<{ name: string; description?: string; url?: string }>;
  certifications?: string[];
}

export const resumeHubApi = {
  parseFile: (fileBase64: string, mimeType: string) =>
    call<{ resume: ResumeContent; plainText: string }>("resume-hub", { action: "parse_file", fileBase64, mimeType }),
  /** Free: content-quality read only, no rewrite. Pass resumeId to cache the score onto that row. */
  diagnose: (resume: ResumeContent, resumeId?: string) =>
    call<{ ats_score: number; verdict: "Poor" | "Fair" | "Good" | "Strong"; issues: string[] }>(
      "resume-hub", { action: "resume_diagnose", resume, resumeId },
    ),
  /** Paid (15 credits): the actual rewrite. idempotencyKey: see tailor's doc comment. */
  rewrite: (resume: ResumeContent, jdText?: string, idempotencyKey?: string) =>
    call<{ resume: ResumeContent; ats_score: number; verdict: string; issues: string[]; suggestions: string[]; credits: { spent: number; balance: number } }>(
      "resume-hub", { action: "rewrite", resume, jdText, idempotency_key: idempotencyKey },
    ),

  // v3.120.0 — for someone with no resume yet: a guided interview replaces
  // the upload step, then this same paid rewrite tier builds the document.
  /** Free: structures a plain-language interview into the same career shape Profile already edits. */
  guidedIntakeExtract: (answers: Array<{ question: string; answer: string }>) =>
    call<GuidedIntakeExtraction>("resume-hub", { action: "guided_intake_extract", answers }),
  // v3.133.0 — fixing one specific flagged weak point (a thin bullet, an
  // unexplained gap, a generic summary) instead of rebuilding from nothing.
  // Free, same "structure only what they said, never invent" role as
  // guidedIntakeExtract above. applicable:false means the answer was too
  // vague to honestly use — nothing to apply, nothing changed.
  /** Free: turns one honest answer about one flagged weak point into resume content, or declines if too vague to use honestly. */
  gapProbe: (issue: string, question: string, answer: string) =>
    call<GapProbeResult>("resume-hub", { action: "resume_gap_probe", issue, question, answer }),
  /** Paid (15 credits): builds a full resume from the caller's own profile, server side — no upload required. idempotencyKey: see tailor's doc comment. */
  generateResume: (idempotencyKey?: string) =>
    call<{ resume: ResumeContent; ats_score: number; verdict: string; issues: string[]; suggestions: string[]; credits: { spent: number; balance: number } }>(
      "resume-hub", { action: "resume_generate", idempotency_key: idempotencyKey },
    ),
  // v3.72.0 — these three no longer take a resume blob from the client.
  // The backend resolves the caller's own primary resume plus their full
  // canonical profile server side (the same way the extension already did),
  // so the client can't send stale or partial content and there's nothing
  // to keep in sync on this side.
  match: (jdText: string) =>
    call<{ score: number; breakdown: Record<string, number>; missing_keywords: string[]; summary: string }>("resume-hub", { action: "match", jdText }),
  /** idempotencyKey: pass the same value on a retry of a failed attempt so
   * the server recognizes it and doesn't charge twice if the first attempt
   * actually succeeded server side despite the client never seeing it. */
  /** jobTitle: the posting's own title, used to decide (in code, not by the
   * model) whether the resume header can safely align to it -- see
   * resolveTailorTitle's own comment for the seniority-inflation guard. */
  tailor: (jdText: string, idempotencyKey?: string, jobTitle?: string) =>
    call<{ resume: ResumeContent; gapAnalysis?: { missing: string[]; matchPct: number | null } }>("resume-hub", { action: "tailor", jdText, jobTitle, idempotency_key: idempotencyKey }),

  coverLetter: (jdText: string, opts?: { tone?: string; company?: string; idempotencyKey?: string }) =>
    call<{ body: string }>("resume-hub", { action: "cover_letter", jdText, tone: opts?.tone, company: opts?.company, idempotency_key: opts?.idempotencyKey }),

  // v2.9.0-A — Talent pool consent + status.
  // v3.2.0 — also returns the employer preview, skills with provenance, and
  // the freshness timestamps the Hub shows.
  // v3.5.1 — talentPoolSet carries the consent wording version the user saw.
  talentPoolGet: () =>
    call<TalentPoolStatus>("resume-hub", { action: "talent_pool_get" }),
  talentPoolSet: (opted_in: boolean, consent_version?: string) =>
    call<{ ok: true; opted_in: boolean }>("resume-hub", { action: "talent_pool_set", opted_in, consent_version }),


  // v2.9.1 — manual re-index for the caller (also fired after client writes).
  talentPoolReindexSelf: () =>
    call<{ model: string; skills_count: number }>("resume-hub", { action: "talent_pool_reindex_self" }),

  // v3.134.0 — Browse Jobs. Free, deterministic-only (no AI call), scores a
  // whole page of job_postings rows against the caller's own profile using
  // the same coverage formula job_fit_advice already uses. The listing
  // itself (company/title/location/apply_url/posted_at) is read directly
  // from job_postings via Supabase, not through this action — RLS already
  // allows any authenticated user to read that table, same as resumes/
  // user_profile_canonical are read directly elsewhere in this app.
  jobBoardScore: (jobs: Array<{ id: string; title: string; description: string; skills?: string[] | null }>) =>
    call<{ scores: Array<{ id: string; match_pct: number | null }> }>(
      "resume-hub", { action: "job_board_score", jobs },
    ),

  // v3.151.0 — free, zero-AI: real job titles from the live job_postings
  // catalog that already score well against the caller's own profile,
  // grouped so "openings" is a real, current count, never a guessed
  // demand label.
  roleFinder: () =>
    call<{ roles: Array<{ title: string; match_pct: number; openings: number; companies: string[]; sample_job_id: string }>; has_profile: boolean }>(
      "resume-hub", { action: "role_finder" },
    ),

  // v3.166.0 — free, zero-AI: real posting volume over the last 3 days,
  // nationally and (when a city is passed) scoped to it too. Never
  // freehire's own view/applied counts (confirmed almost always zero in a
  // live sample), just a real count of what's actually landing.
  jobBoardTrending: (city?: string | null) =>
    call<{
      national: { byCategory: Array<{ category: string; count: number }>; byCompany: Array<{ company: string; count: number }> };
      city: { name: string; byCategory: Array<{ category: string; count: number }>; byCompany: Array<{ company: string; count: number }> } | null;
    }>("resume-hub", { action: "job_board_trending", city: city || undefined }),
};

export interface JobPosting {
  id: string;
  source: string;
  company: string;
  // v3.135.0 — resolved by job-board-sync from freehire's own /companies
  // endpoint (a favicon-by-domain lookup), null when no website is on file
  // or the lookup hasn't happened yet — BrowseJobs.tsx falls back to a
  // colored-initial mark either way.
  company_logo_url?: string | null;
  // v3.169.0 — read by BrowseJobs.tsx's own client-side favicon fallback
  // when company_logo_url is null, since Greenhouse/Lever/Ashby's own APIs
  // (unlike freehire's) never return a logo at all.
  company_slug?: string | null;
  title: string;
  description: string;
  location: string | null;
  apply_url: string;
  posted_at: string;
  // v3.166.0 — freehire's own structured enrichment, captured at ingestion.
  // All nullable: real, not fabricated for the rows freehire didn't tag.
  employment_type?: string | null;
  seniority?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  category?: string | null;
  work_mode?: string | null;
  city?: string | null;
  skills?: string[] | null;
}

export interface PoolSkill {
  id: string;
  skill: string;
  provenance: "extracted" | "inferred" | string;
  source: string | null;
}

export interface TalentPoolStatus {
  /** v3.28.0 — an admin has taken this profile out of the pool. */
  discovery_restricted?: boolean;
  discovery_restriction_reason?: string;
  opted_in: boolean;
  consented_at: string | null;
  /** v3.5.1 — which consent wording the user agreed to. */
  consent_version?: string | null;
  indexed: boolean;

  skills_count: number;
  preview: {
    headline: string;
    seniority: string;
    location: string;
    years_experience: number | null;
    indexed_at: string | null;
    embedding_model: string | null;
  } | null;
  skills: PoolSkill[];
  indexed_at: string | null;
  resume_updated_at: string | null;
  profile_updated_at: string | null;
}

