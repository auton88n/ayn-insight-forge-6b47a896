import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LayoutGrid, User, FileText, Briefcase, ListChecks, Puzzle, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import OverviewTab from "@/components/resume-hub/OverviewTab";
import BuilderTab from "@/components/resume-hub/BuilderTab";
import JobsTab from "@/components/resume-hub/JobsTab";
import TrackerTab from "@/components/resume-hub/TrackerTab";
import ExtensionTab from "@/components/resume-hub/ExtensionTab";
import ProfileTab from "@/components/resume-hub/ProfileTab";
import "@/styles/resume-hub.css";

type TabKey = "overview" | "profile" | "builder" | "jobs" | "tracker" | "extension";

const NAV: { key: TabKey; label: string; icon: typeof LayoutGrid; hint: string }[] = [
  { key: "overview",  label: "Overview",  icon: LayoutGrid,  hint: "Snapshot" },
  { key: "profile",   label: "Profile",   icon: User,        hint: "Canonical" },
  { key: "builder",   label: "Resumes",   icon: FileText,    hint: "Tailor & ATS" },
  { key: "jobs",      label: "Saved jobs",icon: Briefcase,   hint: "Match queue" },
  { key: "tracker",   label: "Tracker",   icon: ListChecks,  hint: "Pipeline" },
  { key: "extension", label: "Extension", icon: Puzzle,      hint: "Install AYN" },
];

export default function ResumeHub() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("overview");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        toast({ title: "Sign in required", description: "Please sign in to use Resume Hub." });
        navigate("/");
        return;
      }
      setUserId(data.user.id);
      setLoading(false);
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
            <button className="rh-btn rh-btn-primary" onClick={() => setTab("builder")}>
              New resume
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
                    aria-label={item.label}
                  >
                    <Icon className="w-[18px] h-[18px] shrink-0" />
                    <span className="rh-tip" role="tooltip">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main panel */}
          <section className="rh-main">
            {tab === "overview"  && <OverviewTab userId={userId!} onOpenBuilder={() => setTab("builder")} onOpenJobs={() => setTab("jobs")} />}
            {tab === "profile"   && <ProfileTab userId={userId!} />}
            {tab === "builder"   && <BuilderTab userId={userId!} />}
            {tab === "jobs"      && <JobsTab userId={userId!} onOpenJob={goJob} />}
            {tab === "tracker"   && <TrackerTab userId={userId!} />}
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
                Score, autofill, and tailor on any job board.
              </p>
              <button className="rh-btn w-full justify-center" onClick={downloadExtension}>
                <Download className="w-4 h-4" /> Download v1.9.1
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
