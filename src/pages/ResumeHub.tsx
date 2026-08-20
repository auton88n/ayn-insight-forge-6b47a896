import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Home, User, Briefcase, Mail, LogOut, ClipboardCheck, Settings, Compass } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { AynLoader } from "@/components/shared/AynLoader";
// v3.159.0 — lazy, not eager: these seven tabs were all bundled into one
// ~880KB chunk regardless of which one is actually open, since none of
// them were code-split. Now each tab's code only loads once its own
// button is actually clicked.
const HomeTab = lazy(() => import("@/components/resume-hub/HomeTab"));
const JobsTab = lazy(() => import("@/components/resume-hub/JobsTab"));
const BrowseJobs = lazy(() => import("@/components/resume-hub/BrowseJobs"));
const ProfileTab = lazy(() => import("@/components/resume-hub/ProfileTab"));
const ProposalsTab = lazy(() => import("@/components/resume-hub/ProposalsTab"));
const AssessmentsTab = lazy(() => import("@/components/resume-hub/AssessmentsTab"));
import { employerApi } from "@/lib/employer";
import { assessmentApi } from "@/lib/assessments";
import { billingApi } from "@/lib/billing";
import "@/styles/resume-hub.css";
import aynLogo from "@/assets/ayn-logo.png";
import { useFeature } from "@/hooks/useFeatureFlags";
import { PlatformMaintenanceScreen } from "@/components/shared/MaintenanceNotice";


type TabKey = "home" | "profile" | "browse" | "jobs" | "proposals" | "assessments";
const TAB_KEYS: TabKey[] = ["home", "profile", "browse", "jobs", "proposals", "assessments"];

// v3.145.0 — reported directly: refreshing the page always dropped the
// person back on Home, no matter which section (or which job) they were
// actually looking at. sessionStorage survives a reload but clears on a
// real new session, which is the right scope here — a fresh sign-in
// starting on Home is normal, an in-session refresh throwing the person's
// place away is not.
const TAB_STORAGE_KEY = "ayn_active_tab";
// v3.166.0 — asked directly for Browse Jobs to be the first thing a job
// seeker sees. Only the fallback changes: a real stored tab (this session,
// or mid-session after switching) still wins, so nobody gets yanked away
// from wherever they actually are.
function readStoredTab(): TabKey {
  const v = sessionStorage.getItem(TAB_STORAGE_KEY);
  return (TAB_KEYS as string[]).includes(v || "") ? (v as TabKey) : "browse";
}

// v3.6.0 — Proposals is its own page, between Jobs and Assessments.
// v3.13.0 — Assessments sits right after it, badged the same way.
// v3.69.0 — Get discovered removed: "Let employers find me" and everything
// it powers moved into Profile, so this nav item had nothing left to hold.
// v3.164.0 — Browser extension removed: everything it did now lives here.
const NAV: { key: TabKey; label: string; icon: typeof Home }[] = [
  { key: "home",        label: "Home",              icon: Home },
  { key: "profile",     label: "Profile",           icon: User },
  { key: "browse",      label: "Browse jobs",       icon: Compass },
  { key: "jobs",        label: "Saved jobs",        icon: Briefcase },
  { key: "proposals",   label: "Proposals",         icon: Mail },
  { key: "assessments", label: "Assessments",       icon: ClipboardCheck },
];



export default function ResumeHub() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTabRaw] = useState<TabKey>(readStoredTab);
  const setTab = useCallback((next: TabKey) => {
    sessionStorage.setItem(TAB_STORAGE_KEY, next);
    setTabRaw(next);
  }, []);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingIntros, setPendingIntros] = useState(0);
  const [pendingAssessments, setPendingAssessments] = useState(0);
  // v3.35.0 — billing_get already returns this; only /billing rendered it.
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const refreshCredits = useCallback(() => {
    billingApi.seeker().then(r => setCreditBalance(r.balance)).catch(() => { /* silent */ });
  }, []);
  // v3.25.0 — a platform wide stop shows one message instead of a broken hub.
  const platform = useFeature("platform");

  // v3.142.0 — found while adding a Dialog to Jobs: its "Save job" button
  // rendered with a transparent background instead of ember, because Radix
  // portals Dialog/Sheet/Popover/Select content straight onto document.body,
  // outside this page's own .resume-hub-theme div — so --rh-accent and
  // every other scoped token simply weren't in scope for anything portaled.
  // Same root cause CLAUDE.md already documents fixing once for
  // .employer-surface (v3.10.1): apply the theme class to body too, for as
  // long as this page is mounted.
  useEffect(() => {
    document.body.classList.add("resume-hub-theme");
    return () => document.body.classList.remove("resume-hub-theme");
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!alive) return;
      if (!data.user) {
        // v3.88.0 — this page's own auth check can be right when the
        // cached "signed in" state Index.tsx trusts (module scope,
        // shared across the app) is wrong: not just after an explicit
        // sign-out elsewhere (fixed in v3.84.0), but any time a session
        // that LOOKS present has actually gone bad — an expired refresh
        // token, a failed silent refresh, anything short of a clean
        // sign-out that never fires SIGNED_OUT. Toasting and navigating
        // to "/" alone left that cache untouched, so Index routed
        // straight back here, which found the same thing, forever —
        // reported live as a stuck loading screen behind a toast that
        // never went away. Signing out here forces the real SIGNED_OUT
        // event before leaving, so Index can't bounce back on stale trust.
        toast({ title: "Sign in required", description: "Please sign in to use Resume Hub." });
        await supabase.auth.signOut().catch(() => { /* already signed out server-side is fine */ });
        navigate("/");
        return;
      }
      // v2.10.0 — employers must not access Resume Hub. Bounce them home.
      try {
        const q = supabase.from('profiles').select('role').eq('user_id', data.user.id).maybeSingle();
        const { data: prof } = await (q as unknown as Promise<{ data: { role?: string } | null }>);
        if (prof?.role === 'employer') {
          toast({ title: "Not available", description: "Resume Hub is for job seekers." });
          navigate("/");
          return;
        }
      } catch { /* silent */ }
      setUserId(data.user.id);
      setLoading(false);
      // v3.74.0 — a cross-page link (Settings > Account's "Edit in Profile")
      // can ask to land straight on a tab instead of always opening Home.
      const openTab = sessionStorage.getItem("ayn_open_tab");
      if (openTab) {
        sessionStorage.removeItem("ayn_open_tab");
        if (NAV.some(n => n.key === openTab)) setTab(openTab as TabKey);
      }
      // v3.6.0 — badge the Proposals tab with the pending count.
      employerApi.proposalList()
        .then(r => setPendingIntros((r.requests || []).filter(x => x.status === "pending").length))
        .catch(() => { /* silent */ });
      // v3.13.0 — badge Assessments with anything not yet submitted.
      assessmentApi.list()
        .then(r => setPendingAssessments((r.assessments || [])
          .filter(a => a.status === "sent" || a.status === "started").length))
        .catch(() => { /* silent */ });
      refreshCredits();
    }).catch((e) => {
      // v3.88.0 — getUser() had no .catch() at all: a network failure
      // (not "no user", an actual rejected promise) left loading true
      // forever with no way out and no error shown. Now it surfaces a
      // real retry state instead of hanging on the spinner indefinitely.
      if (!alive) return;
      setLoadError(e instanceof Error ? e.message : "Could not check your sign-in status.");
    });
    return () => { alive = false; };
  }, [navigate, toast]);


  // v3.145.0 — reported directly: the back arrow on a job opened this way
  // (from Browse jobs' "Score and tailor") took the person to the Saved
  // jobs list instead of back to Browse, where they actually came from.
  // ayn_focus_job_from is a second one-shot flag alongside the existing
  // ayn_focus_job handoff, read once by JobsTab on the same mount so its
  // back button can tell the two origins apart.
  const goJob = useCallback((jobId: string) => {
    setTab("jobs");
    sessionStorage.setItem("ayn_focus_job", jobId);
    sessionStorage.setItem("ayn_focus_job_from", "browse");
  }, [setTab]);

  // v3.39.0 — a bare signOut() cleared the session but never navigated
  // anywhere, so this whole gated view stayed on screen looking untouched.
  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    navigate("/");
  }, [navigate]);

  if (loadError) {
    return (
      <div className="resume-hub-theme flex flex-col items-center justify-center gap-3" style={{ minHeight: "100vh" }}>
        <div className="rh-eyebrow">Couldn't check your sign-in status.</div>
        <p className="text-xs text-muted-foreground max-w-xs text-center">{loadError}</p>
        <Button size="sm" onClick={() => window.location.reload()}>Try again</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="resume-hub-theme flex items-center justify-center" style={{ minHeight: "100vh" }}>
        <div className="rh-eyebrow">Loading workspace…</div>
      </div>
    );
  }

  if (platform.loaded && !platform.enabled) return <PlatformMaintenanceScreen />;

  return (
    <div className="resume-hub-theme">
      <div className="rh-shell">
        {/* Top bar */}
        <div className="rh-topbar">
          {/* v3.12.0 — "Back" had nowhere sensible to go once the dashboard
              was removed. The AYN mark takes its place, and Sign out moved
              into a menu on the right, matching the employer header. */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center shrink-0" aria-label="AYN">
              <img src={aynLogo} alt="AYN" className="h-7 w-auto" />
            </div>
            <div className="w-px h-6 bg-[color:var(--rh-hair)]" aria-hidden />
            <div className="min-w-0">
              <div className="rh-eyebrow">Job Search OS</div>
              <h1 className="rh-title leading-tight truncate">Resume Hub</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* v3.35.0 — billing_get already returns this; it just never showed
                up anywhere before /billing itself. */}
            {creditBalance !== null && (
              <button
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: "var(--rh-accent)", color: "var(--rh-accent-2)", background: "var(--rh-tint)" }}
                onClick={() => navigate("/billing")}
                title="Credit balance"
              >
                {creditBalance} credit{creditBalance === 1 ? "" : "s"}
              </button>
            )}
            <button className="rh-btn rh-btn-primary" onClick={() => setTab("profile")}>
              Your resume
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account menu"
                  className="rounded-full text-[color:var(--rh-muted)] hover:text-[color:var(--rh-ink)] hover:bg-[color:var(--rh-raised)]">
                  <User className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              {/* v3.173.0 — reported directly: four items (Your profile,
                  Plan and credits, Settings, Sign out) when Settings already
                  shows the plan/credits summary and the profile summary with
                  a link back to each real editor (AccountPreferences.tsx,
                  v3.73.0) — three ways to reach the same place. Collapsed to
                  Settings plus Sign out, and retinted off the default
                  bg-popover/text-popover-foreground (plain white/black) onto
                  the same rh-tokens the rest of Resume Hub already uses. */}
              <DropdownMenuContent
                align="end"
                className="border-[color:var(--rh-hair)] bg-[color:var(--rh-surface)] text-[color:var(--rh-ink)]"
              >
                <DropdownMenuItem
                  onClick={() => navigate("/settings")}
                  className="focus:bg-[color:var(--rh-tint)] focus:text-[color:var(--rh-accent-2)]"
                >
                  <Settings className="w-4 h-4 mr-2" /> Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[color:var(--rh-hair)]" />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="focus:bg-[color:var(--rh-tint)] focus:text-[color:var(--rh-accent-2)]"
                >
                  <LogOut className="w-4 h-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>


        {/* Three-column workspace */}
        <div className="rh-grid">
          {/* Left icon rail */}
          <aside className="rh-aside-left" aria-label="Workspace navigation">
            <div className="rh-rail-mark" aria-hidden>A</div>
            <div className="rh-rail-sep" aria-hidden />
            <nav className="rh-navlist">
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = tab === item.key;
                // v3.13.0 — Proposals and Assessments both carry a count.
                const count = item.key === "proposals"
                  ? pendingIntros
                  : item.key === "assessments" ? pendingAssessments : 0;
                return (
                  <button
                    key={item.key}
                    onClick={() => setTab(item.key)}
                    className={`rh-navitem ${active ? "active" : ""}`}
                    aria-label={item.label + (count > 0 ? ` (${count} new)` : "")}
                    style={{ position: "relative" }}
                  >
                    <Icon className="w-[18px] h-[18px] shrink-0" />
                    {count > 0 && (
                      <span
                        aria-hidden
                        style={{
                          position: "absolute", top: 4, right: 4,
                          minWidth: 16, height: 16, padding: "0 4px",
                          borderRadius: 999, background: "hsl(var(--primary))",
                          color: "hsl(var(--primary-foreground))",
                          fontSize: 10, fontWeight: 600, lineHeight: "16px",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >{count > 9 ? "9+" : count}</span>
                    )}
                    <span className="rh-tip" role="tooltip">
                      {item.label}{count > 0 ? ` · ${count} new` : ""}
                    </span>
                  </button>
                );

              })}
            </nav>
          </aside>

          {/* Main panel */}
          <section className="rh-main">
            <Suspense fallback={<div className="rh-tab-loading"><AynLoader size="md" /></div>}>
              {tab === "home"      && (
                <HomeTab
                  userId={userId!}
                  onOpenProfile={() => setTab("profile")}
                  onOpenJobs={() => setTab("jobs")}
                  onOpenProposals={() => setTab("proposals")}
                />
              )}
              {tab === "profile"   && <ProfileTab userId={userId!} onCreditsChanged={refreshCredits} />}
              {tab === "proposals" && <ProposalsTab onChanged={setPendingIntros} />}
              {tab === "assessments" && <AssessmentsTab onChanged={setPendingAssessments} />}

              {tab === "browse"    && <BrowseJobs userId={userId!} onAdded={goJob} onOpenProfile={() => setTab("profile")} />}
              {tab === "jobs"      && <JobsTab userId={userId!} onOpenJob={goJob} onOpenProfile={() => setTab("profile")} onCreditsChanged={refreshCredits} onBackToBrowse={() => setTab("browse")} />}
            </Suspense>
          </section>
        </div>
      </div>
    </div>
  );
}
