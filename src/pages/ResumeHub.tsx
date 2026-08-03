import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Home, User, Briefcase, Users, Puzzle, Download, Mail, LogOut, ClipboardCheck, CreditCard } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import HomeTab from "@/components/resume-hub/HomeTab";
import JobsTab from "@/components/resume-hub/JobsTab";
import ExtensionTab from "@/components/resume-hub/ExtensionTab";
import ProfileTab from "@/components/resume-hub/ProfileTab";
import DiscoveryTab from "@/components/resume-hub/DiscoveryTab";
import ProposalsTab from "@/components/resume-hub/ProposalsTab";
import AssessmentsTab from "@/components/resume-hub/AssessmentsTab";
import { employerApi } from "@/lib/employer";
import { assessmentApi } from "@/lib/assessments";
import { billingApi } from "@/lib/billing";
import manifest from "../../extension/manifest.json";
import "@/styles/resume-hub.css";
import aynLogo from "@/assets/ayn-logo.png";
import { useFeature } from "@/hooks/useFeatureFlags";
import { PlatformMaintenanceScreen } from "@/components/shared/MaintenanceNotice";


type TabKey = "home" | "profile" | "jobs" | "proposals" | "assessments" | "discovery" | "extension";

// v3.6.0 — Proposals is its own page, between Jobs and Get discovered.
// v3.13.0 — Assessments sits right after it, badged the same way.
const NAV: { key: TabKey; label: string; icon: typeof Home; hint: string }[] = [
  { key: "home",        label: "Home",              icon: Home,           hint: "Start here" },
  { key: "profile",     label: "Profile",           icon: User,           hint: "You, your resume, your goals" },
  { key: "jobs",        label: "Jobs",              icon: Briefcase,      hint: "Score and tailor" },
  { key: "proposals",   label: "Proposals",         icon: Mail,           hint: "Roles employers want you for" },
  { key: "assessments", label: "Assessments",       icon: ClipboardCheck, hint: "Questions about your own work" },
  { key: "discovery",   label: "Get discovered",    icon: Users,          hint: "Let employers find you" },
  { key: "extension",   label: "Browser extension", icon: Puzzle,         hint: "Score jobs as you browse" },
];



export default function ResumeHub() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("home");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingIntros, setPendingIntros] = useState(0);
  const [pendingAssessments, setPendingAssessments] = useState(0);
  // v3.35.0 — billing_get already returns this; only /billing rendered it.
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const refreshCredits = useCallback(() => {
    billingApi.seeker().then(r => setCreditBalance(r.balance)).catch(() => { /* silent */ });
  }, []);
  // v3.25.0 — a platform wide stop shows one message instead of a broken hub.
  const platform = useFeature("platform");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        toast({ title: "Sign in required", description: "Please sign in to use Resume Hub." });
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



    });
  }, [navigate, toast]);


  const goJob = useCallback((jobId: string) => {
    setTab("jobs");
    sessionStorage.setItem("ayn_focus_job", jobId);
  }, []);

  // v3.39.0 — a bare signOut() cleared the session but never navigated
  // anywhere, so this whole gated view stayed on screen looking untouched.
  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    navigate("/");
  }, [navigate]);

  if (loading) {
    return (
      <div className="resume-hub-theme flex items-center justify-center" style={{ minHeight: "100vh" }}>
        <div className="rh-eyebrow">Loading workspace…</div>
      </div>
    );
  }

  const downloadExtension = () => {
    fetch("/ayn-extension.zip")
      .then((r) => { if (!r.ok) throw new Error(`Download failed: ${r.status}`); return r.blob(); })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "ayn-extension.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => toast({ title: "Download failed", description: err.message, variant: "destructive" }));
  };

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
            <div className="w-px h-6 bg-[color:var(--rh-line)]" aria-hidden />
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
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
                style={{ borderColor: "var(--rh-line)", color: "var(--rh-muted)" }}
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
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTab("profile")}>
                  <User className="w-4 h-4 mr-2" /> Your profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/billing")}>
                  <CreditCard className="w-4 h-4 mr-2" /> Plan and credits
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
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
            {tab === "home"      && (
              <HomeTab
                userId={userId!}
                onOpenProfile={() => setTab("profile")}
                onOpenJobs={() => setTab("jobs")}
                onOpenDiscovery={() => setTab("discovery")}
                onOpenProposals={() => setTab("proposals")}
              />
            )}
            {tab === "profile"   && <ProfileTab userId={userId!} onOpenDiscovery={() => setTab("discovery")} />}
            {tab === "discovery" && <DiscoveryTab userId={userId!} />}
            {tab === "proposals" && <ProposalsTab onChanged={setPendingIntros} />}
            {tab === "assessments" && <AssessmentsTab onChanged={setPendingAssessments} />}

            {tab === "jobs"      && <JobsTab userId={userId!} onOpenJob={goJob} />}

            {tab === "extension" && <ExtensionTab userId={userId!} />}
          </section>


          {/* Right rail */}
          <aside className="rh-aside-right">
            <div className="rh-aside-section">
              <div className="rh-aside-label">Privacy</div>
              <p className="text-[13px] text-[color:var(--rh-muted)] leading-relaxed">
                Private to your account. AYN never mixes data between users.
              </p>
            </div>
            <div className="rh-aside-section">
              <div className="rh-aside-label">Section</div>
              <div className="rh-stat"><span>Active view</span><b>{NAV.find(n => n.key === tab)?.label}</b></div>
              <div className="rh-stat"><span>Mode</span><b>{NAV.find(n => n.key === tab)?.hint}</b></div>
            </div>
            <div className="rh-aside-section">
              <div className="rh-aside-label">Chrome extension</div>
              <p className="text-[13px] text-[color:var(--rh-muted)] leading-relaxed mb-2">
                Score and tailor on any job board. AYN only reads the page.
              </p>

              <button className="rh-btn w-full justify-center" onClick={downloadExtension}>
                <Download className="w-4 h-4" /> Download v{manifest.version}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
