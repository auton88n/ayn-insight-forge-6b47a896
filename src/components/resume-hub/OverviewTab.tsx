import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Briefcase, ChevronRight } from "lucide-react";

interface Props { userId: string; onOpenBuilder: () => void; onOpenJobs: () => void }

export default function OverviewTab({ userId, onOpenBuilder, onOpenJobs }: Props) {
  const [stats, setStats] = useState({ resumes: 0, jobs: 0, primaryScore: null as number | null, primaryTitle: "" });

  useEffect(() => {
    (async () => {
      const [{ count: resumes }, { count: jobs }, { data: primary }] = await Promise.all([
        supabase.from("resumes").select("*", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("jobs").select("*", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("resumes").select("title, ats_score").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
      ]);
      setStats({
        resumes: resumes ?? 0,
        jobs: jobs ?? 0,
        primaryScore: primary?.ats_score ?? null,
        primaryTitle: primary?.title ?? "",
      });
    })();
  }, [userId]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Resumes</p>
              <p className="text-3xl font-bold mt-1">{stats.resumes}</p>
            </div>
            <FileText className="w-5 h-5 text-muted-foreground" />
          </div>
          <Button variant="ghost" size="sm" className="mt-3 -ml-2" onClick={onOpenBuilder}>
            Open builder <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Saved jobs</p>
              <p className="text-3xl font-bold mt-1">{stats.jobs}</p>
            </div>
            <Briefcase className="w-5 h-5 text-muted-foreground" />
          </div>
          <Button variant="ghost" size="sm" className="mt-3 -ml-2" onClick={onOpenJobs}>
            View jobs <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </Card>
      </div>


      {stats.primaryTitle && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Primary resume</p>
              <h3 className="text-lg font-semibold mt-1">{stats.primaryTitle}</h3>
            </div>
            {stats.primaryScore != null && (
              <Badge variant="outline" className="text-base px-3 py-1" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                ATS {stats.primaryScore}
              </Badge>
            )}
          </div>
        </Card>
      )}

      <Card className="p-5 border-dashed">
        <h3 className="font-semibold mb-2">Getting started</h3>
        <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Open <strong>Builder</strong>, paste your existing resume, and let AYN structure it.</li>
          <li>Install the <strong>AYN</strong> Chrome extension from the Extension tab.</li>
          <li>Browse jobs on LinkedIn, Indeed, or any company site. Click "Save" in the extension.</li>
          <li>Open a saved job to see your match score, then tailor your resume for it.</li>

        </ol>
      </Card>
    </div>
  );
}
