/**
 * IntakeWizard.tsx — v3.10.0 "employer profile, saved intake, one visual language".
 *
 * v3.8.0 replaced the free-form intake conversation with widgets. This
 * revision makes that intake survive leaving the page, navigable in both
 * directions, and shaped like a considered product rather than a form.
 *
 * What changed:
 *  - Every answered step is written to a draft row keyed by org, so coming
 *    back resumes exactly where they left off. "Start over" clears it.
 *  - A step map across the top shows completed answers in short form and
 *    jumps back to any of them. Steps ahead are visible but not clickable.
 *  - Back and Continue on every step. Going back never silently loses a later
 *    answer: only answers the change genuinely invalidates are cleared, and
 *    the employer is told which one and why.
 *  - Options are large tappable cards with an orange selected state, keyboard
 *    operable, and animated with a restrained transition that respects
 *    prefers-reduced-motion.
 *
 * The model is still used exactly once, on the optional opening description.
 * It never asks a question here and it never chats.
 *
 * v3.251.0 -- reported directly: this whole panel, and the employer
 * dashboard's other real content, still read as a different, older visual
 * language than the marketing pages -- shadcn's own <Card>/<Button>
 * primitives with a per-instance inline var(--rh-gradient) override, the
 * same workaround this file's own v3.181.0 history already documents
 * being necessary because a bare Button never resolves to ember on its
 * own. Every Card wrapper is now .lp-panel and every Button is now a
 * plain <button> carrying .lp-btn/.lp-btn-primary/.lp-btn-ghost/
 * .lp-quiet-link, the same real classes /employers and /pricing use --
 * not a lookalike, the literal same CSS. Every --rh-* token reference
 * swapped for its --lp-* equivalent throughout, since this file's whole
 * tree now sits under a real .lp ancestor (EmployerHub.tsx's own shell,
 * since v3.250.0), so those variables resolve correctly here for the
 * first time.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, Search, X, Pencil, ArrowRight, ArrowLeft, Sparkle, Check, RotateCcw,
} from "lucide-react";
import { employerApi, type JobSpec, type SkillOption, type IntakeDraft } from "@/lib/employer";
import { useToast } from "@/hooks/use-toast";

export const EMPTY_SPEC: JobSpec = {
  title: "", seniority: "", must_have_skills: [], nice_to_have_skills: [],
  location_preference: "", work_mode: "", employment_type: "", remote_ok: false,
  min_years: 0, work_authorization: "", notes: "",
};

type StepKey =
  | "title" | "seniority" | "must_have_skills" | "nice_to_have_skills"
  | "work_mode" | "employment_type" | "min_years" | "work_authorization";

const STEPS: StepKey[] = [
  "title", "seniority", "must_have_skills", "nice_to_have_skills",
  "work_mode", "employment_type", "min_years", "work_authorization",
];

const QUESTION: Record<StepKey, string> = {
  title: "What is the role called?",
  seniority: "What level is it?",
  must_have_skills: "Which skills must they already have?",
  nice_to_have_skills: "Anything that would be nice to have?",
  work_mode: "Where is the work done?",
  employment_type: "What kind of employment is it?",
  min_years: "How much experience is the minimum?",
  work_authorization: "What about work eligibility?",
};

const HELPER: Record<StepKey, string> = {
  title: "The title candidates would recognise, not an internal job code.",
  seniority: "This sets the bar the match is scored against.",
  must_have_skills: "Every one of these filters the pool. Keep the list honest and short.",
  nice_to_have_skills: "These lift a score but never exclude anyone. You can skip this.",
  work_mode: "On site and hybrid roles are matched against where the candidate is.",
  employment_type: "Candidates state what they are open to, and this is matched against it.",
  min_years: "Recorded years of experience, not a guess about seniority.",
  work_authorization: "Whether they must already be eligible to work, or you would sponsor.",
};

const SENIORITY: { v: string; label: string }[] = [
  { v: "intern", label: "Intern" },
  { v: "entry", label: "Entry" },
  { v: "mid", label: "Mid" },
  { v: "senior", label: "Senior" },
  { v: "staff_principal", label: "Staff or principal" },
  { v: "manager", label: "Manager" },
  { v: "director_plus", label: "Director or above" },
];
const WORK_MODE = [
  { v: "onsite", label: "On site" },
  { v: "hybrid", label: "Hybrid" },
  { v: "remote", label: "Remote" },
];
const EMPLOYMENT = [
  { v: "full_time", label: "Full time" },
  { v: "contract", label: "Contract" },
  { v: "part_time", label: "Part time" },
  { v: "internship", label: "Internship" },
];
const YEARS = [
  { v: 0, label: "Any" },
  { v: 2, label: "2 plus" },
  { v: 5, label: "5 plus" },
  { v: 8, label: "8 plus" },
  { v: 10, label: "10 plus" },
];
const AUTHORIZATION = [
  { v: "authorized_required", label: "Must already be authorised" },
  { v: "open_to_sponsoring", label: "Open to sponsoring" },
];

const TITLE_SUGGESTIONS = [
  "Software Engineer", "Senior Software Engineer", "Backend Engineer", "Frontend Engineer",
  "Full Stack Engineer", "Data Analyst", "Data Engineer", "Data Scientist",
  "Product Manager", "Product Designer", "DevOps Engineer", "QA Engineer",
  "Project Manager", "Business Analyst", "Accountant", "Marketing Manager",
  "Sales Representative", "Customer Success Manager", "Operations Manager",
  "Mechanical Engineer", "Civil Engineer", "Registered Nurse",
];

function labelFor(key: StepKey, spec: JobSpec): string {
  switch (key) {
    case "title": return spec.title || "Not set";
    case "seniority": return SENIORITY.find(s => s.v === spec.seniority)?.label || spec.seniority || "Not set";
    case "must_have_skills": return spec.must_have_skills.join(", ") || "None";
    case "nice_to_have_skills": return spec.nice_to_have_skills.join(", ") || "None";
    case "work_mode": {
      const m = WORK_MODE.find(w => w.v === spec.work_mode)?.label || "Not set";
      return spec.work_mode && spec.work_mode !== "remote" && spec.location_preference
        ? `${m} in ${spec.location_preference}` : m;
    }
    case "employment_type": return EMPLOYMENT.find(e => e.v === spec.employment_type)?.label || "Not set";
    case "min_years": return YEARS.find(y => y.v === (spec.min_years || 0))?.label || `${spec.min_years} plus`;
    case "work_authorization":
      return AUTHORIZATION.find(x => x.v === spec.work_authorization)?.label || "Not set";
  }
}

/** Short form for the step map, so the row stays readable. */
function shortLabel(key: StepKey, spec: JobSpec): string {
  const full = labelFor(key, spec);
  return full.length > 18 ? `${full.slice(0, 17)}…` : full;
}

const SUMMARY_LABEL: Record<StepKey, string> = {
  title: "Role title", seniority: "Seniority", must_have_skills: "Must have skills",
  nice_to_have_skills: "Nice to have", work_mode: "Location and remote",
  employment_type: "Employment type", min_years: "Minimum experience",
  work_authorization: "Work eligibility",
};

function isAnswered(key: StepKey, spec: JobSpec): boolean {
  switch (key) {
    case "title": return !!spec.title.trim();
    case "seniority": return !!spec.seniority;
    case "must_have_skills": return spec.must_have_skills.length > 0;
    case "nice_to_have_skills": return false; // optional, always offered once
    case "work_mode": return !!spec.work_mode;
    case "employment_type": return !!spec.employment_type;
    case "min_years": return (spec.min_years || 0) > 0;
    case "work_authorization": return !!spec.work_authorization;
  }
}

/**
 * Changing an earlier answer can make a later one meaningless. This returns
 * the later answers a change invalidates, with the reason, so we can tell the
 * employer instead of quietly dropping their work.
 */
function invalidatedBy(changed: StepKey, before: JobSpec, after: JobSpec): { key: StepKey; reason: string }[] {
  const out: { key: StepKey; reason: string }[] = [];
  if (changed === "work_mode" && after.work_mode === "remote" && before.location_preference) {
    // location_preference lives inside the work_mode step, nothing later breaks.
  }
  if (changed === "seniority" && before.seniority !== after.seniority) {
    const senior = ["senior", "staff_principal", "director_plus"];
    if (after.seniority === "intern" && (before.min_years || 0) > 0) {
      out.push({ key: "min_years", reason: "an internship cannot also require years of experience" });
    }
    if (senior.includes(after.seniority) && after.employment_type === "internship") {
      out.push({ key: "employment_type", reason: "a senior role cannot be an internship" });
    }
  }
  if (changed === "employment_type" && after.employment_type === "internship" && (after.min_years || 0) > 0) {
    out.push({ key: "min_years", reason: "an internship cannot also require years of experience" });
  }
  return out;
}

function clearStep(spec: JobSpec, key: StepKey): JobSpec {
  switch (key) {
    case "min_years": return { ...spec, min_years: 0 };
    case "employment_type": return { ...spec, employment_type: "" };
    case "seniority": return { ...spec, seniority: "" };
    default: return spec;
  }
}

/** A large tappable option card with an ember selected state. */
function OptionCard({
  label, selected, onClick,
}: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="group relative flex items-center gap-2 rounded-xl border px-4 py-3 text-sm text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      style={selected
        ? { background: "var(--lp-gradient-ember)", borderColor: "transparent", color: "#fff", boxShadow: "0 6px 16px -6px hsl(var(--lp-ember) / 0.5)" }
        : { borderColor: "hsl(var(--lp-border-soft))", background: "hsl(var(--lp-surface))" }}
    >
      {selected && <Check className="w-4 h-4 shrink-0" />}
      <span className="font-medium">{label}</span>
    </button>
  );
}

/** Chip input with autocomplete over skills that real candidates have. */
function SkillChips({
  value, onChange, catalog, poolSize, max = 6,
}: {
  value: string[]; onChange: (v: string[]) => void;
  catalog: SkillOption[]; poolSize: number; max?: number;
}) {
  const [q, setQ] = useState("");
  const countFor = useCallback((s: string) => {
    const n = s.toLowerCase().trim();
    return catalog.find(c => c.skill_norm === n || c.skill.toLowerCase() === n)?.count ?? 0;
  }, [catalog]);

  const matches = useMemo(() => {
    const n = q.toLowerCase().trim();
    if (!n) return catalog.slice(0, 8);
    return catalog.filter(c => c.skill_norm.includes(n) || c.skill.toLowerCase().includes(n)).slice(0, 8);
  }, [q, catalog]);

  const add = (s: string) => {
    const v = s.trim();
    if (!v || value.length >= max) return;
    if (value.some(x => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...value, v]);
    setQ("");
  };

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map(s => {
            const c = countFor(s);
            return (
              <Badge key={s} variant={c === 0 ? "outline" : "secondary"} className="font-normal gap-1.5 py-1">
                {s}
                <span className={c === 0 ? "text-destructive" : "text-muted-foreground"}>{c} in pool</span>
                <button type="button" onClick={() => onChange(value.filter(x => x !== s))} aria-label={`Remove ${s}`}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
      {value.some(s => countFor(s) === 0) && (
        <p className="text-xs text-destructive">
          A skill with zero in the pool removes every candidate. Nobody who opted in lists it.
        </p>
      )}
      {value.length < max && (
        <>
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(q); } }}
            placeholder="Type a skill, press enter"
          />
          <div className="flex flex-wrap gap-1.5">
            {matches.map(m => (
              <button
                key={m.skill_norm} type="button" onClick={() => add(m.skill)}
                className="text-xs rounded-full border px-2.5 py-1 transition-colors"
                style={{ borderColor: "hsl(var(--lp-border-soft))" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "hsl(var(--lp-ember))"; e.currentTarget.style.background = "hsl(var(--lp-ember) / 0.12)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "hsl(var(--lp-border-soft))"; e.currentTarget.style.background = "transparent"; }}
              >
                {m.skill} <span className="text-muted-foreground">{m.count}</span>
              </button>
            ))}
            {matches.length === 0 && (
              <span className="text-xs text-muted-foreground">
                No opted in candidate lists that. You can still add it, the search will return nobody.
              </span>
            )}
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        {poolSize} candidates have opted into discovery. Up to {max} skills, {value.length} chosen.
      </p>
    </div>
  );
}

export default function IntakeWizard({
  orgId, searching, onSearch, initialSpec, openAtSummary,
}: {
  orgId: string;
  searching: boolean;
  onSearch: (spec: JobSpec) => void;
  /** v3.10.0 — reopen a previous search's spec so a tweak beats starting over. */
  initialSpec?: JobSpec | null;
  openAtSummary?: boolean;
}) {
  const { toast } = useToast();
  const [spec, setSpec] = useState<JobSpec>(initialSpec || EMPTY_SPEC);
  const [phase, setPhase] = useState<"loading" | "opening" | "asking" | "summary">(
    initialSpec && openAtSummary ? "summary" : "loading",
  );
  const [opening, setOpening] = useState("");
  const [reading, setReading] = useState(false);
  /** Which steps the employer has passed through, in order, so Back works. */
  const [visited, setVisited] = useState<StepKey[]>([]);
  const [cursor, setCursor] = useState<StepKey | null>(null);
  const [editing, setEditing] = useState<StepKey | null>(null);
  const [typed, setTyped] = useState("");
  const [freeText, setFreeText] = useState(false);
  const [clearedNote, setClearedNote] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<SkillOption[]>([]);
  const [poolSize, setPoolSize] = useState(0);

  const current = editing ?? cursor;
  const hydrated = useRef(false);

  useEffect(() => {
    employerApi.skillCatalog(orgId)
      .then(r => { setCatalog(r.skills || []); setPoolSize(r.pool_size || 0); })
      .catch(() => { /* autocomplete is a helper, not a gate */ });
  }, [orgId]);

  // ── Restore an in-progress intake ────────────────────────────────
  // v3.12.0 — two things were genuinely broken here. The opening free text
  // was never written at all (the save effect returned early while
  // phase === "opening"), and the step the employer was on was never stored,
  // so even a restored draft reopened at the first unanswered question rather
  // than where they left off. The step now travels inside `phase` as
  // "asking:<step>", and the opener is saved as they type.
  useEffect(() => {
    if (initialSpec && openAtSummary) { hydrated.current = true; return; }
    let alive = true;
    employerApi.draftGet(orgId)
      .then(r => {
        if (!alive) return;
        const d = r.draft;
        if (d && (d.opening || Object.keys(d.job_spec || {}).length)) {
          const restored: JobSpec = { ...EMPTY_SPEC, ...(d.job_spec as Partial<JobSpec>) };
          setSpec(restored);
          setOpening(d.opening || "");
          const answered = (d.answered || []).filter((k): k is StepKey => (STEPS as string[]).includes(k));
          setVisited(answered);
          const [savedPhase, savedCursor] = String(d.phase || "").split(":");
          const fallback = STEPS.find(k => !answered.includes(k) && !isAnswered(k, restored)) || null;
          if (savedPhase === "summary") {
            setCursor(null);
            setPhase("summary");
          } else if (savedPhase === "opening" || !answered.length) {
            setCursor(fallback);
            setPhase("opening");
          } else {
            const cur = (STEPS as string[]).includes(savedCursor || "")
              ? (savedCursor as StepKey) : fallback;
            setCursor(cur);
            setPhase(cur ? "asking" : "summary");
          }
        } else {
          setPhase("opening");
        }
      })
      .catch(() => { if (alive) setPhase("opening"); })
      .finally(() => { hydrated.current = true; });
    return () => { alive = false; };
  }, [orgId, initialSpec, openAtSummary]);

  // ── Persist after every change, including the free text opener ───
  useEffect(() => {
    if (!hydrated.current || phase === "loading") return;
    const nothingYet = !opening.trim() && !spec.title.trim() && visited.length === 0;
    if (nothingYet) return;
    const encoded = phase === "summary" ? "summary"
      : phase === "opening" ? "opening"
        : `asking:${cursor ?? ""}`;
    const draft: IntakeDraft = {
      opening, job_spec: spec, answered: visited, phase: encoded,
    };
    const t = setTimeout(() => { void employerApi.draftSave(orgId, draft).catch(() => {}); }, 500);
    return () => clearTimeout(t);
  }, [orgId, spec, opening, visited, phase, cursor]);


  useEffect(() => { setTyped(""); setFreeText(false); }, [current]);

  const startOver = async () => {
    setSpec(EMPTY_SPEC); setOpening(""); setVisited([]); setCursor(null);
    setEditing(null); setClearedNote(null); setPhase("opening");
    await employerApi.draftClear(orgId).catch(() => {});
  };

  const firstUnanswered = (base: JobSpec, done: StepKey[]): StepKey | null =>
    STEPS.find(k => !done.includes(k) && !isAnswered(k, base)) || null;

  const startQueue = (base: JobSpec) => {
    const done = STEPS.filter(k => isAnswered(k, base));
    setVisited(done);
    const next = firstUnanswered(base, done);
    setCursor(next);
    setPhase(next ? "asking" : "summary");
  };

  const readOpening = async () => {
    if (!opening.trim()) { startQueue(EMPTY_SPEC); return; }
    setReading(true);
    try {
      const r = await employerApi.specExtract(orgId, opening.trim());
      const next: JobSpec = { ...EMPTY_SPEC, ...r.job_spec, notes: opening.trim() };
      next.must_have_skills = (next.must_have_skills || []).slice(0, 6);
      next.nice_to_have_skills = (next.nice_to_have_skills || []).slice(0, 6);
      setSpec(next);
      startQueue(next);
    } catch (e) {
      toast({ title: "Could not read that", description: (e as Error).message, variant: "destructive" });
      setSpec({ ...EMPTY_SPEC, notes: opening.trim() });
      startQueue(EMPTY_SPEC);
    } finally { setReading(false); }
  };

  /** Answer the current question and move on, or close a summary edit. */
  const answer = (patch: Partial<JobSpec>) => {
    const key = current;
    if (!key) return;
    const before = spec;
    let after: JobSpec = { ...spec, ...patch };

    // Preserve later answers unless the change genuinely invalidates them.
    const broken = invalidatedBy(key, before, after);
    if (broken.length) {
      for (const b of broken) after = clearStep(after, b.key);
      setClearedNote(
        broken.map(b => `${SUMMARY_LABEL[b.key]} was cleared because ${b.reason}.`).join(" "),
      );
    } else {
      setClearedNote(null);
    }

    setSpec(after);
    const done = visited.includes(key) ? visited : [...visited, key];
    setVisited(done);

    if (editing) { setEditing(null); setPhase("summary"); return; }
    const next = firstUnanswered(after, done);
    setCursor(next);
    if (!next) setPhase("summary");
  };

  const skip = () => {
    const key = current;
    if (!key) return;
    if (editing) { setEditing(null); setPhase("summary"); return; }
    const done = visited.includes(key) ? visited : [...visited, key];
    setVisited(done);
    const next = firstUnanswered(spec, done);
    setCursor(next);
    if (!next) setPhase("summary");
  };

  const goBack = () => {
    if (editing) { setEditing(null); setPhase("summary"); return; }
    const idx = current ? STEPS.indexOf(current) : STEPS.length;
    const prev = STEPS.slice(0, idx).reverse().find(k => visited.includes(k));
    if (prev) { setCursor(prev); setPhase("asking"); return; }
    setPhase("opening");
  };

  const jumpTo = (k: StepKey) => {
    setEditing(null);
    setCursor(k);
    setPhase("asking");
  };

  if (phase === "loading") {
    return (
      <div className="lp-panel flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Opening description ──────────────────────────────────────────
  if (phase === "opening") {
    return (
      <div className="lp-panel space-y-4 employer-step-in">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Tell AYN about the role</h2>
          <p className="text-sm text-muted-foreground">
            One paragraph is enough. AYN reads it, then asks only about what you left out.
          </p>
        </div>
        <Textarea
          value={opening}
          onChange={e => setOpening(e.target.value)}
          placeholder="For example: senior backend engineer in Toronto, hybrid, strong Python and Postgres, five years or more."
          className="min-h-[110px]"
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={readOpening} disabled={reading} className="lp-btn lp-btn-primary">
            {reading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Continue
          </button>
          <button type="button" className="lp-btn lp-btn-ghost" onClick={() => { setSpec(EMPTY_SPEC); startQueue(EMPTY_SPEC); }} disabled={reading}>
            Skip, ask me everything
          </button>
        </div>
      </div>
    );
  }

  const stepMap = (
    <>
      {/* Desktop: the whole path, completed steps clickable. */}
      <div className="hidden sm:flex flex-wrap items-center gap-1.5">
        {STEPS.map((k, i) => {
          const done = visited.includes(k);
          const active = current === k;
          const reachable = done || active;
          return (
            <button
              key={k}
              type="button"
              disabled={!reachable}
              onClick={() => jumpTo(k)}
              aria-current={active ? "step" : undefined}
              className={active
                ? "rounded-full border px-2.5 py-1 text-[11px] transition-colors font-medium"
                : done
                  ? "rounded-full border px-2.5 py-1 text-[11px] transition-colors"
                  : "rounded-full border border-dashed px-2.5 py-1 text-[11px] transition-colors cursor-not-allowed"}
              style={active
                ? { borderColor: "hsl(var(--lp-ember))", background: "hsl(var(--lp-ember) / 0.12)", color: "hsl(var(--lp-fg))" }
                : done
                  // v3.189.0 — reported directly: a completed step read as
                  // plain grey, no different from an unreachable one, so
                  // the whole step map looked un-branded next to the rest
                  // of the ember system. A light, quiet ember tint for
                  // "done" keeps it clearly a step below "active" while
                  // still reading as this app's own color, not default grey.
                  ? { borderColor: "hsl(var(--lp-ember) / 0.2)", color: "hsl(var(--lp-ember-soft))" }
                  : { borderColor: "hsl(var(--lp-border-soft))", color: "hsl(var(--lp-dim))" }}
            >
              <span className="tabular-nums mr-1 opacity-60">{i + 1}</span>
              {done && !active ? shortLabel(k, spec) : SUMMARY_LABEL[k]}
            </button>
          );
        })}
      </div>
      {/* Mobile: just where they are, plus a back arrow. */}
      <div className="sm:hidden flex items-center gap-2">
        <button type="button" className="lp-btn lp-btn-ghost lp-btn-sm" onClick={goBack} aria-label="Back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-xs text-muted-foreground">
          Step {current ? STEPS.indexOf(current) + 1 : STEPS.length} of {STEPS.length}
        </span>
      </div>
    </>
  );

  // ── One question at a time ───────────────────────────────────────
  if (current && phase !== "summary") {
    const optionCards = (list: { v: string; label: string }[], field: keyof JobSpec) => (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {list.map(o => (
          <OptionCard
            key={o.v} label={o.label}
            selected={(spec[field] as string) === o.v}
            onClick={() => answer({ [field]: o.v } as Partial<JobSpec>)}
          />
        ))}
      </div>
    );

    return (
      <div
        className="lp-panel space-y-5"
        onKeyDown={e => { if (e.key === "Escape" && editing) { setEditing(null); setPhase("summary"); } }}
      >
        {stepMap}

        <div key={current} className="space-y-5 employer-step-in">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {editing ? "Editing" : `Question ${STEPS.indexOf(current) + 1} of ${STEPS.length}`}
              </p>
              <h2 className="text-lg font-semibold tracking-tight">{QUESTION[current]}</h2>
              <p className="text-sm text-muted-foreground">{HELPER[current]}</p>
            </div>
            {editing && (
              <button type="button" className="lp-quiet-link" style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer" }} onClick={() => { setEditing(null); setPhase("summary"); }}>
                Cancel
              </button>
            )}
          </div>

          {clearedNote && (
            <p className="text-xs border-l-2 pl-3" style={{ color: "hsl(var(--lp-muted))", borderColor: "hsl(var(--lp-ember))" }}>{clearedNote}</p>
          )}

          {current === "title" && (
            <div className="space-y-3">
              <Input
                value={typed || spec.title} onChange={e => setTyped(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (typed || spec.title).trim()) answer({ title: (typed || spec.title).trim() }); }}
                placeholder="Role title"
                autoFocus
              />
              <div className="flex flex-wrap gap-1.5">
                {TITLE_SUGGESTIONS
                  .filter(t => !typed.trim() || t.toLowerCase().includes(typed.toLowerCase()))
                  .slice(0, 8)
                  .map(t => (
                    <button key={t} type="button" onClick={() => answer({ title: t })}
                      className="text-xs rounded-full border px-2.5 py-1 transition-colors"
                style={{ borderColor: "hsl(var(--lp-border-soft))" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "hsl(var(--lp-ember))"; e.currentTarget.style.background = "hsl(var(--lp-ember) / 0.12)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "hsl(var(--lp-border-soft))"; e.currentTarget.style.background = "transparent"; }}>
                      {t}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {current === "seniority" && (
            freeText
              ? <TypeInstead value={typed} setValue={setTyped} onSave={v => answer({ seniority: v })} onBack={() => setFreeText(false)} />
              : <>{optionCards(SENIORITY, "seniority")}<TypeInsteadLink onClick={() => setFreeText(true)} /></>
          )}

          {(current === "must_have_skills" || current === "nice_to_have_skills") && (
            <SkillChips
              value={current === "must_have_skills" ? spec.must_have_skills : spec.nice_to_have_skills}
              onChange={v => setSpec(p => ({ ...p, [current]: v }))}
              catalog={catalog}
              poolSize={poolSize}
            />
          )}

          {current === "work_mode" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {WORK_MODE.map(o => (
                  <OptionCard
                    key={o.v} label={o.label} selected={spec.work_mode === o.v}
                    onClick={() => setSpec(p => ({
                      ...p, work_mode: o.v, remote_ok: o.v !== "onsite",
                      location_preference: o.v === "remote" ? "" : p.location_preference,
                    }))}
                  />
                ))}
              </div>
              {spec.work_mode && spec.work_mode !== "remote" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Where</Label>
                  <Input
                    value={spec.location_preference || ""}
                    onChange={e => setSpec(p => ({ ...p, location_preference: e.target.value }))}
                    placeholder="City or region"
                  />
                </div>
              )}
            </div>
          )}

          {current === "employment_type" && (
            freeText
              ? <TypeInstead value={typed} setValue={setTyped} onSave={v => answer({ employment_type: v })} onBack={() => setFreeText(false)} />
              : <>{optionCards(EMPLOYMENT, "employment_type")}<TypeInsteadLink onClick={() => setFreeText(true)} /></>
          )}

          {current === "min_years" && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {YEARS.map(y => (
                <OptionCard
                  key={y.v} label={y.label} selected={(spec.min_years || 0) === y.v}
                  onClick={() => answer({ min_years: y.v })}
                />
              ))}
            </div>
          )}

          {current === "work_authorization" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {AUTHORIZATION.map(a => (
                  <OptionCard
                    key={a.v} label={a.label} selected={spec.work_authorization === a.v}
                    onClick={() => setSpec(p => ({ ...p, work_authorization: a.v }))}
                  />
                ))}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Which country do they need to be eligible in</Label>
                <Input
                  value={typed} onChange={e => setTyped(e.target.value)}
                  placeholder="For example Canada"
                />
              </div>
            </div>
          )}

          {/* Back and Continue on every step. */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" className="lp-btn lp-btn-ghost lp-btn-sm" onClick={goBack}>
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              type="button"
              className="lp-btn lp-btn-primary lp-btn-sm"
              disabled={
                (current === "title" && !(typed || spec.title).trim()) ||
                (current === "work_mode" && !spec.work_mode) ||
                (current === "work_authorization" && !spec.work_authorization)
              }
              onClick={() => {
                if (current === "title") return answer({ title: (typed || spec.title).trim() });
                if (current === "work_authorization") {
                  return answer({
                    notes: [spec.notes, typed.trim() ? `Work eligibility country: ${typed.trim()}` : ""]
                      .filter(Boolean).join("\n"),
                  });
                }
                answer({});
              }}
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
            {(current === "nice_to_have_skills" || current === "min_years") && (
              <button type="button" className="lp-quiet-link" style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer" }} onClick={skip}>Skip</button>
            )}
            <button type="button" onClick={startOver}
              className="ml-auto text-xs text-muted-foreground underline underline-offset-2">
              Start over
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Editable summary ─────────────────────────────────────────────
  const blocking = spec.must_have_skills.some(s => {
    const n = s.toLowerCase();
    return !catalog.some(c => c.skill_norm === n || c.skill.toLowerCase() === n);
  });

  return (
    <div className="lp-panel space-y-5 employer-step-in">
      {stepMap}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">The role AYN will search for</h2>
        <p className="text-sm text-muted-foreground">Click any line to change it.</p>
      </div>
      {clearedNote && (
        <p className="text-xs border-l-2 pl-3" style={{ color: "hsl(var(--lp-muted))", borderColor: "hsl(var(--lp-ember))" }}>{clearedNote}</p>
      )}
      <div className="divide-y rounded-xl border overflow-hidden" style={{ borderColor: "hsl(var(--lp-border-soft))" }}>
        {STEPS.map(k => (
          <button
            key={k} type="button" onClick={() => { setEditing(k); setPhase("asking"); }}
            className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors"
            style={{ borderColor: "hsl(var(--lp-border-soft))" }}
            onMouseEnter={e => (e.currentTarget.style.background = "hsl(var(--lp-border-soft) / 0.4)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <span className="text-xs shrink-0 w-40" style={{ color: "hsl(var(--lp-muted))" }}>{SUMMARY_LABEL[k]}</span>
            <span className="text-sm flex-1 truncate" style={{ color: "hsl(var(--lp-fg))" }}>{labelFor(k, spec)}</span>
            <Pencil className="w-3.5 h-3.5 shrink-0" style={{ color: "hsl(var(--lp-ember-soft))" }} />
          </button>
        ))}
      </div>
      {blocking && (
        <p className="text-xs text-destructive">
          At least one must have skill is not held by anyone in the pool. The search will return nobody until you change it.
        </p>
      )}
      {/* v3.12.0 — one clear primary, one clearly secondary, same height,
          real gap between them, and the note on its own line. */}
      <div className="pt-1 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            className="lp-btn lp-btn-primary lp-btn-lg w-full sm:w-auto"
            onClick={() => onSearch(spec)}
            disabled={searching || !spec.title.trim() || spec.must_have_skills.length === 0}
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Find candidates
          </button>
          <button type="button" className="lp-btn lp-btn-ghost lp-btn-lg w-full sm:w-auto" onClick={startOver}>
            <RotateCcw className="w-4 h-4" /> Start over
          </button>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Sparkle className="w-3 h-3 shrink-0" /> AYN searches candidates who opted into discovery, nothing else.
        </p>
      </div>

    </div>
  );
}

function TypeInsteadLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-xs text-muted-foreground underline underline-offset-2 mt-2">
      Type it instead
    </button>
  );
}

function TypeInstead({
  value, setValue, onSave, onBack,
}: { value: string; setValue: (v: string) => void; onSave: (v: string) => void; onBack: () => void }) {
  return (
    <div className="space-y-2">
      <Input
        value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && value.trim()) onSave(value.trim()); }}
        placeholder="Type your answer"
        autoFocus
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!value.trim()}
          onClick={() => onSave(value.trim())}
          className="lp-btn lp-btn-primary lp-btn-sm"
        >
          Save
        </button>
        <button type="button" className="lp-btn lp-btn-ghost lp-btn-sm" onClick={onBack}>Back to options</button>
      </div>
    </div>
  );
}
