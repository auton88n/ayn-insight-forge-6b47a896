/**
 * TalentPoolCard.tsx — v3.2.0 "one profile, and show what it powers"
 *
 * The point of the Profile redesign: make the talent pool connection visible.
 * When a seeker is opted in we show them exactly what an employer sees
 * (the anonymized card employer_match returns), which skills are backed by
 * evidence versus inferred, how fresh it is, and what is missing that
 * employers actually filter on.
 */
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, RefreshCw, X, ShieldCheck, Check, AlertCircle } from "lucide-react";
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
/** v3.5.1 — bump whenever the consent wording changes. */
const CONSENT_VERSION = "v3.5.1-full-profile";




interface Props {
  /** Bumped by the parent after any save so the card refetches freshness. */
  refreshKey?: number;
  /** One entry per profile group, with what employers lose when it is empty. */
  groupGaps: GroupGap[];
  pendingIntros: number;
}

export default function TalentPoolCard({ refreshKey = 0, groupGaps, pendingIntros }: Props) {

  const { toast } = useToast();
  const [status, setStatus] = useState<TalentPoolStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  // v3.5.1 — opting in requires an explicit confirmation step.
  const [confirmOpen, setConfirmOpen] = useState(false);


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

  const toggle = async (next: boolean) => {
    setSaving(true);
    setConfirmOpen(false);
    try {
      await resumeHubApi.talentPoolSet(next, next ? CONSENT_VERSION : undefined);
      setPoolOptInCache(next);
      toast({
        title: next ? "You're discoverable" : "Left the pool",
        description: next
          ? "Employers searching AYN can now see your full profile. Contact details stay private until you approve an intro."
          : "Your profile left the pool.",
      });
      await load();

    } catch (e) {
      toast({ title: "Couldn't update", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  };

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
            <Users className="w-4 h-4 text-primary" />
            <span className="font-medium">Let employers find me</span>
            {optedIn ? <Badge variant="secondary">On</Badge> : <Badge variant="outline">Off</Badge>}
          </div>
          {optedIn && pendingIntros > 0 && (
            <p className="text-xs font-medium text-primary mt-1">
              {pendingIntros} {pendingIntros === 1 ? "company wants" : "companies want"} an intro
            </p>
          )}
          {optedIn ? (
            <p className="text-xs text-muted-foreground mt-1 max-w-xl leading-relaxed">
              You are discoverable. Employers searching AYN can see your full profile, and AYN's AI
              matches you to open roles using everything you have provided.
              <br />
              Your email and phone stay private until you approve an intro. Turn this off anytime and
              your profile leaves the pool immediately.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1 max-w-xl leading-relaxed">
              Turn this on and employers searching AYN can see your full profile: your resume, work
              history, skills, education, what you are looking for, and where you can work. AYN's AI
              uses all of it to match you to roles you would not have found on your own.
              <br />
              Employers reach you through AYN. Your email and phone are only shared when you approve
              a specific request.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          <Switch
            checked={optedIn}
            disabled={loading || saving}
            onCheckedChange={(next) => (next ? setConfirmOpen(true) : toggle(false))}
          />
        </div>
      </div>

      {/* v3.5.1 — explicit consent moment before the profile enters the pool. */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make your profile discoverable</AlertDialogTitle>
            <AlertDialogDescription>
              Employers searching AYN will be able to see everything in your profile, including your
              resume, work history, skills, and preferences. AYN's AI will use this information to
              match you with roles and to recommend you to employers. You can turn this off at any
              time, and your profile is removed from the pool immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => toggle(true)}>Turn on discovery</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


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
                  No name and no contact details. That is the whole card.
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
