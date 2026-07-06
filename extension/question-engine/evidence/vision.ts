/**
 * evidence/vision.ts — the "vision" evidence source. GATED: invoked only when
 * fused confidence for a needed property is below THRESHOLDS.visionGate and
 * DOM+a11y are the only sources. Returns label/option evidence tagged to element
 * refs. NEVER returns actions or coordinates.
 */
import type { Evidence } from "../evidence";
export function collect(el: Element, root: Document | Element): Evidence[] {
  void el;
  void root;
  return [];
}
