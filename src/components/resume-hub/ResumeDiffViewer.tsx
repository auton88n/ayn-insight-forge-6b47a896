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

function renderInline(before: string, after: string, side: "before" | "after") {
  const parts = diffWordsWithSpace(before, after);
  return parts.map((p, i) => {
    if (side === "before") {
      if (p.added) return null;
      return (
        <span
          key={i}
          className={p.removed ? "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 line-through" : ""}
        >
          {p.value}
        </span>
      );
    }
    if (p.removed) return null;
    return (
      <span
        key={i}
        className={p.added ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : ""}
      >
        {p.value}
      </span>
    );
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

      {/* Column headers */}
      <div className="hidden md:grid grid-cols-2 gap-3 text-xs font-semibold" style={{ color: "var(--rh-faint, currentColor)" }}>
        <div>Original</div>
        <div>Improved</div>
      </div>

      {/* Diff rows */}
      <div className="rounded-xl overflow-hidden divide-y" style={{ border: "1px solid var(--rh-hair, var(--border))", borderColor: "var(--rh-hair, var(--border))" }}>
        {hunks.map(h => {
          // "changed"/"added"/"removed" all need the accept/reject toggle;
          // only a genuinely unchanged line is purely informational.
          const isActionable = h.status !== "unchanged";
          const isAccepted = accepted.has(h.id);
          return (
            <div
              key={h.id}
              className="grid md:grid-cols-[1fr_1fr_auto] gap-0 md:gap-3 items-stretch"
              style={{
                background: isActionable
                  ? isAccepted ? "var(--rh-trust-tint, transparent)" : "var(--rh-tint, transparent)"
                  : "var(--rh-surface, var(--background))",
                borderColor: "var(--rh-hair, var(--border))",
              }}
            >
              <div className="px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap border-b md:border-b-0 md:border-r" style={{ borderColor: "var(--rh-hair, var(--border))" }}>
                {h.status === "changed" && renderInline(h.before, h.after, "before")}
                {h.status === "removed" && renderInline(h.before, "", "before")}
                {h.status === "added" && <span style={{ color: "var(--rh-muted, currentColor)" }}>{"\u00A0"}</span>}
                {h.status === "unchanged" && <span style={{ color: "var(--rh-muted, currentColor)" }}>{h.before || "\u00A0"}</span>}
              </div>
              <div className="px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                {h.status === "changed" && (
                  isAccepted
                    ? renderInline(h.before, h.after, "after")
                    : <span className="italic line-through" style={{ color: "var(--rh-muted, currentColor)" }}>{h.after || "\u00A0"}</span>
                )}
                {h.status === "added" && (
                  isAccepted
                    ? renderInline("", h.after, "after")
                    : <span className="italic line-through" style={{ color: "var(--rh-muted, currentColor)" }}>{h.after || "\u00A0"}</span>
                )}
                {h.status === "removed" && <span style={{ color: "var(--rh-muted, currentColor)" }}>{"\u00A0"}</span>}
                {h.status === "unchanged" && <span style={{ color: "var(--rh-muted, currentColor)" }}>{h.after || "\u00A0"}</span>}
              </div>
              {isActionable && (
                <div className="px-2 py-2 flex md:flex-col gap-1 items-center justify-center border-t md:border-t-0 md:border-l" style={{ borderColor: "var(--rh-hair, var(--border))" }}>
                  <button
                    type="button"
                    className="h-7 w-7 rounded-full flex items-center justify-center transition"
                    style={isAccepted
                      ? { background: "var(--rh-trust, #16a34a)", color: "#fff" }
                      : { background: "var(--rh-raised, transparent)", color: "var(--rh-muted, currentColor)" }}
                    onClick={() => toggle(h.id)}
                    title={isAccepted ? "Reject this change" : "Accept this change"}
                  >
                    {isAccepted ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ResumeDiffViewer;
