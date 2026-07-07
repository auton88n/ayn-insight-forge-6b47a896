/**
 * evidence/vision.ts — the "vision" evidence source. GATED.
 *
 * Public collect() is synchronous and always returns [] so it can slot into the
 * sync detect->enrich pipeline without side effects. Real vision reads go
 * through collectGated(), which the async builder path invokes ONLY when fused
 * confidence for a needed kind is below THRESHOLDS.visionGate (0.70) and
 * dom+accessibility are the only sources present (§5.5 gate).
 *
 * The provider is dependency-injected: the engine never imports a specific
 * vision backend. Default provider is a no-op so the engine ships useful
 * without cloud credentials.
 */

import type { Evidence, EvidenceKind } from "../evidence";
import { makeEvidence } from "../evidence";

export interface VisionRequest {
  readonly el: Element;
  readonly root: Document | Element;
  readonly needed: ReadonlyArray<EvidenceKind>;
}

export interface VisionResult {
  /** Optional label read from screenshot. */
  label?: string;
  /** Optional option labels read from screenshot (for choice groups). */
  options?: ReadonlyArray<{ value: string; label: string }>;
  /** Provider self-reported confidence (0..1). */
  confidence?: number;
}

export type VisionProvider = (req: VisionRequest) => Promise<VisionResult | null>;

const noopProvider: VisionProvider = async () => null;
let activeProvider: VisionProvider = noopProvider;

/** Register a vision provider. Pass null to reset to the no-op default. */
export function setVisionProvider(p: VisionProvider | null): void {
  activeProvider = p ?? noopProvider;
}

/** Sync source hook. Always [] — vision is async and gated. */
export function collect(el: Element, root: Document | Element): Evidence[] {
  void el;
  void root;
  return [];
}

/**
 * Gated async vision collection. Returns Evidence tagged (source: 'vision')
 * with the low default weight from WEIGHTS. Callers MUST have already
 * verified the confidence gate before calling.
 */
export async function collectGated(
  el: Element,
  root: Document | Element,
  needed: ReadonlyArray<EvidenceKind>
): Promise<Evidence[]> {
  if (needed.length === 0) return [];
  let result: VisionResult | null = null;
  try {
    result = await activeProvider({ el, root, needed });
  } catch {
    return [];
  }
  if (!result) return [];
  const out: Evidence[] = [];
  const c = clamp01(result.confidence ?? 0.6);
  if (result.label && needed.includes("label")) {
    out.push(makeEvidence("vision", "label", result.label, c));
  }
  if (result.options && result.options.length > 0 && needed.includes("options")) {
    out.push(makeEvidence("vision", "options", result.options, c));
  }
  return out;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
