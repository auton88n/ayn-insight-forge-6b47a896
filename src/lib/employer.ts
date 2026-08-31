// v2.9.0-B — Employer marketplace client. Session-JWT web-lane calls to
// supabase/functions/resume-hub. All employer actions are gated server-side
// on org_members; the ref_map that links anonymous refs to real users
// never leaves the edge function.
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL } from "@/config";
import { maintenanceErrorFrom } from "@/lib/featureError";

const FN = `${SUPABASE_URL}/functions/v1/resume-hub`;

// v3.313.0 — real, reported bug: a stale access token after the tab sat
// idle/backgrounded a while produces a genuine 401 here too, same as
// resumeHub.ts's own identical fix (see that file's own comment for the
// full root cause). This file has its own separate call(), so it needed
// the same fix on its own path rather than inheriting the other one.
async function isExpiredJwt(status: number, data: unknown): Promise<boolean> {
  if (status !== 401) return false;
  const coded = data as { code?: string; message?: string; error?: string };
  return coded?.code === "PGRST301" || /jwt|invalid session|invalid token/i.test(String(coded?.message || coded?.error || ""));
}

async function call<T>(body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const headers = {
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    "Content-Type": "application/json",
  };
  const r = await fetch(FN, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await r.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = { error: text }; }

  if (!r.ok && await isExpiredJwt(r.status, parsed)) {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (!refreshErr && refreshed.session) {
      const retryHeaders = { ...headers, Authorization: `Bearer ${refreshed.session.access_token}` };
      const r2 = await fetch(FN, { method: "POST", headers: retryHeaders, body: JSON.stringify(body) });
      const text2 = await r2.text();
      let parsed2: unknown;
      try { parsed2 = JSON.parse(text2); } catch { parsed2 = { error: text2 }; }
      if (r2.ok) return parsed2 as T;
      const maintenance2 = maintenanceErrorFrom(parsed2);
      if (maintenance2) throw maintenance2;
      throw new Error((parsed2 as { error?: string })?.error || `Request failed (${r2.status})`);
    }
  }
  if (!r.ok) {
    const maintenance = maintenanceErrorFrom(parsed);
    if (maintenance) throw maintenance;
    throw new Error((parsed as { error?: string })?.error || `Request failed (${r.status})`);
  }
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

/**
 * v3.11.0 — the company profile is an onboarding gate, not a settings form.
 * A candidate decides whether to accept a proposal mostly on who is reaching
 * out, so a blank profile wastes the proposal for both sides. These six are
 * required before AYN will search or send. LinkedIn and logo stay optional.
 */
export const ABOUT_MIN = 80;

export type OrgField = "name" | "website" | "industry" | "headquarters" | "company_size" | "about";

export const REQUIRED_ORG_FIELDS: { key: OrgField; label: string; nudge: string }[] = [
  { key: "name", label: "Company name", nudge: "Add your company name so candidates know who is reaching out." },
  { key: "website", label: "Website", nudge: "Add your website so candidates can check you out." },
  { key: "industry", label: "Industry", nudge: "Add your industry so candidates can tell whether the work is in their field." },
  { key: "headquarters", label: "Headquarters", nudge: "Add your headquarters so candidates know where the company is based." },
  { key: "company_size", label: "Company size", nudge: "Add your company size. Some people only want a small team, some only want a large one." },
  { key: "about", label: "About the company", nudge: `Add an about paragraph so candidates know what you do. At least ${ABOUT_MIN} characters.` },
];

/** Which required fields are still missing on this org, in priority order. */
export function missingOrgFields(org: Org | null): typeof REQUIRED_ORG_FIELDS {
  if (!org) return REQUIRED_ORG_FIELDS;
  return REQUIRED_ORG_FIELDS.filter(f => {
    const v = String((org as Record<string, unknown>)[f.key] ?? "").trim();
    if (!v) return true;
    if (f.key === "about") return v.length < ABOUT_MIN;
    return false;
  });
}

export function isOrgComplete(org: Org | null): boolean {
  return missingOrgFields(org).length === 0;
}

/** A bare domain is a normal thing to type. Normalise it, do not reject it. */
export function normaliseUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`;
}

export function isValidUrl(raw: string): boolean {
  const v = normaliseUrl(raw);
  if (!v) return true;
  try {
    const u = new URL(v);
    return (u.protocol === "http:" || u.protocol === "https:") && /\./.test(u.hostname);
  } catch { return false; }
}

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

/**
 * v3.12.0 — a structured, anonymous background block. Replaces rendering
 * `profile_text` (the embedding blob) into the candidate dialog.
 */
export type CandidateProfileBlock = {
  seniority: string;
  years_experience: number | null;
  current_title: string;
  primary_function: string;
  known_for: string[];
  skills_by_level: Array<{ level: string; skills: Array<{ name: string; years: number | null }> }>;
  experience: Array<{ title: string; company: string; dates: string; industry: string }>;
  education: Array<{ line: string }>;
  certifications: string[];
  seeking: string[];
};

export type CandidateCard = {
  ref: string;
  score: number;
  /** v3.15.1 — first name only. Last name, email and phone need an accept. */
  first_name?: string;
  headline: string;

  seniority: string;
  years_experience: number | null;
  location: string;
  matched_must_haves: string[];
  gaps: string[];
  why: string[];
  skills_extracted?: string[];
  skills_inferred?: string[];
  /** Legacy embedding blob. Kept for older stored searches only. */
  summary?: string;
  /** v3.12.0 — the structured background the dialog actually renders. */
  profile?: CandidateProfileBlock;
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
  /** v3.163.0 — inbox controls, employer-set only. */
  two_way_enabled: boolean;
  candidate_blocked: boolean;
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
  first_name?: string | null;
  name?: string | null;
  /** v3.163.0 — inbox controls, employer-set only. */
  two_way_enabled: boolean;
  candidate_blocked: boolean;

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

  // v3.163.0 — inbox. Sends and thread listing go through resume-hub (they
  // need the safety screen and cross-thread permission checks); reading
  // the actual messages in a thread is a direct, RLS-protected query
  // instead (see inboxMessages below) — that's what actually guarantees a
  // candidate can never see a blocked message, not application code
  // remembering to filter correctly.
  inboxSend: (reveal_request_ids: string[], body: string) =>
    call<{ ok: boolean; blocked: boolean; reason?: string; sent_count: number }>({
      action: "inbox_send", reveal_request_ids, body,
    }),
  inboxThreads: (as: "employer" | "candidate") =>
    call<{ threads: InboxThread[] }>({ action: "inbox_list_threads", as }),
  inboxMarkRead: (reveal_request_id: string, as: "employer" | "candidate") =>
    call<{ ok: true }>({ action: "inbox_mark_read", reveal_request_id, as }),
  inboxSetTwoWay: (reveal_request_id: string, enabled: boolean) =>
    call<{ ok: true; two_way_enabled: boolean }>({ action: "inbox_set_two_way", reveal_request_id, enabled }),
  inboxBlockCandidate: (reveal_request_id: string, blocked: boolean) =>
    call<{ ok: true; candidate_blocked: boolean }>({ action: "inbox_block_candidate", reveal_request_id, blocked }),
};

export type InboxThread = {
  reveal_request_id: string;
  job_title: string | null;
  org_name?: string;
  candidate_ref?: string;
  two_way_enabled: boolean;
  candidate_blocked: boolean;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
};

export type InboxMessage = {
  id: string;
  reveal_request_id: string;
  sender_role: "employer" | "candidate";
  body: string | null;
  kind: "text" | "call_invite";
  call_url: string | null;
  call_scheduled_at: string | null;
  status: "sent" | "blocked";
  read_at: string | null;
  created_at: string;
};

/**
 * Direct, RLS-protected read — deliberately not a resume-hub action. This
 * is the one query where the database's own policy, not application code,
 * is what guarantees a candidate never sees a message AYN blocked.
 */
export async function inboxMessages(reveal_request_id: string): Promise<InboxMessage[]> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase
    .from("inbox_messages")
    .select("id, reveal_request_id, sender_role, body, kind, call_url, call_scheduled_at, status, read_at, created_at")
    .eq("reveal_request_id", reveal_request_id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as InboxMessage[];
}

