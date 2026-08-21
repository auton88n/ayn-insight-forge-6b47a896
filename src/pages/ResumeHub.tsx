import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Home, User, Briefcase, Mail, LogOut, ClipboardCheck, Settings, Compass, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AynLoader } from "@/components/shared/AynLoader";
// v3.159.0 — lazy, not eager: these seven tabs were all bundled into one
// ~880KB chunk regardless of which one is actually open, since none of
// them were code-split. Now each tab's code only loads once its own
// button is actually clicked.
const SettingsPanel = lazy(() => import("@/components/shared/SettingsPanel"));
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


// v3.188.0 — reported directly against a screenshot: the rail's top mark
// read as a personal avatar (rounded square, single letter, ember-filled —
// exactly the shape apps use for one), but it was a hardcoded "A" for
// "AYN" regardless of who was signed in. Now the real signed-in person's
// own initial, name first since that's what a person actually recognizes
// as themselves, email as the fallback for an account with no name on
// file yet. "A" only survives as the fallback-of-last-resort.
function initialFromIdentity(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || "").trim() || (email || "").trim();
  return source ? source[0].toUpperCase() : "A";
}

type TabKey = "home" | "profile" | "browse" | "jobs" | "proposals" | "assessments";
const TAB_KEYS: TabKey[] = ["browse", "profile", "jobs", "proposals", "assessments", "home"];

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
// v3.175.0 — reported directly: reorder so the actual job-search work
// (Browse, Profile/resume, Saved, Proposals, Assessments) comes first, with
// Home last instead of first, now that it carries the merged Settings
// section (v3.174.0) as much as it carries "Next." Icon swapped from a
// house to a gear to match what Home mostly reads as now: the account/
// settings area, not the app's primary landing point (Browse jobs already
// is that, per readStoredTab's own "browse" fallback below).
const NAV: { key: TabKey; label: string; icon: typeof Home }[] = [
  { key: "browse",      label: "Browse jobs",       icon: Compass },
  { key: "profile",     label: "Profile",           icon: User },
  { key: "jobs",        label: "Saved jobs",        icon: Briefcase },
  { key: "proposals",   label: "Proposals",         icon: Mail },
  { key: "assessments", label: "Assessments",       icon: ClipboardCheck },
  { key: "home",        label: "Home",              icon: Settings },
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
  // v3.174.0 — Home now embeds the settings sections directly (Account,
  // Notifications, Privacy, Sessions), which need a real access token and
  // the full Session object (PrivacySettings' export/delete flow), not
  // just the user id everything else here has always used.
  const [session, setSession] = useState<Session | null>(null);
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
      supabase.auth.getSession().then(({ data: sessData }) => { if (alive) setSession(sessData.session); });
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
          {/* v3.176.0 — reported directly: "the resuma hub needs to be
              removed and Job Search OS also," part of the same "organize
              this" pass as the credit pill below. Both were pure text
              labels with no function -- the eyebrow was decorative, and
              there is only one app here, so naming it again next to its
              own logo was never telling anyone something they didn't
              already know. The heading itself isn't deleted, only its
              visible rendering: an sr-only <h1> keeps a real, single page
              heading for screen readers and SEO (this page's only h1 was
              about to disappear entirely otherwise, a real regression this
              same research pass had just flagged as a value screen readers
              rely on), while a sighted visitor now sees just the mark. */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center shrink-0" aria-label="AYN">
              <img src={aynLogo} alt="AYN" className="h-7 w-auto" />
            </div>
            <h1 className="sr-only">Resume Hub</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* v3.35.0 — billing_get already returns this; it just never showed
                up anywhere before /billing itself.
                v3.175.0 — reported directly: "better looking credit bar."
                v3.176.0 — reported directly, again: still not modern enough,
                asked for something "the new generation" would like. 2026
                research on Gen Z product design points at "Functional
                Maximalism" -- bold, confident color over a subtle outline,
                not literal gamification (streaks/badges/leaderboards would
                be real scope creep for a plain balance readout in a job
                tool, not a finance app). Switched from an outline+tint chip
                to the same solid ember gradient + glow every primary CTA on
                this page already uses, so it reads as a real, first-class
                stat instead of a quiet secondary label. */}
            {creditBalance !== null && (
              <button
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold text-white transition hover:opacity-90"
                style={{ background: "var(--rh-gradient)", boxShadow: "var(--rh-glow)" }}
                onClick={() => navigate("/billing")}
                title="Credit balance"
              >
                <Zap className="w-3.5 h-3.5" fill="#fff" strokeWidth={0} />
                {creditBalance} credit{creditBalance === 1 ? "" : "s"}
              </button>
            )}
            {/* v3.177.0 — the "Your resume" button (setTab("profile"))
                reported directly for removal — Profile has been its own
                nav rail item since v3.175.0's reorder, so this was a
                second, redundant path to the exact same place. */}
            {/* v3.173.0/v3.174.0 — this used to open a dropdown (Your
                profile, Plan and credits, Settings, Sign out, later trimmed
                to Settings/Sign out) for things that all now live on the
                Home tab itself (v3.174.0's merged Settings section).
                v3.175.0 — reported directly: "make icon for exit only."
                With Settings gone from here, a one-item dropdown had
                nothing left to justify itself; this is now a direct sign
                out button, no menu, matching handleSignOut's own existing
                no-confirmation design everywhere else it's called. */}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              title="Sign out"
              onClick={handleSignOut}
              className="rounded-full text-[color:var(--rh-muted)] hover:text-[color:var(--rh-accent-2)] hover:bg-[color:var(--rh-tint)]"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>


        {/* Three-column workspace */}
        <div className="rh-grid">
          {/* Left icon rail */}
          <aside className="rh-aside-left" aria-label="Workspace navigation">
            <div
              className="rh-rail-mark"
              title={session?.user?.email || undefined}
              aria-label={session?.user?.email ? `Signed in as ${session.user.email}` : "Account"}
            >
              {initialFromIdentity(session?.user?.user_metadata?.full_name as string | undefined, session?.user?.email)}
            </div>
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
                  >
                    <Icon className="w-[18px] h-[18px] shrink-0" />
                    <span className="rh-navlabel">{item.label}</span>
                    {count > 0 && (
                      <span className="rh-navbadge" aria-hidden>{count > 9 ? "9+" : count}</span>
                    )}
                  </button>
                );

              })}
            </nav>
          </aside>

          {/* Main panel */}
          <section className="rh-main">
            <Suspense fallback={<div className="rh-tab-loading"><AynLoader size="md" /></div>}>
              {/* v3.179.0 — Home is Settings only now, "Next" removed;
                  onOpenProfile/onOpenJobs/onOpenProposals only ever existed
                  to power that section's own buttons. */}
              {tab === "home"      && <SettingsPanel userId={userId!} session={session} />}
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
