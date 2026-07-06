/**
 * evidence.ts
 * The common currency of the engine. Every understanding signal is expressed as
 * Evidence. Only the Question Builder consumes fused evidence to create
 * Questions; no source ever creates a Question.
 */

export type EvidenceSource =
  | "dom"
  | "accessibility"
  | "adapter"
  | "mutation"
  | "vision";

export type EvidenceKind =
  | "label"
  | "role"
  | "name"
  | "required"
  | "options"
  | "section"
  | "grouping"
  | "validation"
  | "bbox"
  | "placeholder"
  | "description";

export interface Evidence {
  readonly source: EvidenceSource;
  readonly kind: EvidenceKind;
  readonly value: unknown;
  readonly confidence: number;
  readonly weight: number;
  readonly timestamp: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Default trust weights per (source, kind). Config, not code: tuning a weight is
 * a data change measured against the corpus, never a logic change. A weight of 0
 * means the source is not trusted for that kind at all. Vision is deliberately
 * low so it can never override a confident DOM/a11y reading.
 */
export const WEIGHTS: Readonly<
  Record<EvidenceSource, Partial<Record<EvidenceKind, number>>>
> = Object.freeze({
  accessibility: {
    label: 0.9,
    role: 0.95,
    name: 0.9,
    required: 0.9,
    description: 0.85,
  },
  dom: {
    label: 0.7,
    name: 0.6,
    required: 0.8,
    options: 0.9,
    section: 0.7,
    validation: 0.9,
    placeholder: 0.8,
    bbox: 0.9,
  },
  adapter: {
    grouping: 0.95,
    label: 0.85,
    options: 0.9,
    section: 0.85,
    required: 0.85,
  },
  mutation: {
    label: 0.7,
    options: 0.9,
    grouping: 0.6,
  },
  vision: {
    label: 0.4,
    options: 0.4,
    grouping: 0.35,
  },
});

/** Look up the default weight for a (source, kind), 0 if untrusted. */
export function defaultWeight(
  source: EvidenceSource,
  kind: EvidenceKind
): number {
  return WEIGHTS[source]?.[kind] ?? 0;
}

/** Construct an Evidence with the default weight for its (source, kind). */
export function makeEvidence(
  source: EvidenceSource,
  kind: EvidenceKind,
  value: unknown,
  confidence: number,
  metadata?: Record<string, unknown>
): Evidence {
  return Object.freeze({
    source,
    kind,
    value,
    confidence,
    weight: defaultWeight(source, kind),
    timestamp: Date.now(),
    metadata,
  });
}
