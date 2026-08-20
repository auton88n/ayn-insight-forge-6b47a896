import { useMemo, useState } from "react";
import { diffWordsWithSpace } from "diff";
import { Button } from "@/components/ui/button";
import { Check, X, Copy, CheckCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Hunk {
  id: number;
  before: string;
  after: string;
  status: "changed" | "unchanged";
}

function buildHunks(original: string, improved: string): Hunk[] {
  // Split both into lines, pair them with simple LCS-ish line diff via word-diff per line.
  const o = original.split(/\r?\n/);
  const i = improved.split(/\r?\n/);
  const max = Math.max(o.length, i.length);
  const hunks: Hunk[] = [];
  for (let k = 0; k < max; k++) {
    const before = o[k] ?? "";
    const after = i[k] ?? "";
    hunks.push({
      id: k,
      before,
      after,
      status: before.trim() === after.trim() ? "unchanged" : "changed",
    });
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
  const changedIds = useMemo(() => hunks.filter(h => h.status === "changed").map(h => h.id), [hunks]);
  const [accepted, setAccepted] = useState<Set<number>>(() => new Set(changedIds));
  const [copied, setCopied] = useState(false);

  const finalText = useMemo(
    () => hunks.map(h => (h.status === "unchanged" || accepted.has(h.id) ? h.after : h.before)).join("\n"),
    [hunks, accepted]
  );

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
          const isChanged = h.status === "changed";
          const isAccepted = accepted.has(h.id);
          return (
            <div
              key={h.id}
              className="grid md:grid-cols-[1fr_1fr_auto] gap-0 md:gap-3 items-stretch"
              style={{
                background: isChanged
                  ? isAccepted ? "var(--rh-trust-tint, transparent)" : "var(--rh-tint, transparent)"
                  : "var(--rh-surface, var(--background))",
                borderColor: "var(--rh-hair, var(--border))",
              }}
            >
              <div className="px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap border-b md:border-b-0 md:border-r" style={{ borderColor: "var(--rh-hair, var(--border))" }}>
                {isChanged ? renderInline(h.before, h.after, "before") : <span style={{ color: "var(--rh-muted, currentColor)" }}>{h.before || "\u00A0"}</span>}
              </div>
              <div className="px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                {isChanged ? (
                  isAccepted
                    ? renderInline(h.before, h.after, "after")
                    : <span className="italic line-through" style={{ color: "var(--rh-muted, currentColor)" }}>{h.after || "\u00A0"}</span>
                ) : (
                  <span style={{ color: "var(--rh-muted, currentColor)" }}>{h.after || "\u00A0"}</span>
                )}
              </div>
              {isChanged && (
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
