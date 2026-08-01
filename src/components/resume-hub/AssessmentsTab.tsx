/**
 * v3.13.0 — the candidate side of verification assessments.
 *
 * The candidate sees the company, the role, how long it takes and when it
 * expires. Starting begins a server enforced timer. One question at a time,
 * no going back, every answer autosaved. After submitting they get a plain
 * confirmation and nothing else: no score, no verdict, no feedback. There is
 * no endpoint on this lane that could return one.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Timer, CheckCircle2, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { assessmentApi, type SeekerAssessment, type StartedAssessment } from "@/lib/assessments";
import { MaintenanceNotice } from "@/components/shared/MaintenanceNotice";

function mmss(total: number): string {
  const s = Math.max(0, total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function AssessmentsTab({ onChanged }: { onChanged?: (pending: number) => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<SeekerAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<StartedAssessment | null>(null);
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState("");
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const questionStart = useRef<number>(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await assessmentApi.list();
      const list = r.assessments || [];
      setRows(list);
      onChanged?.(list.filter(a => a.status === "sent" || a.status === "started").length);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [onChanged]);

  useEffect(() => { void load(); }, [load]);

  const submit = useCallback(async (auto: boolean) => {
    if (!active) return;
    setBusy(true);
    try {
      const r = await assessmentApi.submit(active.id);
      setDone(r.org_name);
      setActive(null);
      await load();
      if (auto) toast({ title: "Time is up", description: "Your answers were submitted." });
    } catch (e) {
      toast({ title: "Could not submit", description: (e as Error).message, variant: "destructive" });
      setActive(null);
      await load();
    } finally { setBusy(false); }
  }, [active, load, toast]);

  // Server enforced deadline. This countdown is only the visible half of it:
  // the edge function rejects and auto submits any answer past the deadline.
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const secs = Math.round((new Date(active.deadline_at).getTime() - Date.now()) / 1000);
      setLeft(secs);
      if (secs <= 0) void submit(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [active, submit]);

  const start = async (id: string) => {
    setBusy(true);
    try {
      const a = await assessmentApi.start(id);
      setActive(a);
      setIdx(0);
      setDraft(String(a.answers?.[a.questions[0]?.id]?.answer ?? ""));
      questionStart.current = Date.now();
      setDone(null);
    } catch (e) {
      toast({ title: "Could not open it", description: (e as Error).message, variant: "destructive" });
      await load();
    } finally { setBusy(false); }
  };

  const saveAndNext = async (value: string) => {
    if (!active) return;
    const q = active.questions[idx];
    if (!q) return;
    setBusy(true);
    try {
      await assessmentApi.answer(active.id, q.id, value, Date.now() - questionStart.current);
      if (idx + 1 >= active.questions.length) {
        await submit(false);
      } else {
        setIdx(idx + 1);
        setDraft("");
        questionStart.current = Date.now();
      }
    } catch (e) {
      toast({ title: "Could not save", description: (e as Error).message, variant: "destructive" });
      await load();
      setActive(null);
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Card className="p-6 space-y-2 max-w-lg">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold">Submitted</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">Your answers went to {done}.</p>
        <Button variant="outline" onClick={() => setDone(null)}>Back to assessments</Button>
      </Card>
    );
  }

  if (active) {
    const q = active.questions[idx];
    return (
      <Card className="p-5 sm:p-6 space-y-4 max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{active.org_name}</p>
            <h2 className="text-sm font-semibold truncate">{active.job_title || "Assessment"}</h2>
          </div>
          <Badge variant={left < 120 ? "destructive" : "outline"} className="gap-1 shrink-0">
            <Timer className="w-3 h-3" /> {mmss(left)}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          Question {idx + 1} of {active.questions.length}. You cannot go back.
        </p>

        {q && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed font-medium">{q.text}</p>
            {q.type === "mc" ? (
              <div className="space-y-2">
                {(q.options || []).map((o, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={busy}
                    onClick={() => saveAndNext(o)}
                    className="w-full text-left rounded-lg border border-border px-3 py-2.5 text-sm leading-relaxed hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >{o}</button>
                ))}
              </div>
            ) : (
              <>
                <Textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  maxLength={3000}
                  className="min-h-[140px]"
                  placeholder="Two to four sentences."
                />
                <Button onClick={() => saveAndNext(draft)} disabled={busy || !draft.trim()}>
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {idx + 1 >= active.questions.length ? "Submit" : "Next question"}
                </Button>
              </>
            )}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Assessments</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A company asked you a few questions about your own work before deciding on a role.
        </p>
      </div>

      {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      {!loading && rows.length === 0 && (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Assessments arrive from companies that found you in the talent pool.
          </p>
        </Card>
      )}

      {rows.map(a => (
        <Card key={a.id} className="p-4 sm:p-5 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {a.org_logo_url
                ? <img src={a.org_logo_url} alt="" className="w-8 h-8 rounded object-cover" />
                : <Building2 className="w-4 h-4 text-muted-foreground" />}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{a.org_name}</p>
                <p className="text-xs text-muted-foreground truncate">{a.job_title}</p>
              </div>
            </div>
            {a.status === "submitted" && <Badge variant="secondary">Submitted</Badge>}
            {a.status === "expired" && <Badge variant="outline">Expired</Badge>}
          </div>

          <p className="text-xs text-muted-foreground">
            {a.question_count} questions · about {Math.round(a.time_limit_seconds / 60)} minutes
            {a.expires_at ? ` · closes ${new Date(a.expires_at).toLocaleDateString()}` : ""}
          </p>

          {a.status === "submitted" ? (
            <p className="text-xs text-muted-foreground">Your answers went to {a.org_name}.</p>
          ) : a.status === "expired" ? (
            <p className="text-xs text-muted-foreground">This one closed before it was submitted.</p>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => start(a.id)}>
              {a.status === "started" ? "Continue" : "Start"}
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}
