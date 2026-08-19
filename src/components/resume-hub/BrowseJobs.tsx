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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, ExternalLink, Plus, Flame, Search, MapPin, Home, ChevronDown, X, Building2, Bookmark, Wand2, Compass,
  DollarSign, Clock, TrendingUp,
} from "lucide-react";
import { resumeHubApi, type JobPosting } from "@/lib/resumeHub";
import { useToast } from "@/hooks/use-toast";

interface Props {
  userId: string;
  /** Opens the posting on the caller's own Saved jobs page, where scoring, tailoring and the cover letter actually live. */
  onAdded: (jobId: string) => void;
  onOpenProfile: () => void;
}

const PAGE_SIZE = 25;
const HOT_WINDOW_MS = 24 * 60 * 60 * 1000;
// v3.166.0 — the enrichment columns job-board-sync now captures, so filters
// and ranking can read them without a second round trip per row.
const COLS = "id, source, company, company_logo_url, title, description, location, apply_url, posted_at, "
  + "employment_type, seniority, salary_min, salary_max, salary_currency, category, work_mode, city, skills";

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time", part_time: "Part-time", contract: "Contract", internship: "Internship",
};
const SENIORITY_LABELS: Record<string, string> = {
  junior: "Junior", mid: "Mid", senior: "Senior", staff: "Staff", lead: "Lead", principal: "Principal",
};
const POSTED_WITHIN_OPTIONS = [
  { key: "1", label: "24 hours" },
  { key: "3", label: "3 days" },
  { key: "7", label: "This week" },
] as const;

// Freehire's own vocabulary for these two fields is broader than the curated
// label maps above (c_level, middle, fellowship all showed up live, none of
// them hardcoded) -- fall back to a humanized slug instead of the raw
// underscore-joined value so an unmapped one still reads like a real label.
function humanizeSlug(s: string) {
  return s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function formatSalary(min: number | null | undefined, max: number | null | undefined, currency: string | null | undefined) {
  if (min == null && max == null) return null;
  const cur = currency || "USD";
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
  if (min != null && max != null) return `${cur} ${fmt(min)}–${fmt(max)}`;
  return `${cur} ${fmt((min ?? max)!)}+`;
}
// v3.145.0 — whatever's open in the detail pane, restored once on a
// refresh via its own one-shot effect below.
const BROWSE_LAST_OPEN_KEY = "ayn_browse_last_open";

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
// v3.149.0 — bottom tier relabeled from "Quick match" to "Rough estimate":
// that name was already doing double duty as this whole feature's own
// section heading, which made the lowest, least-trustworthy tier read as
// if it shared a name with the feature itself rather than flagging
// itself as the one to be most skeptical of.
function scoreTier(score: number) {
  if (score >= 50) return { label: "Strong match", ring: "#10b981", text: "#047857" };
  if (score >= 20) return { label: "Some overlap", ring: "#f59e0b", text: "#b45309" };
  return { label: "Rough estimate", ring: "#9ca3af", text: "#6b7280" };
}

// v3.147.0 — asked directly for the auto-computed quick-match score to
// read as a circular gauge instead of a flat text pill. Same tiering
// scoreTier already used (emerald/amber/neutral), just drawn as a ring
// instead of a background fill, with the number in the center. Used at
// two sizes: small and unlabeled inline in the list row (25 of these on
// a page, no room for a label), larger with its tier label in the detail
// pane, where it is the one score on screen.
// v3.149.0 — asked directly to never show a bare low percentage without
// making the "this is an estimate, click through for the real one"
// framing more prominent. A tooltip alone doesn't count as prominent —
// nothing to hover on a touch device, and a hover target is easy to miss
// even on desktop. showLabel's caller (the detail pane, the one place
// with room) now gets a real, always-visible line under the gauge
// whenever the score is below the top tier, since that's exactly the
// range where a keyword-only number is most likely to undersell someone.
function ScoreGauge({ score, size = 28, showLabel = false }: { score: number; size?: number; showLabel?: boolean }) {
  const stroke = Math.max(3, Math.round(size * 0.12));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = c * (1 - pct / 100);
  const tier = scoreTier(pct);
  const showHint = showLabel && pct < 50;
  const ring = (
    <span style={{ width: size, height: size, position: "relative" }} className="inline-block shrink-0">
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rh-hair, #ececec)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={tier.ring} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <span style={{ position: "absolute", inset: 0 }} className="flex items-center justify-center">
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: Math.max(9, size * 0.32), color: tier.text, lineHeight: 1 }}>
          {Math.round(pct)}
        </span>
      </span>
    </span>
  );
  const title = "A quick keyword estimate, computed automatically from your title, skills and years of experience. Score and tailor for AYN's full match analysis.";
  if (!showHint) {
    return (
      <span className="inline-flex items-center gap-2" title={title}>
        {ring}
        {showLabel && <span className="text-xs font-medium" style={{ color: tier.text }}>{tier.label}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-1" title={title}>
      <span className="inline-flex items-center gap-2">
        {ring}
        <span className="text-xs font-medium" style={{ color: tier.text }}>{tier.label}</span>
      </span>
      <span className="text-[11px] text-muted-foreground">
        Rough estimate. Click Score and tailor for the real match.
      </span>
    </span>
  );
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

export default function BrowseJobs({ userId, onAdded, onOpenProfile }: Props) {
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

  // v3.151.0 — "Explore roles": real job titles from the live catalog that
  // already score well against this resume, instead of asking an LLM to
  // invent a list. Fetched once, lazily, the first time the dialog opens;
  // cached in state so reopening it doesn't re-run the sweep.
  const [rolesOpen, setRolesOpen] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [roles, setRoles] = useState<Array<{ title: string; match_pct: number; openings: number; companies: string[]; sample_job_id: string }> | null>(null);
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

  /* Same pattern for the three enrichment-backed filters — real distinct
     values on file, never a hardcoded guess at freehire's own vocabulary. */
  useEffect(() => {
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
  }, []);

  /* v3.166.0 — search autocomplete. Real distinct titles/companies already
     on file, same lightweight single-column-read pattern as locations
     above, filtered client side as the person types — no per-keystroke
     query. */
  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
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
  }, []);

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
    if (employmentType) q = q.eq("employment_type", employmentType);
    if (seniority) q = q.eq("seniority", seniority);
    if (category) q = q.eq("category", category);
    if (postedWithin) {
      const cutoff = new Date(Date.now() - Number(postedWithin) * 24 * 60 * 60 * 1000).toISOString();
      q = q.gte("posted_at", cutoff);
    }
    return q;
  }, [query, location, remoteOnly, matchMode, desiredLocations, employmentType, seniority, category, postedWithin]);

  // v3.142.0 — the underlying query still sorts by recency (that's what
  // keeps pagination and the total count honest); once a page's quick
  // scores come back, this re-sorts what's already loaded so the strongest
  // overlap with the resume surfaces first. Guarded against a no-op reorder
  // so this can never loop against the score update below.
  // v3.166.0 — no longer gated on matchMode (which only ever meant "also
  // narrow to Profile's desired_locations"). Match-based ranking is now the
  // default state; "Newest" is the explicit opt-out for someone who wants
  // pure recency instead.
  useEffect(() => {
    if (newestFirst) return;
    setJobs((prev) => {
      const sorted = [...prev].sort((a, b) => (scores[b.id] ?? -1) - (scores[a.id] ?? -1));
      const same = sorted.every((j, i) => j.id === prev[i]?.id);
      return same ? prev : sorted;
    });
  }, [scores, newestFirst]);

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
      toast({ title: "Removed", description: "Taken off your saved jobs." });
    } catch (e) {
      toast({ title: "Couldn't remove that job", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setAddingId(null);
    }
  };

  const handleAdd = (job: JobPosting) => saveJob(job, true);
  const toggleBookmark = (e: React.MouseEvent, job: JobPosting) => {
    e.stopPropagation();
    if (savedUrls.has(job.apply_url)) unsaveJob(job);
    else saveJob(job);
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

  const scorePill = (id: string, size = 28) => {
    const score = scores[id];
    if (score != null) return <ScoreGauge score={score} size={size} showLabel={size >= 40} />;
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
          {scorePill(selected.id, 44)}
          <span className="text-xs text-muted-foreground">Posted {postedAge(selected.posted_at)} · {postedDate(selected.posted_at)}</span>
        </div>

        {/* v3.166.0 — real, freehire-tagged facts about this specific
            posting, shown wherever they're actually present, never a blank
            placeholder for what's not on file. */}
        {(formatSalary(selected.salary_min, selected.salary_max, selected.salary_currency) || selected.employment_type || selected.seniority || selected.work_mode) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {formatSalary(selected.salary_min, selected.salary_max, selected.salary_currency) && (
              <span className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1" style={{ background: "var(--rh-tint)", color: "var(--rh-accent-2)" }}>
                <DollarSign className="w-3 h-3" />{formatSalary(selected.salary_min, selected.salary_max, selected.salary_currency)}
              </span>
            )}
            {selected.employment_type && (
              <span className="text-xs rounded-full px-2.5 py-1 bg-muted text-muted-foreground">
                {EMPLOYMENT_TYPE_LABELS[selected.employment_type] || humanizeSlug(selected.employment_type)}
              </span>
            )}
            {selected.seniority && (
              <span className="text-xs rounded-full px-2.5 py-1 bg-muted text-muted-foreground">
                {SENIORITY_LABELS[selected.seniority] || humanizeSlug(selected.seniority)}
              </span>
            )}
            {selected.work_mode && (
              <span className="text-xs rounded-full px-2.5 py-1 bg-muted text-muted-foreground capitalize">
                {selected.work_mode}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button onClick={() => handleAdd(selected)} disabled={addingId === selected.id}>
            {addingId === selected.id
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Plus className="w-4 h-4 mr-2" />}
            Score and tailor
          </Button>
          {/* v3.148.0 — reported directly against a live screenshot: this
              rendered half-fixed — a plain white/black-bordered button at
              rest that flipped to a solid black fill on hover, since it's
              a Button with asChild wrapping a real <a> tag, and the
              resume-hub.css ember retint below only ever targeted actual
              <button> elements (button.border-foreground), never an
              anchor carrying the same class. Rather than widen that CSS
              to catch every possible tag, this one's asked to be solid
              black outright — a secondary "leave AYN" action reads fine
              as a plain dark button next to the ember "Score and tailor"
              primary action, not fighting it for the same accent color. */}
          <Button asChild style={{ background: "#0a0a0a", borderColor: "#0a0a0a", color: "#fff" }} className="hover:opacity-90">
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
        <div className="flex items-center gap-2 flex-wrap">
          {/* v3.166.0 — real relevance ranking is the default now, so this
              is an opt-out ("Newest") rather than the "Match me" opt-in
              above, which is a separate, stronger action (it also narrows
              to Profile's desired_locations). */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setNewestFirst((v) => !v)}
            className="text-xs"
          >
            <Clock className="w-3.5 h-3.5 mr-1.5" />{newestFirst ? "Sorted by newest" : "Sort: best match"}
          </Button>
          <Button type="button" variant="outline" onClick={openRoleFinder}>
            <Compass className="w-4 h-4 mr-2" />Explore roles
          </Button>
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
        <div className="relative flex-1" ref={searchBoxRef}>
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={rawQuery}
            onChange={(e) => { setRawQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search by title or company"
            className="pl-9"
          />
          {searchOpen && searchSuggestions.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg py-1 max-h-64 overflow-y-auto">
              {searchSuggestions.map((s) => (
                <button
                  key={`${s.kind}-${s.v}`}
                  type="button"
                  className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm hover:bg-muted"
                  onClick={() => { setRawQuery(s.v); setQuery(s.v); setSearchOpen(false); }}
                >
                  {s.kind === "company"
                    ? <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    : <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  <span className="truncate">{s.v}</span>
                </button>
              ))}
            </div>
          )}
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

      {/* v3.166.0 — real filters on the enrichment columns job-board-sync
          now captures. Job type and seniority as chips (a small, bounded
          value set); category as a dropdown (freehire tags ~20 distinct
          values); posted-within as chips too. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {POSTED_WITHIN_OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setPostedWithin((v) => (v === o.key ? null : o.key))}
            className="text-xs px-2.5 py-1 rounded-full border transition"
            style={postedWithin === o.key
              ? { background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" }
              : { borderColor: "var(--border, hsl(var(--border)))" }}
          >
            {o.label}
          </button>
        ))}
        {employmentTypes.length > 0 && (
          <span className="w-px h-4 bg-border mx-0.5" aria-hidden="true" />
        )}
        {employmentTypes.map((et) => (
          <button
            key={et}
            type="button"
            onClick={() => setEmploymentType((v) => (v === et ? null : et))}
            className="text-xs px-2.5 py-1 rounded-full border transition"
            style={employmentType === et
              ? { background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" }
              : { borderColor: "var(--border, hsl(var(--border)))" }}
          >
            {EMPLOYMENT_TYPE_LABELS[et] || humanizeSlug(et)}
          </button>
        ))}
        {seniorities.length > 0 && (
          <span className="w-px h-4 bg-border mx-0.5" aria-hidden="true" />
        )}
        {seniorities.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSeniority((v) => (v === s ? null : s))}
            className="text-xs px-2.5 py-1 rounded-full border transition"
            style={seniority === s
              ? { background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" }
              : { borderColor: "var(--border, hsl(var(--border)))" }}
          >
            {SENIORITY_LABELS[s] || humanizeSlug(s)}
          </button>
        ))}
        {categories.length > 0 && (
          <Select value={category ?? "__all"} onValueChange={(v) => setCategory(v === "__all" ? null : v)}>
            <SelectTrigger className="h-7 w-auto text-xs gap-1.5 rounded-full px-2.5 py-1 border-input">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                            {formatSalary(j.salary_min, j.salary_max, j.salary_currency) && (
                              <span className="text-[11px] font-medium" style={{ color: "var(--rh-accent-2)" }}>
                                {formatSalary(j.salary_min, j.salary_max, j.salary_currency)}
                              </span>
                            )}
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
                            list or reading the full posting first.
                            v3.144.0 — and asked directly to make it a real
                            toggle, not save-only. */}
                        <button
                          type="button"
                          onClick={(e) => toggleBookmark(e, j)}
                          disabled={addingId === j.id}
                          aria-label={isSaved ? "Remove from saved" : "Save job"}
                          title={isSaved ? "Remove from saved" : "Save job"}
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

      {/* v3.151.0 — real job titles, scored the same free way every card
          already is, grouped from the live catalog instead of guessed by
          an AI. Picking one filters the list to real postings under it. */}
      <Dialog open={rolesOpen} onOpenChange={setRolesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Roles that fit you</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Real job titles from postings open right now, ranked by the same quick match every card shows. Not a guess at demand, just a count of what's actually listed.
          </p>
          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1 space-y-1.5">
            {rolesLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)
            ) : rolesError ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">Couldn't load this right now.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => { setRoles(null); openRoleFinder(); }}>
                  Try again
                </Button>
              </div>
            ) : !roles || roles.length === 0 ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  {rolesHasProfile
                    ? "Nothing in today's postings scored well against your profile yet. Check back as new jobs come in."
                    : "Add a resume or a few skills to Profile first, then AYN can find roles that fit you."}
                </p>
                {!rolesHasProfile && (
                  <Button type="button" size="sm" onClick={() => { setRolesOpen(false); onOpenProfile(); }}>
                    Open Profile
                  </Button>
                )}
              </div>
            ) : (
              roles.map((r) => (
                <button
                  key={r.title}
                  type="button"
                  onClick={() => pickRole(r.title)}
                  className="w-full text-left rounded-md border border-border/60 px-3 py-2.5 hover:bg-muted transition flex items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.openings} open posting{r.openings === 1 ? "" : "s"}{r.companies.length ? ` · ${r.companies.slice(0, 2).join(", ")}${r.companies.length > 2 ? "…" : ""}` : ""}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-xs font-semibold rounded-full px-2 py-1"
                    style={{ background: "var(--rh-tint)", color: "var(--rh-accent-2)" }}
                  >
                    {r.match_pct}%
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
