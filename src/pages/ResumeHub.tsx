import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, User, Briefcase, Users, Puzzle, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import HomeTab from "@/components/resume-hub/HomeTab";
import JobsTab from "@/components/resume-hub/JobsTab";
import ExtensionTab from "@/components/resume-hub/ExtensionTab";
import ProfileTab from "@/components/resume-hub/ProfileTab";
import DiscoveryTab from "@/components/resume-hub/DiscoveryTab";
import { employerApi } from "@/lib/employer";
import manifest from "../../extension/manifest.json";
import "@/styles/resume-hub.css";


type TabKey = "home" | "profile" | "jobs" | "discovery" | "extension";

// v3.4.0 — the Resumes tab is gone. A user keeps one resume and it lives in
// Profile, because Profile is the single place they edit who they are.
const NAV: { key: TabKey; label: string; icon: typeof Home; hint: string }[] = [
  { key: "home",      label: "Home",              icon: Home,      hint: "Start here" },
  { key: "profile",   label: "Profile",           icon: User,      hint: "You, your resume, your goals" },
  { key: "jobs",      label: "Jobs",              icon: Briefcase, hint: "Score and tailor" },
  { key: "discovery", label: "Get discovered",    icon: Users,     hint: "Let employers find you" },
  { key: "extension", label: "Browser extension", icon: Puzzle,    hint: "Score jobs as you browse" },
];


export default function ResumeHub() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("home");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingIntros, setPendingIntros] = useState(0);

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
      // v2.9.1 — surface a badge on the Profile tab when employers want an intro.
      employerApi.revealList()
        .then(r => setPendingIntros((r.requests || []).filter(x => x.status === "pending").length))
        .catch(() => { /* silent */ });
    });
  }, [navigate, toast]);


  const goJob = useCallback((jobId: string) => {
    setTab("jobs");
    sessionStorage.setItem("ayn_focus_job", jobId);
  }, []);

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

  return (
    <div className="resume-hub-theme">
      <div className="rh-shell">
        {/* Top bar */}
        <div className="rh-topbar">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="text-[color:var(--rh-muted)] hover:text-[color:var(--rh-ink)] hover:bg-[color:var(--rh-raised)]"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
            <div className="min-w-0">
              <div className="rh-eyebrow">Job Search OS</div>
              <h1 className="rh-title leading-tight truncate">Resume Hub</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="rh-btn rh-btn-primary" onClick={() => setTab("profile")}>
              Your resume
            </button>
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
                return (
                  <button
                    key={item.key}
                    onClick={() => setTab(item.key)}
                    className={`rh-navitem ${active ? "active" : ""}`}
                    aria-label={item.label + (item.key === "discovery" && pendingIntros > 0 ? ` (${pendingIntros} intro requests)` : "")}
                    style={{ position: "relative" }}
                  >
                    <Icon className="w-[18px] h-[18px] shrink-0" />
                    {item.key === "discovery" && pendingIntros > 0 && (
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
                      >{pendingIntros > 9 ? "9+" : pendingIntros}</span>
                    )}
                    <span className="rh-tip" role="tooltip">
                      {item.label}{item.key === "discovery" && pendingIntros > 0 ? ` · ${pendingIntros} intro${pendingIntros === 1 ? "" : "s"}` : ""}
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
              />
            )}
            {tab === "profile"   && <ProfileTab userId={userId!} onOpenDiscovery={() => setTab("discovery")} />}
            {tab === "discovery" && <DiscoveryTab userId={userId!} />}
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
