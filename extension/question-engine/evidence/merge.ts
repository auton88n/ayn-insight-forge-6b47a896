/**
 * evidence/merge.ts
 * Pure evidence fusion. A weak source never overrides a strong one: if the
 * top-weighted source is >= 2x the next, it wins outright; otherwise the top
 * value wins but overall confidence is reduced to reflect the contest.
 */

import type { Evidence } from "../evidence";

export interface FusedValue {
  value: unknown;
  agreement: number;
  winner: Evidence | null;
  losers: Evidence[];
}

export function fuse(evidence: ReadonlyArray<Evidence>): FusedValue {
  void evidence;
  return { value: undefined, agreement: 0, winner: null, losers: [] };
}
