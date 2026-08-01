/**
 * ProposalsTab.tsx — v3.6.0 "the proposal loop"
 *
 * The seeker end of the loop. An employer described a role in AYN, AYN
 * recommended this person, and the employer wrote them a proposal. Nothing
 * about the seeker's contact details has been shared yet. Accepting is the
 * only thing that releases name, email and phone.
 */
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Inbox, MapPin, Briefcase, Banknote, ExternalLink, ChevronDown } from "lucide-react";
import { employerApi, type Proposal } from "@/lib/employer";

function when(iso: string | null): string {
  if (!iso) return "";
  const d = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const mins = Math.round(d / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function ProposalsTab({ onChanged }: { onChanged?: (pending: number) => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await employerApi.proposalList();
      const list = r.requests || [];
      setRows(list);
      onChanged?.(list.filter(x => x.status === "pending").length);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [onChanged]);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, approve: boolean) => {
    setBusy(p => ({ ...p, [id]: true }));
    try {
      await employerApi.proposalDecide(id, approve);
      toast({
        title: approve ? "Contact details shared" : "Declined",
        description: approve
          ? "The employer can now see your name, email and phone."
          : "They were not told why.",
      });
      await load();
    } catch (e) {
      toast({ title: "Couldn't update", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(p => ({ ...p, [id]: false })); }
  };

  const pending = rows.filter(r => r.status === "pending");
  const history = rows.filter(r => r.status !== "pending");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Proposals</h2>
        <p className="text-sm text-muted-foreground">Roles employers want you for.</p>
      </div>

      {pending.length === 0 && (
        <Card className="p-8 text-center space-y-2">
          <Inbox className="w-6 h-6 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium">No proposals yet</p>
          <p className="text-xs text-muted-foreground">
            Turn on discovery so employers hiring for roles like yours can reach you.
          </p>
        </Card>
      )}

      {pending.map(p => (
        <Card key={p.id} className="p-4 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {p.org_logo_url && (
                <img src={p.org_logo_url} alt={`${p.org_name} logo`} loading="lazy" className="w-9 h-9 rounded-lg object-cover border border-border/60" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold">{p.org_name}</p>
                <p className="text-base font-medium">{p.job_title}</p>
              </div>
            </div>
            <Badge variant="secondary" className="shrink-0">{when(p.sent_at)}</Badge>
          </div>

          {/* v3.10.0 — who is reaching out, only what the employer actually entered. */}
          {(p.org_industry || p.org_size || p.org_headquarters || p.org_website || p.org_about) && (
            <div className="rounded-lg border border-border/50 p-3 space-y-1.5">
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {p.org_industry && <span>{p.org_industry}</span>}
                {p.org_size && <span>{p.org_size} people</span>}
                {p.org_headquarters && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{p.org_headquarters}</span>}
                {p.org_website && (
                  <a href={p.org_website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    <ExternalLink className="w-3.5 h-3.5" />Website
                  </a>
                )}
              </div>
              {p.org_about && <p className="text-xs leading-relaxed">{p.org_about}</p>}
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {p.job_location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{p.job_location}</span>}
            {p.employment_type && <span className="inline-flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" />{p.employment_type}</span>}
            {p.salary_range && <span className="inline-flex items-center gap-1"><Banknote className="w-3.5 h-3.5" />{p.salary_range}</span>}
            {p.job_url && (
              <a href={p.job_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="w-3.5 h-3.5" />View the posting
              </a>
            )}
          </div>


          {p.message && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap rounded-lg bg-muted/30 border border-border/50 p-3">
              {p.message}
            </p>
          )}

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Accepting shares your name, email and phone with this employer.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy[p.id]} onClick={() => decide(p.id, true)}>
                {busy[p.id] ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Share my contact details
              </Button>
              <Button size="sm" variant="outline" disabled={busy[p.id]} onClick={() => decide(p.id, false)}>
                Not interested
              </Button>
            </div>
          </div>
        </Card>
      ))}

      {history.length > 0 && (
        <Card className="p-4">
          <button
            type="button"
            onClick={() => setHistoryOpen(o => !o)}
            className="flex w-full items-center justify-between text-sm font-medium"
          >
            <span>History ({history.length})</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
          </button>
          {historyOpen && (
            <div className="mt-3 space-y-2">
              {history.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.job_title}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.org_name} · {when(p.responded_at)}</div>
                  </div>
                  <Badge variant={p.status === "approved" ? "secondary" : "outline"}>
                    {p.status === "approved" ? "Accepted" : "Declined"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
