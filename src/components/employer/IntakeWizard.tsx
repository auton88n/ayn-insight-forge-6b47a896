/**
 * IntakeWizard.tsx — v3.8.0 "the chat is candidate search, nothing else".
 *
 * Replaces the free-form intake conversation. AYN asks one question at a time
 * and the employer answers by clicking. There is a "type it instead" escape on
 * every step for anything the options do not cover.
 *
 * The model is used exactly once, on the optional opening description, to
 * prefill fields the employer already stated so those questions get skipped.
 * It never asks a question here and it never chats.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Search, X, Pencil, ArrowRight, Sparkle } from "lucide-react";
import { employerApi, type JobSpec, type SkillOption } from "@/lib/employer";
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
                className="text-xs rounded-full border border-border/60 px-2.5 py-1 hover:bg-muted transition-colors"
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
  orgId, searching, onSearch,
}: {
  orgId: string;
  searching: boolean;
  onSearch: (spec: JobSpec) => void;
}) {
  const { toast } = useToast();
  const [spec, setSpec] = useState<JobSpec>(EMPTY_SPEC);
  const [phase, setPhase] = useState<"opening" | "asking" | "summary">("opening");
  const [opening, setOpening] = useState("");
  const [reading, setReading] = useState(false);
  const [queue, setQueue] = useState<StepKey[]>([]);
  const [editing, setEditing] = useState<StepKey | null>(null);
  const [typed, setTyped] = useState("");
  const [freeText, setFreeText] = useState(false);

  const [catalog, setCatalog] = useState<SkillOption[]>([]);
  const [poolSize, setPoolSize] = useState(0);

  useEffect(() => {
    employerApi.skillCatalog(orgId)
      .then(r => { setCatalog(r.skills || []); setPoolSize(r.pool_size || 0); })
      .catch(() => { /* autocomplete is a helper, not a gate */ });
  }, [orgId]);

  const current = editing ?? queue[0] ?? null;

  useEffect(() => { setTyped(""); setFreeText(false); }, [current]);

  const startQueue = (base: JobSpec) => {
    const remaining = STEPS.filter(k => !isAnswered(k, base));
    setQueue(remaining);
    setPhase(remaining.length ? "asking" : "summary");
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
    setSpec(prev => ({ ...prev, ...patch }));
    if (editing) { setEditing(null); return; }
    setQueue(prev => {
      const rest = prev.slice(1);
      if (rest.length === 0) setPhase("summary");
      return rest;
    });
  };

  const skip = () => {
    if (editing) { setEditing(null); return; }
    setQueue(prev => {
      const rest = prev.slice(1);
      if (rest.length === 0) setPhase("summary");
      return rest;
    });
  };

  // ── Opening description ──────────────────────────────────────────
  if (phase === "opening") {
    return (
      <Card className="p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Tell AYN about the role</h2>
          <p className="text-xs text-muted-foreground">
            One paragraph is enough. AYN reads it, then asks only about what you left out.
          </p>
        </div>
        <Textarea
          value={opening}
          onChange={e => setOpening(e.target.value)}
          placeholder="For example: senior backend engineer in Toronto, hybrid, strong Python and Postgres, five years or more."
          className="min-h-[96px]"
        />
        <div className="flex gap-2">
          <Button onClick={readOpening} disabled={reading}>
            {reading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
            Continue
          </Button>
          <Button variant="ghost" onClick={() => { setSpec(EMPTY_SPEC); startQueue(EMPTY_SPEC); }} disabled={reading}>
            Skip, ask me everything
          </Button>
        </div>
      </Card>
    );
  }

  // ── One question at a time ───────────────────────────────────────
  if (current) {
    const opts = (list: { v: string; label: string }[], field: keyof JobSpec) => (
      <div className="flex flex-wrap gap-2">
        {list.map(o => (
          <Button key={o.v} variant="outline" size="sm"
            onClick={() => answer({ [field]: o.v } as Partial<JobSpec>)}>
            {o.label}
          </Button>
        ))}
      </div>
    );

    return (
      <Card className="p-4 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {editing ? "Editing" : `Question ${STEPS.indexOf(current) + 1} of ${STEPS.length}`}
            </p>
            <h2 className="text-base font-semibold">{QUESTION[current]}</h2>
          </div>
          {editing && <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>}
        </div>

        {current === "title" && (
          <div className="space-y-3">
            <Input
              value={typed} onChange={e => setTyped(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && typed.trim()) answer({ title: typed.trim() }); }}
              placeholder="Role title"
            />
            <div className="flex flex-wrap gap-1.5">
              {TITLE_SUGGESTIONS
                .filter(t => !typed.trim() || t.toLowerCase().includes(typed.toLowerCase()))
                .slice(0, 8)
                .map(t => (
                  <button key={t} type="button" onClick={() => answer({ title: t })}
                    className="text-xs rounded-full border border-border/60 px-2.5 py-1 hover:bg-muted transition-colors">
                    {t}
                  </button>
                ))}
            </div>
            <Button size="sm" disabled={!typed.trim()} onClick={() => answer({ title: typed.trim() })}>Next</Button>
          </div>
        )}

        {current === "seniority" && (
          freeText
            ? <TypeInstead value={typed} setValue={setTyped} onSave={v => answer({ seniority: v })} onBack={() => setFreeText(false)} />
            : <>{opts(SENIORITY, "seniority")}<TypeInsteadLink onClick={() => setFreeText(true)} /></>
        )}

        {(current === "must_have_skills" || current === "nice_to_have_skills") && (
          <div className="space-y-4">
            <SkillChips
              value={current === "must_have_skills" ? spec.must_have_skills : spec.nice_to_have_skills}
              onChange={v => setSpec(p => ({ ...p, [current]: v }))}
              catalog={catalog}
              poolSize={poolSize}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => answer({})}>Next</Button>
              {current === "nice_to_have_skills" && (
                <Button size="sm" variant="ghost" onClick={skip}>Skip</Button>
              )}
            </div>
          </div>
        )}

        {current === "work_mode" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {WORK_MODE.map(o => (
                <Button
                  key={o.v}
                  variant={spec.work_mode === o.v ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSpec(p => ({
                    ...p, work_mode: o.v, remote_ok: o.v !== "onsite",
                    location_preference: o.v === "remote" ? "" : p.location_preference,
                  }))}
                >
                  {o.label}
                </Button>
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
            <Button size="sm" disabled={!spec.work_mode} onClick={() => answer({})}>Next</Button>
          </div>
        )}

        {current === "employment_type" && (
          freeText
            ? <TypeInstead value={typed} setValue={setTyped} onSave={v => answer({ employment_type: v })} onBack={() => setFreeText(false)} />
            : <>{opts(EMPLOYMENT, "employment_type")}<TypeInsteadLink onClick={() => setFreeText(true)} /></>
        )}

        {current === "min_years" && (
          <div className="flex flex-wrap gap-2">
            {YEARS.map(y => (
              <Button key={y.v} variant="outline" size="sm" onClick={() => answer({ min_years: y.v })}>{y.label}</Button>
            ))}
          </div>
        )}

        {current === "work_authorization" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {AUTHORIZATION.map(a => (
                <Button
                  key={a.v}
                  variant={spec.work_authorization === a.v ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSpec(p => ({ ...p, work_authorization: a.v }))}
                >
                  {a.label}
                </Button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Which country do they need to be eligible in</Label>
              <Input
                value={typed} onChange={e => setTyped(e.target.value)}
                placeholder="For example Canada"
              />
            </div>
            <Button
              size="sm"
              disabled={!spec.work_authorization}
              onClick={() => answer({
                notes: [spec.notes, typed.trim() ? `Work eligibility country: ${typed.trim()}` : ""]
                  .filter(Boolean).join("\n"),
              })}
            >
              Next
            </Button>
          </div>
        )}
      </Card>
    );
  }

  // ── Editable summary ─────────────────────────────────────────────
  const blocking = spec.must_have_skills.some(s => {
    const n = s.toLowerCase();
    return !catalog.some(c => c.skill_norm === n || c.skill.toLowerCase() === n);
  });

  return (
    <Card className="p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">The role AYN will search for</h2>
        <p className="text-xs text-muted-foreground">Click any line to change it.</p>
      </div>
      <div className="divide-y divide-border/50 rounded-lg border border-border/50">
        {STEPS.map(k => (
          <button
            key={k} type="button" onClick={() => { setEditing(k); setPhase("summary"); }}
            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
          >
            <span className="text-xs text-muted-foreground shrink-0 w-40">{SUMMARY_LABEL[k]}</span>
            <span className="text-sm flex-1 truncate">{labelFor(k, spec)}</span>
            <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
      {blocking && (
        <p className="text-xs text-destructive">
          At least one must have skill is not held by anyone in the pool. The search will return nobody until you change it.
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button onClick={() => onSearch(spec)} disabled={searching || !spec.title.trim() || spec.must_have_skills.length === 0}>
          {searching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
          Find candidates
        </Button>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Sparkle className="w-3 h-3" /> AYN searches candidates who opted into discovery, nothing else.
        </span>
      </div>
    </Card>
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
        <Button size="sm" disabled={!value.trim()} onClick={() => onSave(value.trim())}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onBack}>Back to options</Button>
      </div>
    </div>
  );
}
