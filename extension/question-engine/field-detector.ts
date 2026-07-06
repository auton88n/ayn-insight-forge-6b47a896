/**
 * field-detector.ts
 * DOM -> RawDetection[] -> DetectedField[]. Discovers every interactive control
 * and attaches evidence and layout context. Does NOT group.
 */

import type { RawDetection, DetectedField } from "./question";

export interface DetectOptions {
  pierceShadow?: boolean;
  descendFrames?: boolean;
}

export function detect(root: Document | Element, opts?: DetectOptions): RawDetection[] {
  void root;
  void opts;
  return [];
}

export function enrich(
  raw: ReadonlyArray<RawDetection>,
  root: Document | Element
): DetectedField[] {
  void raw;
  void root;
  return [];
}
