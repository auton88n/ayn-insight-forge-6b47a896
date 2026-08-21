/**
 * v3.13.0 — the employer's send-an-assessment dialog.
 *
 * Generate from the candidate's own profile, review the questions, drop any
 * you dislike, set a time limit and an expiry, send. The rubric behind each
 * question is never returned to this client, so there is nothing to edit.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Send, Trash2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AynLoader } from "@/components/shared/AynLoader";
import { assessmentApi, ASSESSMENT_LIMIT_NOTE, type PubQuestion } from "@/lib/assessments";

// v3.157.0 — the per-question caps a candidate actually sees (2 minutes for
// a multiple-choice question, 3 for a short answer, AssessmentsTab.tsx's own
// QUESTION_BUDGET_SECONDS) are the real source of truth for how long an
// honest answer takes. A flat 30-minute default regardless of question count
// read as arbitrarily long. The suggested limit below is computed from the
// actual question mix instead; these fixed options stay as an override.
const QUESTION_SECONDS: Record<string, number> = { mc: 120, short: 180 };
const LIMITS = [
  { label: "15 minutes", value: 900 },
  { label: "30 minutes", value: 1800 },
  { label: "45 minutes", value: 2700 },
  { label: "60 minutes", value: 3600 },
];
const EXPIRIES = [
  { label: "3 days", value: 3 },
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
];

export default function AssessmentDialog({
  open, onOpenChange, orgId, searchId, candidateRef, onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orgId: string;
  searchId: string;
  candidateRef: string;
  onSent: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PubQuestion[]>([]);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(1800);
  const [suggestedLimit, setSuggestedLimit] = useState<number | null>(null);
  const [expiry, setExpiry] = useState(7);

  const generate = useCallback(async () => {
    setBusy(true);
    setDropped(new Set());
    try {
      const r = await assessmentApi.generate(orgId, searchId, candidateRef);
      setAssessmentId(r.assessment_id);
      setQuestions(r.questions || []);
      const suggested = (r.questions || []).reduce(
        (sum, q) => sum + (QUESTION_SECONDS[q.type] || QUESTION_SECONDS.short), 0,
      );
      const clamped = Math.max(300, Math.min(7200, Math.ceil(suggested / 300) * 300));
      setSuggestedLimit(clamped);
      setLimit(clamped);
    } catch (e) {
      toast({ title: "Could not build an assessment", description: (e as Error).message, variant: "destructive" });
      onOpenChange(false);
    } finally { setBusy(false); }
  }, [orgId, searchId, candidateRef, toast, onOpenChange]);

  useEffect(() => {
    if (open && !assessmentId && !busy) void generate();
    if (!open) { setAssessmentId(null); setQuestions([]); setSuggestedLimit(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const kept = questions.filter(q => !dropped.has(q.id));

  const send = async () => {
    if (!assessmentId) return;
    if (kept.length < 3) {
      toast({ title: "Keep at least three questions", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      await assessmentApi.send(assessmentId, kept.map(q => q.id), limit, expiry);
      toast({ title: "Assessment sent", description: "You will see the result here once they submit." });
      onOpenChange(false);
      onSent();
    } catch (e) {
      toast({ title: "Could not send", description: (e as Error).message, variant: "destructive" });
    } finally { setSending(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send an assessment</DialogTitle>
          <DialogDescription>
            Written from this candidate's own profile to check that what they claim is real.
            They never see how they scored.
          </DialogDescription>
        </DialogHeader>

        {busy ? (
          <div className="py-12 flex items-center justify-center">
            <AynLoader size="md" label="Loading" />
          </div>
        ) : (

          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground leading-relaxed">{ASSESSMENT_LIMIT_NOTE}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Time limit</Label>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedLimit && !LIMITS.some(l => l.value === suggestedLimit) && (
                    <button
                      type="button"
                      onClick={() => setLimit(suggestedLimit)}
                      className="rounded-full border px-3 py-1 text-xs transition-colors"
                        style={{
                          ...((limit === suggestedLimit)
                            ? { borderColor: "var(--rh-accent)", background: "var(--rh-tint)", color: "var(--rh-accent-2)", fontWeight: 500 }
                            : { borderColor: "var(--rh-hair)", color: "var(--rh-muted)" }),
                      }}
                    >Suggested ({Math.round(suggestedLimit / 60)} min)</button>
                  )}
                  {LIMITS.map(l => (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => setLimit(l.value)}
                      className="rounded-full border px-3 py-1 text-xs transition-colors"
                      style={limit === l.value
                        ? { borderColor: "var(--rh-accent)", background: "var(--rh-tint)", color: "var(--rh-accent-2)", fontWeight: 500 }
                        : { borderColor: "var(--rh-hair)", color: "var(--rh-muted)" }}
                    >{l.label}</button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Suggested from this question set: 2 minutes per multiple choice, 3 per short answer.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Expires in</Label>
                <div className="flex flex-wrap gap-1.5">
                  {EXPIRIES.map(l => (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => setExpiry(l.value)}
                      className="rounded-full border px-3 py-1 text-xs transition-colors"
                      style={expiry === l.value
                        ? { borderColor: "var(--rh-accent)", background: "var(--rh-tint)", color: "var(--rh-accent-2)", fontWeight: 500 }
                        : { borderColor: "var(--rh-hair)", color: "var(--rh-muted)" }}
                    >{l.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {kept.length} questions
                </p>
                <Button variant="ghost" size="sm" onClick={generate} disabled={busy}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Regenerate
                </Button>
              </div>
              {questions.map((q, i) => {
                const off = dropped.has(q.id);
                return (
                  <div
                    key={q.id}
                    className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${off ? "border-border/40 opacity-50" : "border-border/70"}`}
                  >
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="font-normal shrink-0">
                        {q.type === "mc" ? "Multiple choice" : "Short answer"}
                      </Badge>
                      <p className="text-sm leading-relaxed flex-1">{i + 1}. {q.text}</p>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                        aria-label={off ? "Put this question back" : "Remove this question"}
                        onClick={() => setDropped(prev => {
                          const next = new Set(prev);
                          if (next.has(q.id)) next.delete(q.id); else next.add(q.id);
                          return next;
                        })}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {q.type === "mc" && (
                      <ul className="pl-4 space-y-0.5">
                        {(q.options || []).map((o, oi) => (
                          <li key={oi} className="text-xs text-muted-foreground leading-relaxed">{o}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={send}
            disabled={sending || busy || kept.length < 3}
            className="hover:opacity-90"
            style={{ background: "var(--rh-gradient)", borderColor: "transparent", color: "#fff", boxShadow: "var(--rh-glow)" }}
          >
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send assessment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
