/**
 * BrowseJobs.tsx — v3.138.0
 *
 * Real job postings sourced from company career pages (never LinkedIn or
 * Indeed — job-board-sync's own header comment covers how that's enforced
 * and what got filtered out when it wasn't true in practice), refreshed
 * continuously, dropped after 3 days (v3.194.0, was 7) so Apply always
 * points at something still likely open.
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
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Sheet, SheetContent } from "@/components/ui/sheet";

import { Skeleton } from "@/components/ui/skeleton";

import { Loader2, Search, Home, X } from "lucide-react";
import { resumeHubApi, type JobPosting } from "@/lib/resumeHub";
import { useToast } from "@/hooks/use-toast";
// v3.322.0 — these used to be defined in this file; four separate public,
// no-login pages (JobsBrowser.tsx, LiveJobsPreview.tsx, PublicJobs.tsx,
// SalaryGuide.tsx) imported them straight from here for reuse, which meant
// every anonymous visitor's build pulled in this whole ~2,600-line account
// module just for a formatter function -- confirmed at the built-output
// level, not assumed. Moved to a real, neutral shared module; this file is
// now a consumer like every other caller, not the source. See that file's
// own header for the full story, including a real, live label-map bug
// fixed in the same move.
import { safeLike } from "@/lib/jobPostingFormat";
import { savedJobsQueryKey } from "@/lib/queryKeys";
// v3.330.0 — this file was 2,282 lines; the pieces below were pulled out
// into their own focused files as part of splitting it up. Pure code
// movement, zero logic changes -- see each file's own header comment.
import { groupByRegion } from "@/lib/locationRegion";
import { SwipeDeck } from "./SwipeDeck";
import { JobListRow } from "./JobListRow";
import { JobDetailPane } from "./JobDetailPane";
import { BrowseToolbar } from "./BrowseToolbar";
import { SearchBox, LocationPicker, FiltersMenu } from "./BrowseFilters";
import { RoleFinderDialog, TrendingDialog, type RoleFit } from "./BrowseJobsDialogs";
import { PAGE_SIZE, BROWSE_LAST_OPEN_KEY, COLS, displayCount } from "./browseJobsHelpers";

interface Props {
  userId: string;
  /** Opens the posting on the caller's Saved jobs page for scoring and tailoring. */
  onAdded: (jobId: string) => void;
  onOpenProfile: () => void;
}
export default function BrowseJobs({ userId, onAdded, onOpenProfile }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  // v3.171.0 — "swipe to decide," the second half of the approved Ember
  // Discovery mockup. Real, growing pattern (one competitor alone reports
  // 850K+ users and 30M+ swipes) built on the same real insight the
  // research kept surfacing: applying is fundamentally a yes/no gut call,
  // and swipe matches that decision speed better than reading down a
  // list. Deliberately a second way to browse, not a replacement for the
  // list -- reuses the exact same filtered/scored `jobs` this page
  // already loads, so switching modes never changes what's actually being
  // shown, only how.
  const [viewMode, setViewMode] = useState<"list" | "swipe">("list");
  const [swipeIndex, setSwipeIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [scores, setScores] = useState<Record<string, number | null>>({});

  // v3.199.0 — a confirmed "showcase" company (real, observed low turnover
  // over real time, from company_hiring_status) ranks a little lower in
  // Best match, never hidden outright, never anything less than "showcase"
  // itself (insufficient_data/uncertain get no penalty at all -- most
  // companies sit there for weeks, and treating "no verdict yet" the same
  // as a real negative one would quietly bury most of the catalog for no
  // real reason). Fetched once per distinct company already on the page,
  // not per row.
  const [hiringStatusByCompany, setHiringStatusByCompany] = useState<Record<string, string>>({});
  const SHOWCASE_RANK_PENALTY = 20;
  // job_board_score legitimately returns match_pct: null for every job when
  // the caller has no resume/profile text to score against yet — a real,
  // honest "can't score this" answer, not a pending fetch. This tracks which
  // ids have already come back so a null reads as "no resume yet" instead of
  // spinning on "Scoring…" forever.
  const [scored, setScored] = useState<Set<string>>(new Set());
  const [logoFailed, setLogoFailed] = useState<Set<string>>(new Set());

  // v3.183.0 — real, persistent "have I seen this job before" tracking
  // (job_postings_seen), reported directly: swipe mode repeated cards on
  // every reload, with no memory at all. `seenIds` is the live, growing set
  // used for the list view's "Seen" badge; `seenSnapshotRef` is frozen the
  // moment the initial fetch lands and is what the swipe deck filters
  // against — deliberately NOT the live `seenIds`, so a card marked seen
  // mid-session (the moment it becomes the active swipe card) doesn't
  // retroactively vanish from the array and shift indices out from under
  // an in-progress drag. The next reload's fresh fetch is what actually
  // excludes it, which is the real thing being asked for: no repeats
  // across a reload, not real-time removal mid-swipe.
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const seenSnapshotRef = useRef<Set<string> | null>(null);
  // Flips exactly once, when the initial fetch resolves — used only to
  // trigger swipeJobs' memo below the first time the snapshot is ready
  // (the fetch can resolve after or before the jobs fetch, a real race).
  // Deliberately not touched again by markSeen, unlike seenIds itself, so
  // it can't retrigger that memo mid-session the way depending on seenIds
  // directly would.
  const [seenSnapshotReady, setSeenSnapshotReady] = useState(false);
  useEffect(() => {
    supabase.from("job_postings_seen").select("job_posting_id").eq("user_id", userId)
      .then(({ data }) => {
        const ids = new Set((data ?? []).map((r) => r.job_posting_id as string));
        setSeenIds(ids);
        seenSnapshotRef.current = ids;
        setSeenSnapshotReady(true);
      });
  }, [userId]);
  const markSeen = useCallback((jobId: string) => {
    setSeenIds((prev) => {
      if (prev.has(jobId)) return prev; // already known seen — skip the redundant write
      supabase.from("job_postings_seen")
        .upsert({ user_id: userId, job_posting_id: jobId }, { onConflict: "user_id,job_posting_id" })
        .then(() => {});
      return new Set(prev).add(jobId);
    });
  }, [userId]);

  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState<string | null>(null);
  const [remoteOnly, setRemoteOnly] = useState(false);

  // v3.166.0 — real filters, backed by the enrichment columns job-board-sync
  // now captures. employmentType/seniority are chip toggles (a small,
  // bounded value set); category is a dropdown (freehire tags ~20 distinct
  // values); postedWithin is a chip too. All plain .eq()/.gte() additions to
  // buildQuery, same shape as the existing location/remoteOnly filters.
  const [employmentType, setEmploymentType] = useState<string | null>(null);
  const [seniority, setSeniority] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [postedWithin, setPostedWithin] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<string[]>([]);
  const [seniorities, setSeniorities] = useState<string[]>([]);
  const [structuredCities, setStructuredCities] = useState<string[]>([]);

  // v3.166.0 — "Trending": real posting volume, nationally and (optionally)
  // scoped to a chosen city, over the last 3 days. Fetched lazily the first
  // time the dialog opens, same pattern openRoleFinder already uses; a city
  // change re-fetches since that's a real, different query server side, not
  // something to slice out of an already-loaded national result.
  const [trendingOpen, setTrendingOpen] = useState(false);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [trendingCity, setTrendingCity] = useState<string | null>(null);
  const [trendingData, setTrendingData] = useState<Awaited<ReturnType<typeof resumeHubApi.jobBoardTrending>> | null>(null);
  const [trendingError, setTrendingError] = useState(false);

  const loadTrending = useCallback((city: string | null) => {
    setTrendingLoading(true);
    setTrendingError(false);
    resumeHubApi.jobBoardTrending(city)
      .then((res) => setTrendingData(res))
      .catch(() => setTrendingError(true))
      .finally(() => setTrendingLoading(false));
  }, []);

  const openTrending = () => {
    setTrendingOpen(true);
    if (trendingData === null && !trendingLoading) loadTrending(trendingCity);
  };

  const pickTrendingCity = (city: string | null) => {
    setTrendingCity(city);
    loadTrending(city);
  };

  // v3.166.0 — "real relevance ranking" is now the default, not opt-in.
  // Independent of matchMode (which additionally narrows to Profile's
  // desired_locations, a real, deliberate filter that stays its own
  // choice) — this only controls whether the list re-sorts by quick score
  // once scores come back. A caller with no profile yet gets match_pct:
  // null for every job, which the re-sort effect below already treats as a
  // no-op stable sort, so the honest fallback is exactly today's recency
  // order — no new "no profile" branch needed.
  const [newestFirst, setNewestFirst] = useState(false);

  const [locations, setLocations] = useState<string[]>([]);
  const [locOpen, setLocOpen] = useState(false);
  // v3.171.0 — moved up from where the Filters panel's own JSX lives,
  // since the lazy-load effect below now needs it declared before that
  // point in the function body -- referencing a const before its own
  // declaration is a real temporal-dead-zone error in plain JS, not
  // something TypeScript's own checker happened to catch here.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [locFilter, setLocFilter] = useState("");
  const locBoxRef = useRef<HTMLDivElement | null>(null);

  const [selected, setSelected] = useState<JobPosting | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  // v3.166.0 — "posting freshness" as the honest, measurable stand-in for
  // "how responsive is this company": job_postings prunes anything past 3
  // days regardless of source (v3.194.0, was 7), so every row already on
  // file is a currently open posting — how many of them a company has
  // right now, and how recently the newest one landed, is a real signal
  // AYN already has data for. Never framed as "reply speed" (Browse Jobs
  // applications happen on the company's own site, outside anything AYN
  // can observe).
  const [companyActivity, setCompanyActivity] = useState<{ count: number; mostRecent: string } | null>(null);

  // v3.197.0 — "actively hiring" only ever shown when AYN is actually sure:
  // company_hiring_status() requires real observed turnover over real time
  // (company_hiring_stats, maintained by triggers on job_postings), not a
  // guess from a single listing. Deliberately one-directional — showcase/
  // uncertain/insufficient_data all render nothing at all, since a
  // negative-leaning label on a real, named company is a much bigger trust
  // call than a positive one, and most companies won't have a confident
  // verdict for weeks regardless.
  const [activelyHiring, setActivelyHiring] = useState(false);

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

  // v3.151.0 — "Explore roles": real job titles from the live catalog that
  // already score well against this resume, instead of asking an LLM to
  // invent a list. Fetched once, lazily, the first time the dialog opens;
  // cached in state so reopening it doesn't re-run the sweep.
  const [rolesOpen, setRolesOpen] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [roles, setRoles] = useState<RoleFit[] | null>(null);
  // Distinguishes "you have no profile data yet" from "you have a real
  // profile, nothing in today's postings scored well" -- these are
  // different, both honest, and read very differently to the person.
  const [rolesHasProfile, setRolesHasProfile] = useState(true);
  const [rolesError, setRolesError] = useState(false);

  const openRoleFinder = () => {
    setRolesOpen(true);
    if (roles !== null || rolesLoading) return;
    setRolesLoading(true);
    setRolesError(false);
    resumeHubApi.roleFinder()
      .then((res) => { setRoles(res.roles); setRolesHasProfile(res.has_profile); })
      .catch(() => setRolesError(true))
      .finally(() => setRolesLoading(false));
  };

  const pickRole = (title: string) => {
    setRolesOpen(false);
    setMatchMode(false);
    setLocation(null);
    setRemoteOnly(false);
    setRawQuery(title);
    setQuery(title);
  };

  const hasFilters = !!query || !!location || remoteOnly || !!employmentType || !!seniority || !!category || !!postedWithin;

  /* Debounce the search box so typing doesn't fire a query per keystroke. */
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [rawQuery]);

  // v3.171.0 — found live while looking into why the page "feels slow":
  // these four dataset fetches (location, category/employmentType/
  // seniority/city, title/company) each pull up to 5,000 raw text rows,
  // and all four used to fire unconditionally the instant the page
  // mounted -- before a person ever touched a filter, a search box, or
  // the Trending dialog. That's a real, measurable amount of unnecessary
  // data movement on first load, not a feeling. Each is now lazy: it
  // fetches once, the first time the UI that actually needs it opens, and
  // is cached afterward (the loaded ref guards against a duplicate fetch
  // on every reopen). The location dropdown's own real distinct count is
  // shown in its search placeholder ("Search N locations") whether or not
  // it has loaded yet -- 0 while pending is honest and momentary, the
  // real count replaces it within one round trip.
  const locationsLoadedRef = useRef(false);
  useEffect(() => {
    if (!locOpen || locationsLoadedRef.current) return;
    locationsLoadedRef.current = true;
    let cancelled = false;
    supabase.from("job_postings").select("location").limit(5000).then(({ data }) => {
      if (cancelled || !data) return;
      const set = new Set<string>();
      for (const r of data as { location: string | null }[]) if (r.location) set.add(r.location);
      setLocations(Array.from(set).sort((a, b) => a.localeCompare(b)));
    });
    return () => { cancelled = true; };
  }, [locOpen]);

  /* Job type / seniority / category — real distinct values on file, never
     a hardcoded guess at freehire's own vocabulary. Lazy: loads the first
     time the Filters panel opens, not on mount. */
  const filterOptionsLoadedRef = useRef(false);
  useEffect(() => {
    if (!filtersOpen || filterOptionsLoadedRef.current) return;
    filterOptionsLoadedRef.current = true;
    let cancelled = false;
    Promise.all([
      supabase.from("job_postings").select("category").not("category", "is", null).limit(5000),
      supabase.from("job_postings").select("employment_type").not("employment_type", "is", null).limit(5000),
      supabase.from("job_postings").select("seniority").not("seniority", "is", null).limit(5000),
    ]).then(([cat, et, sen]) => {
      if (cancelled) return;
      const dedupe = (rows: { [k: string]: string | null }[] | null, key: string) => {
        const set = new Set<string>();
        for (const r of rows || []) if (r[key]) set.add(r[key] as string);
        return Array.from(set).sort((a, b) => a.localeCompare(b));
      };
      setCategories(dedupe(cat.data as { category: string | null }[], "category"));
      setEmploymentTypes(dedupe(et.data as { employment_type: string | null }[], "employment_type"));
      setSeniorities(dedupe(sen.data as { seniority: string | null }[], "seniority"));
    });
    return () => { cancelled = true; };
  }, [filtersOpen]);

  /* job_postings.city — freehire's own parsed city, a different, cleaner
     field than the raw `location` text the location filter groups by.
     Only the Trending dialog's city picker needs it, so it loads there,
     not on mount. */
  const citiesLoadedRef = useRef(false);
  useEffect(() => {
    if (!trendingOpen || citiesLoadedRef.current) return;
    citiesLoadedRef.current = true;
    let cancelled = false;
    supabase.from("job_postings").select("city").not("city", "is", null).limit(5000).then(({ data }) => {
      if (cancelled || !data) return;
      const set = new Set<string>();
      for (const r of data as { city: string | null }[]) if (r.city) set.add(r.city);
      setStructuredCities(Array.from(set).sort((a, b) => a.localeCompare(b)));
    });
    return () => { cancelled = true; };
  }, [trendingOpen]);

  /* v3.166.0 — search autocomplete. Real distinct titles/companies already
     on file, same lightweight single-column-read pattern as locations
     above, filtered client side as the person types — no per-keystroke
     query. Lazy: loads on the search box's first focus, not on mount. */
  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const searchOptionsLoadedRef = useRef(false);

  useEffect(() => {
    if (!searchOpen || searchOptionsLoadedRef.current) return;
    searchOptionsLoadedRef.current = true;
    let cancelled = false;
    Promise.all([
      supabase.from("job_postings").select("title").limit(5000),
      supabase.from("job_postings").select("company").limit(5000),
    ]).then(([t, c]) => {
      if (cancelled) return;
      const dedupe = (rows: { [k: string]: string | null }[] | null, key: string) => {
        const set = new Set<string>();
        for (const r of rows || []) if (r[key]) set.add(r[key] as string);
        return Array.from(set);
      };
      setTitleOptions(dedupe(t.data as { title: string | null }[], "title"));
      setCompanyOptions(dedupe(c.data as { company: string | null }[], "company"));
    });
    return () => { cancelled = true; };
  }, [searchOpen]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const searchSuggestions = useMemo(() => {
    const q = rawQuery.trim().toLowerCase();
    if (!q) return [];
    const titles = titleOptions.filter((t) => t.toLowerCase().includes(q)).slice(0, 5).map((v) => ({ v, kind: "title" as const }));
    const companies = companyOptions.filter((c) => c.toLowerCase().includes(q)).slice(0, 3).map((v) => ({ v, kind: "company" as const }));
    return [...titles, ...companies];
  }, [rawQuery, titleOptions, companyOptions]);

  // v3.167.0 — asked directly for a cleaner, more modern feel closer to
  // LinkedIn/Indeed: the ~20 job type/seniority/category/posted-within
  // chips used to sit permanently on screen as one wrapping wall, which
  // read as cluttered rather than clean. Collapsed into a single
  // "Filters" button with an active-count badge that opens a panel — same
  // hand-rolled dropdown pattern as the location box right next to it,
  // not a new primitive. (filtersOpen itself now declared up near locOpen
  // -- see that declaration's own v3.171.0 comment.)
  const filtersBoxRef = useRef<HTMLDivElement | null>(null);
  const activeFilterCount = [employmentType, seniority, category, postedWithin].filter(Boolean).length;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (filtersBoxRef.current && !filtersBoxRef.current.contains(e.target as Node)) setFiltersOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
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

  // v3.199.0 — batched, and only for companies not already known, so
  // paging through a long list never re-fetches a company it already has
  // an answer for.
  useEffect(() => {
    const slugs = Array.from(new Set(jobs.map((j) => j.company_slug).filter((s): s is string => !!s)))
      .filter((s) => !(s in hiringStatusByCompany));
    if (!slugs.length) return;
    let cancelled = false;
    supabase.rpc("company_hiring_status_batch", { p_company_slugs: slugs }).then(({ data }) => {
      if (cancelled || !data) return;
      setHiringStatusByCompany((prev) => {
        const next = { ...prev };
        for (const row of data as Array<{ company_slug: string; status: string | null }>) {
          next[row.company_slug] = row.status ?? "";
        }
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [jobs, hiringStatusByCompany]);

  const scorePage = useCallback((rows: JobPosting[]) => {
    if (!rows.length) return;
    resumeHubApi.jobBoardScore(rows.map((r) => ({ id: r.id, title: r.title, description: r.description, skills: r.skills })))
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

  // The first-page query used to run twice on every visit: once at mount, and again
  // when Profile's desired locations finished loading (null to []), even though they
  // only matter when "Match me" is on. Key on what actually changes the query.
  const desiredKey = matchMode && desiredLocations ? desiredLocations.join("|") : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queryLocations = useMemo(() => (matchMode ? desiredLocations : null), [desiredKey, matchMode]);

  const buildQuery = useCallback((withCount: boolean) => {
    let q = supabase
      .from("job_postings")
      .select(COLS, withCount ? { count: "exact" } : undefined)
      .order("posted_at", { ascending: false })
      // v3.196.0 — the closure checker (job-checker/) flags real scam
      // patterns on the small subset of listings it actually visits;
      // never shown to a seeker once confirmed. Most rows are still
      // unchecked (scam_suspected is null), so this must explicitly keep
      // null alongside false — a bare `.not(...,"eq",true)` would silently
      // drop every unchecked row too, since SQL's three-valued logic
      // treats NOT(NULL = true) as NULL, not TRUE.
      .or("scam_suspected.is.null,scam_suspected.eq.false");
    const term = safeLike(query);
    if (term) q = q.or(`title.ilike.%${term}%,company.ilike.%${term}%`);
    if (matchMode && queryLocations && queryLocations.length > 0) {
      q = q.or(queryLocations.map((l) => `location.ilike.%${safeLike(l)}%`).join(","));
    } else {
      if (location) q = q.eq("location", location);
      if (remoteOnly) q = q.ilike("location", "%remote%");
    }
    if (employmentType) q = q.eq("employment_type", employmentType);
    if (seniority) q = q.eq("seniority", seniority);
    if (category) q = q.eq("category", category);
    if (postedWithin) {
      const cutoff = new Date(Date.now() - Number(postedWithin) * 24 * 60 * 60 * 1000).toISOString();
      q = q.gte("posted_at", cutoff);
    }
    return q;
  }, [query, location, remoteOnly, matchMode, queryLocations, employmentType, seniority, category, postedWithin]);

  // v3.142.0 — the underlying query still sorts by recency (that's what
  // keeps pagination and the total count honest); once a page's quick
  // scores come back, this re-sorts what's already loaded so the strongest
  // overlap with the resume surfaces first. Guarded against a no-op reorder
  // so this can never loop against the score update below.
  // v3.166.0 — no longer gated on matchMode (which only ever meant "also
  // narrow to Profile's desired_locations"). Match-based ranking is now the
  // default state; "Newest" is the explicit opt-out for someone who wants
  // pure recency instead.
  // v3.199.0 — a confirmed "showcase" company's jobs rank a little lower
  // here, never hidden, never anything less than a real "showcase" verdict
  // (see hiringStatusByCompany above).
  const rankScore = useCallback((j: JobPosting) => {
    const base = scores[j.id] ?? -1;
    const showcase = j.company_slug && hiringStatusByCompany[j.company_slug] === "showcase";
    return showcase ? base - SHOWCASE_RANK_PENALTY : base;
  }, [scores, hiringStatusByCompany]);

  useEffect(() => {
    if (newestFirst) return;
    setJobs((prev) => {
      const sorted = [...prev].sort((a, b) => rankScore(b) - rankScore(a));
      const same = sorted.every((j, i) => j.id === prev[i]?.id);
      return same ? prev : sorted;
    });
  }, [scores, newestFirst, rankScore]);

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
      setSwipeIndex(0);
      scorePage(rows);
    });
    return () => { cancelled = true; };
  }, [buildQuery, scorePage, toast]);

  // v3.183.0 — the deck now excludes anything already seen (frozen at the
  // fetch that just landed, see seenSnapshotRef above), so what the deck
  // actually has left to show can run short of what was fetched — a fully
  // already-seen page would otherwise silently starve the deck without
  // ever tripping the old raw-fetch-count trigger below.
  // seenSnapshotReady is read only to force this one recompute once the ref
  // is actually populated (a plain ref mutation doesn't trigger useMemo on
  // its own); the lint rule can't see it's used indirectly via the ref.
  const swipeJobs = useMemo(
    () => (seenSnapshotRef.current ? jobs.filter((j) => !seenSnapshotRef.current!.has(j.id)) : jobs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, seenSnapshotReady],
  );

  // v3.171.0 — keeps the swipe deck feeling like a continuous stream
  // instead of hitting a wall every 25 cards: loads the next page a few
  // cards before the deck actually runs out, same loadMore the list's own
  // "Load more jobs" button already calls.
  // v3.183.0 — checks how many UNSEEN cards are actually left (swipeJobs),
  // not the raw fetched count — a page that came back mostly already-seen
  // needs another load sooner, not later.
  useEffect(() => {
    if (viewMode !== "swipe" || total === null || loadingMore) return;
    if (jobs.length < total && swipeIndex >= swipeJobs.length - 3) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, swipeIndex, jobs.length, swipeJobs.length, total, loadingMore]);

  // v3.145.0 — reported directly: refreshing dropped whatever was open in
  // the detail pane back to the page's first result. Deliberately its own
  // one-shot effect (deps: []) rather than folded into the query effect
  // above: that effect re-runs whenever buildQuery's identity changes
  // (e.g. once desiredLocations finishes loading right after mount for
  // Match me), and a first attempt at merging the two lost this restore to
  // exactly that race — whichever run resolved first "won" and looked
  // like a valid prev selection, discarding the real restore. This runs
  // once, and always wins when it resolves, no merge to race against.
  useEffect(() => {
    const lastId = sessionStorage.getItem(BROWSE_LAST_OPEN_KEY);
    if (!lastId) return;
    let cancelled = false;
    supabase.from("job_postings").select(COLS).eq("id", lastId).maybeSingle().then(({ data }) => {
      if (cancelled || !data) return;
      setSelected(data as unknown as JobPosting);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (selected) sessionStorage.setItem(BROWSE_LAST_OPEN_KEY, selected.id);
    else sessionStorage.removeItem(BROWSE_LAST_OPEN_KEY);
  }, [selected]);

  /* v3.166.0 — posting freshness for the currently open job's company.
     job_postings prunes past 3 days regardless of source (v3.194.0, was 7),
     so every row already on file is a currently open posting -- this is a
     real count of how many that company has right now, not an estimate. */
  useEffect(() => {
    if (!selected) { setCompanyActivity(null); return; }
    let cancelled = false;
    supabase
      .from("job_postings")
      .select("posted_at", { count: "exact" })
      .eq("company", selected.company)
      .order("posted_at", { ascending: false })
      .limit(1)
      .then(({ data, count }) => {
        if (cancelled) return;
        const mostRecent = (data as { posted_at: string }[] | null)?.[0]?.posted_at;
        if (count && mostRecent) setCompanyActivity({ count, mostRecent });
        else setCompanyActivity(null);
      });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    if (!selected?.company_slug) { setActivelyHiring(false); return; }
    let cancelled = false;
    supabase
      .rpc("company_hiring_status", { p_company_slug: selected.company_slug })
      .then(({ data }) => {
        if (!cancelled) setActivelyHiring(data === "active");
      });
    return () => { cancelled = true; };
  }, [selected]);

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
    markSeen(j.id);
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
  // v3.143.0 — "Score and tailor" was navigating even on an already-saved
  // job with nothing new to do — fixed to stay put in that one case.
  // v3.144.0 — that fix overshot: reported directly that clicking "Score
  // and tailor" now saves the job but never takes the person to the one
  // place scoring, tailoring and the cover letter actually happen (this
  // page's own detail pane has neither). Landed on two distinct, honest
  // affordances instead of one shared save path: the row bookmark saves
  // or unsaves and never leaves the list, since that's the point of a
  // bookmark; "Score and tailor" is a real navigation action and always
  // takes the person to the Saved jobs page with this job open, whether
  // it was already saved or just added — that's what the button says it
  // does. `navigate` picks which behavior a given call gets.
  const saveJob = async (job: JobPosting, navigate = false) => {
    setAddingId(job.id);
    try {
      const { data: existing } = await supabase.from("jobs")
        .select("id").eq("user_id", userId).eq("source_url", job.apply_url).maybeSingle();
      if (existing) {
        setSavedUrls((prev) => new Set(prev).add(job.apply_url));
        if (navigate) onAdded((existing as { id: string }).id);
        else toast({ title: "Already saved", description: "Find it on the Saved jobs page whenever you're ready." });
        return;
      }
      const { data, error } = await supabase.from("jobs").insert({
        user_id: userId,
        source: "job_board",
        source_url: job.apply_url,
        jd_text: job.description,
        company: job.company,
        title: job.title,
        location: job.location,
      }).select("id").single();
      if (error) throw error;
      setSavedUrls((prev) => new Set(prev).add(job.apply_url));
      // Saved jobs (JobsTab.tsx) reads this same "jobs" table through its
      // own cached query -- a genuinely new row here would otherwise sit
      // hidden behind that cache until it naturally expired (up to 60s),
      // silently missing from a page whose whole job is showing it.
      queryClient.invalidateQueries({ queryKey: savedJobsQueryKey(userId) });
      if (navigate) {
        toast({ title: "Job added", description: "Scoring and tailoring are ready on the Jobs page." });
        onAdded((data as { id: string }).id);
      } else {
        toast({ title: "Saved", description: "Find it anytime on the Saved jobs page." });
      }
    } catch (e) {
      toast({ title: "Couldn't add that job", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setAddingId(null);
    }
  };

  // v3.144.0 — asked directly: the bookmark only ever saved, clicking it
  // again on an already-saved job just said "already saved" instead of
  // actually undoing it. It's a real toggle now — unsaving here deletes
  // the same row "Remove" on the Saved jobs page deletes, not a separate
  // soft state, so the two surfaces can never disagree about whether a job
  // is saved.
  const unsaveJob = async (job: JobPosting) => {
    setAddingId(job.id);
    try {
      const { error } = await supabase.from("jobs")
        .delete().eq("user_id", userId).eq("source_url", job.apply_url);
      if (error) throw error;
      setSavedUrls((prev) => { const next = new Set(prev); next.delete(job.apply_url); return next; });
      queryClient.invalidateQueries({ queryKey: savedJobsQueryKey(userId) });
      toast({ title: "Removed", description: "Taken off your saved jobs." });
    } catch (e) {
      toast({ title: "Couldn't remove that job", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setAddingId(null);
    }
  };

  const handleAdd = (job: JobPosting) => saveJob(job, true);
  // Stable callbacks for the memoized list rows. The functions above close
  // over per-render state, so the rows call through a ref that is refreshed
  // every render: identity never changes (rows don't re-render on unrelated
  // state), yet a click always runs the latest closure (no stale state).
  const rowActionsRef = useRef({ openJob, saveJob, unsaveJob });
  rowActionsRef.current = { openJob, saveJob, unsaveJob };
  const handleOpenRow = useCallback((job: JobPosting) => rowActionsRef.current.openJob(job), []);
  const handleToggleBookmark = useCallback((job: JobPosting, isSaved: boolean) => {
    if (isSaved) rowActionsRef.current.unsaveJob(job);
    else rowActionsRef.current.saveJob(job);
  }, []);
  const handleLogoError = useCallback(
    (jobId: string) => setLogoFailed((prev) => (prev.has(jobId) ? prev : new Set(prev).add(jobId))),
    [],
  );

  // v3.142.0 — flat while searching (a typed filter beats a category
  // browse every time), grouped by region while just browsing so 1,000+
  // raw strings aren't one undifferentiated alphabetical wall.
  const visibleLocations = useMemo(() => {
    const f = locFilter.trim().toLowerCase();
    if (f) return { flat: locations.filter((l) => l.toLowerCase().includes(f)).slice(0, 120), byRegion: null as ReturnType<typeof groupByRegion> | null };
    return { flat: null as string[] | null, byRegion: groupByRegion(locations) };
  }, [locations, locFilter]);

  const clearFilters = () => {
    setRawQuery("");
    setQuery("");
    setLocation(null);
    setRemoteOnly(false);
    setMatchMode(false);
    setEmploymentType(null);
    setSeniority(null);
    setCategory(null);
    setPostedWithin(null);
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


  const detail = selected && (
    <JobDetailPane
      job={selected}
      score={scores[selected.id]}
      hasScored={scored.has(selected.id)}
      logoFailed={logoFailed.has(selected.id)}
      isAdding={addingId === selected.id}
      activelyHiring={activelyHiring}
      companyActivity={companyActivity}
      onAdd={handleAdd}
      onLogoError={handleLogoError}
    />
  );


  return (
    <div className="space-y-4">
      <BrowseToolbar
        newestFirst={newestFirst}
        onToggleNewest={() => setNewestFirst((v) => !v)}
        onOpenTrending={openTrending}
        onOpenRoles={openRoleFinder}
        matchMode={matchMode}
        onToggleMatchMode={() => (matchMode ? setMatchMode(false) : startMatchMode())}
        desiredLocations={desiredLocations}
        onOpenProfile={onOpenProfile}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-2">
        <SearchBox
          boxRef={searchBoxRef}
          value={rawQuery}
          onType={(v) => { setRawQuery(v); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
          open={searchOpen}
          suggestions={searchSuggestions}
          onPick={(v) => { setRawQuery(v); setQuery(v); setSearchOpen(false); }}
        />

        <LocationPicker
          boxRef={locBoxRef}
          disabled={matchMode}
          location={location}
          open={locOpen}
          onToggle={() => { setLocOpen((v) => !v); setLocFilter(""); }}
          filter={locFilter}
          onFilterChange={setLocFilter}
          totalCount={locations.length}
          visible={visibleLocations}
          onSelect={(loc) => { setLocation(loc); setLocOpen(false); }}
        />

        {/* v3.185.0 — reported directly from a mobile screenshot: Search,
            Location, Remote and Filters stacked as four separate full-width
            rows with no grouping at all. Search and Location genuinely need
            that width (a text field, a dropdown trigger with real label
            text); Remote and Filters are both compact, button-shaped
            toggles, so they now share one row and split it evenly on
            mobile instead of each claiming a full row of their own.
            lg:contents makes this wrapper disappear from layout at the
            desktop breakpoint, so Remote and Filters rejoin the outer row
            exactly as before -- pixel-identical desktop behavior, purely
            additive on mobile. */}
        <div className="flex gap-2 lg:contents">
          <Button
            type="button"
            variant={remoteOnly ? "default" : "outline"}
            onClick={() => setRemoteOnly((v) => !v)}
            disabled={matchMode}
            className={`flex-1 lg:flex-initial shrink-0 ${matchMode ? "opacity-50" : ""}`}
          >
            <Home className="w-4 h-4 mr-1.5" />Remote
          </Button>

          {/* v3.167.0 — the job type/seniority/category/posted-within chips
              used to sit permanently on screen, ~20 of them wrapping across
              two lines — the single biggest thing making this page read as
              cluttered rather than clean. Collapsed into one button with an
              active-count badge; the panel it opens is the exact same
              controls, just out of the way until wanted. Same hand-rolled
              dropdown pattern as the location box, not a new primitive. */}
          <FiltersMenu
            boxRef={filtersBoxRef}
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            activeCount={activeFilterCount}
            postedWithin={postedWithin}
            setPostedWithin={setPostedWithin}
            employmentTypes={employmentTypes}
            employmentType={employmentType}
            setEmploymentType={setEmploymentType}
            seniorities={seniorities}
            seniority={seniority}
            setSeniority={setSeniority}
            categories={categories}
            category={category}
            setCategory={setCategory}
          />
        </div>

        {(hasFilters || matchMode) && (
          <Button type="button" variant="ghost" onClick={clearFilters} className="shrink-0">
            <X className="w-4 h-4 mr-1.5" />Clear
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {loading
          ? "Loading jobs…"
          : total === null
            ? ""
            : hasFilters || matchMode
              ? <><span className="font-semibold text-foreground">{displayCount(total)}</span> job{total === 1 ? "" : "s"} match your search</>
              : <><span className="font-semibold text-foreground">{displayCount(total)}</span> jobs</>}
      </p>

      {/* Split view: list on the left, the full posting on the right */}
      {viewMode === "list" && (
      /* Sept 2026 -- "the card for JD here is small not like job search."
         Job search's own list/detail split gives the detail pane a real
         .9fr/1.6fr ratio (roughly two thirds of the row), matching that
         exactly here instead of the near-even 1fr/1.15fr split this page
         had -- the actual gap the report was about, not a sizing detail
         inside the pane itself. */
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(270px,.9fr)_minmax(0,1.6fr)] gap-4 items-start">
        <div className="space-y-3">
          {loading ? (
            <Card className="divide-y divide-border/60 border-border/60 overflow-hidden p-0 rounded-xl shadow-none hover:shadow-none">
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
            <Card className="p-10 text-center rounded-xl shadow-none hover:shadow-none">
              <p className="text-sm text-muted-foreground">
                {hasFilters ? "No jobs match your search. Try clearing a filter." : "No fresh postings right now, check back soon."}
              </p>
            </Card>
          ) : (
            <>
              {/* Sept 2026 -- "we still see the old design," pointed
                  directly at Job matches next to the already-flattened
                  Job search. Each posting used to be its own individually
                  bordered, rounded, shadowed card (v3.171.0's own real
                  ember-lift treatment) -- the exact bordered-tile look the
                  25 September workspace direction moved away from
                  everywhere else. One shared bordered container now holds
                  every row, each row separated by a plain hairline
                  divider instead of its own box; every badge, pill and
                  action inside a row (score, New, Seen, salary, bookmark,
                  the direct apply link) is untouched, only the row's own
                  outer shape changed. */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--rh-hair)" }}>
                {jobs.map((j) => (
                  <JobListRow
                    key={j.id}
                    job={j}
                    active={selected?.id === j.id}
                    isSaved={savedUrls.has(j.apply_url)}
                    isSeen={seenIds.has(j.id)}
                    isSaving={addingId === j.id}
                    logoFailed={logoFailed.has(j.id)}
                    score={scores[j.id]}
                    hasScored={scored.has(j.id)}
                    onOpen={handleOpenRow}
                    onToggleBookmark={handleToggleBookmark}
                    onLogoError={handleLogoError}
                  />
                ))}
              </div>

              {total !== null && jobs.length < total && (
                <Button variant="outline" className="w-full" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load more jobs"}
                </Button>
              )}
            </>
          )}
        </div>

        {/* Desktop detail pane -- Sept 2026, "copy exactly how the cards
            in job search and mimic the cards layout and the movements."
            top-5/max-h-[calc(100vh-40px)]/overflow-y-auto are Job search's
            own .lp-browser-detail numbers (position:sticky, top:20px,
            max-height:calc(100vh-40px)), not this page's old, unrelated
            top-4/h-[calc(100vh-8rem)]/overflow-hidden -- a hard height
            plus overflow-hidden always left a card exactly one fixed size
            regardless of content, with the visible white box ending well
            short of the viewport whenever a job's own detail content
            didn't fill it; max-height plus overflow-y-auto instead lets a
            short posting's card be its own natural (shorter) height with
            no wasted blank space reserved beneath it, and a long one
            scroll as one continuous piece up to the same cap Job search
            itself uses, exactly the "movement" being asked to match. */}
        <Card className="hidden lg:block border-border/60 overflow-y-auto sticky top-5 max-h-[calc(100vh-40px)] p-0 rounded-xl shadow-none hover:shadow-none">
          {selected
            ? detail
            : <p className="p-10 text-sm text-muted-foreground text-center">Pick a job to read the full posting.</p>}
        </Card>
      </div>
      )}

      {viewMode === "swipe" && (loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--rh-accent)" }} />
        </div>
      ) : (
        <SwipeDeck
          jobs={swipeJobs}
          index={swipeIndex}
          onIndexChange={setSwipeIndex}
          scores={scores}
          scored={scored}
          logoFailed={logoFailed}
          setLogoFailed={setLogoFailed}
          onSave={(job) => saveJob(job)}
          onSeen={markSeen}
          onOpenDetail={(job) => { setViewMode("list"); openJob(job); }}
          hasMore={total !== null && jobs.length < total}
        />
      ))}

      {/* Narrow screens get the same detail as a full height sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 lg:hidden">
          <div className="h-full pt-6">{detail}</div>
        </SheetContent>
      </Sheet>

      <RoleFinderDialog
        open={rolesOpen}
        onOpenChange={setRolesOpen}
        loading={rolesLoading}
        error={rolesError}
        roles={roles}
        hasProfile={rolesHasProfile}
        onRetry={() => { setRoles(null); openRoleFinder(); }}
        onPick={pickRole}
        onOpenProfile={onOpenProfile}
      />

      <TrendingDialog
        open={trendingOpen}
        onOpenChange={setTrendingOpen}
        cities={structuredCities}
        city={trendingCity}
        onPickCity={pickTrendingCity}
        loading={trendingLoading}
        error={trendingError}
        data={trendingData}
        onRetry={() => loadTrending(trendingCity)}
      />
    </div>
  );
}
