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

export interface ResumeContent {
  basics?: {
    name?: string; title?: string; email?: string; phone?: string;
    location?: string; summary?: string;
    links?: Array<{ label: string; url: string }>;
  };
  work?: Array<{ company: string; title: string; location?: string; start?: string; end?: string; bullets: string[] }>;
  education?: Array<{ school: string; degree?: string; field?: string; start?: string; end?: string }>;
  skills?: string[];
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
  /** Paid (15 credits): the actual rewrite. */
  rewrite: (resume: ResumeContent, jdText?: string) =>
    call<{ resume: ResumeContent; ats_score: number; verdict: string; suggestions: string[]; credits: { spent: number; balance: number } }>(
      "resume-hub", { action: "rewrite", resume, jdText },
    ),
  // v3.72.0 — these three no longer take a resume blob from the client.
  // The backend resolves the caller's own primary resume plus their full
  // canonical profile server side (the same way the extension already did),
  // so the client can't send stale or partial content and there's nothing
  // to keep in sync on this side.
  match: (jdText: string) =>
    call<{ score: number; breakdown: Record<string, number>; missing_keywords: string[]; summary: string }>("resume-hub", { action: "match", jdText }),
  tailor: (jdText: string) =>
    call<{ resume: ResumeContent }>("resume-hub", { action: "tailor", jdText }),

  coverLetter: (jdText: string, opts?: { tone?: string; company?: string }) =>
    call<{ body: string }>("resume-hub", { action: "cover_letter", jdText, ...opts }),


  listTokens: () => call<{ tokens: Array<{ id: string; token_prefix: string; device_label: string; last_used_at: string | null; revoked_at: string | null; created_at: string }> }>("resume-hub", { action: "token_list" }),
  revokeToken: (id: string) => call<{ ok: true }>("resume-hub", { action: "token_revoke", id }),

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
};

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

