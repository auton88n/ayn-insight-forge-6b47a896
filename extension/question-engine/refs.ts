/**
 * refs.ts
 * Stable element references and the id-minting contract. The existing AYN
 * injector dispatches on id PREFIX; mintId() centralizes that contract so it
 * lives in exactly one place and cannot drift by accident. ElementRef carries a
 * generation counter for re-resolution after DOM mutation.
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

let currentGeneration = 0;

/** Bump the generation. Called by the MutationObserver wrapper after each batch. */
export function nextGeneration(): number {
  return ++currentGeneration;
}

export function getGeneration(): number {
  return currentGeneration;
}

/**
 * Mint an injector-compatible field id. anchorFid is the aynFid of the group
 * anchor (for choice groups) or the control (for single fields). This is the
 * ONLY place ids are constructed.
 */
export function mintId(
  kind: IdKind,
  anchorFid: string,
  frame = ""
): string {
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
 * fid stamp first, then selector, then xpath. Returns null if the element is
 * gone. Implementation lands in a later phase; the contract is fixed here.
 */
export function resolveRef(ref: ElementRef, root: Document | Element): Element | null {
  void ref;
  void root;
  return null;
}
