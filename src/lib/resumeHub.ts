import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL } from "@/config";

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
  if (!r.ok) throw new Error((data as { error?: string })?.error || `Request failed (${r.status})`);
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
  parse: (resumeText: string) =>
    call<{ resume: ResumeContent }>("resume-hub", { action: "parse", resumeText }),

  parseFile: (fileBase64: string, mimeType: string) =>
    call<{ resume: ResumeContent; plainText: string }>("resume-hub", { action: "parse_file", fileBase64, mimeType }),
  rewrite: (resume: ResumeContent, jdText?: string) =>
    call<{ resume: ResumeContent; ats_score: number; suggestions: string[] }>("resume-hub", { action: "rewrite", resume, jdText }),
  match: (resume: ResumeContent, jdText: string) =>
    call<{ score: number; breakdown: Record<string, number>; missing_keywords: string[]; summary: string }>("resume-hub", { action: "match", resume, jdText }),
  tailor: (resume: ResumeContent, jdText: string) =>
    call<{ resume: ResumeContent }>("resume-hub", { action: "tailor", resume, jdText }),

  smartTailor: (resumeText: string, jdText: string, jobTitle?: string, company?: string) =>
    call<{ keywords: Array<{ text: string; inResume: boolean }>; tailoredText: string; changes: string[] }>(
      "resume-hub", { action: "smart_tailor", resumeText, jdText, jobTitle, company }
    ),
  coverLetter: (resume: ResumeContent, jdText: string, opts?: { tone?: string; company?: string }) =>
    call<{ body: string }>("resume-hub", { action: "cover_letter", resume, jdText, ...opts }),

  ingestJob: (payload: { source_url?: string; html?: string; text?: string; company?: string; title?: string; location?: string; jd_text?: string; source?: string }) =>
    call<{ job_id: string; deduped: boolean }>("resume-hub", { action: "ext_ingest_job", ...payload }),

  mintToken: (label: string) => call<{ token: string; prefix: string; id: string }>("resume-hub", { action: "token_mint", label }),
  listTokens: () => call<{ tokens: Array<{ id: string; token_prefix: string; device_label: string; last_used_at: string | null; revoked_at: string | null; created_at: string }> }>("resume-hub", { action: "token_list" }),
  revokeToken: (id: string) => call<{ ok: true }>("resume-hub", { action: "token_revoke", id }),
};
