/**
 * v3.13.0 — verification assessments client.
 *
 * Every call goes to supabase/functions/resume-hub with a session JWT.
 * Nothing here can reach a rubric, a score, or a verdict on the candidate
 * lane: those live in tables the anon and authenticated roles have no
 * privileges on at all, and no candidate action returns them.
 */
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL } from "@/config";

const FN = `${SUPABASE_URL}/functions/v1/resume-hub`;

async function call<T>(body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const r = await fetch(FN, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = { error: text }; }
  if (!r.ok) throw new Error((parsed as { error?: string })?.error || `Request failed (${r.status})`);
  return parsed as T;
}

/** What the candidate is allowed to see. There is no rubric field here. */
export type PubQuestion = {
  id: string;
  type: "mc" | "short";
  text: string;
  options?: string[];
};

export type AssessmentStatus = "sent" | "started" | "submitted" | "expired";

/** Employer view. `result` is null until the candidate submits. */
export type EmployerAssessment = {
  id: string;
  ref: string | null;
  search_id: string | null;
  job_title: string | null;
  status: AssessmentStatus;
  question_count: number;
  time_limit_seconds: number;
  sent_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  expires_at: string | null;
  result: {
    overall_score: number;
    verification_verdict: "consistent" | "partly consistent" | "inconsistent";
    per_question: Array<{
      id: string; question: string; answer: string;
      seconds_spent: number; score: number; observed: string;
    }>;
    strengths: string[];
    concerns: string[];
    employer_summary: string;
  } | null;
};

/** Candidate view. No score, no verdict, no observation, by design. */
export type SeekerAssessment = {
  id: string;
  org_name: string;
  org_logo_url: string | null;
  job_title: string;
  status: AssessmentStatus;
  question_count: number;
  time_limit_seconds: number;
  sent_at: string | null;
  expires_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  deadline_at: string | null;
};

export type StartedAssessment = {
  id: string;
  org_name: string;
  job_title: string;
  questions: PubQuestion[];
  answers: Record<string, { answer?: string; ms?: number }>;
  deadline_at: string;
  seconds_left: number;
};

export const assessmentApi = {
  // Employer lane
  generate: (org_id: string, search_id: string, ref: string) =>
    call<{ assessment_id: string; job_title: string; questions: PubQuestion[] }>({
      action: "employer_assessment_generate", org_id, search_id, ref,
    }),
  send: (assessment_id: string, keep_ids: string[], time_limit_seconds: number, expires_days: number) =>
    call<{ ok: true }>({
      action: "employer_assessment_send", assessment_id, keep_ids, time_limit_seconds, expires_days,
    }),
  employerList: (search_id?: string) =>
    call<{ assessments: EmployerAssessment[] }>({ action: "employer_assessment_list", search_id }),

  // Candidate lane
  list: () => call<{ assessments: SeekerAssessment[] }>({ action: "assessment_list" }),
  start: (id: string) => call<StartedAssessment>({ action: "assessment_start", id }),
  answer: (id: string, question_id: string, answer: string, ms: number) =>
    call<{ ok: true }>({ action: "assessment_answer", id, question_id, answer, ms }),
  submit: (id: string) => call<{ ok: true; org_name: string }>({ action: "assessment_submit", id }),
  /** The growth note only. Never the assessment content or how they scored. */
  growthNotes: () => call<{ notes: string[] }>({ action: "assessment_growth_notes" }),
};

/** One honest line the employer UI must always show. */
export const ASSESSMENT_LIMIT_NOTE =
  "This checks depth of experience. It cannot prove someone answered unaided.";
