/**
 * TalentPoolCard.tsx — v3.2.0 "one profile, and show what it powers"
 *
 * The point of the Profile redesign: make the talent pool connection visible.
 * When a seeker is opted in we show them exactly what an employer sees
 * (the summary card employer_match returns), which skills are backed by
 * evidence versus inferred, how fresh it is, and what is missing that
 * employers actually filter on.
 */
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, RefreshCw, X, ShieldCheck, Check, AlertCircle, ArrowRight } from "lucide-react";
import { resumeHubApi, type TalentPoolStatus, type PoolSkill } from "@/lib/resumeHub";
import { AYN_POOL_REINDEXED, setPoolOptInCache } from "@/lib/talentPoolSync";
import type { GroupGap } from "@/lib/profileGaps";


function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "never";
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
interface Props {
  /** Bumped by the parent after any save so the card refetches freshness. */
  refreshKey?: number;
  /** One entry per profile group, with what employers lose when it is empty. */
  groupGaps: GroupGap[];
  pendingIntros: number;
  /** v3.66.0 — the on/off switch itself now lives in Profile; this jumps there. */
  onOpenProfile: () => void;
}

export default function TalentPoolCard({ refreshKey = 0, groupGaps, pendingIntros, onOpenProfile }: Props) {

  const { toast } = useToast();
  const [status, setStatus] = useState<TalentPoolStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await resumeHubApi.talentPoolGet();
      setStatus(r);
      // Seed the shared cache so client-side writes can skip the request
      // entirely when this seeker is not in the pool.
      setPoolOptInCache(!!r.opted_in);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  // v3.2.1 — a write elsewhere in the Hub triggered a reindex, so refresh the
  // freshness line and the preview the moment it resolves.
  useEffect(() => {
    const onReindexed = () => { load(); };
    window.addEventListener(AYN_POOL_REINDEXED, onReindexed);
    return () => window.removeEventListener(AYN_POOL_REINDEXED, onReindexed);
  }, [load]);

  const reindex = async () => {
    setReindexing(true);
    try {
      await resumeHubApi.talentPoolReindexSelf();
      await load();
      toast({ title: "Profile refreshed" });
    } catch (e) {
      toast({ title: "Couldn't refresh", description: (e as Error).message, variant: "destructive" });
    } finally { setReindexing(false); }
  };

  const deleteSkill = async (s: PoolSkill) => {
    try {
      await resumeHubApi.talentPoolSkillDelete(s.id);
      setStatus(p => p ? { ...p, skills: p.skills.filter(x => x.id !== s.id), skills_count: p.skills_count - 1 } : p);
    } catch (e) {
      toast({ title: "Couldn't remove", description: (e as Error).message, variant: "destructive" });
    }
  };

  const optedIn = !!status?.opted_in;
  // v3.28.0 — when an admin restricts discovery the toggle would otherwise
  // look normal and do nothing, so say what happened instead.
  const discoveryRestricted = !!status?.discovery_restricted;
  const restrictionReason = status?.discovery_restriction_reason || "";
  const extracted = (status?.skills ?? []).filter(s => s.provenance === "extracted");
  const inferred = (status?.skills ?? []).filter(s => s.provenance === "inferred");

  const indexedAt = status?.indexed_at ?? null;
  const newestEdit = [status?.resume_updated_at, status?.profile_updated_at]
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;
  const stale = !!(optedIn && indexedAt && newestEdit && new Date(newestEdit).getTime() > new Date(indexedAt).getTime() + 5000);

  return (
    <Card className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <Users className={`w-4 h-4 ${optedIn ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} />
            <span className="font-medium">Let employers find me</span>
            <span
              className={`text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                optedIn ? "bg-emerald-500 text-white" : "bg-muted-foreground/20 text-muted-foreground"
              }`}
            >
              {optedIn ? "On" : "Off"}
            </span>
          </div>
          {optedIn && pendingIntros > 0 && (
            <p className="text-xs font-medium text-primary mt-1">
              {pendingIntros} new job {pendingIntros === 1 ? "proposal" : "proposals"}
            </p>
          )}
          {discoveryRestricted && (
            <p className="text-xs text-destructive mt-1 max-w-xl leading-relaxed">
              An administrator has removed your profile from the talent pool, so employers cannot
              find you right now.{restrictionReason ? ` Reason given: ${restrictionReason}.` : ""} Contact
              support if you think this is wrong.
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1 max-w-xl leading-relaxed">
            {optedIn
              ? "You are discoverable. Employers can send you job proposals. Your contact details stay private until you accept one."
              : "Turn this on to be recommended to employers hiring for roles like yours."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onOpenProfile} className="h-8">
            {optedIn ? "Manage in Profile" : "Turn on in Profile"} <ArrowRight className="w-3 h-3 ml-1.5" />
          </Button>
        </div>
      </div>

      {optedIn && !loading && (
        <>
          {/* Summary of your profile as employers first see it in a search result */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                What employers see
              </span>
            </div>
            {status?.preview ? (
              <>
                <div>
                  <p className="text-sm font-medium">{status.preview.headline || "No headline yet"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[
                      status.preview.seniority,
                      status.preview.years_experience != null ? `${status.preview.years_experience} years` : "",
                      status.preview.location,
                    ].filter(Boolean).join(" · ") || "No seniority, years, or location yet"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(status.skills ?? []).slice(0, 18).map(s => (
                    <Badge key={s.id} variant="secondary" className="font-normal">{s.skill}</Badge>
                  ))}
                  {(status.skills ?? []).length === 0 && (
                    <span className="text-xs text-muted-foreground">No skills saved yet.</span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Employers see this first, and can open your full profile.
                </p>


              </>
            ) : (
              <p className="text-xs text-muted-foreground">Nothing to show yet. Save your profile or upload a resume.</p>
            )}
          </div>

          {/* Skills split by provenance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-xs font-medium">Backed by your resume ({extracted.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {extracted.map(s => <Badge key={s.id} variant="outline" className="font-normal">{s.skill}</Badge>)}
                {extracted.length === 0 && <span className="text-xs text-muted-foreground">Nothing evidenced yet.</span>}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium">AYN inferred these ({inferred.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {inferred.map(s => (
                  <Badge key={s.id} variant="secondary" className="font-normal gap-1">
                    {s.skill}
                    <button
                      type="button"
                      aria-label={`Remove ${s.skill}`}
                      onClick={() => deleteSkill(s)}
                      className="opacity-60 hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
                {inferred.length === 0 && <span className="text-xs text-muted-foreground">None inferred.</span>}
              </div>
            </div>
          </div>

          {/* Freshness */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {stale ? (
              <span className="text-primary font-medium">Your resume changed since AYN last refreshed what employers see</span>
            ) : (
              <span className="text-muted-foreground">
                Employers have seen this version since {relativeTime(indexedAt)}.
              </span>
            )}
            <Button variant="outline" size="sm" onClick={reindex} disabled={reindexing} className="h-7">
              {reindexing ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
              Refresh
            </Button>
          </div>

          {/* Findability by group. Concrete consequences, no score out of 100. */}
          <div className="space-y-1.5 pt-1">
            <p className="text-xs font-medium">How findable you are</p>
            {groupGaps.map(g => (
              <div key={g.group} className="flex items-start gap-2 text-xs">
                {g.complete
                  ? <Check className="w-3.5 h-3.5 mt-[1px] shrink-0 text-primary" />
                  : <AlertCircle className="w-3.5 h-3.5 mt-[1px] shrink-0 text-muted-foreground" />}
                <span className={g.complete ? "text-muted-foreground" : ""}>
                  <span className="font-medium">{g.group}</span>
                  {g.complete ? " is complete." : <> — {g.consequence}</>}
                </span>
              </div>
            ))}
          </div>

        </>
      )}
    </Card>
  );
}
