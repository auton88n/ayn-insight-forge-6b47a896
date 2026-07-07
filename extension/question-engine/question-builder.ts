/**
 * question-builder.ts
 * QuestionGroup[] -> Question[]. THE ONLY MODULE THAT CREATES A Question.
 *
 * Steps per group:
 *   1. Collect all evidence (per-control + group-level) into one array.
 *   2. Fuse per kind via evidence/merge.
 *   3. Resolve label, required, options, section, description, placeholder,
 *      validation from fused values.
 *   4. Classify semanticType + QuestionKind via semantic-types.
 *   5. Compute confidence via confidence-engine.
 *   6. Mint injector-compatible id via refs.mintId.
 *   7. Freeze.
 */

import type {
  QuestionGroup,
  Question,
  QuestionKind,
  Option,
  Validation,
  ControlKind,
} from "./question";
import { freezeQuestion } from "./question";
import type { Evidence, EvidenceKind } from "./evidence";
import { fuse } from "./evidence/merge";
import { classify } from "./semantic-types";
import { computeConfidence } from "./confidence-engine";
import { mintId, idKindFor, makeRef, ensureFid } from "./refs";

export function build(groups: ReadonlyArray<QuestionGroup>): Question[] {
  const out: Question[] = [];
  const seenIds = new Set<string>();

  for (const g of groups) {
    if (g.controls.length === 0) continue;

    const allEvidence: Evidence[] = [
      ...g.groupingEvidence,
      ...g.controls.flatMap((c) => c.evidence),
    ];

    const byKind = bucketByKind(allEvidence);
    const labelFused = fuse(byKind.get("label") ?? []);
    const requiredFused = fuse(byKind.get("required") ?? []);
    const optionsFused = fuse(byKind.get("options") ?? []);
    const sectionFused = fuse(byKind.get("section") ?? []);
    const descFused = fuse(byKind.get("description") ?? []);
    const placeholderFused = fuse(byKind.get("placeholder") ?? []);
    const validationFused = fuse(byKind.get("validation") ?? []);

    const anchor = g.controls[0];
    const controlKind = anchor.kind;
    const grouped = g.controls.length > 1;

    const options = resolveOptions(g, optionsFused.value);
    const label = typeof labelFused.value === "string" ? labelFused.value : "";
    const kind = questionKindFor(controlKind, grouped, optionsFused.value, options);

    const classification = classify({
      label,
      section: (sectionFused.value as string) ?? null,
      optionLabels: options.map((o) => o.label),
      placeholder: (placeholderFused.value as string) ?? null,
      kind,
    });

    const confidence = computeConfidence({
      labelEvidence: byKind.get("label") ?? [],
      groupConfidence: g.groupConfidence,
      typingConfidence: classification.confidence,
    });

    const isCustom = controlKind === "custom" || controlKind === "combobox";
    const anchorFid = ensureFid(anchor.node);
    const id = mintId(idKindFor(controlKind, grouped, isCustom), anchorFid, anchor.frame);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const q: Question = {
      id,
      frame: anchor.frame,
      label,
      semanticType: classification.semanticType,
      kind,
      required: requiredFused.value === true,
      options,
      section: (sectionFused.value as string) ?? null,
      description: (descFused.value as string) ?? null,
      placeholder: (placeholderFused.value as string) ?? null,
      helpText: null,
      validation: (validationFused.value as Validation | null) ?? null,
      confidence,
      evidence: Object.freeze(allEvidence),
      controls: Object.freeze(g.controls.map((c) => c.ref)),
    };

    out.push(freezeQuestion(q));
  }

  return out;
}

function bucketByKind(evidence: ReadonlyArray<Evidence>): Map<EvidenceKind, Evidence[]> {
  const m = new Map<EvidenceKind, Evidence[]>();
  for (const e of evidence) {
    const a = m.get(e.kind) ?? [];
    a.push(e);
    m.set(e.kind, a);
  }
  return m;
}

function questionKindFor(
  control: ControlKind,
  grouped: boolean,
  optionsValue: unknown,
  options: ReadonlyArray<Option> = []
): QuestionKind {
  if (control === "file") return "file";
  if (control === "textarea") return "text";
  if (control === "radio") return "single_choice";
  if (control === "checkbox") return grouped ? "multi_choice" : "boolean";
  if (control === "custom" && grouped) return "boolean";
  if (control === "custom" && options.length > 0) return "boolean";
  if (control === "select") return "single_choice";
  if (control === "listbox") return "multi_choice";
  if (control === "combobox") return "single_choice";
  if (Array.isArray(optionsValue) && optionsValue.length > 0) return "single_choice";
  return "text";
}

function resolveOptions(g: QuestionGroup, fusedOptions: unknown): Option[] {
  // Multi-control groups: each member IS an option (radio group, checkbox group).
  if (g.controls.length > 1) {
    return g.controls.map((c) => {
      const input = c.node as HTMLInputElement;
      const label = optionLabelFromControl(c.node) || input.value || "";
      return { value: input.value ?? label, label, ref: c.ref };
    });
  }

  // Single-control groups with an options list (select, listbox, combobox).
  if (Array.isArray(fusedOptions)) {
    const anchor = g.controls[0];
    return (fusedOptions as Array<{ value: string; label: string }>).map((o) => ({
      value: o.value,
      label: o.label,
      // For <option> nodes we don't have per-option refs here; reuse anchor ref.
      ref: makeRef(anchor.node),
    }));
  }

  return [];
}

function optionLabelFromControl(el: Element): string {
  const id = el.getAttribute("id");
  const doc = el.ownerDocument;
  if (id && doc) {
    const l = doc.querySelector(`label[for="${cssEscape(id)}"]`);
    if (l) return normalize(l.textContent || "");
  }
  const wrap = el.closest("label");
  if (wrap) {
    const clone = wrap.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input,textarea,select,button").forEach((n) => n.remove());
    return normalize(clone.textContent || "");
  }
  const aria = el.getAttribute("aria-label");
  if (aria) return normalize(aria);
  return normalize(el.textContent || "");
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
