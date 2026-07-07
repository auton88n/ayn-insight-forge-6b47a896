/**
 * field-detector.ts
 * DOM -> RawDetection[] -> DetectedField[].
 *
 * detect() discovers every interactive control under root, piercing shadow roots
 * and descending into same-origin iframes, classifies each into a ControlKind,
 * and stamps a stable ref. It does NOT group; grouping is the reconstructor's
 * job. enrich() attaches evidence (from the dom and accessibility sources) plus
 * layout context (visibility, nearest container) to each detection.
 */

import type { RawDetection, DetectedField, ControlKind } from "./question";
import { makeRef } from "./refs";
import { collect as collectDom } from "./evidence/dom";
import { collect as collectA11y } from "./evidence/accessibility";
import { collect as collectAdapter } from "./evidence/adapter";
import type { ATSPlugin } from "./adapters/index";

export interface DetectOptions {
  pierceShadow?: boolean; // default true
  descendFrames?: boolean; // default true
}

const CONTROL_ROLES = new Set([
  "radio",
  "checkbox",
  "combobox",
  "listbox",
  "switch",
  "textbox",
  "spinbutton",
]);

/** Discover every interactive control under root. No evidence yet. */
export function detect(root: Document | Element, opts: DetectOptions = {}): RawDetection[] {
  const pierceShadow = opts.pierceShadow !== false;
  const descendFrames = opts.descendFrames !== false;
  const out: RawDetection[] = [];
  const seen = new Set<Element>();
  walk(root, "", out, seen, pierceShadow, descendFrames);
  return out;
}

function walk(
  node: Document | Element | ShadowRoot,
  frame: string,
  out: RawDetection[],
  seen: Set<Element>,
  pierceShadow: boolean,
  descendFrames: boolean
): void {
  const elements = node.querySelectorAll("*");
  elements.forEach((el) => {
    if (seen.has(el)) return;

    const kind = controlKindOf(el);
    if (kind) {
      seen.add(el);
      out.push({ node: el, kind, ref: makeRef(el), frame });
    }

    if (pierceShadow) {
      const sr = (el as HTMLElement).shadowRoot;
      if (sr) walk(sr, frame, out, seen, pierceShadow, descendFrames);
    }

    if (descendFrames && el.tagName === "IFRAME") {
      try {
        const doc = (el as HTMLIFrameElement).contentDocument;
        if (doc) {
          const childFrame = frame ? `${frame}.f` : "f";
          walk(doc, childFrame, out, seen, pierceShadow, descendFrames);
        }
      } catch {
        // cross-origin iframe, unreachable, skip
      }
    }
  });
}

/** Classify an element into a ControlKind, or null if it is not a field. */
export function controlKindOf(el: Element): ControlKind | null {
  const tag = el.tagName.toLowerCase();

  if (tag === "textarea") return "textarea";

  if (tag === "select") {
    return (el as HTMLSelectElement).multiple ? "listbox" : "select";
  }

  if (tag === "input") {
    const type = ((el as HTMLInputElement).type || "text").toLowerCase();
    if (type === "hidden" || type === "submit" || type === "reset" || type === "button" || type === "image") {
      return null;
    }
    if (type === "radio") return "radio";
    if (type === "checkbox") return "checkbox";
    if (type === "file") return "file";
    return "text";
  }

  if ((el as HTMLElement).isContentEditable) return "text";

  const role = el.getAttribute("role");
  if (role && CONTROL_ROLES.has(role)) {
    if (role === "radio") return "radio";
    if (role === "checkbox" || role === "switch") return "checkbox";
    if (role === "combobox") return "combobox";
    if (role === "listbox") return "listbox";
    if (role === "textbox" || role === "spinbutton") return "text";
    return "custom";
  }

  return null;
}

/**
 * Attach evidence and layout context to each RawDetection. Runs the dom and
 * accessibility evidence sources per control, computes visibility, and finds the
 * nearest meaningful container.
 */
export function enrich(
  raw: ReadonlyArray<RawDetection>,
  root: Document | Element,
  adapter: ATSPlugin | null = null
): DetectedField[] {
  return raw.map((d) => {
    const base: DetectedField = {
      ...d,
      evidence: [...collectDom(d.node, root), ...collectA11y(d.node, root)],
      visible: isVisible(d.node),
      container: nearestContainer(d.node),
    };
    // Adapter evidence sees the enriched field so it can reason about container.
    const adapterEv = collectAdapter(base, root, adapter);
    return { ...base, evidence: [...base.evidence, ...adapterEv] };
  });
}

const CONTAINER_SELECTOR =
  "fieldset,[role=group],[role=radiogroup],[data-field-path],[class*=fieldEntry],[class*=field-entry],[class*=field],[class*=question]";

/** Nearest meaningful ancestor container, or the parent element as a fallback. */
export function nearestContainer(el: Element): Element {
  const c = el.closest(CONTAINER_SELECTOR);
  if (c && c !== el) return c;
  return el.parentElement ?? el;
}

/** Loose visibility test: laid out and not display:none / visibility:hidden. */
export function isVisible(el: Element): boolean {
  const he = el as HTMLElement;
  if (!(he.offsetWidth || he.offsetHeight || he.getClientRects().length)) {
    const laidOutAncestor = el.closest("label,[class*=field],fieldset");
    if (!laidOutAncestor) return false;
  }
  try {
    const cs = (el.ownerDocument?.defaultView ?? window).getComputedStyle(he);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
  } catch {
    // getComputedStyle can throw on detached nodes; assume visible
  }
  return true;
}
