import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Status = "saved" | "applied" | "interview" | "offer" | "rejected";
const COLUMNS: Status[] = ["saved", "applied", "interview", "offer", "rejected"];

interface AppRow { id: string; status: Status; notes: string | null; jobs: { id: string; title: string; company: string; location: string | null } | null }

interface Props { userId: string }

export default function TrackerTab({ userId }: Props) {
  const { toast } = useToast();
  const [apps, setApps] = useState<AppRow[]>([]);

  const load = async () => {
    // No FK relationship; do two queries
    const { data: a } = await supabase.from("applications").select("id, status, notes, job_id").eq("user_id", userId);
    const list = (a as Array<{ id: string; status: Status; notes: string | null; job_id: string }>) ?? [];
    const jobIds = Array.from(new Set(list.map((x) => x.job_id)));
    let jobsMap: Record<string, AppRow["jobs"]> = {};
    if (jobIds.length) {
      const { data: jrows } = await supabase.from("jobs").select("id, title, company, location").in("id", jobIds);
      jobsMap = Object.fromEntries((jrows ?? []).map((j) => [j.id, j as AppRow["jobs"]]));
    }
    setApps(list.map((x) => ({ id: x.id, status: x.status, notes: x.notes, jobs: jobsMap[x.job_id] ?? null })));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  const move = async (id: string, status: Status) => {
    const patch: Record<string, unknown> = { status };
    if (status === "applied") patch.applied_at = new Date().toISOString();
    await supabase.from("applications").update(patch).eq("id", id);
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
              {items.map((a) => (
                <Card key={a.id} className="p-3 space-y-2">
                  <div className="text-sm font-medium leading-tight">{a.jobs?.title ?? "Unknown role"}</div>
                  <div className="text-xs text-muted-foreground">{a.jobs?.company ?? ""}</div>
                  <Select value={a.status} onValueChange={(v) => move(a.id, v as Status)}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COLUMNS.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
