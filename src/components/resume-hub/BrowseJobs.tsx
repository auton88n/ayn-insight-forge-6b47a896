/**
 * BrowseJobs.tsx — v3.134.0
 *
 * Real job postings sourced from company career pages (never LinkedIn or
 * Indeed — job-board-sync's own header comment covers how that's enforced
 * and what got filtered out when it wasn't true in practice), refreshed
 * continuously, dropped after 7 days so Apply always points at something
 * still likely open. Each card shows a real match score against the
 * caller's own resume — computed the same deterministic way job_fit_advice
 * already does (no AI call), so scoring a whole page costs nothing.
 *
 * Picking a job here just adds it to the user's own jobs list (same table,
 * same shape as "Add job manually") and hands off to the exact same
 * score/tailor/cover-letter flow already built — this component's only
 * job is discovery, not a parallel pipeline.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, Plus, Flame, X } from "lucide-react";
import { resumeHubApi, type JobPosting } from "@/lib/resumeHub";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onAdd: (job: JobPosting) => Promise<void>;
  onClose: () => void;
}

const PAGE_SIZE = 24;
const HOT_WINDOW_MS = 24 * 60 * 60 * 1000;

export default function BrowseJobs({ onAdd, onClose }: Props) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("job_postings")
        .select("id, source, company, title, description, location, apply_url, posted_at")
        .order("posted_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (cancelled) return;
      if (error) {
        toast({ title: "Couldn't load jobs", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      const rows = (data as JobPosting[]) ?? [];
      setJobs(rows);
      setLoading(false);
      if (rows.length) {
        resumeHubApi.jobBoardScore(rows.map((r) => ({ id: r.id, description: r.description })))
          .then((res) => {
            if (cancelled) return;
            const map: Record<string, number | null> = {};
            for (const s of res.scores) map[s.id] = s.match_pct;
            setScores(map);
          })
          .catch(() => { /* best effort — cards still render fine with no score */ });
      }
    })();
    return () => { cancelled = true; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const handleAdd = async (job: JobPosting) => {
    setAddingId(job.id);
    try {
      await onAdd(job);
    } catch (e) {
      toast({ title: "Couldn't add that job", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Browse jobs</h3>
          <p className="text-xs text-muted-foreground">Real postings from company career pages, refreshed continuously. Never LinkedIn or Indeed.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No fresh postings right now — check back soon.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {jobs.map((j) => {
            const isHot = Date.now() - new Date(j.posted_at).getTime() < HOT_WINDOW_MS;
            const score = scores[j.id];
            return (
              <Card key={j.id} className="p-4 space-y-3 border-border/60 hover:border-primary/40 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{j.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {j.company}{j.location ? ` • ${j.location}` : ""}
                    </p>
                  </div>
                  {isHot && (
                    <Badge className="shrink-0 bg-primary/10 text-primary border-primary/30 gap-1 hover:bg-primary/10">
                      <Flame className="w-3 h-3" /> New
                    </Badge>
                  )}
                </div>

                {score != null && (
                  <div className="flex items-center gap-2" title="A quick keyword-based estimate. Open the job for AYN's full match analysis.">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${score}%` }} />
                    </div>
                    <span className="text-xs font-medium shrink-0">{score}% quick match</span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => handleAdd(j)} disabled={addingId === j.id}>
                    {addingId === j.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <><Plus className="w-3.5 h-3.5 mr-1" /> Score & tailor</>}
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <a href={j.apply_url} target="_blank" rel="noopener noreferrer" aria-label="Open real posting">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
