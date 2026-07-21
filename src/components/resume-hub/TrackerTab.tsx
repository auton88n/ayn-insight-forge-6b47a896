import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Status = "saved" | "applied" | "interview" | "offer" | "rejected";
const COLUMNS: Status[] = ["saved", "applied", "interview", "offer", "rejected"];

interface AppRow {
  id: string;
  job_id: string | null;
  job_title: string | null;
  company: string | null;
  job_url: string | null;
  status: Status;
  match_score: number | null;
  salary_estimate: string | null;
  notes: string | null;
  applied_at: string | null;
  updated_at: string | null;
}

// v2.7.0 — { url → most recent autofill telemetry } so cards can show fill %.
type RunSummary = { filled: number; total: number; ats: string | null; at: string };

interface Props { userId: string; onOpenJob?: (id: string) => void }

export default function TrackerTab({ userId, onOpenJob }: Props) {
  const { toast } = useToast();
  const [apps, setApps] = useState<AppRow[]>([]);
  const [runs, setRuns] = useState<Record<string, RunSummary>>({});

  const load = async () => {
    const { data, error } = await supabase
      .from("job_applications")
      .select("id, job_id, job_title, company, job_url, status, match_score, salary_estimate, notes, applied_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "Couldn't load applications", description: error.message, variant: "destructive" });
      return;
    }
    setApps((data ?? []) as unknown as AppRow[]);

    // Pull recent autofill telemetry and index by URL for at-a-glance fill %.
    const { data: runRows } = await supabase
      .from("autofill_runs")
      .select("url, filled, failed, fields_total, ats, completed_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    const map: Record<string, RunSummary> = {};
    for (const r of (runRows ?? []) as Array<{ url: string | null; filled: number | null; failed: number | null; fields_total: number | null; ats: string | null; completed_at: string | null; created_at: string }>) {
      if (!r.url || map[r.url]) continue;
      const total = (r.filled ?? 0) + (r.failed ?? 0) || r.fields_total || 0;
      map[r.url] = { filled: r.filled ?? 0, total, ats: r.ats, at: r.completed_at ?? r.created_at };
    }
    setRuns(map);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  const move = async (id: string, status: Status) => {
    const patch: { status: Status; updated_at: string; applied_at?: string } = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === "applied") patch.applied_at = new Date().toISOString();
    const { error } = await supabase
      .from("job_applications")
      .update(patch as unknown as never)
      .eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Moved to ${status}` });
    load();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      {COLUMNS.map((col) => {
        const items = apps.filter((a) => a.status === col);
        return (
          <div key={col} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{col}</h3>
              <Badge variant="outline" className="text-xs">{items.length}</Badge>
            </div>
            <div className="space-y-2 min-h-[200px] p-2 rounded-lg bg-muted/30">
              {items.map((a) => {
                const run = a.job_url ? runs[a.job_url] : undefined;
                return (
                  <Card key={a.id} className="p-3 space-y-2">
                    <div className="text-sm font-medium leading-tight">
                      {a.job_id && onOpenJob ? (
                        <button className="text-left hover:underline" onClick={() => onOpenJob(a.job_id!)}>
                          {a.job_title ?? "Untitled role"}
                        </button>
                      ) : a.job_url ? (
                        <a href={a.job_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {a.job_title ?? "Untitled role"}
                        </a>
                      ) : (
                        a.job_title ?? "Untitled role"
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                      <span className="truncate">{a.company ?? ""}</span>
                      {typeof a.match_score === "number" && (
                        <Badge variant="secondary" className="text-[10px]">{a.match_score}%</Badge>
                      )}
                    </div>
                    {a.salary_estimate && (
                      <div className="text-[11px] text-muted-foreground">{a.salary_estimate}</div>
                    )}
                    {run && run.total > 0 && (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                        <span>Autofill: {run.filled}/{run.total}</span>
                        {run.ats && <span className="opacity-70">· {run.ats}</span>}
                      </div>
                    )}
                    <Select value={a.status} onValueChange={(v) => move(a.id, v as Status)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COLUMNS.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
