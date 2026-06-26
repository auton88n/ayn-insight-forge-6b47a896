import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import OverviewTab from "@/components/resume-hub/OverviewTab";
import BuilderTab from "@/components/resume-hub/BuilderTab";
import JobsTab from "@/components/resume-hub/JobsTab";
import TrackerTab from "@/components/resume-hub/TrackerTab";
import ExtensionTab from "@/components/resume-hub/ExtensionTab";
import ProfileTab from "@/components/resume-hub/ProfileTab";

export default function ResumeHub() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState("overview");
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
    // Could deep-link with state; for v1 just switch tab
    sessionStorage.setItem("ayn_focus_job", jobId);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "Syne, sans-serif" }}>
                Resume Hub
              </h1>
              <p className="text-xs text-muted-foreground">Private to your account. AYN never mixes data between users.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="w-4 h-4 text-primary" />
            Powered by AYN AI
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-6 w-full max-w-3xl">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="builder">Builder</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="tracker">Tracker</TabsTrigger>
            <TabsTrigger value="extension">Extension</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab userId={userId!} onOpenBuilder={() => setTab("builder")} onOpenJobs={() => setTab("jobs")} />
          </TabsContent>
          <TabsContent value="builder" className="mt-6">
            <BuilderTab userId={userId!} />
          </TabsContent>
          <TabsContent value="jobs" className="mt-6">
            <JobsTab userId={userId!} onOpenJob={goJob} />
          </TabsContent>
          <TabsContent value="tracker" className="mt-6">
            <TrackerTab userId={userId!} />
          </TabsContent>
          <TabsContent value="extension" className="mt-6">
            <ExtensionTab userId={userId!} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
