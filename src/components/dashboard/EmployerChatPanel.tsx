// v2.9.0-B — Hiring mode chat panel. Lives inside the AYN dashboard.
// Employers describe a role; the intake agent (resume-hub/employer_intake_chat)
// distills a JobSpec; a Find candidates action runs the hybrid matcher
// (deterministic extracted-only prefilter, vector recall, grounded rerank);
// results render as anonymized cards with Request intro reveal flow.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Building2, Users, Sparkles, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  employerApi,
  type Org,
  type JobSpec,
  type IntakeTurn,
  type CandidateCard,
} from "@/lib/employer";

type Bubble =
  | { kind: "text"; role: "user" | "assistant"; text: string }
  | { kind: "register"; text: string }
  | { kind: "job_spec"; spec: JobSpec }
  | { kind: "results"; searchId: string | null; results: CandidateCard[]; poolNote: string };

export default function EmployerChatPanel({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [org, setOrg] = useState<Org | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [regName, setRegName] = useState("");
  const [regSite, setRegSite] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [revealBusy, setRevealBusy] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await employerApi.orgGet();
        setOrg(r.org);
        if (r.org) {
          setBubbles([{ kind: "text", role: "assistant", text: `Hiring mode is on for ${r.org.name}. Tell me about the role you need to fill.` }]);
        } else {
          setBubbles([{ kind: "text", role: "assistant", text: "Welcome to hiring mode. First, let's register your company so I can start finding candidates." },
            { kind: "register", text: "Company details" }]);
        }
      } catch { /* silent */ } finally { setOrgLoading(false); }
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles]);

  const intakeHistory: IntakeTurn[] = useMemo(() =>
    bubbles.filter(b => b.kind === "text").map(b => {
      const t = b as { kind: "text"; role: "user" | "assistant"; text: string };
      return { role: t.role, content: t.text };
    })
  , [bubbles]);

  const registerOrg = useCallback(async () => {
    if (!regName.trim()) return;
    setRegBusy(true);
    try {
      const { org: created } = await employerApi.orgCreate(regName.trim(), regSite.trim() || undefined);
      setOrg(created);
      setBubbles(prev => [
        ...prev.filter(b => b.kind !== "register"),
        { kind: "text", role: "assistant", text: `${created.name} is registered. Tell me about the role you need to fill.` },
      ]);
    } catch (e) {
      toast({ title: "Couldn't register", description: (e as Error).message, variant: "destructive" });
    } finally { setRegBusy(false); }
  }, [regName, regSite, toast]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy || !org) return;
    setInput("");
    const next: Bubble[] = [...bubbles, { kind: "text", role: "user", text }];
    setBubbles(next);
    setBusy(true);
    try {
      const history: IntakeTurn[] = next.filter(b => b.kind === "text").map(b => {
        const t = b as { kind: "text"; role: "user" | "assistant"; text: string };
        return { role: t.role, content: t.text };
      });
      const r = await employerApi.intake(org.id, history);
      if (r.done) {
        setBubbles(prev => [...prev, { kind: "job_spec", spec: r.job_spec }]);
      } else {
        setBubbles(prev => [...prev, { kind: "text", role: "assistant", text: r.question }]);
      }
    } catch (e) {
      toast({ title: "Intake failed", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  }, [input, busy, org, bubbles, toast]);

  const findCandidates = useCallback(async (spec: JobSpec) => {
    if (!org) return;
    setBusy(true);
    try {
      const r = await employerApi.match(org.id, spec);
      setBubbles(prev => [...prev, { kind: "results", searchId: r.search_id, results: r.results, poolNote: r.pool_note }]);
    } catch (e) {
      toast({ title: "Search failed", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  }, [org, toast]);

  const requestIntro = useCallback(async (searchId: string | null, ref: string) => {
    if (!searchId) return;
    const key = `${searchId}:${ref}`;
    setRevealBusy(p => ({ ...p, [key]: true }));
    try {
      await employerApi.revealRequest(searchId, ref);
      setRevealed(p => ({ ...p, [key]: true }));
    } catch (e) {
      toast({ title: "Couldn't send request", description: (e as Error).message, variant: "destructive" });
    } finally { setRevealBusy(p => ({ ...p, [key]: false })); }
  }, [toast]);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md overflow-hidden flex flex-col">
      <div className="border-b border-border/50 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Building2 className="w-4 h-4 text-primary" />
          <span className="font-medium">Hiring mode</span>
          {org && <Badge variant="secondary">{org.name}</Badge>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4 mr-1" /> Exit hiring mode</Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4 max-w-3xl mx-auto w-full">
        {orgLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}

        {bubbles.map((b, i) => {
          if (b.kind === "text") {
            return (
              <div key={i} className={b.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${b.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border/50"}`}>
                  {b.text}
                </div>
              </div>
            );
          }
          if (b.kind === "register") {
            return (
              <Card key={i} className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium"><Building2 className="w-4 h-4 text-primary" /> Register your company</div>
                <Input placeholder="Company name" value={regName} onChange={e => setRegName(e.target.value)} />
                <Input placeholder="Website (optional)" value={regSite} onChange={e => setRegSite(e.target.value)} />
                <Button size="sm" onClick={registerOrg} disabled={regBusy || !regName.trim()}>
                  {regBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Register and continue
                </Button>
              </Card>
            );
          }
          if (b.kind === "job_spec") {
            return <JobSpecCard key={i} spec={b.spec} onFind={findCandidates} busy={busy} />;
          }
          if (b.kind === "results") {
            return (
              <div key={i} className="space-y-3">
                {b.poolNote && (
                  <Card className="p-3 text-sm text-muted-foreground bg-muted/30">{b.poolNote}</Card>
                )}
                {b.results.length === 0 && !b.poolNote && (
                  <Card className="p-4 text-sm text-muted-foreground">No candidates in the pool match yet. The pool grows as job seekers opt in.</Card>
                )}
                {b.results.map(c => {
                  const key = `${b.searchId}:${c.ref}`;
                  return (
                    <Card key={c.ref} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{c.headline || "Candidate"}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {[c.seniority, c.years_experience != null ? `${c.years_experience} yrs` : null, c.location].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <ScoreRing score={c.score} />
                      </div>
                      {c.matched_must_haves.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {c.matched_must_haves.map(s => <Badge key={s} className="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">{s}</Badge>)}
                        </div>
                      )}
                      {c.gaps.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {c.gaps.map(s => <Badge key={s} variant="outline" className="text-muted-foreground">{s}</Badge>)}
                        </div>
                      )}
                      {c.why.length > 0 && (
                        <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                          {c.why.map((w, wi) => <li key={wi}>{w}</li>)}
                        </ul>
                      )}
                      <Button
                        size="sm"
                        variant={revealed[key] ? "secondary" : "default"}
                        disabled={revealed[key] || revealBusy[key] || !b.searchId}
                        onClick={() => requestIntro(b.searchId, c.ref)}
                      >
                        {revealBusy[key] ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
                        {revealed[key] ? "Requested · waiting for candidate" : "Request intro"}
                      </Button>
                    </Card>
                  );
                })}
              </div>
            );
          }
          return null;
        })}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
          </div>
        )}
      </div>

      <div className="border-t border-border/50 px-4 sm:px-6 py-3">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={org ? "Describe the role you need to fill…" : "Register your company first"}
            disabled={!org || busy}
          />
          <Button onClick={send} disabled={!org || busy || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score || 0));
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg viewBox="0 0 40 40" className="w-14 h-14 -rotate-90">
        <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="4" />
        <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" className="text-primary" strokeWidth="4"
          strokeDasharray={`${(clamped / 100) * 2 * Math.PI * 17} ${2 * Math.PI * 17}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold">{clamped}</div>
    </div>
  );
}

function JobSpecCard({ spec, onFind, busy }: { spec: JobSpec; onFind: (s: JobSpec) => void; busy: boolean }) {
  const [edit, setEdit] = useState<JobSpec>(spec);
  const setSkills = (k: "must_have_skills" | "nice_to_have_skills", v: string) =>
    setEdit(prev => ({ ...prev, [k]: v.split(",").map(x => x.trim()).filter(Boolean) }));
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="w-4 h-4 text-primary" /> Job spec</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input value={edit.title || ""} onChange={e => setEdit(p => ({ ...p, title: e.target.value }))} placeholder="Title" />
        <Input value={edit.seniority || ""} onChange={e => setEdit(p => ({ ...p, seniority: e.target.value }))} placeholder="Seniority" />
        <Input value={(edit.must_have_skills || []).join(", ")} onChange={e => setSkills("must_have_skills", e.target.value)} placeholder="Must-have skills (comma separated)" />
        <Input value={(edit.nice_to_have_skills || []).join(", ")} onChange={e => setSkills("nice_to_have_skills", e.target.value)} placeholder="Nice-to-have skills" />
        <Input value={edit.location_preference || ""} onChange={e => setEdit(p => ({ ...p, location_preference: e.target.value }))} placeholder="Location preference" />
        <Input type="number" value={edit.min_years ?? 0} onChange={e => setEdit(p => ({ ...p, min_years: Number(e.target.value) }))} placeholder="Min years" />
      </div>
      <Textarea value={edit.notes || ""} onChange={e => setEdit(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" rows={2} />
      <Button size="sm" onClick={() => onFind(edit)} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
        Find candidates
      </Button>
    </Card>
  );
}
