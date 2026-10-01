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
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Timer, CheckCircle2, Type } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { assessmentApi, type SeekerAssessment, type StartedAssessment } from "@/lib/assessments";
import { MaintenanceNotice } from "@/components/shared/MaintenanceNotice";
import { companyAvatar } from "./BrowseJobs";

// v3.172.0 — checked assessments against real research on what candidates
// say about skills tests: a good one "feels collaborative and real," a bad
// one "feels like a badly-set-up exam." The one concrete thing here that
// read as exam-alarm rather than calm: both timers flashed shadcn's harsh
// "destructive" red the moment they crossed a threshold, binary, no
// graduated warning. Replaced with the same gold AYN already reserves for
// "pay attention to this" elsewhere (salary, low-ATS-score notices) —
// still real urgency, not a fire alarm.
function timerTone(secondsLeft: number, warnAt: number): { color: string; bg: string } {
  if (secondsLeft < Math.min(20, warnAt / 4)) return { color: "#9a5348", bg: "#f5e6e2" };
  if (secondsLeft < warnAt) return { color: "var(--rh-gold)", bg: "var(--rh-gold-tint)" };
  return { color: "var(--rh-muted)", bg: "var(--rh-raised)" };
}

function mmss(total: number): string {
  const s = Math.max(0, total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// v3.155.0 — a per-question budget on top of the existing overall clock.
// Generous, not punishing: enough time to actually read and answer
// honestly, tight enough that reading a full AI-relayed response and
// retyping it by hand (paste is blocked below) costs something real.
// Auto-advances on expiry the same lenient way the overall timer already
// does -- whatever is drafted still gets submitted, nothing is discarded
// for a slow connection or a moment's hesitation.
const QUESTION_BUDGET_SECONDS: Record<string, number> = { mc: 120, short: 180 };

// Not real cryptography -- a deliberately garbled, one-way-looking scramble
// so a copied question reads as corrupted nonsense wherever it lands
// (including inside an AI chat), instead of the real question text.
function scrambleForClipboard(s: string): string {
  const shifted = s
    .split("")
    .map((c) => {
      const code = c.charCodeAt(0);
      return code >= 33 && code <= 126 ? String.fromCharCode(((code - 33 + 13) % 94) + 33) : c;
    })
    .join("");
  return `[AYN assessment content is protected] ${shifted.split("").reverse().join("")}`;
}

// v3.156.0 — asked directly: paste-block and copy-scramble only ever
// touch the browser's clipboard events, and a DOM-reading browser AI
// assistant (Claude for Chrome or similar, given page-read permission)
// never fires those -- it reads document.body.innerText or the real text
// nodes directly, seeing exactly what React rendered, no clipboard
// involved at all. Rendering the question as canvas pixels removes the
// DOM text node that kind of agent would read; it would need real OCR or
// vision on the image instead, a meaningfully harder, slower path for a
// generic, casual assistant a candidate points at the page.
//
// This closes ONE specific gap -- a zero-effort automated read -- not the
// general problem. A person who reads the question with their own eyes
// and retypes it into a chat window is untouched by this, same as by
// everything else built so far; nothing closes that, and the timing and
// no-paste mechanics elsewhere are the real, load-bearing defense against
// it regardless of how the text was obtained.
//
// The accessible-text toggle below is not a loophole patched over --
// it's the honest resolution to a real tension: an aria-label carrying
// the same text would be exactly as machine-readable as a <p> tag, so
// there is no version of "readable by a legitimate screen reader" that
// isn't also "readable by automation using the same accessibility API."
// Rather than silently ship something screen-reader users can't use, this
// offers a real, unconditional switch to plain text -- no proof of need
// required, since demanding one would be inappropriate and likely
// unlawful. Choosing it is a deliberate human action, the same real cost
// as reading the screen and retyping by hand; it does not reopen the
// zero-effort automated case this exists to close.
function CanvasQuestionText({ text, sampleClassName }: { text: string; sampleClassName: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sampleRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const sample = sampleRef.current;
    if (!canvas || !sample) return;

    const draw = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const style = getComputedStyle(sample);
      const color = style.color;
      const fontSize = parseFloat(style.fontSize) || 14;
      const fontWeight = style.fontWeight || "500";
      const fontFamily = style.fontFamily || "sans-serif";
      const lineHeight = Math.round(fontSize * 1.625);
      const dpr = window.devicePixelRatio || 1;
      const maxWidth = Math.max(200, parent.clientWidth);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

      const words = text.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(test).width > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      if (!lines.length) lines.push("");

      const height = lines.length * lineHeight;
      canvas.width = maxWidth * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${maxWidth}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      ctx.fillStyle = color;
      ctx.textBaseline = "top";
      lines.forEach((l, i) => ctx.fillText(l, 0, i * lineHeight));
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [text]);

  return (
    <>
      <span
        ref={sampleRef}
        className={sampleClassName}
        aria-hidden="true"
        style={{ position: "absolute", visibility: "hidden", height: 0, width: 0, overflow: "hidden", whiteSpace: "nowrap" }}
      >x</span>
      <canvas ref={canvasRef} aria-hidden="true" />
    </>
  );
}

export default function AssessmentsTab({ onChanged }: { onChanged?: (pending: number) => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<SeekerAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<StartedAssessment | null>(null);
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState("");
  const [left, setLeft] = useState(0);
  const [qLeft, setQLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const questionStart = useRef<number>(Date.now());
  // v3.156.0 — off by default (questions render as canvas); once turned on
  // it stays on for the rest of this assessment, not re-asked per question.
  const [accessibleText, setAccessibleText] = useState(false);

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
    // v3.41.0 — the 1-second countdown tick calls submit(true) again on every
    // tick once the deadline passes, and busy wasn't checked here, only
    // active (which stays set until the request resolves). On a slow
    // connection this fired a second concurrent assessment_submit call
    // before the first had cleared active.
    if (!active || busy) return;
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
  }, [active, busy, load, toast]);

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

  // v3.155.0 — a draft ref so the per-question countdown below can read the
  // latest typed text without re-subscribing its interval on every
  // keystroke (which would reset the tick and never actually count down).
  const draftRef = useRef("");
  useEffect(() => { draftRef.current = draft; }, [draft]);

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
    // v3.155.0 — the per-question timer below can fire in the same moment
    // as a manual click; without this guard both could call
    // assessment_answer for the same question a beat apart, same class of
    // race the overall timer's own busy check (v3.41.0, above) already
    // exists to prevent.
    if (!active || busy) return;
    const q = active.questions[idx];
    if (!q) return;
    setBusy(true);
    try {
      const r = await assessmentApi.answer(active.id, q.id, value, Date.now() - questionStart.current);
      // v3.154.0 — a short answer can come back with one live follow-up:
      // spliced in as the very next question, same running clock, same
      // "no going back" rule. It did not exist until this answer was
      // submitted, so there was nothing to prepare for it in advance.
      const nextQuestions = r.follow_up
        ? [...active.questions.slice(0, idx + 1), r.follow_up, ...active.questions.slice(idx + 1)]
        : active.questions;
      if (idx + 1 >= nextQuestions.length) {
        await submit(false);
      } else {
        if (r.follow_up) setActive({ ...active, questions: nextQuestions });
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

  // v3.155.0 — a per-question budget on top of the overall one, mirroring
  // the same server-timestamped clock (assessment_start /
  // assessment_answer both re-stamp current_question_started_at, which is
  // what the backend actually grades against — this is the felt half of
  // it). Auto-advances the same lenient way: whatever is drafted still
  // gets submitted, nothing is silently lost.
  useEffect(() => {
    if (!active) return;
    const q = active.questions[idx];
    if (!q) return;
    const budget = QUESTION_BUDGET_SECONDS[q.type] || 90;
    const anchor = questionStart.current;
    const tick = () => {
      const secs = budget - Math.round((Date.now() - anchor) / 1000);
      setQLeft(secs);
      if (secs <= 0) void saveAndNext(draftRef.current);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, idx]);

  if (done) {
    return (
      <Card className="p-6 space-y-2 max-w-lg rounded-xl" style={{ borderColor: "var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" style={{ color: "var(--rh-trust)" }} />
          <h2 className="rh-display text-base">Submitted</h2>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--rh-muted)" }}>Your answers went to {done}.</p>
        <Button variant="outline" onClick={() => setDone(null)}>Back to assessments</Button>
      </Card>
    );
  }

  if (active) {
    const q = active.questions[idx];
    const qTone = timerTone(qLeft, 20);
    const overallTone = timerTone(left, 120);
    const progress = active.questions.length > 0 ? Math.round((idx / active.questions.length) * 100) : 0;
    return (
      <Card className="p-5 sm:p-6 space-y-4 max-w-2xl rounded-xl" style={{ borderColor: "var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--rh-faint)" }}>{active.org_name}</p>
            <h2 className="rh-display text-[15px] truncate">{active.job_title || "Assessment"}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold rounded-full px-2.5 py-1" style={{ background: qTone.bg, color: qTone.color }}>
              {mmss(qLeft)} <span className="hidden sm:inline">this question</span>
            </span>
            <span className="text-xs font-semibold rounded-full px-2.5 py-1 inline-flex items-center gap-1" style={{ background: overallTone.bg, color: overallTone.color }}>
              <Timer className="w-3 h-3" /> {mmss(left)}
            </span>
          </div>
        </div>

        {/* v3.172.0 — a real progress bar, not just "Question 2 of 6" as
            text. Visual progress is a calmer signal than a raw count —
            the same principle behind why a skeleton screen feels faster
            than a spinner even at an identical load time. */}
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--rh-raised)" }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(4, progress)}%`, background: "var(--rh-gradient)" }} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs" style={{ color: "var(--rh-muted)" }}>
            Question {idx + 1} of {active.questions.length}. You cannot go back.
          </p>
          {/* v3.156.0 — a real, unconditional switch, not a hidden setting:
              anyone who needs the question as plain text for a screen
              reader gets it with one click, no reason required. This
              control itself is always a normal, focusable button, never
              canvas, so it can be found and used regardless of whether the
              question content itself is currently readable. */}
          <button
            type="button"
            onClick={() => setAccessibleText(v => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground underline shrink-0"
          >
            <Type className="w-3 h-3" />
            {accessibleText ? "Hide accessible text" : "Show as accessible text"}
          </button>
        </div>

        {q && (
          <div className="space-y-3">
            {/* v3.155.0 — asked directly for something real against a
                paste-in from another tab: copying any part of the prompt
                (question or options) hands back scrambled text instead of
                the real content. Selection and highlighting still look and
                feel normal; only what actually lands in the clipboard is
                garbled, so this reads as the page working, not broken.
                Left active in accessible-text mode too -- it doesn't
                interfere with how a screen reader itself reads the page. */}
            <div onCopy={e => { e.preventDefault(); e.clipboardData.setData("text/plain", scrambleForClipboard(q.text)); }}>
              {accessibleText ? (
                <p className="text-sm leading-relaxed font-medium">{q.text}</p>
              ) : (
                <CanvasQuestionText text={q.text} sampleClassName="text-sm leading-relaxed font-medium" />
              )}
              {q.type === "mc" && (
                <div className="space-y-2 mt-3">
                  {(q.options || []).map((o, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={busy}
                      onClick={() => saveAndNext(o)}
                      // v3.156.0 — a real accessible name even before the
                      // toggle above is used, so a screen reader lands on
                      // "Option 2", not a silent, unlabeled button. Not
                      // the real option text -- that's still exactly what
                      // the toggle exists to reveal.
                      aria-label={accessibleText ? undefined : `Option ${i + 1}`}
                      className="w-full text-left rounded-lg px-3 py-2.5 text-sm leading-relaxed transition-colors disabled:opacity-50"
                      style={{ border: "1px solid var(--rh-hair)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--rh-accent)"; e.currentTarget.style.background = "var(--rh-tint)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--rh-hair)"; e.currentTarget.style.background = "transparent"; }}
                    >
                      {accessibleText ? o : <CanvasQuestionText text={o} sampleClassName="text-sm leading-relaxed" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {q.type !== "mc" && (
              <>
                <Textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onPaste={e => e.preventDefault()}
                  onDrop={e => e.preventDefault()}
                  maxLength={3000}
                  className="min-h-[140px]"
                  placeholder="Two to four sentences, typed in your own words."
                />
                <p className="text-[11px] -mt-2" style={{ color: "var(--rh-faint)" }}>Pasting is turned off for this box. Type your answer directly.</p>
                <Button
                  onClick={() => saveAndNext(draft)}
                  disabled={busy || !draft.trim()}
                  style={{ background: "var(--rh-gradient)", borderColor: "transparent", color: "#fff", boxShadow: "var(--rh-glow)" }}
                  className="hover:opacity-90"
                >
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
      {/* v3.273.0 -- swapped the thin accent-dash heading for the site's
          real .lp-eyebrow pill (see JobsTab.tsx's own note on this same
          pass for the full reasoning). */}
      <div>
        <h2 className="lp-eyebrow" style={{ marginBottom: 8 }}>Assessments</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--rh-muted)" }}>
          A company asked you a few questions about your own work before deciding on a role.
        </p>
      </div>

      <MaintenanceNotice feature="assessments" />

      {loading && <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--rh-faint)" }} />}
      {!loading && rows.length === 0 && (
        <Card className="p-5 rounded-xl" style={{ borderColor: "var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
          <p className="text-sm" style={{ color: "var(--rh-muted)" }}>
            Nothing here yet. Assessments arrive from companies that found you in the talent pool.
          </p>
        </Card>
      )}

      {/* v3.177.0 — reported directly: match Browse jobs' own tall card
          shape (boxed logo, bigger title, a chip row, a bottom-border
          footer) instead of the flatter single-row card this used before.
          Title/subtitle order flipped to match every other card in this
          app -- the role first, the company second -- since this one had
          it backwards (org name as the heading, job title as the
          subtitle).
          v3.178.0 — reported directly, again, as "bad, not what 2026
          looks like": next to the reference card this still read thin,
          since there is no description-equivalent field here to give it
          real height. min-h-[300px] (shorter than Saved jobs' 420px --
          there is genuinely less to say about an assessment than a full
          job posting, and forcing the same height would read as dead
          padding, not spaciousness) plus the flex-1 spacer already below
          gives it the same generous, unhurried footer placement the
          reference card has, without inventing content to fill it. */}
      {/* v3.180.0 — same fix as JobsTab.tsx's own card grid: a fixed
          two-column layout stretched each card to roughly half the panel,
          a wide landscape shape next to the reference card's narrow
          portrait one. Auto-fill with a 280px floor instead.
          v3.271.0 — reported directly against a real account with only 2
          assessments: auto-fill creates a real, empty grid track for every
          280px of container width regardless of whether there's a card to
          fill it, so a wide page with few items reads as two small cards
          floating in a mostly-blank page. Capped the grid area itself at
          roughly four columns' worth -- a page with many assessments still
          wraps into more rows exactly as before, but a page with a
          handful no longer claims width it has nothing to put there. */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", maxWidth: 1180 }}>
        {rows.map(a => {
          const avatar = companyAvatar(a.org_name || "?");
          const statusMeta = a.status === "submitted"
            ? { label: "Submitted", bg: "var(--rh-trust-tint)", color: "var(--rh-trust)" }
            : a.status === "expired"
              ? { label: "Expired", bg: "var(--rh-raised)", color: "var(--rh-faint)" }
              : null;
          return (
            <div
              key={a.id}
              className="rh-lift w-full rounded-2xl p-5 flex flex-col min-h-[300px]"
              style={{ background: "var(--rh-surface)", border: "1px solid var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}
            >
              {a.org_logo_url ? (
                <img src={a.org_logo_url} alt="" className="w-14 h-14 rounded-xl object-contain bg-white p-1.5 border mb-3" style={{ borderColor: "var(--rh-hair)" }} />
              ) : (
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 mb-3 ${avatar.className}`} style={{ boxShadow: "0 6px 16px -6px rgba(28,23,18,0.35)" }}>
                  {avatar.initial}
                </div>
              )}
              <p className="rh-display text-[18px] leading-snug mb-1">{a.job_title}</p>
              <p className="text-[13px] mb-3" style={{ color: "var(--rh-muted)" }}>{a.org_name}</p>

              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ background: "var(--rh-raised)", color: "var(--rh-muted)" }}>
                  {a.question_count} questions · ~{Math.round(a.time_limit_seconds / 60)} min
                </span>
                {statusMeta && (
                  <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ background: statusMeta.bg, color: statusMeta.color }}>
                    {statusMeta.label}
                  </span>
                )}
              </div>

              <div className="flex-1" />

              <div className="flex items-center justify-between pt-3 mt-3 border-t" style={{ borderColor: "var(--rh-hair)" }}>
                {a.status === "submitted" ? (
                  <p className="text-xs" style={{ color: "var(--rh-faint)" }}>Your answers went to {a.org_name}.</p>
                ) : a.status === "expired" ? (
                  <p className="text-xs" style={{ color: "var(--rh-faint)" }}>This one closed before it was submitted.</p>
                ) : (
                  <p className="text-xs" style={{ color: "var(--rh-faint)" }}>
                    {a.expires_at ? `Closes ${new Date(a.expires_at).toLocaleDateString()}` : ""}
                  </p>
                )}
                {(a.status !== "submitted" && a.status !== "expired") && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => start(a.id)}
                    style={{ background: "var(--rh-gradient)", borderColor: "transparent", color: "#fff", boxShadow: "var(--rh-glow)" }}
                    className="hover:opacity-90 shrink-0"
                  >
                    {a.status === "started" ? "Continue" : "Start"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
