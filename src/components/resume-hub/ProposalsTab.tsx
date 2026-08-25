/**
 * ProposalsTab.tsx — v3.6.0 "the proposal loop"
 *
 * The seeker end of the loop. An employer described a role in AYN, AYN
 * recommended this person, and the employer wrote them a proposal. Nothing
 * about the seeker's contact details has been shared yet. Accepting is the
 * only thing that releases name, email and phone.
 *
 * v3.172.0 — checked this against the real competitive bar for "an
 * employer reaching out to you" (Otta/Hired's whole design philosophy:
 * it should read as an event, never as spam or a plain notification).
 * This was rendering on shadcn's flat defaults, the same weight as any
 * other card in the app — the one moment in all of Resume Hub that's
 * genuinely exciting news had no visual distinction from a settings row.
 * Given the ember gradient, a real logo fallback (this had none at all
 * before — no org_logo_url meant nothing rendered, not even an initial),
 * and its own accent border so it reads as the moment it actually is.
 */
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Inbox, MapPin, Briefcase, Banknote, ExternalLink, ChevronDown, MessageCircle, Sparkles } from "lucide-react";
import { employerApi, type Proposal } from "@/lib/employer";
import { resumeHubApi } from "@/lib/resumeHub";
import MessageThread from "@/components/shared/MessageThread";
import { companyAvatar } from "./BrowseJobs";

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
  const [openThread, setOpenThread] = useState<string | null>(null);
  // v3.186.0 — reported directly: the empty state always said "Turn on
  // discovery," even for an account that already had it on and was
  // correctly just waiting for a real employer to send one. Fetches the
  // same talent_pool_get status ProfileTab's own toggle already reads, so
  // the two surfaces can't disagree about whether discovery is on.
  const [poolOptedIn, setPoolOptedIn] = useState<boolean | null>(null);

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
  useEffect(() => {
    resumeHubApi.talentPoolGet().then(r => setPoolOptedIn(!!r.opted_in)).catch(() => {});
  }, []);

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
      <div className="flex items-center justify-center py-16" style={{ color: "var(--rh-muted)" }}>
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* v3.235.0 -- the same short ember accent mark Group's own headings
          in Profile now carry, so a tab's top-level title reads with as
          much presence here as the marketing pages' section headings. */}
      <div>
        <h2 className="rh-display flex items-center gap-2.5 text-xl">
          <span aria-hidden="true" style={{ width: 18, height: 3, borderRadius: 2, background: "var(--rh-accent)", flexShrink: 0 }} />
          Proposals
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--rh-muted)" }}>Roles employers want you for.</p>
      </div>

      {pending.length === 0 && (
        <Card className="p-8 text-center space-y-2 rounded-xl" style={{ borderColor: "var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
          <Inbox className="w-6 h-6 mx-auto" style={{ color: "var(--rh-faint)" }} />
          <p className="rh-display text-[15px]">No proposals yet</p>
          <p className="text-xs" style={{ color: "var(--rh-muted)" }}>
            {poolOptedIn
              ? "You're discoverable — a proposal will show up here the moment an employer sends one."
              : "Turn on discovery so employers hiring for roles like yours can reach you."}
          </p>
        </Card>
      )}

      {pending.map(p => {
        const avatar = companyAvatar(p.org_name || "?");
        return (
        <Card
          key={p.id}
          className="rh-lift p-4 sm:p-6 space-y-4 rounded-2xl min-h-[380px] flex flex-col"
          style={{ background: "var(--rh-surface)", border: "1.5px solid var(--rh-accent)", boxShadow: "var(--rh-shadow-lift)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {p.org_logo_url ? (
                <img src={p.org_logo_url} alt={`${p.org_name} logo`} loading="lazy" className="w-14 h-14 rounded-xl object-contain bg-white p-1.5 border" style={{ borderColor: "var(--rh-hair)" }} />
              ) : (
                <div
                  className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${avatar.className}`}
                  style={{ boxShadow: "0 6px 16px -6px rgba(28,23,18,0.35)" }}
                >
                  {avatar.initial}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: "var(--rh-accent-2)" }}>
                  <Sparkles className="w-3.5 h-3.5" />{p.org_name} wants to meet you
                </p>
                <p className="rh-display text-[18px] mt-0.5">{p.job_title}</p>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 border-0" style={{ background: "var(--rh-raised)", color: "var(--rh-faint)" }}>{when(p.sent_at)}</Badge>
          </div>

          {/* v3.177.0 — reported directly: "vertical nice shape," matching
              Browse jobs' own card language -- location/type/salary are
              now real pill chips instead of plain icon+text, same as that
              card's own chip row. */}
          <div className="flex flex-wrap gap-1.5">
            {p.job_location && (
              <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ background: "var(--rh-raised)", color: "var(--rh-muted)" }}>
                <MapPin className="w-3 h-3 inline mr-1 -mt-0.5" />{p.job_location}
              </span>
            )}
            {p.employment_type && (
              <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ background: "var(--rh-trust-tint)", color: "var(--rh-trust)" }}>
                <Briefcase className="w-3 h-3 inline mr-1 -mt-0.5" />{p.employment_type}
              </span>
            )}
            {p.salary_range && (
              <span className="text-[11px] font-bold rounded-full px-2.5 py-1" style={{ background: "var(--rh-gold-tint)", color: "var(--rh-gold)" }}>
                <Banknote className="w-3 h-3 inline mr-1 -mt-0.5" />{p.salary_range}
              </span>
            )}
          </div>

          {/* v3.10.0 — who is reaching out, only what the employer actually entered. */}
          {(p.org_industry || p.org_size || p.org_headquarters || p.org_website || p.org_about) && (
            <div className="rounded-lg p-3 space-y-1.5" style={{ background: "var(--rh-raised)", border: "1px solid var(--rh-hair)" }}>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: "var(--rh-muted)" }}>
                {p.org_industry && <span>{p.org_industry}</span>}
                {p.org_size && <span>{p.org_size} people</span>}
                {p.org_headquarters && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{p.org_headquarters}</span>}
                {p.org_website && (
                  <a href={p.org_website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline" style={{ color: "var(--rh-accent-2)" }}>
                    <ExternalLink className="w-3.5 h-3.5" />Website
                  </a>
                )}
              </div>
              {p.org_about && <p className="text-xs leading-relaxed" style={{ color: "var(--rh-ink)" }}>{p.org_about}</p>}
            </div>
          )}

          {p.job_url && (
            <a href={p.job_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold underline" style={{ color: "var(--rh-accent-2)" }}>
              <ExternalLink className="w-3.5 h-3.5" />View the posting
            </a>
          )}


          {p.message && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap rounded-lg p-3" style={{ background: "var(--rh-tint)", border: "1px solid var(--rh-hair)" }}>
              {p.message}
            </p>
          )}

          <div className="space-y-2 pt-3 mt-auto border-t" style={{ borderColor: "var(--rh-hair)" }}>
            <p className="text-xs" style={{ color: "var(--rh-faint)" }}>
              Accepting shares your name, email and phone with this employer.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy[p.id]}
                onClick={() => decide(p.id, true)}
                style={{ background: "var(--rh-gradient)", borderColor: "transparent", color: "#fff", boxShadow: "var(--rh-glow)" }}
                className="hover:opacity-90"
              >
                {busy[p.id] ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Share my contact details
              </Button>
              <Button size="sm" variant="outline" disabled={busy[p.id]} onClick={() => decide(p.id, false)}>
                Not interested
              </Button>
              <Button
                size="sm" variant="ghost"
                onClick={() => setOpenThread(o => o === p.id ? null : p.id)}
              >
                <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                {openThread === p.id ? "Hide messages" : "Messages"}
              </Button>
            </div>
          </div>

          {openThread === p.id && (
            <MessageThread
              revealRequestId={p.id}
              role="candidate"
              twoWayEnabled={p.two_way_enabled}
              candidateBlocked={p.candidate_blocked}
            />
          )}
        </Card>
        );
      })}

      {history.length > 0 && (
        <Card className="p-4 rounded-xl" style={{ borderColor: "var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
          <button
            type="button"
            onClick={() => setHistoryOpen(o => !o)}
            className="flex w-full items-center justify-between text-sm font-semibold"
            style={{ color: "var(--rh-muted)" }}
          >
            <span>History ({history.length})</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
          </button>
          {historyOpen && (
            <div className="mt-3 space-y-2">
              {history.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ border: "1px solid var(--rh-hair)" }}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.job_title}</div>
                    <div className="text-xs truncate" style={{ color: "var(--rh-faint)" }}>{p.org_name} · {when(p.responded_at)}</div>
                  </div>
                  <span
                    className="text-[11px] font-semibold rounded-full px-2.5 py-1 shrink-0"
                    style={p.status === "approved"
                      ? { background: "var(--rh-trust-tint)", color: "var(--rh-trust)" }
                      : { background: "var(--rh-raised)", color: "var(--rh-faint)" }}
                  >
                    {p.status === "approved" ? "Accepted" : "Declined"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
