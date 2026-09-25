import { useMemo, useState } from "react";
import { diffLines, diffWordsWithSpace } from "diff";
import { Button } from "@/components/ui/button";
import { Check, X, Copy, CheckCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Hunk {
  id: number;
  before: string;
  after: string;
  // "changed": a line was edited (real content on both sides, word-diffed).
  // "added"/"removed": a line exists on only one side, no counterpart at all.
  status: "changed" | "unchanged" | "added" | "removed";
}

// Sept 2026 -- "the lines are not lining up," reported against a real
// screenshot where a row's Original text and Improved text were visibly
// unrelated content. This was never a layout bug: the old buildHunks split
// both documents into flat line arrays and paired o[k] with i[k] by plain
// array index. The instant a real edit inserts, deletes, or reorders a
// single line anywhere above a point in the document (adding a new
// "Languages:" line, moving EXPERIENCE, anything), every row after that
// point pairs two lines that no longer correspond to the same content at
// all -- the two sides just drift out of step for the rest of the diff.
// Rebuilt on the diff package's own diffLines (a real LCS-based line
// matcher, not positional zipping): unchanged lines stay one row each;
// a remove immediately followed by an add (diffLines' own idiom for "this
// line was edited") pairs up so the existing word-level highlight still
// applies; anything left over is a genuine addition or removal with
// nothing at all on the other side, rendered as its own row with the
// opposite column intentionally blank rather than forced to align with
// unrelated text.
function linesOf(value: string): string[] {
  const lines = value.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function buildHunks(original: string, improved: string): Hunk[] {
  // Normalize to a single trailing newline on both sides first -- diffLines
  // compares raw tokens including the newline character, so an otherwise
  // identical last line reports as a spurious remove+add whenever only one
  // side happens to end in "\n" and the other doesn't.
  const changes = diffLines(`${original.replace(/\n?$/, "")}\n`, `${improved.replace(/\n?$/, "")}\n`);
  const hunks: Hunk[] = [];
  let id = 0;

  for (let idx = 0; idx < changes.length; idx++) {
    const change = changes[idx];

    if (!change.added && !change.removed) {
      for (const line of linesOf(change.value)) {
        hunks.push({ id: id++, before: line, after: line, status: "unchanged" });
      }
      continue;
    }

    if (change.removed) {
      const removedLines = linesOf(change.value);
      const next = changes[idx + 1];
      if (next?.added) {
        // The classic "this line was edited" shape: diffLines reports it as
        // a removed block immediately followed by an added block of the
        // same region. Pair them line by line so renderInline's word-level
        // highlight still applies; any leftover on the longer side (a
        // genuine multi-line insert/delete sitting inside the same edit)
        // becomes its own added/removed row instead of a false pairing.
        const addedLines = linesOf(next.value);
        const max = Math.max(removedLines.length, addedLines.length);
        for (let k = 0; k < max; k++) {
          const before = removedLines[k];
          const after = addedLines[k];
          if (before !== undefined && after !== undefined) {
            hunks.push({ id: id++, before, after, status: "changed" });
          } else if (before !== undefined) {
            hunks.push({ id: id++, before, after: "", status: "removed" });
          } else {
            hunks.push({ id: id++, before: "", after, status: "added" });
          }
        }
        idx++; // the paired "added" block was just consumed above
        continue;
      }
      for (const line of removedLines) {
        hunks.push({ id: id++, before: line, after: "", status: "removed" });
      }
      continue;
    }

    // A pure addition with no removed block right before it to pair against.
    for (const line of linesOf(change.value)) {
      hunks.push({ id: id++, before: "", after: line, status: "added" });
    }
  }

  return hunks;
}

// Sept 2026 -- "I don't like this side by side like a table," asked
// directly what else it could be, and picked "track changes, one column"
// from three real options: this reads top to bottom like the actual
// resume (like Word or Google Docs suggested edits) instead of two panels
// that have to be read in lockstep. One word-diff pass now renders BOTH
// the struck-through removal and the underlined addition inline, in the
// order they actually occur in the sentence -- there is no separate
// "before" and "after" render any more, just one true sequence of parts.
// Diffing a string against itself (the unchanged-line case) or against an
// empty string (a pure addition/removal, "changed" | "added" | "removed"
// all reuse this one function) both degrade correctly on their own, so
// every hunk status can call this the same way with no branching here.
// A word-level interleave reads great for a small, targeted edit (a
// couple of words changed) but turns to noise once a sentence is nearly
// entirely reworded -- a real, inherent property of word diffing two
// dissimilar strings, not specific to this component (the old two-column
// layout hit the identical algorithm, it was just less visible split
// across two panels). Measured against real content before picking a
// number: a genuine small edit and a moderate rewrite both retain
// 60%+ of their characters unchanged, while a near-total rewrite
// retains under 15% -- 0.35 sits cleanly in the real gap between them.
const REWRITE_THRESHOLD = 0.35;

function renderTrackedLine(before: string, after: string) {
  const parts = diffWordsWithSpace(before, after);

  if (before && after) {
    const unchangedLen = parts.reduce((sum, p) => sum + (p.added || p.removed ? 0 : p.value.length), 0);
    const similarity = unchangedLen / Math.max(before.length, after.length, 1);
    if (similarity < REWRITE_THRESHOLD) {
      // Near-total rewrite: show the whole old sentence struck through,
      // then the whole new one underlined, as two clean chunks -- the
      // same call a person resolving "this whole line changed" would
      // make by hand, rather than a fine word-by-word interleave.
      return (
        <>
          <span className="line-through bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">{before}</span>
          {" "}
          <span className="underline decoration-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">{after}</span>
        </>
      );
    }
  }

  return parts.map((p, i) => {
    if (p.removed) {
      return (
        <span key={i} className="line-through bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
          {p.value}
        </span>
      );
    }
    if (p.added) {
      return (
        <span key={i} className="underline decoration-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
          {p.value}
        </span>
      );
    }
    return <span key={i}>{p.value}</span>;
  });
}

interface Props {
  original: string;
  improved: string;
  onConfirm?: (finalText: string) => void;
}

export function ResumeDiffViewer({ original, improved, onConfirm }: Props) {
  const { toast } = useToast();
  const hunks = useMemo(() => buildHunks(original, improved), [original, improved]);
  const changedIds = useMemo(() => hunks.filter(h => h.status !== "unchanged").map(h => h.id), [hunks]);
  const [accepted, setAccepted] = useState<Set<number>>(() => new Set(changedIds));
  const [copied, setCopied] = useState(false);

  const finalText = useMemo(() => {
    // Unlike the old positional pairing, "added"/"removed" hunks have no
    // real counterpart on one side at all -- a rejected addition or an
    // accepted removal must contribute NO line to the final text, not an
    // empty one, or the result would gain a stray blank line for every
    // such decision.
    const lines: string[] = [];
    for (const h of hunks) {
      if (h.status === "unchanged") { lines.push(h.after); continue; }
      if (h.status === "added") { if (accepted.has(h.id)) lines.push(h.after); continue; }
      if (h.status === "removed") { if (!accepted.has(h.id)) lines.push(h.before); continue; }
      lines.push(accepted.has(h.id) ? h.after : h.before);
    }
    return lines.join("\n");
  }, [hunks, accepted]);

  const acceptedCount = accepted.size;
  const totalChanges = changedIds.length;

  function toggle(id: number) {
    setAccepted(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function acceptAll() { setAccepted(new Set(changedIds)); }
  function rejectAll() { setAccepted(new Set()); }

  async function copy() {
    await navigator.clipboard.writeText(finalText);
    setCopied(true); setTimeout(() => setCopied(false), 1800);
    toast({ title: "Copied to clipboard" });
  }

  return (
    // v3.178.0 \u2014 "make sure all the pages have the same design we have in
    // the browser," and a sweep for exactly this shape of gap (a whole
    // component never touched by the Charcoal & Ember pass) found this
    // one: raw border/background/monospace-uppercase throughout, and a
    // literal bg-orange-500 for the confirm button -- Tailwind's stock
    // orange, not this app's actual ember (#e85d3a), so the one button
    // meant to look most "AYN" was quietly the wrong brand color the
    // whole time. Retinted to rh-tokens and the app's normal Figtree
    // typography; every bit of diff/accept/reject logic above is
    // untouched.
    <div className="space-y-4">
      {/* Sticky toolbar */}
      <div
        className="sticky top-16 z-10 rounded-xl p-3 flex flex-wrap items-center gap-3 justify-between"
        style={{ background: "var(--rh-surface, var(--background))", border: "1px solid var(--rh-hair, var(--border))", boxShadow: "var(--rh-shadow-card)" }}
      >
        <div className="text-xs">
          <span className="font-bold" style={{ color: "var(--rh-ink, currentColor)" }}>{acceptedCount}</span>
          <span style={{ color: "var(--rh-muted, currentColor)" }}> of </span>
          <span className="font-bold" style={{ color: "var(--rh-ink, currentColor)" }}>{totalChanges}</span>
          <span style={{ color: "var(--rh-muted, currentColor)" }}> changes accepted</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={rejectAll}>
            <X className="w-3.5 h-3.5 mr-1" /> Reject all
          </Button>
          <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={acceptAll}>
            <Check className="w-3.5 h-3.5 mr-1" /> Accept all
          </Button>
          <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={copy}>
            {copied ? <CheckCheck className="w-3.5 h-3.5 mr-1" style={{ color: "var(--rh-trust)" }} /> : <Copy className="w-3.5 h-3.5 mr-1" />}
            Copy final
          </Button>
          {onConfirm && (
            <Button
              size="sm"
              className="rounded-full text-xs hover:opacity-90"
              style={{ background: "var(--rh-gradient)", borderColor: "transparent", color: "#fff", boxShadow: "var(--rh-glow)" }}
              onClick={() => onConfirm(finalText)}
            >
              Save as new version
            </Button>
          )}
        </div>
      </div>

      {/* Legend, plain and short -- the color coding is the only thing here
          that needs any explaining at all. */}
      <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: "var(--rh-muted, currentColor)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400" /> Added
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-400" /> Removed
        </span>
      </div>

      {/* The resume itself, read top to bottom, with every proposed change
          shown inline where it actually happens -- not a second panel to
          cross-reference against. */}
      <div
        className="rounded-xl p-4 md:p-6 space-y-0.5"
        style={{ background: "var(--rh-surface, var(--background))", border: "1px solid var(--rh-hair, var(--border))", boxShadow: "var(--rh-shadow-card)" }}
      >
        {hunks.map(h => {
          // "changed"/"added"/"removed" all need the accept/reject toggle;
          // only a genuinely unchanged line is purely informational and
          // gets no control at all, not even a disabled one.
          const isActionable = h.status !== "unchanged";
          const isAccepted = accepted.has(h.id);
          const hasText = h.before || h.after;
          return (
            <div
              key={h.id}
              className="flex items-start gap-2 rounded-lg px-2 py-1 -mx-2"
              style={{ background: isActionable ? (isAccepted ? "var(--rh-trust-tint, transparent)" : "var(--rh-tint, transparent)") : "transparent" }}
            >
              <div className="w-6 shrink-0 pt-0.5">
                {isActionable && (
                  <button
                    type="button"
                    className="h-6 w-6 rounded-full flex items-center justify-center transition"
                    style={isAccepted
                      ? { background: "var(--rh-trust, #16a34a)", color: "#fff" }
                      : { background: "var(--rh-raised, transparent)", color: "var(--rh-muted, currentColor)" }}
                    onClick={() => toggle(h.id)}
                    title={isAccepted ? "Reject this change" : "Accept this change"}
                  >
                    {isAccepted ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              <p className="flex-1 min-w-0 text-sm leading-relaxed whitespace-pre-wrap py-0.5" style={!hasText ? { color: "var(--rh-muted, currentColor)" } : undefined}>
                {hasText ? renderTrackedLine(h.before, h.after) : "\u00A0"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ResumeDiffViewer;
