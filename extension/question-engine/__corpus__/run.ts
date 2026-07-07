/**
 * __corpus__/run.ts
 * Rehydrates a fixture into a live Document and runs the engine against it, so
 * the benchmark harness can score real Question[] output without a browser.
 *
 * In Node this is wired via jsdom in the test bootstrap. In browser contexts a
 * caller can pass a pre-built Document (e.g. from DOMParser). The engine itself
 * is document-agnostic — we only need SOMETHING that answers querySelectorAll.
 */

import type { Fixture, CapturedControl } from "./capture";
import { scanForm } from "../index";
import type { Question } from "../question";

export interface RunResult {
  fixture: Fixture;
  questions: Question[];
}

/**
 * Build a minimal HTML document from a fixture's captured controls and scan it.
 * Requires a DOMParser (browser or jsdom-provided global).
 */
export function runFixture(fixture: Fixture, parser?: DOMParser): RunResult {
  const p = parser ?? (typeof DOMParser !== "undefined" ? new DOMParser() : null);
  if (!p) throw new Error("runFixture: DOMParser not available; pass one in Node via jsdom");
  const html = renderHtml(fixture);
  const doc = p.parseFromString(html, "text/html");
  const questions = scanForm(doc);
  return { fixture, questions };
}

function renderHtml(fixture: Fixture): string {
  const body = fixture.controls.map(renderControl).join("\n");
  return `<!doctype html><html><body><form>${body}</form></body></html>`;
}

function renderControl(c: CapturedControl): string {
  const attrs = [
    c.id ? `id="${escape(c.id)}"` : "",
    c.name ? `name="${escape(c.name)}"` : "",
    c.type ? `type="${escape(c.type)}"` : "",
    c.role ? `role="${escape(c.role)}"` : "",
    c.ariaLabel ? `aria-label="${escape(c.ariaLabel)}"` : "",
    ...Object.entries(c.dataAttrs).map(([k, v]) => `${k}="${escape(v)}"`),
  ]
    .filter(Boolean)
    .join(" ");
  const labelHtml = c.visibleLabel && c.id
    ? `<label for="${escape(c.id)}">${escape(c.visibleLabel)}</label>`
    : "";
  if (c.tag === "select") {
    const options = c.options
      .map((o) => `<option value="${escape(o.value)}">${escape(o.label)}</option>`)
      .join("");
    return `${labelHtml}<select ${attrs}>${options}</select>`;
  }
  if (c.tag === "textarea") return `${labelHtml}<textarea ${attrs}></textarea>`;
  return `${labelHtml}<${c.tag} ${attrs} />`;
}

function escape(s: string): string {
  return String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
