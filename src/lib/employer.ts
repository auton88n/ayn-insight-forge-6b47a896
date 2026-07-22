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

export type Org = { id: string; name: string; website: string | null };

export type JobSpec = {
  title: string;
  seniority: string;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  location_preference?: string;
  remote_ok?: boolean;
  min_years?: number;
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
};

export type IntakeTurn = { role: "user" | "assistant"; content: string };
export type IntakeResponse =
  | { done: false; question: string }
  | { done: true; job_spec: JobSpec };

export type RevealRequest = {
  id: string;
  org_name: string;
  job_title: string;
  status: "pending" | "approved" | "declined";
  created_at: string;
  decided_at: string | null;
};

export const employerApi = {
  orgGet: () => call<{ org: Org | null; role?: string }>({ action: "employer_org_get" }),
  orgCreate: (name: string, website?: string) =>
    call<{ org: Org }>({ action: "employer_org_create", name, website }),
  intake: (org_id: string, messages: IntakeTurn[]) =>
    call<IntakeResponse>({ action: "employer_intake_chat", org_id, messages }),
  match: (org_id: string, job_spec: JobSpec) =>
    call<{ search_id: string | null; results: CandidateCard[]; pool_note: string }>({
      action: "employer_match", org_id, job_spec,
    }),
  revealRequest: (search_id: string, ref: string) =>
    call<{ ok: true; status: string; already?: boolean }>({
      action: "employer_reveal_request", search_id, ref,
    }),
  revealStatus: (search_id: string) =>
    call<{ requests: Array<{ id: string; ref: string; status: string; name?: string | null; email?: string | null }> }>({
      action: "employer_reveal_status", search_id,
    }),
  revealList: () => call<{ requests: RevealRequest[] }>({ action: "reveal_list" }),
  revealDecide: (id: string, approve: boolean) =>
    call<{ ok: true; status: string }>({ action: "reveal_decide", id, approve }),
};
