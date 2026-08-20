/**
 * CandidateAskCards.tsx — v3.9.0.
 *
 * The free-form chat under the results is gone. AYN is still the brain, it
 * just answers four fixed questions per candidate and renders the answer in
 * place under that candidate. Answers are cached per (search_id, ref, card),
 * so clicking a card twice never re-runs the model.
 */
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { employerApi, type CardKey } from "@/lib/employer";
import { useToast } from "@/hooks/use-toast";

const CARDS: { key: CardKey; label: string; multiOnly?: boolean }[] = [
  { key: "why_score", label: "Why this score" },
  { key: "what_is_missing", label: "What is missing" },
  { key: "compare", label: "Compare to the others", multiOnly: true },
  { key: "screen_questions", label: "What to ask in a screen" },
];

export default function CandidateAskCards({
  searchId, candidateRef, total,
}: { searchId: string; candidateRef: string; total: number }) {
  const { toast } = useToast();
  const cache = useRef<Map<string, string>>(new Map());
  const [active, setActive] = useState<CardKey | null>(null);
  const [answer, setAnswer] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const ask = useCallback(async (key: CardKey) => {
    if (busy) return;
    if (active === key) { setActive(null); setAnswer(""); return; }
    const cacheKey = `${searchId}|${candidateRef}|${key}`;
    const hit = cache.current.get(cacheKey);
    if (hit) { setActive(key); setAnswer(hit); return; }
    setActive(key);
    setAnswer("");
    setBusy(true);
    try {
      const r = await employerApi.cardAnswer(searchId, candidateRef, key);
      cache.current.set(cacheKey, r.answer);
      setAnswer(r.answer);
    } catch (e) {
      toast({ title: "AYN could not answer", description: (e as Error).message, variant: "destructive" });
      setActive(null);
    } finally { setBusy(false); }
  }, [active, busy, candidateRef, searchId, toast]);

  const visible = CARDS.filter(c => !c.multiOnly || total > 1);
  const activeLabel = CARDS.find(c => c.key === active)?.label || "";

  return (
    <div className="space-y-3 pt-1">
      <div className="flex flex-wrap gap-2">
        {visible.map(c => (
          <Button
            key={c.key}
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-full text-xs font-medium"
            style={active === c.key ? { borderColor: "var(--rh-accent)", background: "var(--rh-tint)", color: "var(--rh-accent-2)" } : undefined}
            onClick={() => ask(c.key)}
          >
            {busy && active === c.key ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : null}
            {c.label}
          </Button>
        ))}
      </div>
      {active && (busy || answer) && (
        <div className="rounded-xl px-4 py-3.5 space-y-2" style={{ border: "1px solid var(--rh-hair)", borderLeft: "2px solid var(--rh-accent)", background: "var(--rh-surface)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {activeLabel}
          </p>
          {busy && !answer ? (
            <div className="space-y-2" aria-live="polite">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading the match result…
              </p>
              <div className="h-3 rounded bg-muted animate-pulse w-11/12" />
              <div className="h-3 rounded bg-muted animate-pulse w-4/5" />
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{answer}</p>
          )}
        </div>
      )}
    </div>
  );
}

