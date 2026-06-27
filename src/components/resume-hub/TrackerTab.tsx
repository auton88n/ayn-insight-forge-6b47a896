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

interface Props { userId: string }

export default function TrackerTab({ userId }: Props) {
  const { toast } = useToast();
  const [apps, setApps] = useState<AppRow[]>([]);

  const load = async () => {
    const { data, error } = await supabase
      .from("job_applications")
      .select("id, job_title, company, job_url, status, match_score, salary_estimate, notes, applied_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "Couldn't load applications", description: error.message, variant: "destructive" });
      return;
    }
    setApps((data ?? []) as unknown as AppRow[]);
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
              {items.map((a) => (
                <Card key={a.id} className="p-3 space-y-2">
                  <div className="text-sm font-medium leading-tight">
                    {a.job_url ? (
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
