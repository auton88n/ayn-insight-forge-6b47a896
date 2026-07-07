/**
 * evidence/merge.ts
 * Pure evidence fusion. Group evidence items by their VALUE (stringified for
 * primitives, JSON for structured), sum (weight * confidence) per bucket, and
 * pick the winner. If the top bucket's mass is >= 2x the next, it wins outright
 * with agreement = top/total. Otherwise agreement is discounted by the contest.
 *
 * Single-source evidence returns its raw source confidence — no phantom
 * "agreement" bonus. This prevents overconfidence from one loud signal.
 */

import type { Evidence } from "../evidence";

export interface FusedValue {
  value: unknown;
  agreement: number;
  winner: Evidence | null;
  losers: Evidence[];
}

export function fuse(evidence: ReadonlyArray<Evidence>): FusedValue {
  if (evidence.length === 0) {
    return { value: undefined, agreement: 0, winner: null, losers: [] };
  }
  if (evidence.length === 1) {
    const e = evidence[0];
    return {
      value: e.value,
      agreement: clamp01(e.confidence),
      winner: e,
      losers: [],
    };
  }

  const buckets = new Map<string, { mass: number; items: Evidence[] }>();
  for (const e of evidence) {
    const key = keyOf(e.value);
    const mass = e.weight * e.confidence;
    const b = buckets.get(key);
    if (b) {
      b.mass += mass;
      b.items.push(e);
    } else {
      buckets.set(key, { mass, items: [e] });
    }
  }

  const sorted = Array.from(buckets.values()).sort((a, b) => b.mass - a.mass);
  const top = sorted[0];
  const next = sorted[1];
  const total = sorted.reduce((s, b) => s + b.mass, 0);
  const winner = top.items.reduce((best, cur) =>
    cur.weight * cur.confidence > best.weight * best.confidence ? cur : best
  );

  let agreement = total > 0 ? top.mass / total : 0;
  if (next && top.mass < 2 * next.mass) {
    // Contested — cut agreement by the contest ratio.
    agreement *= 0.8;
  }

  const losers: Evidence[] = [];
  for (let i = 1; i < sorted.length; i++) losers.push(...sorted[i].items);

  return { value: winner.value, agreement: clamp01(agreement), winner, losers };
}

function keyOf(v: unknown): string {
  if (v == null) return "null";
  if (typeof v === "string") return `s:${v.toLowerCase().replace(/\s+/g, " ").trim()}`;
  if (typeof v === "number" || typeof v === "boolean") return `p:${String(v)}`;
  try {
    return `o:${JSON.stringify(v)}`;
  } catch {
    return "o:?";
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
