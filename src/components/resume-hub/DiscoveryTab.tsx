/**
 * DiscoveryTab.tsx — v3.3.0 "Get discovered"
 *
 * The talent pool used to be buried inside Profile. It is half the product, so
 * it gets its own tab: the opt in control, what employers see, findability, the
 * freshness indicator, and the intro requests employers send you.
 */
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users } from "lucide-react";
import { employerApi, type RevealRequest } from "@/lib/employer";
import { loadHubSnapshot } from "@/lib/hubSnapshot";
import type { GroupGap } from "@/lib/profileGaps";
import TalentPoolCard from "./TalentPoolCard";

export default function DiscoveryTab({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [gaps, setGaps] = useState<GroupGap[]>([]);
  const [reveals, setReveals] = useState<RevealRequest[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadHubSnapshot(userId).then(s => setGaps(s.groupGaps)).catch(() => { /* silent */ });
  }, [userId]);

  const loadReveals = useCallback(async () => {
    try { const r = await employerApi.revealList(); setReveals(r.requests || []); } catch { /* silent */ }
  }, []);
  useEffect(() => { loadReveals(); }, [loadReveals]);

  const decide = async (id: string, approve: boolean) => {
    setBusy(p => ({ ...p, [id]: true }));
    try {
      await employerApi.revealDecide(id, approve);
      toast({ title: approve ? "Contact shared" : "Declined" });
      await loadReveals();
    } catch (e) {
      toast({ title: "Couldn't update", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(p => ({ ...p, [id]: false })); }
  };

  const pendingIntros = reveals.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <TalentPoolCard groupGaps={gaps} pendingIntros={pendingIntros} />

      {reveals.length > 0 && (
        <Card className="p-4 sm:p-6 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="w-4 h-4 text-primary" />
            Intro requests
          </div>
          <p className="text-xs text-muted-foreground">
            Employers who searched the pool and want to reach out. They can already see your full
            profile. Your email and phone stay private until you approve.
          </p>

          <div className="space-y-2">
            {reveals.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.org_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.job_title || "Role"} · {r.status}</div>
                </div>
                {r.status === "pending" ? (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={busy[r.id]} onClick={() => decide(r.id, false)}>Decline</Button>
                    <Button size="sm" disabled={busy[r.id]} onClick={() => decide(r.id, true)}>
                      {busy[r.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Share contact"}
                    </Button>
                  </div>
                ) : (
                  <Badge variant={r.status === "approved" ? "secondary" : "outline"}>{r.status}</Badge>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
