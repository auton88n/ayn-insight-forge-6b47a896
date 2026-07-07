/**
 * evidence/vision-provider.ts
 *
 * Real vision provider that pairs with evidence/vision.ts's collectGated() and
 * a new dead-zone discovery pass. Screenshots a form region with html2canvas
 * (loaded by the extension at runtime) and posts the base64 image to the
 * ext-vision-discover edge function.
 *
 * The provider is dependency-injected via setVisionProvider(). The screenshot
 * transport is also injected so this module has no direct DOM/network coupling
 * beyond the browser globals.
 */

import type { VisionProvider, VisionRequest, VisionResult } from "./vision";

export interface VisionTransport {
  /** Take a screenshot of `el` and return a base64 PNG (no data: prefix). */
  screenshot(el: Element): Promise<string>;
  /** POST to the vision edge function. Returns the parsed response. */
  discover(image_base64: string, context: Record<string, unknown>): Promise<{
    questions: Array<{
      label: string;
      kind: "text" | "single_choice" | "multi_choice" | "boolean";
      options?: string[];
      anchor_hint?: string;
    }>;
  }>;
}

const cache = new Map<string, VisionResult | null>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const stamps = new Map<string, number>();

export function createVisionProvider(transport: VisionTransport): VisionProvider {
  return async (req: VisionRequest): Promise<VisionResult | null> => {
    const key = fingerprint(req.el);
    const now = Date.now();
    const stamp = stamps.get(key) ?? 0;
    if (cache.has(key) && now - stamp < CACHE_TTL_MS) return cache.get(key)!;

    try {
      const b64 = await transport.screenshot(req.el);
      if (!b64 || b64.length < 200) return null;
      const res = await transport.discover(b64, {
        needed: req.needed,
        url: (req.root as Document).location?.href ?? "",
      });
      const first = res.questions?.[0];
      if (!first) {
        cache.set(key, null);
        stamps.set(key, now);
        return null;
      }
      const result: VisionResult = {
        label: first.label,
        options: first.options?.map((label) => ({ value: label, label })),
        confidence: 0.65,
      };
      cache.set(key, result);
      stamps.set(key, now);
      return result;
    } catch {
      return null;
    }
  };
}

/**
 * Dead-zone discovery: find form regions that look like they contain visible
 * question prompts but produced zero detected fields. Used by content.entry to
 * decide when to invoke the vision provider for full-question discovery (not
 * just per-field label enrichment).
 */
export function findVisualDeadZones(
  root: Document | Element,
  detectedControlContainers: ReadonlySet<Element>
): Element[] {
  const doc = root instanceof Document ? root : root.ownerDocument ?? document;
  const candidates = doc.querySelectorAll<HTMLElement>(
    "form section, form fieldset, form [role='group'], form div[class*='question'], form div[class*='field']"
  );
  const zones: Element[] = [];
  const promptRe = /\?|(select|choose|how|are you|do you|have you|which|please|what)/i;
  for (const el of Array.from(candidates)) {
    if (detectedControlContainers.has(el)) continue;
    const text = (el.textContent ?? "").trim();
    if (text.length < 4 || text.length > 600) continue;
    if (!promptRe.test(text)) continue;
    // Must not contain any interactive control the DOM scanner would have caught.
    const interactive = el.querySelector("input, textarea, select, [role='combobox'], [role='listbox'], [role='radiogroup'], [contenteditable='true']");
    if (interactive) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 20) continue;
    zones.push(el);
    if (zones.length >= 8) break;
  }
  return zones;
}

function fingerprint(el: Element): string {
  const r = (el as HTMLElement).getBoundingClientRect?.();
  const path = shortPath(el);
  const rectKey = r ? `${Math.round(r.left)}x${Math.round(r.top)}x${Math.round(r.width)}x${Math.round(r.height)}` : "";
  return `${path}#${rectKey}`;
}

function shortPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && parts.length < 4) {
    const idx = cur.parentElement
      ? Array.from(cur.parentElement.children).indexOf(cur)
      : 0;
    parts.unshift(`${cur.tagName.toLowerCase()}[${idx}]`);
    cur = cur.parentElement;
  }
  return parts.join(">");
}
