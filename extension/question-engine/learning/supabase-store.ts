/**
 * learning/supabase-store.ts
 *
 * Real LearningEngine backed by public.ext_answer_memory in Supabase
 * (per-user, RLS-protected). Talks to PostgREST directly so the fill hot
 * path stays fast and local — no extra function invocation.
 *
 * v2.12.0: exact-signature lookup unchanged. When exact misses, run a
 * bounded local fuzzy pass against ONE per-session fetch of the user's
 * most-used rows (LIMIT 200, ordered by times_used desc). Sensitive
 * questions (work auth, sponsorship, EEO, salary, notice period) are
 * hard-excluded from fuzzy matching — those stay exact-signature only.
 */

import type { LearningEngine, Suggestion } from "./interface";
import type { Question, Answer } from "../question";

export interface LearningTransport {
  /** Return the current user's access token, or null if unauthenticated. */
  getAccessToken(): Promise<string | null>;
  /** Base URL of the Supabase REST endpoint, e.g. https://<ref>.supabase.co/rest/v1 */
  restBaseUrl: string;
  /** Supabase anon key. Sent as apikey header. */
  anonKey: string;
}

/** Deterministic short signature for a question so identical prompts collide. */
export function questionSignature(q: Pick<Question, "label" | "kind" | "options">): string {
  const label = normalizeLabel(q.label);
  const opts = (q.options ?? []).map((o) => normalizeLabel(o.label)).sort().join("|");
  return simpleHash(`${label}::${q.kind}::${opts}`);
}

function normalizeLabel(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim()
    .slice(0, 240);
}

function simpleHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// ── Fuzzy matching (mirrors backend ext_lookup_answer, kept local) ────
const STOPWORDS = new Set([
  "the","a","an","of","to","for","in","on","at","is","are","do","you","your",
  "our","we","please","describe","tell","us","this","that","and","or","with",
  "would","will","have","has","any","about",
]);

function normalizeForFuzzy(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  for (const t of normalizeForFuzzy(s).split(" ")) {
    if (t.length >= 3 && !STOPWORDS.has(t)) out.add(t);
  }
  return out;
}

// Reuse the sensitive category surface from v2.10.1 so fuzzy never bleeds
// across work-auth ↔ sponsorship ↔ EEO ↔ salary ↔ notice-period.
const SENSITIVE_SEMANTIC_TYPES = new Set([
  "work_authorization","sponsorship","visa_status",
  "eeo_gender","eeo_race","eeo_ethnicity","eeo_veteran","eeo_disability","eeo_self_identification",
  "salary_expectation","desired_compensation","current_salary",
  "notice_period",
]);
const SENSITIVE_RE = /work\s*auth|authoriz|sponsor|visa|eeo|gender|race|ethnic|veteran|disabil|salary|compensat|desired\s*pay|notice\s*period/i;

function isSensitive(q: Pick<Question, "label" | "semanticType">): boolean {
  const t = String((q as { semanticType?: string }).semanticType || "").toLowerCase();
  if (SENSITIVE_SEMANTIC_TYPES.has(t)) return true;
  return SENSITIVE_RE.test(q.label || "");
}

interface MemoryRow {
  question_signature: string;
  canonical_label: string;
  semantic_type: string;
  question_kind: string;
  answer_value: string | null;
  answer_option_label: string | null;
  answer_option_labels: string[] | null;
  ats_hint: string | null;
  times_used: number;
  verified_ok_count: number;
  verified_fail_count: number;
}

export function createSupabaseLearning(transport: LearningTransport): LearningEngine & {
  recordVerified(q: Question, verified: boolean, atsHint?: string): Promise<void>;
} {
  const cache = new Map<string, MemoryRow | null>();
  // Per-session snapshot of the user's memory for the fuzzy pass. Fetched
  // ONCE lazily on the first fuzzy miss, then reused for the whole fill.
  let sessionRows: MemoryRow[] | null = null;
  let sessionRowsPromise: Promise<MemoryRow[]> | null = null;

  async function headers(): Promise<HeadersInit | null> {
    const token = await transport.getAccessToken();
    if (!token) return null;
    return {
      Authorization: `Bearer ${token}`,
      apikey: transport.anonKey,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
  }

  async function fetchRow(sig: string): Promise<MemoryRow | null> {
    if (cache.has(sig)) return cache.get(sig)!;
    const h = await headers();
    if (!h) return null;
    try {
      const url = `${transport.restBaseUrl}/ext_answer_memory?question_signature=eq.${encodeURIComponent(
        sig
      )}&select=question_signature,canonical_label,semantic_type,question_kind,answer_value,answer_option_label,answer_option_labels,ats_hint,times_used,verified_ok_count,verified_fail_count&limit=1`;
      const r = await fetch(url, { headers: h });
      if (!r.ok) { cache.set(sig, null); return null; }
      const rows = (await r.json()) as MemoryRow[];
      const row = rows[0] ?? null;
      cache.set(sig, row);
      return row;
    } catch {
      return null;
    }
  }

  async function fetchSessionRows(): Promise<MemoryRow[]> {
    if (sessionRows) return sessionRows;
    if (sessionRowsPromise) return sessionRowsPromise;
    sessionRowsPromise = (async () => {
      const h = await headers();
      if (!h) return [];
      try {
        const url = `${transport.restBaseUrl}/ext_answer_memory?select=question_signature,canonical_label,semantic_type,question_kind,answer_value,answer_option_label,answer_option_labels,ats_hint,times_used,verified_ok_count,verified_fail_count&order=times_used.desc&limit=200`;
        const r = await fetch(url, { headers: h });
        if (!r.ok) return [];
        const rows = (await r.json()) as MemoryRow[];
        sessionRows = rows;
        return rows;
      } catch { return []; }
    })();
    return sessionRowsPromise;
  }

  function fuzzyMatch(q: Question, rows: MemoryRow[]): { row: MemoryRow; score: number } | null {
    if (isSensitive(q)) return null;
    const incoming = tokenize(q.label || "");
    if (incoming.size < 3) return null;
    let best: { row: MemoryRow; score: number } | null = null;
    for (const row of rows) {
      if ((row.question_kind || "").toLowerCase() !== (q.kind || "").toLowerCase()) continue;
      const rowTokens = tokenize(row.canonical_label || "");
      if (rowTokens.size === 0) continue;
      let overlap = 0;
      for (const t of incoming) if (rowTokens.has(t)) overlap++;
      const smaller = Math.min(incoming.size, rowTokens.size);
      const score = smaller === 0 ? 0 : overlap / smaller;
      if (overlap >= 3 && score >= 0.7 && (!best || score > best.score)) {
        best = { row, score };
      }
    }
    return best;
  }

  async function upsertRow(payload: Partial<MemoryRow> & { question_signature: string }): Promise<void> {
    const h = await headers();
    if (!h) return;
    try {
      await fetch(
        `${transport.restBaseUrl}/ext_answer_memory?on_conflict=user_id,question_signature`,
        {
          method: "POST",
          headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(payload),
        }
      );
      cache.delete(payload.question_signature);
      sessionRows = null; sessionRowsPromise = null;
    } catch {
      /* swallow — best-effort */
    }
  }

  function rowToSuggestion(row: MemoryRow, matchType: "exact" | "fuzzy"): Suggestion {
    const answer: Answer = {
      value: row.answer_value ?? undefined,
      optionLabel: row.answer_option_label ?? undefined,
      optionLabels: row.answer_option_labels ?? undefined,
      confidence: 0.6 + Math.min(0.3, row.verified_ok_count * 0.03),
      reasoning: matchType === "fuzzy"
        ? `Reused your answer to: ${row.canonical_label}`
        : "learned_from_previous_fills",
    } as Answer;
    return { answer, confidence: answer.confidence ?? 0.6, source: "memory" };
  }

  return {
    remember(q: Question): void {
      const a = q.answer;
      if (!a || a.skip) return;
      const sig = questionSignature(q);
      void upsertRow({
        question_signature: sig,
        canonical_label: q.label,
        semantic_type: q.semanticType,
        question_kind: q.kind,
        answer_value: a.value ?? null,
        answer_option_label: a.optionLabel ?? null,
        answer_option_labels: a.optionLabels ?? null,
      });
    },

    lookup(q: Question): Suggestion | null {
      const sig = questionSignature(q);
      const cached = cache.get(sig);
      // Exact-signature path unchanged in behaviour and speed.
      if (cached === undefined) {
        void fetchRow(sig);
      } else if (cached) {
        const trust =
          cached.verified_ok_count / Math.max(1, cached.verified_ok_count + cached.verified_fail_count);
        if (trust >= 0.5) return rowToSuggestion(cached, "exact");
      }
      // Fuzzy fallback: only when we have a warm session snapshot AND the
      // question is not sensitive. First call kicks the fetch and returns
      // null; subsequent calls in this fill see the cached rows.
      if (!sessionRows) { void fetchSessionRows(); return null; }
      const hit = fuzzyMatch(q, sessionRows);
      if (!hit) return null;
      const trust =
        hit.row.verified_ok_count / Math.max(1, hit.row.verified_ok_count + hit.row.verified_fail_count);
      if (trust < 0.5) return null;
      return rowToSuggestion(hit.row, "fuzzy");
    },

    promote(q: Question): void {
      const sig = questionSignature(q);
      void upsertRow({
        question_signature: sig,
        canonical_label: q.label,
        semantic_type: q.semanticType,
        question_kind: q.kind,
        verified_ok_count: 1,
        times_used: 1,
      });
    },

    forget(criteria): void {
      void criteria;
      // Deletion handled through the UI (ExtensionTab) via direct REST call.
    },

    async recordVerified(q: Question, verified: boolean, atsHint?: string): Promise<void> {
      const a = q.answer;
      if (!a) return;
      const sig = questionSignature(q);
      await upsertRow({
        question_signature: sig,
        canonical_label: q.label,
        semantic_type: q.semanticType,
        question_kind: q.kind,
        answer_value: a.value ?? null,
        answer_option_label: a.optionLabel ?? null,
        answer_option_labels: a.optionLabels ?? null,
        ats_hint: atsHint ?? null,
        times_used: 1,
        verified_ok_count: verified ? 1 : 0,
        verified_fail_count: verified ? 0 : 1,
      });
    },
  };
}

let activeLearning: (LearningEngine & Partial<{ recordVerified: (q: Question, ok: boolean, ats?: string) => Promise<void> }>) | null = null;
export function setLearningEngine(e: LearningEngine | null): void {
  activeLearning = e as any;
}
export function getLearningEngine(): typeof activeLearning {
  return activeLearning;
}
