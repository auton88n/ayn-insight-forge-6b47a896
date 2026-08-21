/**
 * EmployerHub.tsx — v3.8.0 "the chat is candidate search, nothing else".
 *
 * The employer surface, and now the only conversational surface in the app.
 * Four steps in one page: answer the intake widgets, review the JobSpec, read
 * the candidates AYN found, send a proposal. v3.9.0 removed the free-form
 * chat: AYN now answers four fixed questions per candidate, and the proposal
 * message arrives pre-written.
 *
 * No candidate identity is ever rendered here. Name, email and phone only
 * appear in the Sent list, and only after the candidate accepted.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Loader2, Send, Building2, MapPin, CheckCircle2, AlertCircle, LogOut,
  Brain, Search as SearchIcon, Mail, ClipboardCheck, ArrowLeft, Settings, Zap,
} from "lucide-react";

import IntakeWizard from "@/components/employer/IntakeWizard";
import CompanyProfile from "@/components/employer/CompanyProfile";
import CandidateResultCard from "@/components/employer/CandidateResultCard";
import CandidateProfile from "@/components/employer/CandidateProfile";
import AssessmentDialog from "@/components/employer/AssessmentDialog";
import AssessmentsPanel from "@/components/employer/AssessmentsPanel";
import MessageThread from "@/components/shared/MessageThread";
import { AynLoader } from "@/components/shared/AynLoader";
import aynLogo from "@/assets/ayn-logo.png";
import { MaintenanceNotice } from "@/components/shared/MaintenanceNotice";
import { useFeature } from "@/hooks/useFeatureFlags";
import { isFeatureDisabled } from "@/lib/featureError";
import {
  employerApi, isOrgComplete, missingOrgFields,
  type CandidateCard, type JobSpec, type Org, type SentProposal,
} from "@/lib/employer";
import { billingApi, type EmployerBilling } from "@/lib/billing";
// v3.181.0 — the actual root cause of "the gradient button rendered
// transparent": this file applied the .resume-hub-theme class but never
// loaded the stylesheet that defines --rh-* on it. ResumeHub.tsx pulls
// this in directly (its own import, same path) rather than it being a
// global stylesheet, so a fresh employer session that never visited
// Resume Hub in the same tab had every --rh-* variable resolve to nothing
// at all -- not the old flat orange, not ember, literally undefined,
// which is why the "Continue" button above was invisible (an inline
// `background: var(--rh-gradient)` with an unresolved var() is treated
// as invalid, not a fallback to nothing rendered, so it fell through to
// the default Button variant's own now-conflicting bg-foreground rule
// and produced a fully transparent button with white text).
import "@/styles/resume-hub.css";


/** v3.12.0 — the employer gets a left rail in the Resume Hub language. */
type EmployerTab = "search" | "proposals" | "assessments" | "company";
const EMPLOYER_NAV: { key: EmployerTab; label: string; icon: typeof Brain; hint: string }[] = [
  { key: "search", label: "Search", hint: "Describe the role, read candidates", icon: SearchIcon },
  { key: "proposals", label: "Proposals", hint: "What you sent, and their answers", icon: Mail },
  { key: "assessments", label: "Assessments", hint: "Check that their claims are real", icon: ClipboardCheck },
  { key: "company", label: "Company", hint: "What candidates see about you", icon: Building2 },
];



function ScoreRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div
      className="relative w-12 h-12 shrink-0 rounded-full grid place-items-center"
      style={{ background: `conic-gradient(var(--rh-accent) ${pct * 3.6}deg, var(--rh-raised) 0deg)` }}
      aria-label={`Match score ${pct}`}
    >
      <div className="w-9 h-9 rounded-full bg-card grid place-items-center text-xs font-semibold">{pct}</div>
    </div>
  );
}

// v3.188.0 — same fix as ResumeHub.tsx's own rail mark, see its comment:
// the rounded-square single-letter mark reads as a personal avatar, so it
// should actually be one. Duplicated rather than imported since it's three
// lines and importing a helper out of a sibling page component for this
// would be the wrong kind of coupling.
function initialFromIdentity(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || "").trim() || (email || "").trim();
  return source ? source[0].toUpperCase() : "A";
}

export default function EmployerHub({ companyName }: { companyName?: string | null }) {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgName, setOrgName] = useState(companyName || "");
  const [orgBusy, setOrgBusy] = useState(false);

  const [spec, setSpec] = useState<JobSpec | null>(null);
  // v3.35.0 — resume-hub already computes this on every metered action;
  // it was just never rendered inside the hub itself, only on /billing.
  const [usage, setUsage] = useState<EmployerBilling | null>(null);

  // v3.15.0 — left nav state, and the staged search flow.
  const [tab, setTab] = useState<EmployerTab>("search");
  const [stage, setStage] = useState<"spec" | "results">("spec");



  // v3.39.0 — a bare signOut() cleared the session but never navigated
  // anywhere, so this whole gated view stayed on screen looking untouched.
  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    navigate("/");
  }, [navigate]);

  const [searching, setSearching] = useState(false);
  // v3.24.0 — maintenance switches, set from the admin panel.
  const searchFeature = useFeature("candidate_search");
  const proposalFeature = useFeature("proposals");
  const assessFeature = useFeature("assessments");
  const [searchId, setSearchId] = useState<string | null>(null);
  const [results, setResults] = useState<CandidateCard[]>([]);
  const [poolNote, setPoolNote] = useState("");
  const [open, setOpen] = useState<CandidateCard | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [form, setForm] = useState({ job_title: "", job_location: "", employment_type: "", salary_range: "", job_url: "", message: "" });

  const [sent, setSent] = useState<SentProposal[]>([]);
  const [openThread, setOpenThread] = useState<string | null>(null);

  // v3.13.0 — the assessment dialog and a reload key for the sent list.
  const [assessFor, setAssessFor] = useState<CandidateCard | null>(null);
  const [assessKey, setAssessKey] = useState(0);


  const loadSent = useCallback(async () => {
    try { const r = await employerApi.sentProposals(); setSent(r.requests || []); } catch { /* silent */ }
  }, []);

  /**
   * v3.11.0 — the surface unlocks in place, no reload. Clearing a required
   * field later re-locks it, and we say which field and what it blocks.
   */
  const profileComplete = isOrgComplete(org);
  const handleOrgSaved = useCallback((next: Org) => {
    // v3.86.0 — toast() must never run inside a setState updater: it triggers
    // the Toaster's own setState while React is still processing this one,
    // which React flags as updating a component while rendering another.
    const was = isOrgComplete(org);
    const now = isOrgComplete(next);
    setOrg(next);
    if (!was && now) {
      toast({ title: "Company profile complete", description: "You can search for candidates now." });
    } else if (was && !now) {
      const missing = missingOrgFields(next).map(m => m.label).join(", ");
      toast({
        title: `${missing} is now empty`,
        description: "Candidate search and proposals are paused until you fill it back in.",
        variant: "destructive",
      });
    }
  }, [org, toast]);


  const refreshUsage = useCallback((orgId: string) => {
    billingApi.employer(orgId).then(setUsage).catch(() => { /* silent */ });
  }, []);

  useEffect(() => {
    employerApi.orgGet()
      .then(r => {
        setOrg(r.org);
        if (r.org?.id) refreshUsage(r.org.id);
      })
      .catch(() => setOrg(null))
      .finally(() => setOrgLoading(false));
    loadSent();
    // v3.74.0 — a cross-page link (Settings > Account's "Edit company
    // profile") can ask to land straight on a tab instead of always Search.
    const openTab = sessionStorage.getItem("ayn_open_tab");
    if (openTab) {
      sessionStorage.removeItem("ayn_open_tab");
      if (EMPLOYER_NAV.some(n => n.key === openTab)) setTab(openTab as EmployerTab);
    }
  }, [loadSent]);

  /**
   * v3.10.1 — the orange token scope has to reach portals too. Radix renders
   * Dialog, AlertDialog, Popover and Select content into document.body, well
   * outside this page's DOM tree, so a class on the wrapper alone would leave
   * the proposal dialog black while the page turned orange. Setting it on
   * <body> for the lifetime of the employer surface covers both.
   * v3.181.0 — reported directly: "make sure our design for candidate is
   * same design for the employer too." .employer-surface was its own,
   * older, flatter-orange (#f97316) system, separate from Resume Hub's
   * real Charcoal & Ember one (#e85d3a gradient, warm paper canvas,
   * Figtree/Outfit). Swapped to .resume-hub-theme -- the exact same scope
   * the seeker side uses, not a lookalike -- so both surfaces are
   * genuinely one design system, not two that happen to match colors.
   */
  useEffect(() => {
    document.body.classList.add("resume-hub-theme");
    return () => document.body.classList.remove("resume-hub-theme");
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
      setUserName((data.user?.user_metadata?.full_name as string | undefined) ?? null);
    });
  }, []);

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
    setStage("results");
    setResults([]);
    setPoolNote("");
    setSearchId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const r = await employerApi.match(org.id, nextSpec);
      setSearchId(r.search_id);
      setResults(r.results || []);
      setPoolNote(r.pool_note || "");
      refreshUsage(org.id);
    } catch (e) {
      setStage("spec");
      toast(isFeatureDisabled(e)
        ? { title: "Under maintenance", description: e.message }
        : { title: "Search failed", description: (e as Error).message, variant: "destructive" });
    } finally { setSearching(false); }
  };


  const EMPLOYMENT_LABEL: Record<string, string> = {
    full_time: "Full time", contract: "Contract", part_time: "Part time", internship: "Internship",
  };

  const draftMessage = useCallback(async (c: CandidateCard) => {
    if (!org || !searchId) return;
    setDrafting(true);
    try {
      const r = await employerApi.draftProposal(org.id, searchId, c.ref);
      if (r.message) setForm(f => ({ ...f, message: r.message.slice(0, 1000) }));
    } catch {
      // Drafting never blocks sending. The box stays empty with its placeholder.
    } finally { setDrafting(false); }
  }, [org, searchId]);

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
    void draftMessage(c);
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
      if (org) refreshUsage(org.id);
    } catch (e) {
      toast({ title: "Could not send", description: (e as Error).message, variant: "destructive" });
    } finally { setSending(false); }
  };

  const sentRefs = new Set(sent.filter(s => s.status === "pending" || s.status === "approved").map(s => s.ref));

  if (orgLoading) {
    return (
      <div className="resume-hub-theme min-h-screen grid place-items-center" style={{ color: "var(--rh-muted)" }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--rh-accent)" }} />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="resume-hub-theme min-h-screen grid place-items-center p-6">
        <Card className="w-full max-w-md p-6 space-y-4 rounded-2xl" style={{ background: "var(--rh-surface)", border: "1px solid var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4" style={{ color: "var(--rh-accent-2)" }} />
            <h1 className="rh-display">Name your company</h1>
          </div>
          <p className="text-sm" style={{ color: "var(--rh-muted)" }}>Candidates see this name on any proposal you send.</p>
          <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Company name" />
          <Button
            onClick={createOrg}
            disabled={orgBusy || !orgName.trim()}
            className="w-full hover:opacity-90"
            style={{ background: "var(--rh-gradient)", borderColor: "transparent", color: "#fff", boxShadow: "var(--rh-glow)" }}
          >
            {orgBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Continue
          </Button>
        </Card>
      </div>
    );
  }

  const pendingSent = sent.filter(s => s.status === "pending").length;

  return (
    <div className="resume-hub-theme">
      <div className="rh-shell">
        {/* v3.181.0 — the exact rh-topbar markup ResumeHub.tsx uses, not a
            lookalike. "Hiring"/company-name text dropped, matching the
            same "the logo alone is enough" call made on the seeker side
            (v3.176.0) -- org.name still carries as the page's sr-only
            heading and the logo's alt text, so it's not lost, just not
            rendered as a redundant label next to its own mark. */}
        <div className="rh-topbar">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center shrink-0" aria-label="AYN">
              <img src={aynLogo} alt="AYN" className="h-7 w-auto" />
            </div>
            <h1 className="sr-only">{org.name} — AYN for employers</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* v3.35.0 — the same usage numbers Billing already shows, right
                where searches, proposals and assessments actually get spent.
                v3.190.0 — actually matched to the seeker credit pill's real
                style now (solid ember gradient + glow, white text), not just
                the v3.181.0 comment that claimed it already was: this was
                still the old outline+tint chip until now. */}
            {profileComplete && usage && (
              <button
                type="button"
                onClick={() => navigate("/billing")}
                className="hidden sm:inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold text-white transition hover:opacity-90"
                style={{ background: "var(--rh-gradient)", boxShadow: "var(--rh-glow)" }}
                title="Usage this period"
              >
                <Zap className="w-3.5 h-3.5" fill="#fff" strokeWidth={0} />
                <span>{usage.searches_used}{usage.plan?.searches_limit ? `/${usage.plan.searches_limit}` : ""} searches</span>
                <span className="w-1 h-1 rounded-full bg-white/60" aria-hidden />
                <span>{usage.proposals_used}{usage.plan?.proposals_limit ? `/${usage.plan.proposals_limit}` : ""} proposals</span>
                <span className="w-1 h-1 rounded-full bg-white/60" aria-hidden />
                <span>{usage.assessments_used}{usage.plan?.assessments_limit ? `/${usage.plan.assessments_limit}` : ""} assessments</span>
              </button>
            )}
            {org.logo_url && (
              <img src={org.logo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              title="Sign out"
              onClick={handleSignOut}
              className="rounded-full"
              style={{ color: "var(--rh-muted)" }}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/**
         * v3.11.0 — the gate. While a required company field is missing the
         * onboarding profile is the ONLY thing rendered, and v3.12.0 keeps the
         * nav out of the page too. The backend enforces the same rule.
         */}
        {!profileComplete ? (
          <div className="rh-main max-w-2xl mx-auto">
            <CompanyProfile org={org} onSaved={handleOrgSaved} onboarding />
          </div>
        ) : (
          <div className="rh-grid">
            {/* v3.14.0 — icon rail, same language as the seeker Resume Hub.
                v3.181.0 — now the literal same classes (.rh-aside-left/
                .rh-navlist/.rh-navitem), not a parallel reimplementation,
                and the same responsive collapse to a horizontal row on
                mobile that ResumeHub.tsx already gets for free from
                resume-hub.css, so the separate fixed-bottom mobile nav
                this page used to hand-roll is gone; there's nothing left
                for it to do differently.
                v3.187.0 — labels are now always visible, not a hover-only
                tooltip; see resume-hub.css's own note on why. */}
            <aside className="rh-aside-left" aria-label="Employer navigation">
              <div
                className="rh-rail-mark"
                title={userEmail || undefined}
                aria-label={userEmail ? `Signed in as ${userEmail}` : "Account"}
              >
                {initialFromIdentity(userName, userEmail)}
              </div>
              <div className="rh-rail-sep" aria-hidden />
              <nav className="rh-navlist">
                {EMPLOYER_NAV.map(item => {
                  const Icon = item.icon;
                  const active = tab === item.key;
                  const badge = item.key === "proposals" ? pendingSent : 0;
                  return (
                    <button
                      key={item.key}
                      onClick={() => setTab(item.key)}
                      className={`rh-navitem ${active ? "active" : ""}`}
                      aria-label={item.label + (badge > 0 ? ` (${badge} new)` : "")}
                    >
                      <Icon className="w-[18px] h-[18px] shrink-0" />
                      <span className="rh-navlabel">{item.label}</span>
                      {badge > 0 && (
                        <span className="rh-navbadge" aria-hidden>{badge > 9 ? "9+" : badge}</span>
                      )}
                    </button>
                  );
                })}
                {/* v3.189.0 — reported directly: Settings was a standalone
                    topbar icon, the one thing on this page not living in
                    the nav rail with everything else. Moved in as a real
                    row, same treatment as every other item (not a tab
                    switch — it still navigates to the real /settings
                    route, unchanged), matching the seeker side's own
                    Home-as-settings item at the end of its rail. */}
                <button
                  onClick={() => navigate("/settings")}
                  className="rh-navitem"
                  aria-label="Settings"
                >
                  <Settings className="w-[18px] h-[18px] shrink-0" />
                  <span className="rh-navlabel">Settings</span>
                </button>
              </nav>
            </aside>

            <section className="rh-main">
              <div className="mb-4">
                <h2 className="rh-display text-xl">
                  {tab === "search" && stage === "results"
                    ? (spec?.title || "Your role")
                    : EMPLOYER_NAV.find(n => n.key === tab)?.label}
                </h2>
                <p className="text-sm mt-0.5" style={{ color: "var(--rh-muted)" }}>
                  {tab === "search" && stage === "results"
                    ? [spec?.seniority, spec?.location_preference, EMPLOYMENT_LABEL[spec?.employment_type || ""]]
                        .filter(Boolean).join(" · ")
                    : EMPLOYER_NAV.find(n => n.key === tab)?.hint}
                </p>
              </div>


            {tab === "search" && searching && (
              <Card className="p-12 flex flex-col items-center justify-center text-center gap-4">
                <AynLoader size="md" label="Loading" />
              </Card>
            )}


            {tab === "search" && !searching && stage === "spec" && (
              searchFeature.enabled
                ? <IntakeWizard orgId={org.id} searching={searching} onSearch={runMatch} />
                : <MaintenanceNotice feature="candidate_search" />
            )}

            {tab === "search" && !searching && stage === "results" && (
              <div className="space-y-4">
                <div className="flex justify-start">
                  <Button variant="outline" size="sm" onClick={() => setStage("spec")}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to the role
                  </Button>
                </div>


                {results.length === 0 ? (
                  <Card className="p-6 text-center space-y-1.5">
                    <p className="text-sm font-medium">Nobody in the pool matches these must haves yet</p>
                    <p className="text-sm text-muted-foreground">
                      Try relaxing one must have skill, or lowering the minimum years, and search again.
                    </p>
                  </Card>
                ) : (
                  <>
                    {poolNote && <p className="text-sm text-muted-foreground">{poolNote}</p>}
                    {results.map((c, i) => (
                      <CandidateResultCard
                        key={c.ref}
                        candidate={c}
                        index={i}
                        total={results.length}
                        searchId={searchId}
                        alreadySent={sentRefs.has(c.ref)}
                        onOpen={() => { setOpen(c); setFormOpen(false); }}
                        onProposal={() => openProposal(c)}
                        onAssess={() => setAssessFor(c)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}


            {tab === "proposals" && (
              <Card className="p-4 sm:p-6 space-y-3 rounded-2xl" style={{ background: "var(--rh-surface)", border: "1px solid var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
                <h2 className="rh-display text-[15px]">Proposals you sent</h2>
                {sent.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--rh-muted)" }}>
                    Nothing sent yet. Find a candidate first, then send them a proposal.
                  </p>
                )}
                {sent.map(s => (
                  <div key={s.id} className="rounded-lg px-3 py-2.5 space-y-1" style={{ border: "1px solid var(--rh-hair)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {s.name || s.first_name || (s.ref ? `Candidate ${s.ref}` : "Candidate")}
                        </p>
                        <p className="text-xs truncate" style={{ color: "var(--rh-muted)" }}>
                          {[s.job_title || "Role", s.sent_at ? new Date(s.sent_at).toLocaleDateString() : ""]
                            .filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span
                        className="text-[11px] font-semibold rounded-full px-2.5 py-1 shrink-0"
                        style={s.status === "approved"
                          ? { background: "var(--rh-trust-tint)", color: "var(--rh-trust)" }
                          : { background: "var(--rh-raised)", color: "var(--rh-muted)" }}
                      >
                        {s.status === "pending" ? "Waiting for a reply" : s.status === "approved" ? "Accepted" : "Declined"}
                      </span>
                    </div>
                    {s.status === "approved" && (s.email || s.phone) && (
                      <p className="text-xs">
                        {[s.email, s.phone].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {s.status === "declined" && (
                      <p className="text-xs" style={{ color: "var(--rh-faint)" }}>They passed on this role.</p>
                    )}
                    <Button
                      size="sm" variant="ghost" className="h-7 px-2 text-xs"
                      onClick={() => setOpenThread(o => o === s.id ? null : s.id)}
                    >
                      <Mail className="w-3.5 h-3.5 mr-1.5" />
                      {openThread === s.id ? "Hide messages" : "Messages"}
                    </Button>
                    {openThread === s.id && (
                      <MessageThread
                        revealRequestId={s.id}
                        role="employer"
                        twoWayEnabled={s.two_way_enabled}
                        candidateBlocked={s.candidate_blocked}
                        onTwoWayChange={(enabled) => setSent(prev => prev.map(x => x.id === s.id ? { ...x, two_way_enabled: enabled } : x))}
                        onBlockChange={(blocked) => setSent(prev => prev.map(x => x.id === s.id ? { ...x, candidate_blocked: blocked } : x))}
                      />
                    )}
                  </div>
                ))}

              </Card>
            )}

            {tab === "company" && <CompanyProfile org={org} onSaved={handleOrgSaved} page />}

            {tab === "assessments" && <AssessmentsPanel reloadKey={assessKey} />}
            </section>
          </div>
        )}
      </div>




      {/* Candidate detail. No name, email, phone, or user id at this stage. */}
      <Dialog open={!!open && !formOpen} onOpenChange={o => { if (!o) setOpen(null); }}>
        <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] max-h-[88dvh] sm:max-h-[85vh] overflow-hidden bg-background flex flex-col gap-0 p-0">
          {open && (
            <>
              <DialogHeader className="shrink-0 border-b border-border/60 bg-background p-6 pb-4 space-y-1.5">

                <DialogTitle className="flex items-center gap-3">
                  <ScoreRing score={open.score} />
                  <span className="min-w-0">
                    <span className="block text-base leading-tight">{open.first_name || "Candidate"}</span>
                    <span className="block text-sm font-normal text-muted-foreground truncate">
                      {open.headline || "No headline given"}
                    </span>
                  </span>
                </DialogTitle>
                <DialogDescription className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {[open.seniority, open.years_experience != null ? `${open.years_experience} years` : "", open.location]
                    .filter(Boolean).join(" · ") || "No location given"}
                </DialogDescription>

              </DialogHeader>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-background p-6 space-y-6">
                {open.why.length > 0 && (
                  <section className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Why AYN picked them</p>
                    <ul className="space-y-2">
                      {open.why
                        .flatMap(w => w.split(/(?<=\.)\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean))
                        .map((w, i) => (
                          <li key={i} className="text-sm leading-relaxed flex gap-2.5">
                            <span className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--rh-accent)" }} aria-hidden />
                            <span>{w}</span>
                          </li>
                        ))}
                    </ul>
                  </section>
                )}

                <section className="rounded-xl border border-border/60 grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
                  <div className="p-4 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Requirements met</p>
                    <div className="flex flex-wrap gap-1.5">
                      {open.matched_must_haves.map(m => (
                        <Badge key={m} variant="secondary" className="font-normal gap-1 py-1">
                          <CheckCircle2 className="w-3 h-3" />{m}
                        </Badge>
                      ))}
                      {open.matched_must_haves.length === 0 && <span className="text-sm text-muted-foreground">None recorded.</span>}
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Missing</p>
                    <div className="flex flex-wrap gap-1.5">
                      {open.gaps.map(g => (
                        <Badge key={g} variant="outline" className="font-normal gap-1 py-1 text-muted-foreground">
                          <AlertCircle className="w-3 h-3" />{g}
                        </Badge>
                      ))}
                      {open.gaps.length === 0 && <span className="text-sm text-muted-foreground">Nothing missing that you named.</span>}
                    </div>
                  </div>
                </section>

                {/* v3.15.1 — the two provenance rows sit in one bordered block
                    with aligned labels, so the chips stop floating loose. */}
                <section className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Skills</p>
                  <div className="rounded-xl border border-border/60 divide-y divide-border/60">
                    {([
                      { label: "From their resume", note: "Evidenced", list: open.skills_extracted ?? [], dashed: false, empty: "Nothing evidenced." },
                      { label: "AYN inferred", note: "Not evidenced", list: open.skills_inferred ?? [], dashed: true, empty: "None inferred." },
                    ]).map(row => (
                      <div key={row.label} className="p-4 grid grid-cols-1 sm:grid-cols-[9rem_1fr] gap-2 sm:gap-4">
                        <div className="min-w-0">
                          <p className="text-xs font-medium">{row.label}</p>
                          <p className="text-[11px] text-muted-foreground">{row.note}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 min-w-0">
                          {row.list.map(s => (
                            <Badge key={s} variant="outline" className={`font-normal ${row.dashed ? "border-dashed" : ""}`}>{s}</Badge>
                          ))}
                          {row.list.length === 0 && <span className="text-xs text-muted-foreground">{row.empty}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>


                {open.profile ? (
                  <section className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Background</p>
                    <CandidateProfile profile={open.profile} location={open.location} />
                  </section>
                ) : open.summary ? (
                  <section className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Background</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{open.summary}</p>
                  </section>
                ) : null}

              </div>


              <DialogFooter className="shrink-0 gap-2 sm:gap-3 border-t border-border/60 bg-background p-6 pt-4">
                {/* v3.13.0 — check the claims before you spend a proposal. */}
                <Button
                  variant="outline"
                  disabled={!searchId || !assessFeature.enabled}
                  onClick={() => { setAssessFor(open); setOpen(null); }}
                >
                  <ClipboardCheck className="w-4 h-4 mr-2" /> Send an assessment
                </Button>
                {sentRefs.has(open.ref) ? (
                  <Button disabled variant="secondary">Proposal sent, waiting for a reply</Button>
                ) : (
                  <Button
                    onClick={() => openProposal(open)}
                    disabled={!proposalFeature.enabled}
                    className="hover:opacity-90"
                    style={{ background: "var(--rh-gradient)", borderColor: "transparent", color: "#fff", boxShadow: "var(--rh-glow)" }}
                  >
                    Send a job proposal
                  </Button>
                )}
              </DialogFooter>

            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Proposal form */}
      <Dialog open={formOpen} onOpenChange={o => { setFormOpen(o); if (!o) setOpen(null); }}>
        <DialogContent className="max-w-lg w-[calc(100vw-1.5rem)] max-h-[88dvh] overflow-y-auto overscroll-contain bg-background">
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
              <div className="flex items-center justify-between">
                <Label className="text-xs">Message</Label>
                <button
                  type="button"
                  onClick={() => open && draftMessage(open)}
                  disabled={drafting}
                  className="text-[11px] font-bold hover:underline disabled:opacity-50"
                  style={{ color: "var(--rh-accent-2)" }}
                >
                  {drafting ? "Writing a draft…" : "Rewrite draft"}
                </button>
              </div>
              <Textarea
                value={form.message}
                maxLength={1000}
                onChange={e => setForm({ ...form, message: e.target.value })}
                className="min-h-[120px]"
                placeholder={drafting ? "AYN is drafting a message…" : "Why you think they are a fit and what happens next."}
              />
              <p className="text-[11px] text-muted-foreground text-right">{form.message.length} of 1000</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button
              onClick={submitProposal}
              disabled={sending}
              className="hover:opacity-90"
              style={{ background: "var(--rh-gradient)", borderColor: "transparent", color: "#fff", boxShadow: "var(--rh-glow)" }}
            >
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send proposal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* v3.13.0 — verification assessment. Rubrics never reach this client. */}
      {org && searchId && assessFor && (
        <AssessmentDialog
          open={!!assessFor}
          onOpenChange={o => { if (!o) setAssessFor(null); }}
          orgId={org.id}
          searchId={searchId}
          candidateRef={assessFor.ref}
          onSent={() => { setAssessKey(k => k + 1); setTab("assessments"); if (org) refreshUsage(org.id); }}
        />
      )}
    </div>

  );
}
