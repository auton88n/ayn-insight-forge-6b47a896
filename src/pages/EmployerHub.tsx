/**
 * EmployerHub.tsx — v3.8.0 "the chat is candidate search, nothing else".
 *
 * The employer surface, and now the only conversational surface in the app.
 * Four steps in one page: answer the intake widgets, review the JobSpec, read
 * the candidates AYN found, send a proposal. The chat under the results is
 * scoped to evaluating those candidates and nothing else.
 *
 * No candidate identity is ever rendered here. Name, email and phone only
 * appear in the Sent list, and only after the candidate accepted.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Send, ArrowLeft, Building2, MapPin, CheckCircle2, AlertCircle, LogOut,
} from "lucide-react";
import IntakeWizard from "@/components/employer/IntakeWizard";
import CandidateChat from "@/components/employer/CandidateChat";
import {
  employerApi, type CandidateCard, type JobSpec, type Org, type SentProposal,
} from "@/lib/employer";


function ScoreRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div
      className="relative w-12 h-12 shrink-0 rounded-full grid place-items-center"
      style={{ background: `conic-gradient(hsl(var(--primary)) ${pct * 3.6}deg, hsl(var(--muted)) 0deg)` }}
      aria-label={`Match score ${pct}`}
    >
      <div className="w-9 h-9 rounded-full bg-card grid place-items-center text-xs font-semibold">{pct}</div>
    </div>
  );
}

export default function EmployerHub({ companyName }: { companyName?: string | null }) {
  const { toast } = useToast();

  const [org, setOrg] = useState<Org | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgName, setOrgName] = useState(companyName || "");
  const [orgBusy, setOrgBusy] = useState(false);

  const [spec, setSpec] = useState<JobSpec | null>(null);


  const [searching, setSearching] = useState(false);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [results, setResults] = useState<CandidateCard[]>([]);
  const [poolNote, setPoolNote] = useState("");
  const [open, setOpen] = useState<CandidateCard | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ job_title: "", job_location: "", employment_type: "", salary_range: "", job_url: "", message: "" });

  const [sent, setSent] = useState<SentProposal[]>([]);

  const loadSent = useCallback(async () => {
    try { const r = await employerApi.sentProposals(); setSent(r.requests || []); } catch { /* silent */ }
  }, []);

  useEffect(() => {
    employerApi.orgGet()
      .then(r => setOrg(r.org))
      .catch(() => setOrg(null))
      .finally(() => setOrgLoading(false));
    loadSent();
  }, [loadSent]);

  const createOrg = async () => {
    if (!orgName.trim()) return;
    setOrgBusy(true);
    try {
      const r = await employerApi.orgCreate(orgName.trim());
      setOrg(r.org);
    } catch (e) {
      toast({ title: "Couldn't create company", description: (e as Error).message, variant: "destructive" });
    } finally { setOrgBusy(false); }
  };


  const runMatch = async (nextSpec: JobSpec) => {
    if (!org) return;
    setSpec(nextSpec);
    setSearching(true);
    setResults([]);
    setPoolNote("");
    setSearchId(null);
    try {
      const r = await employerApi.match(org.id, nextSpec);
      setSearchId(r.search_id);
      setResults(r.results || []);
      setPoolNote(r.pool_note || "");
    } catch (e) {
      toast({ title: "Search failed", description: (e as Error).message, variant: "destructive" });
    } finally { setSearching(false); }
  };

  const EMPLOYMENT_LABEL: Record<string, string> = {
    full_time: "Full time", contract: "Contract", part_time: "Part time", internship: "Internship",
  };

  const openProposal = (c: CandidateCard) => {
    setForm({
      job_title: spec?.title || "",
      job_location: spec?.location_preference || "",
      employment_type: EMPLOYMENT_LABEL[spec?.employment_type || ""] || "",
      salary_range: "",
      job_url: "",
      message: "",
    });
    setOpen(c);
    setFormOpen(true);
  };


  const submitProposal = async () => {
    if (!searchId || !open) return;
    if (!form.job_title.trim() || !form.message.trim()) {
      toast({ title: "Add a job title and a message", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      await employerApi.sendProposal(searchId, open.ref, {
        job_title: form.job_title.trim(),
        job_location: form.job_location.trim() || undefined,
        employment_type: form.employment_type.trim() || undefined,
        salary_range: form.salary_range.trim() || undefined,
        job_url: form.job_url.trim() || undefined,
        message: form.message.trim(),
      });
      toast({ title: "Proposal sent", description: "You will see a reply here." });
      setFormOpen(false);
      await loadSent();
    } catch (e) {
      toast({ title: "Could not send", description: (e as Error).message, variant: "destructive" });
    } finally { setSending(false); }
  };

  const sentRefs = new Set(sent.filter(s => s.status === "pending" || s.status === "approved").map(s => s.ref));

  if (orgLoading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  if (!org) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <Card className="w-full max-w-md p-6 space-y-4">
          <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /><h1 className="font-semibold">Name your company</h1></div>
          <p className="text-sm text-muted-foreground">Candidates see this name on any proposal you send.</p>
          <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Company name" />
          <Button onClick={createOrg} disabled={orgBusy || !orgName.trim()} className="w-full">
            {orgBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Continue
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Hiring</p>
            <h1 className="text-lg font-semibold truncate">{org.name}</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
            <LogOut className="w-4 h-4 mr-1.5" /> Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* 1 and 2. Widget intake, then the editable spec summary. */}
        <IntakeWizard orgId={org.id} searching={searching} onSearch={runMatch} />


        {/* 3. Results */}
        {(results.length > 0 || poolNote) && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Candidates</h2>
            {poolNote && <p className="text-xs text-muted-foreground">{poolNote}</p>}
            {results.map(c => (
              <Card key={c.ref} className="p-4 sm:p-5 space-y-3">
                <div className="flex items-start gap-4">
                  <ScoreRing score={c.score} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.headline || "Candidate"}</p>
                    <p className="text-xs text-muted-foreground">
                      {[c.seniority, c.years_experience != null ? `${c.years_experience} years` : "", c.location]
                        .filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setOpen(c); setFormOpen(false); }}>Open</Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.matched_must_haves.map(m => <Badge key={m} variant="secondary" className="font-normal">{m}</Badge>)}
                  {c.gaps.map(g => <Badge key={g} variant="outline" className="font-normal text-muted-foreground">{g}</Badge>)}
                </div>
                <ul className="space-y-1">
                  {c.why.slice(0, 3).map((w, i) => (
                    <li key={i} className="text-xs text-muted-foreground leading-relaxed">{w}</li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}

        {/* 3b. The only chat: evaluating the candidates this search returned. */}
        {searchId && results.length > 0 && (
          <CandidateChat searchId={searchId} count={results.length} />
        )}



        {/* 4. Sent proposals */}
        {sent.length > 0 && (
          <Card className="p-4 sm:p-6 space-y-3">
            <h2 className="text-sm font-semibold">Proposals you sent</h2>
            {sent.map(s => (
              <div key={s.id} className="rounded-lg border border-border/50 px-3 py-2.5 space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium truncate">{s.job_title || "Role"}</p>
                  <Badge variant={s.status === "approved" ? "secondary" : "outline"}>
                    {s.status === "pending" ? "Waiting for a reply" : s.status === "approved" ? "Accepted" : "Declined"}
                  </Badge>
                </div>
                {s.status === "approved" && (
                  <p className="text-xs">
                    <span className="font-medium">{s.name || "Candidate"}</span>
                    {s.email ? ` · ${s.email}` : ""}{s.phone ? ` · ${s.phone}` : ""}
                  </p>
                )}
                {s.status === "declined" && (
                  <p className="text-xs text-muted-foreground">They passed on this role.</p>
                )}
              </div>
            ))}
          </Card>
        )}
      </main>

      {/* Candidate detail. No name, email, phone, or user id at this stage. */}
      <Dialog open={!!open && !formOpen} onOpenChange={o => { if (!o) setOpen(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <ScoreRing score={open.score} />
                  <span className="text-base">{open.headline || "Candidate"}</span>
                </DialogTitle>
                <DialogDescription className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {[open.seniority, open.years_experience != null ? `${open.years_experience} years` : "", open.location]
                    .filter(Boolean).join(" · ") || "No location given"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Why AYN picked them</p>
                  <ul className="space-y-1.5">
                    {open.why.map((w, i) => <li key={i} className="text-sm leading-relaxed">{w}</li>)}
                  </ul>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Requirements met</p>
                    <div className="flex flex-wrap gap-1.5">
                      {open.matched_must_haves.map(m => (
                        <Badge key={m} variant="secondary" className="font-normal gap-1">
                          <CheckCircle2 className="w-3 h-3" />{m}
                        </Badge>
                      ))}
                      {open.matched_must_haves.length === 0 && <span className="text-xs text-muted-foreground">None recorded.</span>}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Gaps</p>
                    <div className="flex flex-wrap gap-1.5">
                      {open.gaps.map(g => (
                        <Badge key={g} variant="outline" className="font-normal gap-1 text-muted-foreground">
                          <AlertCircle className="w-3 h-3" />{g}
                        </Badge>
                      ))}
                      {open.gaps.length === 0 && <span className="text-xs text-muted-foreground">None found.</span>}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Backed by their resume</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(open.skills_extracted ?? []).map(s => <Badge key={s} variant="outline" className="font-normal">{s}</Badge>)}
                      {(open.skills_extracted ?? []).length === 0 && <span className="text-xs text-muted-foreground">Nothing evidenced.</span>}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">AYN inferred</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(open.skills_inferred ?? []).map(s => <Badge key={s} variant="secondary" className="font-normal">{s}</Badge>)}
                      {(open.skills_inferred ?? []).length === 0 && <span className="text-xs text-muted-foreground">None inferred.</span>}
                    </div>
                  </div>
                </div>

                {open.summary && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Background</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{open.summary}</p>
                  </div>
                )}
              </div>

              <DialogFooter>
                {sentRefs.has(open.ref) ? (
                  <Button disabled variant="secondary">Proposal sent, waiting for a reply</Button>
                ) : (
                  <Button onClick={() => openProposal(open)}>Send a job proposal</Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Proposal form */}
      <Dialog open={formOpen} onOpenChange={o => { setFormOpen(o); if (!o) setOpen(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send a job proposal</DialogTitle>
            <DialogDescription>
              The candidate reads this in AYN. Their contact details reach you only if they accept.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Job title</Label>
              <Input value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Location</Label>
                <Input value={form.job_location} onChange={e => setForm({ ...form, job_location: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Employment type</Label>
                <Input value={form.employment_type} onChange={e => setForm({ ...form, employment_type: e.target.value })} placeholder="Full time" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Salary range</Label>
                <Input value={form.salary_range} onChange={e => setForm({ ...form, salary_range: e.target.value })} placeholder="120k to 150k" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Link to the posting</Label>
                <Input value={form.job_url} onChange={e => setForm({ ...form, job_url: e.target.value })} placeholder="https://" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Message</Label>
              <Textarea
                value={form.message}
                maxLength={1000}
                onChange={e => setForm({ ...form, message: e.target.value })}
                className="min-h-[120px]"
                placeholder="Why you think they are a fit and what happens next."
              />
              <p className="text-[11px] text-muted-foreground text-right">{form.message.length} of 1000</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
            <Button onClick={submitProposal} disabled={sending}>
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send proposal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
