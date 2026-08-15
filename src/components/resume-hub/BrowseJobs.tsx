/**
 * BrowseJobs.tsx — v3.138.0
 *
 * Real job postings sourced from company career pages (never LinkedIn or
 * Indeed — job-board-sync's own header comment covers how that's enforced
 * and what got filtered out when it wasn't true in practice), refreshed
 * continuously, dropped after 7 days so Apply always points at something
 * still likely open.
 *
 * v3.137.0 — reported directly against a live screenshot: this needs to be
 * its own page rather than a mode that takes over the saved-jobs tracker,
 * the description was never shown at all even though every row stores one
 * (about 5,400 characters on average), and the location filter only ever
 * listed the locations of the 24 rows that happened to be loaded, out of
 * 1,095 real distinct locations in the table. Rebuilt as a real job board:
 *
 *   - A split view. The result list on the left, the full posting on the
 *     right (desktop) or in a full-height sheet (narrow screens), so the
 *     description is always one click away and never truncates the list.
 *   - Search, location and remote all filter server side, against the
 *     whole table, not against whatever page is already in memory.
 *   - Pagination, 25 at a time, with a real total count so the board
 *     never looks like it holds two dozen postings.
 *
 * Picking a job still just adds it to the user's own jobs list (same
 * table, same shape as "Add job manually") and hands off to the exact same
 * score/tailor/cover-letter flow already built — this page's only job is
 * discovery, not a parallel pipeline.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2, ExternalLink, Plus, Flame, Search, MapPin, Home, ChevronDown, X, Building2, Bookmark, Wand2,
} from "lucide-react";
import { resumeHubApi, type JobPosting } from "@/lib/resumeHub";
import { useToast } from "@/hooks/use-toast";

interface Props {
  userId: string;
  onOpenProfile: () => void;
}

const PAGE_SIZE = 25;
const HOT_WINDOW_MS = 24 * 60 * 60 * 1000;
const COLS = "id, source, company, company_logo_url, title, description, location, apply_url, posted_at";

// A small, deliberately warm palette that sits next to this app's own ember
// accent without competing with it — each company gets one deterministically,
// so the same company always lands on the same color across a session.
export const AVATAR_PALETTE = [
  "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-300",
  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
];

export function companyAvatar(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const initial = (name.trim()[0] || "?").toUpperCase();
  return { initial, className: AVATAR_PALETTE[hash % AVATAR_PALETTE.length] };
}

// job_board_score is deliberately keyword-only (no AI call — see that
// function's own header, and CLAUDE.md's disclosed accuracy gap versus the
// full semantic pipeline), so a low number on a mismatched role is a
// correct, honest answer, not a failure. Styled as a neutral tier rather
// than a red/failed one so it never reads as "AYN broke."
function scoreTier(score: number) {
  if (score >= 50) return { label: "Strong match", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" };
  if (score >= 20) return { label: "Some overlap", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" };
  return { label: "Quick match", cls: "bg-muted text-muted-foreground" };
}

function postedAge(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// v3.141.0 — asked directly to also show the actual posting date, not just
// a relative "3 hours ago". Short form for the compact list row (no year —
// job_postings is pruned past a 7-day freshness window, so a stored date
// is always within the current year in practice); the detail pane gets the
// same short date, room there doesn't call for anything longer either.
function postedDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Escapes the characters PostgREST treats as special inside an ilike filter. */
function safeLike(s: string) {
  return s.replace(/[%,()]/g, " ").trim();
}

// v3.142.0 — asked directly for "a better way to organize locations": the
// filter held 1,000+ distinct raw strings (job-board-sync pulls location
// text as-is from each company's own ATS, so granularity varies wildly —
// "Germany", "Kyle, TX", "Dearborn, MI, United States" all coexist) in one
// flat alphabetical list. There's no reliable geocoder here to turn that
// into real city/country structure, so this groups by the last
// comma-separated segment instead — usually a state, province or country —
// which is honest about what the data actually is rather than pretending
// to a precision it doesn't have. Search still works as a flat filter
// across everything; grouping is only for browsing with no query typed.
function groupLocations(locs: string[]) {
  const groups = new Map<string, string[]>();
  for (const loc of locs) {
    const parts = loc.split(",").map((s) => s.trim()).filter(Boolean);
    const key = parts.length > 1 ? parts[parts.length - 1] : loc;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(loc);
  }
  return Array.from(groups.entries())
    .map(([key, items]) => ({ key, items: items.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key));
}

export default function BrowseJobs({ userId, onOpenProfile }: Props) {
  const { toast } = useToast();

  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [scores, setScores] = useState<Record<string, number | null>>({});
  // job_board_score legitimately returns match_pct: null for every job when
  // the caller has no resume/profile text to score against yet — a real,
  // honest "can't score this" answer, not a pending fetch. This tracks which
  // ids have already come back so a null reads as "no resume yet" instead of
  // spinning on "Scoring…" forever.
  const [scored, setScored] = useState<Set<string>>(new Set());
  const [logoFailed, setLogoFailed] = useState<Set<string>>(new Set());

  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState<string | null>(null);
  const [remoteOnly, setRemoteOnly] = useState(false);

  const [locations, setLocations] = useState<string[]>([]);
  const [locOpen, setLocOpen] = useState(false);
  const [locFilter, setLocFilter] = useState("");
  const locBoxRef = useRef<HTMLDivElement | null>(null);

  const [selected, setSelected] = useState<JobPosting | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  // v3.142.0 — a bookmark on each row saves without leaving the list or
  // opening detail, separate from "Score and tailor" in the detail pane
  // (which deliberately still jumps to the Jobs page — that's someone
  // saying "I want to work on this now", not "keep this for later").
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set());

  // v3.142.0 — "Match me": AYN filters to the locations already declared in
  // Profile (preferences.desired_locations) and sorts by the same quick
  // keyword score every card already shows, instead of the person having
  // to hand-pick a location and read down the list themselves.
  const [matchMode, setMatchMode] = useState(false);
  const [desiredLocations, setDesiredLocations] = useState<string[] | null>(null);

  const hasFilters = !!query || !!location || remoteOnly;

  /* Debounce the search box so typing doesn't fire a query per keystroke. */
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [rawQuery]);

  /* Every distinct location in the table, not just the loaded page. One
     lightweight single-column read, deduped here, cached for the page. */
  useEffect(() => {
    let cancelled = false;
    supabase.from("job_postings").select("location").limit(5000).then(({ data }) => {
      if (cancelled || !data) return;
      const set = new Set<string>();
      for (const r of data as { location: string | null }[]) if (r.location) set.add(r.location);
      setLocations(Array.from(set).sort((a, b) => a.localeCompare(b)));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (locBoxRef.current && !locBoxRef.current.contains(e.target as Node)) setLocOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  /* Every job URL already saved, so the bookmark can show its filled state
     without a round trip per row. */
  useEffect(() => {
    let cancelled = false;
    supabase.from("jobs").select("source_url").eq("user_id", userId).not("source_url", "is", null).then(({ data }) => {
      if (cancelled || !data) return;
      setSavedUrls(new Set((data as { source_url: string | null }[]).map((r) => r.source_url).filter((u): u is string => !!u)));
    });
    return () => { cancelled = true; };
  }, [userId]);

  /* Profile's own desired-locations list, read once for Match me. */
  useEffect(() => {
    let cancelled = false;
    supabase.from("user_profile_canonical").select("preferences").eq("user_id", userId).maybeSingle().then(({ data }) => {
      if (cancelled) return;
      const prefs = data?.preferences as { desired_locations?: string[] } | null | undefined;
      setDesiredLocations(prefs?.desired_locations?.filter(Boolean) ?? []);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const scorePage = useCallback((rows: JobPosting[]) => {
    if (!rows.length) return;
    resumeHubApi.jobBoardScore(rows.map((r) => ({ id: r.id, description: r.description })))
      .then((res) => {
        setScores((prev) => {
          const next = { ...prev };
          for (const s of res.scores) next[s.id] = s.match_pct;
          return next;
        });
        setScored((prev) => {
          const next = new Set(prev);
          for (const r of rows) next.add(r.id);
          return next;
        });
      })
      .catch(() => {
        setScored((prev) => {
          const next = new Set(prev);
          for (const r of rows) next.add(r.id);
          return next;
        });
      });
  }, []);

  const buildQuery = useCallback((withCount: boolean) => {
    let q = supabase
      .from("job_postings")
      .select(COLS, withCount ? { count: "exact" } : undefined)
      .order("posted_at", { ascending: false });
    const term = safeLike(query);
    if (term) q = q.or(`title.ilike.%${term}%,company.ilike.%${term}%`);
    if (matchMode && desiredLocations && desiredLocations.length > 0) {
      q = q.or(desiredLocations.map((l) => `location.ilike.%${safeLike(l)}%`).join(","));
    } else {
      if (location) q = q.eq("location", location);
      if (remoteOnly) q = q.ilike("location", "%remote%");
    }
    return q;
  }, [query, location, remoteOnly, matchMode, desiredLocations]);

  // v3.142.0 — the underlying query still sorts by recency (that's what
  // keeps pagination and the total count honest); once a page's quick
  // scores come back, Match me re-sorts what's already loaded so the
  // strongest overlap with the resume surfaces first. Guarded against a
  // no-op reorder so this can never loop against the score update below.
  useEffect(() => {
    if (!matchMode) return;
    setJobs((prev) => {
      const sorted = [...prev].sort((a, b) => (scores[b.id] ?? -1) - (scores[a.id] ?? -1));
      const same = sorted.every((j, i) => j.id === prev[i]?.id);
      return same ? prev : sorted;
    });
  }, [scores, matchMode]);

  /* First page, and every filter change. */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    buildQuery(true).range(0, PAGE_SIZE - 1).then(({ data, error, count }) => {
      if (cancelled) return;
      setLoading(false);
      if (error) {
        toast({ title: "Couldn't load jobs", description: error.message, variant: "destructive" });
        return;
      }
      const rows = (data as unknown as JobPosting[]) ?? [];
      setJobs(rows);
      setTotal(count ?? rows.length);
      setSelected((prev) => (prev && rows.some((r) => r.id === prev.id) ? prev : rows[0] ?? null));
      scorePage(rows);
    });
    return () => { cancelled = true; };
  }, [buildQuery, scorePage, toast]);

  const loadMore = async () => {
    setLoadingMore(true);
    const { data, error } = await buildQuery(false).range(jobs.length, jobs.length + PAGE_SIZE - 1);
    setLoadingMore(false);
    if (error) {
      toast({ title: "Couldn't load more", description: error.message, variant: "destructive" });
      return;
    }
    const rows = (data as unknown as JobPosting[]) ?? [];
    setJobs((prev) => [...prev, ...rows]);
    scorePage(rows);
  };

  // v3.139.0 — reported directly: clicking a job on desktop turned the
  // whole screen gray, and a second click was needed to clear it. Real
  // cause: SheetContent's className="... lg:hidden" only hides the sheet
  // PANEL at the lg breakpoint — the Sheet primitive always renders its
  // own full-screen overlay regardless of that class (confirmed directly
  // in ui/sheet.tsx: SheetOverlay has no responsive class of its own), so
  // opening the sheet on desktop mounted an invisible-but-real dark
  // backdrop on top of the already-correct split-view pane. The second
  // click wasn't "clearing" anything on purpose — it was landing on that
  // overlay, which closes on any outside click. Fixed at the actual
  // trigger instead of the shared sheet.tsx primitive (used elsewhere in
  // the app; narrowing it here is safer than changing its behavior
  // everywhere): the sheet is a narrow-screen-only affordance to begin
  // with (the detail already shows in the split-view right pane on
  // desktop), so it now simply never opens above the same lg breakpoint
  // SheetContent already hides its panel at.
  const openJob = (j: JobPosting) => {
    setSelected(j);
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) return;
    setSheetOpen(true);
  };

  // v3.138.0 — reported directly against a live screenshot: the same
  // posting listed twice on the Jobs page. This had no dedup check at
  // all — clicking Add a second time on a posting already saved (a
  // double click, or coming back to Browse and clicking it again) just
  // inserted a second row for the identical apply_url. Now checks for an
  // existing row on that exact URL first and opens it instead of
  // inserting a duplicate.
  // v3.142.0 — a bookmark on each row saves without leaving the list.
  // v3.143.0 — "Score and tailor" in the detail pane was still navigating
  // to the Saved jobs page on a genuinely new save, which fixed the
  // already-saved case but not the one actually reported: browsing (Match
  // me included) kept getting interrupted the first time a job was saved
  // too. Nothing on this page force-navigates anymore, first save or not —
  // it saves, says so, and leaves the person exactly where they were.
  // onAdded (a prop that used to carry the person over to Saved jobs) has
  // no remaining caller and was removed along with it.
  const saveJob = async (job: JobPosting) => {
    setAddingId(job.id);
    try {
      const { data: existing } = await supabase.from("jobs")
        .select("id").eq("user_id", userId).eq("source_url", job.apply_url).maybeSingle();
      if (existing) {
        setSavedUrls((prev) => new Set(prev).add(job.apply_url));
        toast({ title: "Already saved", description: "Find it on the Saved jobs page whenever you're ready." });
        return;
      }
      const { error } = await supabase.from("jobs").insert({
        user_id: userId,
        source: "job_board",
        source_url: job.apply_url,
        jd_text: job.description,
        company: job.company,
        title: job.title,
        location: job.location,
      });
      if (error) throw error;
      setSavedUrls((prev) => new Set(prev).add(job.apply_url));
      toast({ title: "Saved", description: "Find it anytime on the Saved jobs page." });
    } catch (e) {
      toast({ title: "Couldn't add that job", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setAddingId(null);
    }
  };

  const handleAdd = (job: JobPosting) => saveJob(job);
  const toggleBookmark = (e: React.MouseEvent, job: JobPosting) => {
    e.stopPropagation();
    if (savedUrls.has(job.apply_url)) {
      toast({ title: "Already saved", description: "Find it on the Saved jobs page." });
      return;
    }
    saveJob(job);
  };

  // v3.142.0 — flat while searching (a typed filter beats a category
  // browse every time), grouped by region while just browsing so 1,000+
  // raw strings aren't one undifferentiated alphabetical wall.
  const visibleLocations = useMemo(() => {
    const f = locFilter.trim().toLowerCase();
    if (f) return { flat: locations.filter((l) => l.toLowerCase().includes(f)).slice(0, 120), groups: null as ReturnType<typeof groupLocations> | null };
    return { flat: null as string[] | null, groups: groupLocations(locations).slice(0, 60) };
  }, [locations, locFilter]);

  const clearFilters = () => {
    setRawQuery("");
    setQuery("");
    setLocation(null);
    setRemoteOnly(false);
    setMatchMode(false);
  };

  const startMatchMode = () => {
    if (!desiredLocations || desiredLocations.length === 0) {
      toast({
        title: "Add your desired locations first",
        description: "Set the countries or cities you're looking in under Profile, then try Match me again.",
      });
      return;
    }
    setLocation(null);
    setRemoteOnly(false);
    setMatchMode(true);
  };

  const scorePill = (id: string) => {
    const score = scores[id];
    if (score != null) {
      const tier = scoreTier(score);
      return (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tier.cls}`}
          title="A quick keyword estimate, computed automatically. Add the job for AYN's full match analysis."
        >
          {tier.label} · {score}%
        </span>
      );
    }
    if (!scored.has(id)) {
      return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-muted text-muted-foreground animate-pulse">Scoring…</span>;
    }
    return <span className="text-xs text-muted-foreground">No resume yet</span>;
  };

  const detail = selected && (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-border/60 space-y-3">
        <div className="flex items-start gap-3">
          {selected.company_logo_url && !logoFailed.has(selected.id) ? (
            <img
              src={selected.company_logo_url}
              alt=""
              className="w-12 h-12 rounded-lg shrink-0 object-contain bg-muted p-1.5"
              onError={() => setLogoFailed((prev) => new Set(prev).add(selected.id))}
            />
          ) : (
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-semibold shrink-0 ${companyAvatar(selected.company).className}`}>
              {companyAvatar(selected.company).initial}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug">{selected.title}</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Building2 className="w-3.5 h-3.5 shrink-0" />{selected.company}
            </p>
            {selected.location && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 shrink-0" />{selected.location}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {scorePill(selected.id)}
          <span className="text-xs text-muted-foreground">Posted {postedAge(selected.posted_at)} · {postedDate(selected.posted_at)}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button onClick={() => handleAdd(selected)} disabled={addingId === selected.id}>
            {addingId === selected.id
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Plus className="w-4 h-4 mr-2" />}
            Score and tailor
          </Button>
          <Button variant="outline" asChild>
            <a href={selected.apply_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />Apply on company site
            </a>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Job description</h3>
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
          {selected.description?.trim() || "This posting did not include a description. Open it on the company site to read the full details."}
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Browse jobs</h3>
          <p className="text-xs text-muted-foreground">
            Real postings from company career pages, refreshed continuously. Never LinkedIn or Indeed.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => (matchMode ? setMatchMode(false) : startMatchMode())}
          style={matchMode ? { background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" } : undefined}
          variant={matchMode ? undefined : "outline"}
          className={matchMode ? "hover:opacity-90" : ""}
        >
          <Wand2 className="w-4 h-4 mr-2" />{matchMode ? "Showing my matches" : "Match me"}
        </Button>
      </div>

      {matchMode && (
        <p className="text-xs text-muted-foreground -mt-2">
          Sorted by fit, filtered to {desiredLocations?.length === 1 ? "the location" : "the locations"} you set in Profile:{" "}
          <span className="text-foreground font-medium">{desiredLocations?.join(", ")}</span>.{" "}
          <button type="button" className="underline hover:text-foreground" onClick={onOpenProfile}>Change this</button>
        </p>
      )}

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder="Search by title or company"
            className="pl-9"
          />
        </div>

        <div className={`relative w-full lg:w-64 ${matchMode ? "opacity-50 pointer-events-none" : ""}`} ref={locBoxRef}>
          <button
            type="button"
            onClick={() => { setLocOpen((v) => !v); setLocFilter(""); }}
            className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm"
          >
            <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className={`flex-1 text-left truncate ${location ? "" : "text-muted-foreground"}`}>
              {location ?? "All locations"}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
          {locOpen && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
              <div className="p-2 border-b">
                <Input
                  autoFocus
                  value={locFilter}
                  onChange={(e) => setLocFilter(e.target.value)}
                  placeholder={`Search ${locations.length} locations`}
                  className="h-8"
                />
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
                  onClick={() => { setLocation(null); setLocOpen(false); }}
                >
                  All locations
                </button>
                {visibleLocations.flat
                  ? visibleLocations.flat.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted ${loc === location ? "font-medium" : ""}`}
                      style={loc === location ? { color: "var(--rh-accent-2)" } : undefined}
                      onClick={() => { setLocation(loc); setLocOpen(false); }}
                    >
                      {loc}
                    </button>
                  ))
                  : visibleLocations.groups?.map((g) => (
                    <div key={g.key}>
                      <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {g.key} <span className="font-normal normal-case">· {g.items.length}</span>
                      </p>
                      {g.items.slice(0, 8).map((loc) => (
                        <button
                          key={loc}
                          type="button"
                          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted ${loc === location ? "font-medium" : ""}`}
                          style={loc === location ? { color: "var(--rh-accent-2)" } : undefined}
                          onClick={() => { setLocation(loc); setLocOpen(false); }}
                        >
                          {loc}
                        </button>
                      ))}
                    </div>
                  ))}
                {visibleLocations.flat?.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">No location matches that.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <Button
          type="button"
          variant={remoteOnly ? "default" : "outline"}
          onClick={() => setRemoteOnly((v) => !v)}
          disabled={matchMode}
          className={`shrink-0 ${matchMode ? "opacity-50" : ""}`}
        >
          <Home className="w-4 h-4 mr-1.5" />Remote
        </Button>

        {(hasFilters || matchMode) && (
          <Button type="button" variant="ghost" onClick={clearFilters} className="shrink-0">
            <X className="w-4 h-4 mr-1.5" />Clear
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {loading
          ? "Loading jobs…"
          : total === null
            ? ""
            : hasFilters || matchMode
              ? `${total} job${total === 1 ? "" : "s"} match your search`
              : `${total} jobs`}
      </p>

      {/* Split view: list on the left, the full posting on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4 items-start">
        <div className="space-y-3">
          {loading ? (
            <Card className="divide-y divide-border/60 border-border/60 overflow-hidden p-0">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </Card>
          ) : jobs.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-sm text-muted-foreground">
                {hasFilters ? "No jobs match your search. Try clearing a filter." : "No fresh postings right now, check back soon."}
              </p>
            </Card>
          ) : (
            <>
              <Card className="divide-y divide-border/60 border-border/60 overflow-hidden p-0">
                {jobs.map((j) => {
                  const isHot = Date.now() - new Date(j.posted_at).getTime() < HOT_WINDOW_MS;
                  const avatar = companyAvatar(j.company);
                  const showLogo = !!j.company_logo_url && !logoFailed.has(j.id);
                  const active = selected?.id === j.id;
                  const isSaved = savedUrls.has(j.apply_url);
                  return (
                    // v3.142.0 — the row used to be one big <button>; adding
                    // a bookmark control meant it could no longer be, since
                    // an interactive element can't nest inside another one.
                    // The clickable area (avatar + text) is now its own
                    // inner button, with the bookmark as a sibling instead
                    // of a child.
                    <div
                      key={j.id}
                      className="w-full flex items-start gap-2 p-4 transition border-l-2 hover:bg-muted/40"
                      style={active
                        ? { background: "var(--rh-tint)", borderLeftColor: "var(--rh-accent)" }
                        : { borderLeftColor: "transparent" }}
                    >
                      <button type="button" onClick={() => openJob(j)} className="flex items-start gap-3 flex-1 min-w-0 text-left">
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
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="font-medium text-sm leading-snug">{j.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {j.company}{j.location ? ` • ${j.location}` : ""}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap pt-0.5">
                            {scorePill(j.id)}
                            <span className="text-[11px] text-muted-foreground">{postedAge(j.posted_at)} · {postedDate(j.posted_at)}</span>
                          </div>
                        </div>
                      </button>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {/* v3.139.0 — reported directly: the New badge sat
                            inline right after the title, so a one-line title
                            and a two-line title left it in a different spot
                            on every card. Pulled out to its own column at the
                            end of the row instead, so it lands in the same
                            place on every card regardless of title length —
                            and given real AYN ember colors (var(--rh-accent)),
                            since bg-primary/text-primary resolve to this
                            app's near-black default here, not orange. */}
                        {isHot && (
                          <Badge
                            variant="outline"
                            className="shrink-0 gap-1 border"
                            style={{ background: "var(--rh-tint)", color: "var(--rh-accent-2)", borderColor: "#f9731650" }}
                          >
                            <Flame className="w-3 h-3" /> New
                          </Badge>
                        )}
                        {/* v3.142.0 — asked directly for a bookmark-style
                            save so a job can be kept without leaving the
                            list or reading the full posting first. */}
                        <button
                          type="button"
                          onClick={(e) => toggleBookmark(e, j)}
                          disabled={addingId === j.id}
                          aria-label={isSaved ? "Saved" : "Save job"}
                          title={isSaved ? "Saved" : "Save job"}
                          className="p-1 rounded hover:bg-muted transition"
                        >
                          <Bookmark
                            className="w-4 h-4"
                            style={isSaved ? { fill: "var(--rh-accent)", color: "var(--rh-accent)" } : { color: "var(--rh-faint, #9ca3af)" }}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </Card>

              {total !== null && jobs.length < total && (
                <Button variant="outline" className="w-full" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : `Load more (${total - jobs.length} left)`}
                </Button>
              )}
            </>
          )}
        </div>

        {/* Desktop detail pane */}
        <Card className="hidden lg:block border-border/60 overflow-hidden sticky top-4 h-[calc(100vh-8rem)] p-0">
          {selected
            ? detail
            : <p className="p-10 text-sm text-muted-foreground text-center">Pick a job to read the full posting.</p>}
        </Card>
      </div>

      {/* Narrow screens get the same detail as a full height sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 lg:hidden">
          <div className="h-full pt-6">{detail}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
