/**
 * CandidateChat.tsx — v3.8.0.
 *
 * The only chat in the product. It appears after a search and it is scoped to
 * the candidates that search returned: compare them, explain a score, explain
 * a gap. The server refuses anything else and refuses to guess.
 */
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { employerApi } from "@/lib/employer";
import { useToast } from "@/hooks/use-toast";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Compare the top two",
  "Why did the first one score highest",
  "What is the biggest gap in this shortlist",
];

export default function CandidateChat({ searchId, count }: { searchId: string; count: number }) {
  const { toast } = useToast();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTurns([]); setDraft(""); }, [searchId]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" }); }, [turns, busy]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: t }];
    setTurns(next);
    setDraft("");
    setBusy(true);
    try {
      const r = await employerApi.resultsChat(searchId, next);
      setTurns([...next, { role: "assistant", content: r.reply }]);
    } catch (e) {
      toast({ title: "AYN could not answer", description: (e as Error).message, variant: "destructive" });
      setTurns(next);
    } finally { setBusy(false); }
  };

  return (
    <Card className="p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Ask about these candidates</h2>
        <p className="text-xs text-muted-foreground">
          AYN answers only about the {count} candidates above, using only what the search returned.
        </p>
      </div>

      {turns.length > 0 && (
        <div ref={scrollRef} className="max-h-80 overflow-y-auto space-y-3 pr-1">
          {turns.map((t, i) => (
            <div key={i} className={t.role === "user" ? "flex justify-end" : ""}>
              <p className={t.role === "user"
                ? "max-w-[80%] rounded-2xl bg-primary text-primary-foreground px-3 py-2 text-sm"
                : "max-w-[90%] text-sm leading-relaxed whitespace-pre-wrap"}>
                {t.content}
              </p>
            </div>
          ))}
          {busy && <p className="text-sm text-muted-foreground animate-pulse">Reading the cards…</p>}
        </div>
      )}

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(s => (
            <button key={s} type="button" onClick={() => send(s)}
              className="text-xs rounded-full border border-border/60 px-2.5 py-1 hover:bg-muted transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }}
          placeholder="Ask about a candidate, a score or a gap"
          className="min-h-[44px] max-h-32"
        />
        <Button onClick={() => send(draft)} disabled={busy || !draft.trim()} size="icon" className="shrink-0">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </Card>
  );
}
