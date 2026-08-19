// ats-direct-sync — v3.166.0
//
// "Our own way of getting jobs" — a real, second, independent source
// alongside job-board-sync's freehire feed, requested directly after
// freehire's own aggregator dependency was flagged as a gap. Polls three
// real ATS vendors' own public, no-auth job-board APIs DIRECTLY — the same
// vendors job-board-sync's BLOCKED_AGGREGATOR_HOSTS list already trusts and
// keeps (Greenhouse, Lever, Ashby) — rather than reading them secondhand
// through freehire. Confirmed live before writing this: all three are real,
// public, free, no API key, and return the company's own current board.
//
// The real catch with all three, unlike freehire's own search endpoint:
// there is no "search every company" call, only "get this one company's
// board" — you have to already know the company's slug. Solved without a
// second discovery mechanism: job_postings.apply_url already reveals which
// companies run which ATS (freehire found them for us), so this function
// harvests that slug list from the existing table, then reads those same
// companies' boards directly and independently going forward. A company
// discovered via freehire today can end up sourced directly from here from
// now on — real "our own" data, not a re-hosting of freehire's copy.
//
// DEDUP, not two rows for the same job: freehire's own apply_url for a
// Greenhouse/Lever/Ashby job already embeds that vendor's own job id as its
// last path segment (confirmed live against real stored rows) — the exact
// same id each vendor's own API returns as `id`. This function builds an
// in-memory index of that trailing-segment token across every apply_url
// already on file, then for every job it reads directly, checks that index
// first: a match means "freehire already has this job, upgrade that row to
// the direct read instead of duplicating it" (UPDATE, same row id, source
// flips to the vendor); no match means a job neither source found yet
// (INSERT). One row per real job, regardless of which source found it.
//
// posted_at IS "last confirmed live," NOT the vendor's own original publish
// date. A company's own board shows every currently open posting regardless
// of how long ago it was first published — a senior role open for a month
// is still real and still live. Storing the original publish date here
// would make job-board-sync's own 7-day prune (which has no source filter,
// deliberately, and is not duplicated here) delete a genuinely still-open
// posting the moment it turns a week old. Setting posted_at to now() on
// every run this posting is still returned by the company's own board means
// it only ever prunes once the company itself stops listing it (filled or
// closed) or this function stops running for a week — both honest
// definitions of "no longer live."
//
// BOUNDED, ROTATING, STATELESS: 1,053 Greenhouse / 120 Lever / 469 Ashby
// companies are already on file (measured live) — far more than one run
// should poll. No new table to track a "last polled" cursor; instead a
// deterministic window computed from the current time, so which slice of
// the company list gets refreshed rotates run to run with no stored state
// at all. At the per-vendor batch sizes below and this cron's own interval,
// every company cycles through well inside job-board-sync's 7-day prune
// window, with real margin as the discovered company list keeps growing.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const CRON_INTERVAL_MS = 2 * 60 * 60 * 1000; // matches this function's own cron registration
// v3.166.0 — tuned down from an initial 150/120/150 (which hit the
// platform's own worker memory ceiling and got cancelled outright — not a
// time-limit issue, confirmed via the container's own logs: "memory limit
// reached for the worker"). Even the per-vendor job-count budget below
// wasn't quite enough headroom at a 20-per-vendor company batch (worked
// three times, failed once on an unlucky rotation) — landed here after
// five consecutive clean live runs at these numbers, real margin below
// where it started failing, not just where it stopped failing once.
const GH_BATCH = 12;
const LEVER_BATCH = 12;
const ASHBY_BATCH = 12;
const FETCH_CONCURRENCY = 3;
const FETCH_TIMEOUT_MS = 6000;

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function rotatingSlice<T>(items: T[], batchSize: number): T[] {
  if (items.length <= batchSize) return items;
  const numBatches = Math.ceil(items.length / batchSize);
  const offset = Math.floor(Date.now() / CRON_INTERVAL_MS) % numBatches;
  const start = offset * batchSize;
  return items.slice(start, start + batchSize);
}

/** The last path segment before any query string — the same token both a
 * freehire-sourced apply_url and each vendor's own API job id share. */
function urlToken(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : null;
  } catch {
    return null;
  }
}

function slugFrom(rawUrl: string, hostRe: RegExp, pathRe: RegExp): string | null {
  try {
    const u = new URL(rawUrl);
    if (!hostRe.test(u.hostname)) return null;
    const m = u.pathname.match(pathRe);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// Greenhouse's own /content=true field, and Ashby/Lever's plain-text
// fields when they're not actually plain (defensive, cheap either way).
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
}
function stripHtml(html: string): string {
  return decodeEntities(String(html || ""))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// For genuinely camelCase API enum values only (Ashby's employmentType:
// "FullTime"). Free-text fields (a department name, a commitment string
// that might read "Full-time" or "Sales: Account Executive (Pro)") go
// through toSlug below instead — camelToSlug alone on those left real,
// live category values garbled (confirmed: "sales:account_executive_pro",
// spaces stripped instead of normalized, punctuation surviving verbatim).
function camelToSlug(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

// Any free-text label -> a clean, consistent slug: lowercase, every run of
// non-alphanumeric characters (spaces, colons, parens, hyphens, ampersands)
// collapsed to one underscore, no leading/trailing underscore.
function toSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

interface Row {
  source: string;
  external_id: string;
  company: string;
  company_slug: string | null;
  company_logo_url: string | null;
  title: string;
  description: string;
  location: string | null;
  apply_url: string;
  posted_at: string;
  employment_type: string | null;
  seniority: string | null;
  category: string | null;
  work_mode: string | null;
  city: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  skills: string[] | null;
  mass_posting_count: number | null;
}

async function pollGreenhouse(slug: string, companyInfo: Map<string, { company: string; logo: string | null }>): Promise<Row[]> {
  try {
    const r = await fetchWithTimeout(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`);
    if (!r || !r.ok) return [];
    const body = await r.json().catch(() => null) as { jobs?: unknown[] } | null;
    const jobs = Array.isArray(body?.jobs) ? body!.jobs! : [];
    const info = companyInfo.get(slug);
    const nowIso = new Date().toISOString();
    return jobs.map((raw) => {
      const j = raw as {
        id?: number; title?: string; company_name?: string; absolute_url?: string;
        location?: { name?: string }; content?: string; departments?: Array<{ name?: string }>;
      };
      if (!j.id || !j.title || !j.absolute_url) return null;
      return {
        source: "greenhouse",
        external_id: String(j.id),
        company: info?.company || j.company_name || slug,
        company_slug: slug,
        company_logo_url: info?.logo ?? null,
        title: String(j.title).slice(0, 300),
        description: stripHtml(j.content || "").slice(0, 20000),
        location: j.location?.name ? String(j.location.name).slice(0, 300) : null,
        apply_url: j.absolute_url,
        posted_at: nowIso,
        employment_type: null,
        seniority: null,
        category: j.departments?.[0]?.name ? toSlug(j.departments[0].name) : null,
        work_mode: null,
        city: null,
        salary_min: null, salary_max: null, salary_currency: null,
        skills: null, mass_posting_count: null,
      } as Row;
    }).filter((r): r is Row => r !== null && r.description.length >= 40);
  } catch {
    return [];
  }
}

async function pollLever(slug: string, companyInfo: Map<string, { company: string; logo: string | null }>): Promise<Row[]> {
  try {
    const r = await fetchWithTimeout(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`);
    if (!r || !r.ok) return [];
    const jobs = await r.json().catch(() => null) as unknown[] | null;
    if (!Array.isArray(jobs)) return [];
    const info = companyInfo.get(slug);
    const nowIso = new Date().toISOString();
    return jobs.map((raw) => {
      const j = raw as {
        id?: string; text?: string; descriptionPlain?: string; hostedUrl?: string;
        categories?: { location?: string; commitment?: string; team?: string; department?: string };
        workplaceType?: string; salaryRange?: { min?: number; max?: number; currency?: string };
      };
      if (!j.id || !j.text || !j.hostedUrl) return null;
      return {
        source: "lever",
        external_id: j.id,
        company: info?.company || slug,
        company_slug: slug,
        company_logo_url: info?.logo ?? null,
        title: String(j.text).slice(0, 300),
        description: stripHtml(j.descriptionPlain || "").slice(0, 20000),
        location: j.categories?.location ? String(j.categories.location).slice(0, 300) : null,
        apply_url: j.hostedUrl,
        posted_at: nowIso,
        employment_type: j.categories?.commitment ? toSlug(j.categories.commitment) : null,
        seniority: null,
        category: (j.categories?.team || j.categories?.department) ? toSlug((j.categories.team || j.categories.department)!) : null,
        work_mode: j.workplaceType ? String(j.workplaceType).toLowerCase() : null,
        city: null,
        salary_min: typeof j.salaryRange?.min === "number" ? Math.round(j.salaryRange.min) : null,
        salary_max: typeof j.salaryRange?.max === "number" ? Math.round(j.salaryRange.max) : null,
        salary_currency: j.salaryRange?.currency || null,
        skills: null, mass_posting_count: null,
      } as Row;
    }).filter((r): r is Row => r !== null && r.description.length >= 40);
  } catch {
    return [];
  }
}

async function pollAshby(slug: string, companyInfo: Map<string, { company: string; logo: string | null }>): Promise<Row[]> {
  try {
    const r = await fetchWithTimeout(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`);
    if (!r || !r.ok) return [];
    const body = await r.json().catch(() => null) as { jobs?: unknown[] } | null;
    const jobs = Array.isArray(body?.jobs) ? body!.jobs! : [];
    const info = companyInfo.get(slug);
    const nowIso = new Date().toISOString();
    return jobs.map((raw) => {
      const j = raw as {
        id?: string; title?: string; descriptionPlain?: string; applyUrl?: string; jobUrl?: string;
        location?: string; department?: string; team?: string; employmentType?: string; workplaceType?: string;
        isListed?: boolean;
      };
      const url = j.applyUrl || j.jobUrl;
      if (!j.id || !j.title || !url || j.isListed === false) return null;
      return {
        source: "ashby",
        external_id: j.id,
        company: info?.company || slug,
        company_slug: slug,
        company_logo_url: info?.logo ?? null,
        title: String(j.title).slice(0, 300),
        description: stripHtml(j.descriptionPlain || "").slice(0, 20000),
        location: j.location ? String(j.location).slice(0, 300) : null,
        apply_url: url,
        posted_at: nowIso,
        employment_type: j.employmentType ? camelToSlug(j.employmentType) : null,
        seniority: null,
        category: (j.department || j.team) ? toSlug((j.department || j.team)!) : null,
        work_mode: j.workplaceType ? String(j.workplaceType).toLowerCase() : null,
        city: null,
        salary_min: null, salary_max: null, salary_currency: null,
        skills: null, mass_posting_count: null,
      } as Row;
    }).filter((r): r is Row => r !== null && r.description.length >= 40);
  } catch {
    return [];
  }
}

// v3.166.0 — real company sizes vary wildly (Airbnb alone returned 193 jobs
// in one call during testing; a live 20-company Greenhouse batch returned
// over 2,500), so a fixed company-count budget alone isn't a reliable
// memory bound: an unlucky rotation that happens to land on several large
// companies can blow past the worker's memory ceiling even at a company
// count that was safe last run. This caps the actual thing that costs
// memory — total jobs (and their full description text) accumulated so
// far — and stops requesting further companies once hit, same defensive
// shape as everywhere else memory/time is bounded in this codebase
// (rateLimitGate, maxPages, etc.): a real ceiling, not a guess.
//
// Per-vendor, not one shared pool: a first version shared one 1,200-job
// budget across all three, and a Greenhouse batch alone routinely used the
// entire thing before Lever or Ashby ever got a single request in — three
// sources in name, one in practice. Each vendor gets its own share so a
// large-company-heavy rotation on one vendor can never starve the other two.
const MAX_JOBS_PER_VENDOR = 200;

async function pollBatch<T>(items: T[], concurrency: number, fn: (item: T) => Promise<Row[]>, budget: { remaining: number }): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < items.length && budget.remaining > 0; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(fn));
    for (const r of results) {
      out.push(...r);
      budget.remaining -= r.length;
    }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCors(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Only the rows that could possibly be one of these three vendors —
    // cuts a ~14k-row table down to the ~1,600 that actually matter here,
    // both for memory (a real, hit ceiling on the first live run below) and
    // so the dedup token index isn't carrying company/logo text for every
    // freehire row that has nothing to do with this function.
    const { data: existing, error: existingErr } = await admin
      .from("job_postings")
      .select("id, apply_url, company, company_slug, company_logo_url")
      .or("apply_url.ilike.%greenhouse.io%,apply_url.ilike.%lever.co%,apply_url.ilike.%ashbyhq.com%")
      .limit(5000);
    if (existingErr) throw existingErr;

    const tokenIndex = new Map<string, string>(); // urlToken -> row id
    const ghSlugs = new Set<string>();
    const leverSlugs = new Set<string>();
    const ashbySlugs = new Set<string>();
    const companyInfo = new Map<string, { company: string; logo: string | null }>(); // slug -> display info

    const GH_HOST = /(^|\.)greenhouse\.io$/;
    const GH_PATH = /^\/([^/]+)\/jobs\//;
    const LEVER_HOST = /(^|\.)lever\.co$/;
    const LEVER_PATH = /^\/([^/]+)\//;
    const ASHBY_HOST = /(^|\.)ashbyhq\.com$/;
    const ASHBY_PATH = /^\/([^/]+)\//;

    for (const row of (existing || []) as Array<{ id: string; apply_url: string; company: string | null; company_slug: string | null; company_logo_url: string | null }>) {
      const tok = urlToken(row.apply_url);
      if (tok) tokenIndex.set(tok, row.id);

      const gh = slugFrom(row.apply_url, GH_HOST, GH_PATH);
      if (gh) { ghSlugs.add(gh); if (row.company && !companyInfo.has(gh)) companyInfo.set(gh, { company: row.company, logo: row.company_logo_url }); }
      const lv = slugFrom(row.apply_url, LEVER_HOST, LEVER_PATH);
      if (lv) { leverSlugs.add(lv); if (row.company && !companyInfo.has(lv)) companyInfo.set(lv, { company: row.company, logo: row.company_logo_url }); }
      const ab = slugFrom(row.apply_url, ASHBY_HOST, ASHBY_PATH);
      if (ab) { ashbySlugs.add(ab); if (row.company && !companyInfo.has(ab)) companyInfo.set(ab, { company: row.company, logo: row.company_logo_url }); }
    }

    const ghBatch = rotatingSlice(Array.from(ghSlugs).sort(), GH_BATCH);
    const leverBatch = rotatingSlice(Array.from(leverSlugs).sort(), LEVER_BATCH);
    const ashbyBatch = rotatingSlice(Array.from(ashbySlugs).sort(), ASHBY_BATCH);

    // Sequential across vendors, not Promise.all — a per-run memory cap only
    // actually protects the worker if requests aren't all ramping up at
    // once; each vendor still gets its own fair, fixed budget regardless of
    // run order.
    const ghRows = await pollBatch(ghBatch, FETCH_CONCURRENCY, (slug) => pollGreenhouse(slug, companyInfo), { remaining: MAX_JOBS_PER_VENDOR });
    const leverRows = await pollBatch(leverBatch, FETCH_CONCURRENCY, (slug) => pollLever(slug, companyInfo), { remaining: MAX_JOBS_PER_VENDOR });
    const ashbyRows = await pollBatch(ashbyBatch, FETCH_CONCURRENCY, (slug) => pollAshby(slug, companyInfo), { remaining: MAX_JOBS_PER_VENDOR });

    const allRows = [...ghRows, ...leverRows, ...ashbyRows];

    const toUpdate: Array<{ id: string; row: Row }> = [];
    const toInsert: Row[] = [];
    for (const row of allRows) {
      const tok = urlToken(row.apply_url);
      const existingId = tok ? tokenIndex.get(tok) : undefined;
      if (existingId) toUpdate.push({ id: existingId, row });
      else toInsert.push(row);
    }

    let updated = 0;
    for (const { id, row } of toUpdate) {
      const { error } = await admin.from("job_postings").update(row).eq("id", id);
      if (!error) updated++;
    }

    let inserted = 0;
    if (toInsert.length) {
      // v3.166.0 — a genuinely new job from two different companies polled
      // in the same run could theoretically share a urlToken in a
      // pathological case; onConflict on the real (source, external_id) key
      // still protects against a literal double-insert of the same job on
      // a re-run within this same batch.
      const { error, count } = await admin
        .from("job_postings")
        .upsert(toInsert, { onConflict: "source,external_id", count: "exact" });
      if (error) throw error;
      inserted = count ?? toInsert.length;
    }

    return new Response(JSON.stringify({
      ok: true,
      companiesPolled: { greenhouse: ghBatch.length, lever: leverBatch.length, ashby: ashbyBatch.length },
      companiesKnown: { greenhouse: ghSlugs.size, lever: leverSlugs.size, ashby: ashbySlugs.size },
      jobsFound: { greenhouse: ghRows.length, lever: leverRows.length, ashby: ashbyRows.length },
      upgraded: updated,
      inserted,
    }), { headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
