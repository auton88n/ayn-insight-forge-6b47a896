/**
 * BrowseJobs.tsx — v3.135.0
 *
 * Real job postings sourced from company career pages (never LinkedIn or
 * Indeed — job-board-sync's own header comment covers how that's enforced
 * and what got filtered out when it wasn't true in practice), refreshed
 * continuously, dropped after 7 days so Apply always points at something
 * still likely open. Each card shows a real match score against the
 * caller's own resume — computed the same deterministic way job_fit_advice
 * already does (no AI call), so scoring a whole page costs nothing.
 *
 * v3.135.0 — reported directly against a live screenshot: no search or
 * filters, no company mark, and the automatic quick-match score read as
 * something you had to click for. The score has always computed on load
 * with zero clicks (jobBoardScore fires once for the whole page in the
 * effect below) — what was missing was making that visible: a colored pill
 * next to the title instead of a thin bar buried under the buttons, and a
 * "Scoring…" placeholder while it's in flight so it never looks blank or
 * broken. There is deliberately no per-company logo asset — job_postings
 * has no logo_url column, and this app has no license to hotlink a
 * third-party logo service — so companyAvatar() below renders the same
 * kind of deterministic colored-initial mark LinkedIn/Indeed themselves
 * fall back to whenever they don't have a real logo either.
 *
 * Picking a job here just adds it to the user's own jobs list (same table,
 * same shape as "Add job manually") and hands off to the exact same
 * score/tailor/cover-letter flow already built — this component's only
 * job is discovery, not a parallel pipeline.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ExternalLink, Plus, Flame, X, Search, MapPin, Home } from "lucide-react";
import { resumeHubApi, type JobPosting } from "@/lib/resumeHub";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onAdd: (job: JobPosting) => Promise<void>;
  onClose: () => void;
}

const PAGE_SIZE = 24;
const HOT_WINDOW_MS = 24 * 60 * 60 * 1000;
const ALL_LOCATIONS = "__all__";

// A small, deliberately warm palette that sits next to this app's own ember
// accent without competing with it — each company gets one deterministically,
// so the same company always lands on the same color across a session.
const AVATAR_PALETTE = [
  "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-300",
  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
];

function companyAvatar(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const initial = (name.trim()[0] || "?").toUpperCase();
  return { initial, className: AVATAR_PALETTE[hash % AVATAR_PALETTE.length] };
}

// job_board_score is deliberately keyword-only (no AI call — see this
// function's own header, and CLAUDE.md's disclosed accuracy gap versus the
// full semantic pipeline), so 0% on a mismatched role is a correct, honest
// answer, not a failure. Styled as a neutral tier rather than a red/failed
// one so it never reads as "AYN broke."
function scoreTier(score: number) {
  if (score >= 50) return { label: "Strong match", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" };
  if (score >= 20) return { label: "Some overlap", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" };
  return { label: "Quick match", cls: "bg-muted text-muted-foreground" };
}

export default function BrowseJobs({ onAdd, onClose }: Props) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  // v3.135.0 — job_board_score legitimately returns match_pct: null for
  // every job when the caller has no resume/profile text to score against
  // yet (bundle.chars < 60 server-side) — a real, honest "can't score this"
  // answer, not a failed or pending fetch. `scores[id] == null` covers both
  // "still in flight" and "backend says no profile," so a separate
  // scoresLoaded flag is needed to tell them apart; without it, an account
  // with no resume would show "Scoring…" forever instead of the real reason.
  const [scoresLoaded, setScoresLoaded] = useState(false);
  // v3.135.0 — a stored company_logo_url can still fail to load for a given
  // viewer (network hiccup, a since-removed favicon) — this tracks which
  // job ids have already failed once, so those cards render the monogram
  // instead of retrying a known-bad image on every re-render.
  const [logoFailed, setLogoFailed] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState(ALL_LOCATIONS);
  const [remoteOnly, setRemoteOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("job_postings")
        .select("id, source, company, company_logo_url, title, description, location, apply_url, posted_at")
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
            setScoresLoaded(true);
          })
          .catch(() => { setScoresLoaded(true); /* cards still render fine with no score */ });
      }
    })();
    return () => { cancelled = true; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const locations = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) if (j.location) set.add(j.location);
    return Array.from(set).sort();
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (q && !`${j.title} ${j.company}`.toLowerCase().includes(q)) return false;
      if (location !== ALL_LOCATIONS && j.location !== location) return false;
      if (remoteOnly && !/remote/i.test(j.location || "")) return false;
      return true;
    });
  }, [jobs, query, location, remoteOnly]);

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

      {!loading && jobs.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or company"
              className="pl-9"
            />
          </div>
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger className="w-full sm:w-56">
              <MapPin className="w-4 h-4 mr-1.5 text-muted-foreground shrink-0" />
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_LOCATIONS}>All locations</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc} value={loc}>{loc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={remoteOnly ? "default" : "outline"}
            size="default"
            onClick={() => setRemoteOnly((v) => !v)}
            className="shrink-0"
          >
            <Home className="w-4 h-4 mr-1.5" />Remote
          </Button>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtered.length === jobs.length ? `${jobs.length} jobs` : `${filtered.length} of ${jobs.length} jobs`}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No fresh postings right now — check back soon.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No jobs match your search. Try clearing a filter.</p>
      ) : (
        // v3.136.0 — reported directly against a live screenshot: a 3-wide
        // card grid doesn't read as a job board, LinkedIn/Indeed both list
        // one posting per row, vertically. Rebuilt as a single-column list,
        // each row inline on desktop (logo, title/company/location, score,
        // actions all on one line) and wrapping to a stacked layout on
        // narrow widths so nothing gets cut off.
        <Card className="divide-y divide-border/60 border-border/60 overflow-hidden p-0">
          {filtered.map((j) => {
            const isHot = Date.now() - new Date(j.posted_at).getTime() < HOT_WINDOW_MS;
            const score = scores[j.id];
            const avatar = companyAvatar(j.company);
            const tier = score != null ? scoreTier(score) : null;
            const showLogo = !!j.company_logo_url && !logoFailed.has(j.id);
            return (
              <div key={j.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 hover:bg-muted/30 transition">
                {showLogo ? (
                  <img
                    src={j.company_logo_url!}
                    alt=""
                    className="w-10 h-10 rounded-lg shrink-0 object-contain bg-muted p-1.5"
                    onError={() => setLogoFailed((prev) => new Set(prev).add(j.id))}
                  />
                ) : (
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-semibold text-sm shrink-0 ${avatar.className}`}>
                    {avatar.initial}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{j.title}</p>
                    {isHot && (
                      <Badge className="shrink-0 bg-primary/10 text-primary border-primary/30 gap-1 hover:bg-primary/10">
                        <Flame className="w-3 h-3" /> New
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {j.company}{j.location ? ` • ${j.location}` : ""}
                  </p>
                </div>

                <div className="shrink-0 sm:w-40">
                  {score != null ? (
                    <div
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tier!.cls}`}
                      title="A quick keyword-based estimate, computed automatically. Open the job for AYN's full match analysis."
                    >
                      {tier!.label} · {score}%
                    </div>
                  ) : !scoresLoaded ? (
                    <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-muted text-muted-foreground animate-pulse">
                      Scoring…
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No resume yet</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => handleAdd(j)} disabled={addingId === j.id}>
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
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
