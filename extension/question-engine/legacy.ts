/**
 * legacy.ts
 * Temporary compatibility boundary. The engine produces rich Questions; existing
 * consumers get the legacy descriptor via projectToLegacy(). Retired in Stage D.
 */

import type { Question, Answer } from "./question";

export interface LegacyDescriptor {
  id: string;
  kind: string;
  label: string;
  type: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  required: boolean;
  group: string;
  accRole: string;
  labelSource: string;
  section: string;
  placeholder: string;
  _frame: string;
  confidence?: number;
}

export function projectToLegacy(q: Question): LegacyDescriptor {
  return {
    id: q.id,
    kind: legacyKind(q),
    label: q.label,
    type: legacyType(q),
    name: "",
    options: q.options.map((o) => ({ value: o.value, label: o.label })),
    required: q.required,
    group: q.semanticType,
    accRole: "",
    labelSource: "engine",
    section: q.section ?? "",
    placeholder: q.placeholder ?? "",
    _frame: q.frame,
    confidence: q.confidence.overall,
  };
}

export function projectFromLegacyAnswer(descriptorAnswer: {
  value?: string;
  optionValue?: string;
  optionLabel?: string;
  optionLabels?: string[];
  skip?: boolean;
  confidence?: number;
  reasoning?: string;
}): Answer {
  return { ...descriptorAnswer };
}

function legacyKind(q: Question): string {
  switch (q.kind) {
    case "single_choice":
      return "structradio";
    case "multi_choice":
      return "checkbox";
    case "boolean":
      return "buttongroup";
    case "text":
      return "text";
    default:
      return q.kind;
  }
}

function legacyType(q: Question): string {
  switch (q.kind) {
    case "text":
      return "text";
    case "date":
      return "text";
    case "single_choice":
      return "radio";
    case "multi_choice":
      return "checkbox";
    case "boolean":
      return "buttongroup";
    case "file":
      return "file";
    default:
      return "text";
  }
}
