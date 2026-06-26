import { useMemo, useState } from "react";
import { diffWordsWithSpace } from "diff";
import { Button } from "@/components/ui/button";
import { Check, X, Copy, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
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
    <div className="space-y-4">
      {/* Sticky toolbar */}
      <div className="sticky top-16 z-10 bg-background border-2 border-border p-3 flex flex-wrap items-center gap-3 justify-between">
        <div className="text-xs font-mono uppercase tracking-widest">
          <span className="text-foreground font-bold">{acceptedCount}</span>
          <span className="text-muted-foreground"> of </span>
          <span className="text-foreground font-bold">{totalChanges}</span>
          <span className="text-muted-foreground"> changes accepted</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="rounded-none font-mono text-xs uppercase" onClick={rejectAll}>
            <X className="w-3.5 h-3.5 mr-1" /> Reject all
          </Button>
          <Button size="sm" variant="outline" className="rounded-none font-mono text-xs uppercase" onClick={acceptAll}>
            <Check className="w-3.5 h-3.5 mr-1" /> Accept all
          </Button>
          <Button size="sm" className="rounded-none font-mono text-xs uppercase" onClick={copy}>
            {copied ? <CheckCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
            Copy final
          </Button>
          {onConfirm && (
            <Button size="sm" variant="default" className="rounded-none font-mono text-xs uppercase bg-orange-500 hover:bg-orange-600 text-white" onClick={() => onConfirm(finalText)}>
              Save as new version
            </Button>
          )}
        </div>
      </div>

      {/* Column headers */}
      <div className="hidden md:grid grid-cols-2 gap-3 text-xs font-mono uppercase tracking-widest text-muted-foreground">
        <div>Original</div>
        <div>Improved</div>
      </div>

      {/* Diff rows */}
      <div className="border border-border divide-y divide-border">
        {hunks.map(h => {
          const isChanged = h.status === "changed";
          const isAccepted = accepted.has(h.id);
          return (
            <div
              key={h.id}
              className={cn(
                "grid md:grid-cols-[1fr_1fr_auto] gap-0 md:gap-3 items-stretch",
                isChanged
                  ? isAccepted
                    ? "bg-emerald-50/40 dark:bg-emerald-950/10"
                    : "bg-rose-50/30 dark:bg-rose-950/10"
                  : "bg-background"
              )}
            >
              <div className="px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap border-b md:border-b-0 md:border-r border-border/50">
                {isChanged ? renderInline(h.before, h.after, "before") : <span className="text-muted-foreground">{h.before || "\u00A0"}</span>}
              </div>
              <div className="px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                {isChanged ? (
                  isAccepted
                    ? renderInline(h.before, h.after, "after")
                    : <span className="text-muted-foreground italic line-through">{h.after || "\u00A0"}</span>
                ) : (
                  <span className="text-muted-foreground">{h.after || "\u00A0"}</span>
                )}
              </div>
              {isChanged && (
                <div className="px-2 py-2 flex md:flex-col gap-1 items-center justify-center border-t md:border-t-0 md:border-l border-border/50">
                  <Button
                    size="sm"
                    variant={isAccepted ? "default" : "outline"}
                    className={cn(
                      "h-7 w-7 p-0 rounded-none",
                      isAccepted && "bg-emerald-600 hover:bg-emerald-700 text-white"
                    )}
                    onClick={() => toggle(h.id)}
                    title={isAccepted ? "Reject this change" : "Accept this change"}
                  >
                    {isAccepted ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  </Button>
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
