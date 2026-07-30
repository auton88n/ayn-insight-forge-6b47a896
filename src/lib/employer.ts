// v2.9.0-B — Employer marketplace client. Session-JWT web-lane calls to
// supabase/functions/resume-hub. All employer actions are gated server-side
// on org_members; the ref_map that links anonymous refs to real users
// never leaves the edge function.
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

/** v3.10.0 — the company profile lives on orgs, and candidates read it. */
export type Org = {
  id: string;
  name: string;
  website: string | null;
  industry?: string | null;
  company_size?: string | null;
  headquarters?: string | null;
  about?: string | null;
  logo_url?: string | null;
  linkedin_url?: string | null;
};

export type OrgPatch = Partial<Omit<Org, "id">>;

/** v3.10.0 — an intake in progress, saved after every answered step. */
export type IntakeDraft = {
  opening: string;
  job_spec: Partial<JobSpec>;
  answered: string[];
  phase: string;
  updated_at?: string;
};

export type JobSpec = {
  title: string;
  seniority: string;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  location_preference?: string;
  /** v3.8.0 — onsite, hybrid or remote. */
  work_mode?: string;
  /** v3.8.0 — full_time, contract, part_time or internship. */
  employment_type?: string;
  remote_ok?: boolean;
  min_years?: number;
  /** v3.8.0 — authorized_required or open_to_sponsoring. */
  work_authorization?: string;
  notes?: string;
};

export type CandidateCard = {
  ref: string;
  score: number;
  headline: string;
  seniority: string;
  years_experience: number | null;
  location: string;
  matched_must_haves: string[];
  gaps: string[];
  why: string[];
  skills_extracted?: string[];
  skills_inferred?: string[];
  summary?: string;
};

/** v3.8.0 — skills that actually exist on opted-in candidates, with counts. */
export type SkillOption = { skill: string; skill_norm: string; count: number };

/** v3.9.0 — the four fixed questions that replaced the results chat. */
export type CardKey = "why_score" | "what_is_missing" | "compare" | "screen_questions";


/** v3.6.0 — what the employer sends and the seeker reads. */
export type ProposalDraft = {
  job_title: string;
  job_location?: string;
  employment_type?: string;
  salary_range?: string;
  job_url?: string;
  message: string;
};

export type Proposal = {
  id: string;
  org_name: string;
  org_website?: string | null;
  /** v3.10.0 — the company profile, so the candidate knows who is asking. */
  org_industry?: string | null;
  org_size?: string | null;
  org_headquarters?: string | null;
  org_about?: string | null;
  org_logo_url?: string | null;
  org_linkedin_url?: string | null;
  job_title: string;
  job_location: string | null;
  employment_type: string | null;
  salary_range: string | null;
  job_url: string | null;
  message: string;
  status: "pending" | "approved" | "declined";
  sent_at: string;
  responded_at: string | null;
};

/** Employer view. Contact fields only ever arrive when status is approved. */
export type SentProposal = {
  id: string;
  ref: string;
  status: "pending" | "approved" | "declined";
  job_title: string;
  job_location: string | null;
  employment_type: string | null;
  salary_range: string | null;
  job_url: string | null;
  message: string;
  sent_at: string;
  responded_at: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export const employerApi = {
  orgGet: () => call<{ org: Org | null; role?: string }>({ action: "employer_org_get" }),
  orgCreate: (name: string, website?: string) =>
    call<{ org: Org }>({ action: "employer_org_create", name, website }),
  /** v3.10.0 — every company profile field stays editable at any time. */
  orgUpdate: (org_id: string, patch: OrgPatch) =>
    call<{ org: Org }>({ action: "employer_org_update", org_id, patch }),
  /** v3.10.0 — the intake survives leaving the page. */
  draftGet: (org_id: string) =>
    call<{ draft: IntakeDraft | null }>({ action: "employer_intake_draft_get", org_id }),
  draftSave: (org_id: string, draft: IntakeDraft) =>
    call<{ ok: true }>({ action: "employer_intake_draft_save", org_id, ...draft }),
  draftClear: (org_id: string) =>
    call<{ ok: true }>({ action: "employer_intake_draft_clear", org_id }),
  /** v3.8.0 — one pass over the opening description, no conversation. */
  specExtract: (org_id: string, description: string) =>
    call<{ job_spec: Partial<JobSpec>; known: string[] }>({
      action: "employer_spec_extract", org_id, description,
    }),
  skillCatalog: (org_id: string) =>
    call<{ pool_size: number; skills: SkillOption[] }>({ action: "employer_skill_catalog", org_id }),
  /** v3.9.0 — four fixed questions replace the free-form results chat. */
  cardAnswer: (search_id: string, ref: string, card: CardKey) =>
    call<{ answer: string }>({ action: "employer_card_answer", search_id, ref, card }),
  /** v3.9.0 — a pre-written proposal message the employer edits. */
  draftProposal: (org_id: string, search_id: string, ref: string) =>
    call<{ subject_hint: string; message: string }>({
      action: "employer_draft_proposal", org_id, search_id, ref,
    }),
  match: (org_id: string, job_spec: JobSpec) =>
    call<{ search_id: string | null; results: CandidateCard[]; pool_note: string }>({
      action: "employer_match", org_id, job_spec,
    }),
  sendProposal: (search_id: string, ref: string, draft: ProposalDraft) =>
    call<{ ok: true; status: string }>({
      action: "employer_reveal_request", search_id, ref, ...draft,
    }),
  sentProposals: (search_id?: string) =>
    call<{ requests: SentProposal[] }>({ action: "employer_reveal_status", search_id }),
  proposalList: () => call<{ requests: Proposal[] }>({ action: "reveal_list" }),
  proposalDecide: (id: string, approve: boolean) =>
    call<{ ok: true; status: string }>({ action: "reveal_decide", id, approve }),
};

