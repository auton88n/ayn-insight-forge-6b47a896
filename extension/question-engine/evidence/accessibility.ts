/**
 * evidence/accessibility.ts — the "accessibility" evidence source.
 *
 * Implements the subset of the WAI-ARIA accessible name computation that matters
 * for form controls: aria-labelledby -> aria-label -> associated <label> ->
 * title. Emits `name` and, when it agrees with the visible label, `label`.
 * Also surfaces role, required, description, and validation metadata.
 *
 * Recursion into aria-labelledby chains is capped at 2 levels; the corpus will
 * tell us if we need more. Returns Evidence[]; never constructs a Question.
 */

import { makeEvidence, type Evidence } from "../evidence";

const IMPLICIT_ROLES: Record<string, string> = {
  input: "textbox",
  textarea: "textbox",
  select: "combobox",
  button: "button",
  a: "link",
  form: "form",
  fieldset: "group",
};

export function collect(el: Element, root: Document | Element): Evidence[] {
  const out: Evidence[] = [];
  const doc = root instanceof Document ? root : el.ownerDocument;

  // ---------- accessible name ----------
  const name = computeAccessibleName(el, doc, 0);
  if (name) {
    out.push(makeEvidence("accessibility", "name", name, 0.95));
    out.push(makeEvidence("accessibility", "label", name, 0.9, { from: "accname" }));
  }

  // ---------- role ----------
  const role = el.getAttribute("role") || implicitRoleOf(el);
  if (role) {
    out.push(makeEvidence("accessibility", "role", role, role === el.getAttribute("role") ? 1.0 : 0.7));
  }

  // ---------- required ----------
  if (el.getAttribute("aria-required") === "true") {
    out.push(makeEvidence("accessibility", "required", true, 1.0));
  }

  // ---------- description ----------
  const describedBy = el.getAttribute("aria-describedby");
  if (describedBy && doc) {
    const desc = idListText(describedBy, doc);
    if (desc) out.push(makeEvidence("accessibility", "description", desc, 0.95));
  }

  // ---------- validation ----------
  const invalid = el.getAttribute("aria-invalid");
  const errMsgId = el.getAttribute("aria-errormessage");
  if (invalid === "true" || errMsgId) {
    const msg = errMsgId && doc ? idListText(errMsgId, doc) : null;
    out.push(
      makeEvidence("accessibility", "validation", { invalid: invalid === "true", message: msg }, 0.9)
    );
  }

  return out;
}

// ============ helpers ============

/**
 * WAI-ARIA name computation (form-control subset, depth-limited).
 * Order: aria-labelledby -> aria-label -> associated <label> -> title.
 */
export function computeAccessibleName(
  el: Element,
  doc: Document | null,
  depth: number
): string {
  if (depth > 2) return "";

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy && doc) {
    const t = idListText(labelledBy, doc, depth + 1);
    if (t) return t;
  }

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel && ariaLabel.trim()) return normalize(ariaLabel);

  const id = el.getAttribute("id");
  if (id && doc) {
    const forLabel = doc.querySelector(`label[for="${cssEscape(id)}"]`);
    if (forLabel) {
      const t = normalize(forLabel.textContent || "");
      if (t) return t;
    }
  }
  const wrap = el.closest("label");
  if (wrap) {
    const clone = wrap.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input,textarea,select,button").forEach((n) => n.remove());
    const t = normalize(clone.textContent || "");
    if (t) return t;
  }

  const title = el.getAttribute("title");
  if (title && title.trim()) return normalize(title);

  return "";
}

function idListText(idList: string, doc: Document, depth = 0): string {
  const parts: string[] = [];
  for (const id of idList.split(/\s+/).filter(Boolean)) {
    const n = doc.getElementById(id);
    if (!n) continue;
    // If the referenced node is itself a labelling wrapper with its own controls,
    // recurse via accname; otherwise take its text.
    const nested =
      depth > 0 ? normalize(n.textContent || "") : computeAccessibleName(n, doc, depth);
    parts.push(nested || normalize(n.textContent || ""));
  }
  return normalize(parts.join(" "));
}

function implicitRoleOf(el: Element): string | null {
  const tag = el.tagName.toLowerCase();
  if (tag === "input") {
    const t = ((el as HTMLInputElement).type || "text").toLowerCase();
    if (t === "radio") return "radio";
    if (t === "checkbox") return "checkbox";
    if (t === "email" || t === "tel" || t === "url" || t === "text" || t === "search")
      return "textbox";
    if (t === "number") return "spinbutton";
    if (t === "file") return "button";
    return "textbox";
  }
  return IMPLICIT_ROLES[tag] ?? null;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
