/**
 * learning/supabase-store.ts
 *
 * Part 2 of the "turn on the learning interface" upgrade. Real LearningEngine
 * backed by public.ext_answer_memory in Supabase (per-user, RLS-protected).
 *
 * Design:
 * - Keyed by a stable question_signature = hash(canonicalLabel + kind + optionSet).
 * - lookup() is best-effort and MUST NOT block the fill pipeline: on network
 *   failure we return null. The engine's original AI path stays authoritative.
 * - remember() writes only after successful verification (the caller decides
 *   when to invoke). promote() bumps verified_ok_count.
 *
 * The store is transport-agnostic: it takes a `fetcher` callback so the
 * extension side can route through spine.aynn.io or the direct Supabase REST
 * URL — both are supported by the same schema.
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
  // FNV-1a 32-bit — collision-resistant enough for per-user keying.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
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
  /** Extension-only: called by content.js after post-inject verification. */
  recordVerified(q: Question, verified: boolean, atsHint?: string): Promise<void>;
} {
  // Small in-memory LRU so lookups within one fill pass don't refetch.
  const cache = new Map<string, MemoryRow | null>();

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
      if (!r.ok) {
        cache.set(sig, null);
        return null;
      }
      const rows = (await r.json()) as MemoryRow[];
      const row = rows[0] ?? null;
      cache.set(sig, row);
      return row;
    } catch {
      return null;
    }
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
    } catch {
      /* swallow — best-effort */
    }
  }

  return {
    remember(q: Question): void {
      // Fire-and-forget; only meaningful once an answer is attached upstream.
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
      const row = cache.get(sig);
      if (row === undefined) {
        // Trigger prefetch asynchronously — first call returns null, next
        // call returns the memorized answer once the cache warms.
        void fetchRow(sig);
        return null;
      }
      if (!row) return null;
      const trust =
        row.verified_ok_count / Math.max(1, row.verified_ok_count + row.verified_fail_count);
      if (trust < 0.5) return null;
      const answer: Answer = {
        value: row.answer_value ?? undefined,
        optionLabel: row.answer_option_label ?? undefined,
        optionLabels: row.answer_option_labels ?? undefined,
        confidence: 0.6 + Math.min(0.3, row.verified_ok_count * 0.03),
        reasoning: "learned_from_previous_fills",
      };
      return { answer, confidence: answer.confidence ?? 0.6, source: "memory" };
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
      // Deletion is handled through the UI (ExtensionTab) via direct REST call.
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

/** Global registration hook so content.js can bind a transport after auth. */
let activeLearning: (LearningEngine & Partial<{ recordVerified: (q: Question, ok: boolean, ats?: string) => Promise<void> }>) | null = null;
export function setLearningEngine(e: LearningEngine | null): void {
  activeLearning = e as any;
}
export function getLearningEngine(): typeof activeLearning {
  return activeLearning;
}
