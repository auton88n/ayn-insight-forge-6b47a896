/**
 * __corpus__/capture.ts
 * Run this from the extension console on any live application page to serialize
 * the current form into a corpus fixture. Records everything the engine needs to
 * reconstruct questions offline: nodes, attributes (incl. data-automation-id),
 * roles, accessible names, options, visibility, and container refs.
 */

export interface CapturedControl {
  tag: string;
  type: string | null;
  name: string | null;
  id: string | null;
  dataAttrs: Record<string, string>;
  role: string | null;
  ariaLabel: string | null;
  ariaLabelledbyText: string | null;
  accessibleName: string | null;
  visibleLabel: string | null;
  options: Array<{ value: string; label: string }>;
  visible: boolean;
  containerPath: string | null;
}

export interface Fixture {
  ats: string;
  url: string;
  capturedAt: string;
  controls: CapturedControl[];
  /** Human-annotated expected questions, added after capture, used by the benchmark. */
  expected?: ExpectedQuestion[];
}

export interface ExpectedQuestion {
  label: string;
  semanticType: string;
  kind: string;
  required: boolean;
  optionLabels: string[];
}

/** Serialize the form region under root into a Fixture (expected filled in by hand). */
export function capture(root: Document | Element, ats: string): Fixture {
  const controls: CapturedControl[] = [];
  const sel = "input,textarea,select,button,[role=radio],[role=checkbox],[role=combobox],[role=listbox]";
  root.querySelectorAll(sel).forEach((el) => {
    controls.push(serialize(el as HTMLElement));
  });
  return {
    ats,
    url: (root instanceof Document ? root : root.ownerDocument)?.location?.href ?? "",
    capturedAt: new Date().toISOString(),
    controls,
  };
}

function serialize(el: HTMLElement): CapturedControl {
  const dataAttrs: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) {
    if (a.name.startsWith("data-")) dataAttrs[a.name] = a.value;
  }
  const options: Array<{ value: string; label: string }> = [];
  if (el.tagName === "SELECT") {
    (el as HTMLSelectElement).querySelectorAll("option").forEach((o) =>
      options.push({ value: o.value, label: (o.textContent ?? "").trim() })
    );
  }
  return {
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute("type"),
    name: el.getAttribute("name"),
    id: el.id || null,
    dataAttrs,
    role: el.getAttribute("role"),
    ariaLabel: el.getAttribute("aria-label"),
    ariaLabelledbyText: null,
    accessibleName: null,
    visibleLabel: null,
    options,
    visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    containerPath: null,
  };
}
