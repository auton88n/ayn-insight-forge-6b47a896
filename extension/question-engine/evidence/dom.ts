/**
 * evidence/dom.ts — the "dom" evidence source.
 *
 * Reads plain DOM structure and native attributes. Returns Evidence[] tagged
 * with (source: 'dom', kind). Never constructs a Question. Never mutates DOM.
 *
 * Weights are pulled from the WEIGHTS table via makeEvidence; source confidence
 * is the per-signal certainty (e.g. an explicit `required` attribute is 1.0,
 * an asterisk-in-label heuristic is 0.6).
 */

import { makeEvidence, type Evidence } from "../evidence";

export function collect(el: Element, root: Document | Element): Evidence[] {
  const out: Evidence[] = [];
  const doc = root instanceof Document ? root : el.ownerDocument;

  // ---------- label ----------
  const labelText = readNativeLabel(el, doc);
  if (labelText) {
    out.push(makeEvidence("dom", "label", labelText, 0.9, { via: "native-label" }));
  }

  // ---------- placeholder ----------
  const placeholder = (el as HTMLInputElement).placeholder;
  if (placeholder) {
    out.push(makeEvidence("dom", "placeholder", placeholder, 1.0));
  }

  // ---------- required ----------
  if (
    (el as HTMLInputElement).required ||
    el.hasAttribute("required") ||
    el.getAttribute("aria-required") === "true"
  ) {
    out.push(makeEvidence("dom", "required", true, 1.0));
  } else if (labelText && /[*✱﹡＊]\s*$/.test(labelText.trim())) {
    out.push(makeEvidence("dom", "required", true, 0.6, { via: "asterisk-heuristic" }));
  }

  // ---------- options ----------
  const options = readOptions(el, doc);
  if (options && options.length) {
    out.push(makeEvidence("dom", "options", options, 1.0));
  }

  // ---------- validation ----------
  const v = readValidation(el);
  if (v) out.push(makeEvidence("dom", "validation", v, 1.0));

  // ---------- section ----------
  const section = nearestHeadingText(el);
  if (section) out.push(makeEvidence("dom", "section", section, 0.8));

  // ---------- bbox ----------
  try {
    const r = (el as HTMLElement).getBoundingClientRect?.();
    if (r && (r.width || r.height)) {
      out.push(
        makeEvidence(
          "dom",
          "bbox",
          { x: r.left, y: r.top, w: r.width, h: r.height },
          1.0
        )
      );
    }
  } catch {
    // ignore
  }

  return out;
}

// ============ helpers ============

function readNativeLabel(el: Element, doc: Document | null): string | null {
  // <label for=id> — but reject framework-generated IDs so we don't collide.
  const id = el.getAttribute("id");
  const GENERATED_ID_RE =
    /^:[a-z0-9]+:$|^[0-9a-f]{8}-[0-9a-f]{4}-|--[a-f0-9]{6,}$|^(mui|rc|rdk|headlessui|radix)-[a-z0-9-]+$|^r[0-9]+$/i;
  if (id && !GENERATED_ID_RE.test(id) && doc) {
    const forLabel = doc.querySelector(`label[for="${cssEscape(id)}"]`);
    const t = textOf(forLabel);
    if (t) return t;
  }

  // wrapping <label>
  const wrap = el.closest("label");
  if (wrap) {
    // Remove the control's own contents from consideration.
    const clone = wrap.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input,textarea,select,button").forEach((n) => n.remove());
    const t = normalize(clone.textContent || "");
    if (t) return t;
  }
  // <fieldset><legend>
  const fs = el.closest("fieldset");
  if (fs) {
    const legend = fs.querySelector(":scope > legend");
    const t = textOf(legend);
    if (t) return t;
  }
  return null;
}

function readOptions(el: Element, doc: Document | null): Array<{ value: string; label: string }> | null {
  const tag = el.tagName.toLowerCase();

  if (tag === "select") {
    const opts = Array.from((el as HTMLSelectElement).options);
    return opts
      .filter((o) => o.value !== "" || o.textContent?.trim())
      .map((o) => ({ value: o.value, label: normalize(o.textContent || "") }));
  }

  // Radio group by shared name
  const type = ((el as HTMLInputElement).type || "").toLowerCase();
  const name = (el as HTMLInputElement).name;
  if ((type === "radio" || type === "checkbox") && name && doc) {
    const form = (el as HTMLInputElement).form ?? doc;
    const nodes = Array.from(
      form.querySelectorAll<HTMLInputElement>(
        `input[type="${type}"][name="${cssEscape(name)}"]`
      )
    );
    if (nodes.length > 1) {
      return nodes.map((n) => ({
        value: n.value,
        label: labelForRadio(n) || n.value,
      }));
    }
  }

  // ARIA listbox / combobox
  const role = el.getAttribute("role");
  if (role === "listbox" || role === "combobox") {
    const optNodes = el.querySelectorAll('[role="option"]');
    if (optNodes.length) {
      return Array.from(optNodes).map((o) => ({
        value: o.getAttribute("data-value") || normalize(o.textContent || ""),
        label: normalize(o.textContent || ""),
      }));
    }
  }

  return null;
}

function labelForRadio(input: HTMLInputElement): string {
  if (input.id) {
    const doc = input.ownerDocument;
    const l = doc?.querySelector(`label[for="${cssEscape(input.id)}"]`);
    const t = textOf(l);
    if (t) return t;
  }
  const wrap = input.closest("label");
  if (wrap) {
    const clone = wrap.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input").forEach((n) => n.remove());
    const t = normalize(clone.textContent || "");
    if (t) return t;
  }
  return "";
}

function readValidation(
  el: Element
): { pattern?: string; min?: number; max?: number; maxLength?: number; format?: string } | null {
  const input = el as HTMLInputElement;
  const v: {
    pattern?: string;
    min?: number;
    max?: number;
    maxLength?: number;
    format?: string;
  } = {};
  if (input.pattern) v.pattern = input.pattern;
  if (input.min && !Number.isNaN(Number(input.min))) v.min = Number(input.min);
  if (input.max && !Number.isNaN(Number(input.max))) v.max = Number(input.max);
  if (input.maxLength && input.maxLength > 0) v.maxLength = input.maxLength;
  const t = (input.type || "").toLowerCase();
  if (t === "email" || t === "url" || t === "tel" || t === "date" || t === "number") {
    v.format = t;
  }
  return Object.keys(v).length ? v : null;
}

function nearestHeadingText(el: Element): string | null {
  let node: Element | null = el;
  while (node) {
    // preceding heading siblings
    let sib: Element | null = node.previousElementSibling;
    while (sib) {
      if (/^H[1-6]$/.test(sib.tagName) || sib.getAttribute("role") === "heading") {
        const t = textOf(sib);
        if (t) return t;
      }
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
  }
  return null;
}

function textOf(n: Element | null): string {
  if (!n) return "";
  return normalize(n.textContent || "");
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
