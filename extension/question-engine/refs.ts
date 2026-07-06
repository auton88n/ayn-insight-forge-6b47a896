/**
 * refs.ts
 * Stable element references and the id-minting contract.
 *
 * The existing AYN injector dispatches on id PREFIX (__textfield__,
 * __structradio__, __buttongroup__, __richedit__, __opentext__,
 * __radio__:custom, multi-checkbox). That contract is load-bearing: changing a
 * prefix is a breaking change requiring an injector change. mintId() centralizes
 * the contract so it lives in exactly one place and cannot drift by accident.
 *
 * ElementRef also carries a generation counter. The DOM mutates between
 * understanding and acting, so a raw node handle goes stale. A consumer holding
 * an older generation must re-resolve via resolveRef() before acting.
 *
 * Phase 2 implements fid stamping, selector/xpath builders, and resolveRef. The
 * only DOM write the engine performs is stamping a data-ayn-fid tracking
 * attribute so a ref can be re-resolved after mutation; it never writes values.
 */

import type { ControlKind } from "./question";

/** The id prefixes the existing injector understands. Do not change casually. */
export const ID_PREFIX = Object.freeze({
  text: "__textfield__",
  structradio: "__structradio__",
  customRadio: "__radio__:custom",
  buttongroup: "__buttongroup__",
  labelgroup: "__labelgroup__",
  multiCheckbox: "__checkbox__:multi",
  richedit: "__richedit__",
  opentext: "__opentext__",
});

export type IdKind = keyof typeof ID_PREFIX;

export interface ElementRef {
  readonly fid: string;
  readonly selector: string;
  readonly xpath: string;
  readonly generation: number;
}

const FID_ATTR = "data-ayn-fid";
let fidCounter = 0;
let currentGeneration = 0;

/** Bump the generation. Called by the MutationObserver wrapper after each batch. */
export function nextGeneration(): number {
  return ++currentGeneration;
}

export function getGeneration(): number {
  return currentGeneration;
}

/**
 * Stamp a stable fid on an element (idempotent) and return it. The fid is stored
 * as a data attribute so resolveRef can find the element again after the DOM
 * mutates. This is the engine's only DOM write and it touches no form value.
 */
export function ensureFid(el: Element): string {
  const existing = el.getAttribute(FID_ATTR);
  if (existing) return existing;
  const fid = `f${fidCounter++}`;
  try {
    el.setAttribute(FID_ATTR, fid);
  } catch {
    // Some custom elements reject setAttribute; fall back to a volatile id.
  }
  return fid;
}

/** Build a reasonably unique CSS selector for re-resolution. Capped depth. */
export function buildSelector(el: Element): string {
  if (el.id) return `#${cssEscape(el.id)}`;
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && node.nodeType === 1 && depth < 5) {
    const current: Element = node;
    let part = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent) {
      const sibs: Element[] = Array.from(parent.children).filter(
        (c) => c.tagName === current.tagName
      );
      if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    if (node.id) {
      parts[0] = `#${cssEscape(node.id)}`;
      break;
    }
    node = parent;
    depth++;
  }
  return parts.join(" > ");
}

/** Build an absolute-ish xpath for re-resolution. */
export function buildXpath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1) {
    let idx = 1;
    let sib = node.previousElementSibling;
    while (sib) {
      if (sib.tagName === node.tagName) idx++;
      sib = sib.previousElementSibling;
    }
    parts.unshift(`${node.tagName.toLowerCase()}[${idx}]`);
    node = node.parentElement;
  }
  return "/" + parts.join("/");
}

/** Build a complete ElementRef for a control, stamping its fid. */
export function makeRef(el: Element): ElementRef {
  return {
    fid: ensureFid(el),
    selector: buildSelector(el),
    xpath: buildXpath(el),
    generation: currentGeneration,
  };
}

/**
 * Mint an injector-compatible field id. anchorFid is the aynFid of the group
 * anchor (for choice groups) or the control (for single fields). This is the
 * ONLY place ids are constructed.
 */
export function mintId(kind: IdKind, anchorFid: string, frame = ""): string {
  const prefix = ID_PREFIX[kind];
  const framePart = frame ? `${frame}:` : "";
  return `${framePart}${prefix}:g${anchorFid}`;
}

/** Map a raw ControlKind plus grouping shape to the id kind used for minting. */
export function idKindFor(
  control: ControlKind,
  grouped: boolean,
  isCustom: boolean
): IdKind {
  if (control === "radio") return grouped ? (isCustom ? "customRadio" : "structradio") : "structradio";
  if (control === "checkbox") return grouped ? "multiCheckbox" : "buttongroup";
  if (control === "custom") return "buttongroup";
  if (control === "textarea") return "text";
  return "text";
}

/**
 * Re-resolve an ElementRef to a live Element, tolerating DOM mutation. Tries the
 * fid stamp first, then the selector, then the xpath. Returns null if gone.
 */
export function resolveRef(ref: ElementRef, root: Document | Element): Element | null {
  const scope: ParentNode = root;
  const byFid = scope.querySelector(`[${FID_ATTR}="${cssEscape(ref.fid)}"]`);
  if (byFid) return byFid;
  if (ref.selector) {
    try {
      const bySel = scope.querySelector(ref.selector);
      if (bySel) return bySel;
    } catch {
      // invalid selector, fall through to xpath
    }
  }
  if (ref.xpath) {
    const doc = root instanceof Document ? root : root.ownerDocument;
    if (doc) {
      try {
        const r = doc.evaluate(
          ref.xpath,
          root,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        if (r.singleNodeValue && r.singleNodeValue.nodeType === 1) {
          return r.singleNodeValue as Element;
        }
      } catch {
        // xpath failed
      }
    }
  }
  return null;
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
