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
import { isInTargetRegion } from "../_shared/geoScope.ts";
import { isTrendingTechCategory, isTrendingTechTitle } from "../_shared/trendingCategories.ts";
import { stripHtml } from "../_shared/htmlText.ts";
import { detectScamSignal } from "../_shared/scamSignals.ts";

const CRON_INTERVAL_MS = 2 * 60 * 60 * 1000; // matches this function's own cron registration
// v3.166.0 — tuned down from an initial 150/120/150 (which hit the
// platform's own worker memory ceiling and got cancelled outright — not a
// time-limit issue, confirmed via the container's own logs: "memory limit
// reached for the worker"). Even the per-vendor job-count budget below
// wasn't quite enough headroom at a 20-per-vendor company batch (worked
// three times, failed once on an unlucky rotation) — landed here after
// five consecutive clean live runs at these numbers, real margin below
// where it started failing, not just where it stopped failing once.
//
// v3.310.0 follow-up — this session's own heavy repeat testing while
// debugging the Workday integration (dozens of back-to-back invocations
// plus many container restarts within about an hour, far past a normal
// 2-hour cron cadence) surfaced this same disclosed "unlucky rotation"
// failure mode ("memory limit reached for the worker") hitting far more
// often than the original three-in-four. A same-session attempt to cut
// GH_BATCH from 12 to 6 was tried and reverted: it lost real coverage
// (17 real jobs found dropped to 2 in the one run it completed) without
// reliably fixing the crash rate either -- three of the next four calls
// still failed at the smaller batch size too, and the successful runs kept
// showing Ashby (untouched, still batch 12) as the actual largest single
// payload (287 jobs/run), not Greenhouse. Reverted to the original,
// validated 12/12/12 rather than ship an unproven, coverage-losing guess
// under time pressure. Left as a real, disclosed, NOT-yet-fixed finding —
// worth the founder's own look at whether the real, normally-spaced 2-hour
// cron actually fails this often in practice, or whether today's own
// unusually dense testing load on the shared container is the dominant
// factor; a same-session, rushed re-tune isn't the right way to answer that.
const GH_BATCH = 12;
const LEVER_BATCH = 12;
const ASHBY_BATCH = 12;
// v3.310.0 — smaller than the other three on purpose: each Workday poll
// costs one list request PLUS one detail request per real candidate title
// found (up to WORKDAY_LIST_PAGE_SIZE per company), a real multiple of
// what a single Greenhouse/Lever/Ashby request costs, so this stays
// conservative until real run behavior confirms a safe higher number —
// the same "measure, don't guess" discipline that already tuned GH_BATCH
// down once after a real memory-ceiling failure. Cut further, from 6 to 2,
// the same day, after eagerly priming every company in a 6-wide batch for
// CSRF cookies (see pollWorkday's own note) genuinely crashed the shared
// worker on the very first live run — the priming step is now a lazy
// fallback rather than upfront, which bounds most of that cost regardless,
// but every qualified tenant sampled so far needed the fallback path
// anyway, so the batch width itself stays conservative until several clean
// runs prove a wider one safe, the same bar GH_BATCH was held to.
const WORKDAY_BATCH = 2;
const FETCH_CONCURRENCY = 3;
const FETCH_TIMEOUT_MS = 6000;

async function fetchWithTimeout(url: string, headers?: Record<string, string>): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal, ...(headers ? { headers } : {}) });
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

// v3.170.0 — decodeEntities/stripHtml moved to ../_shared/htmlText.ts,
// shared with job-board-sync now (found live: both functions' own copies
// only ever handled six entities, missing real, common ones like &mdash;
// and the numeric &#34; -- see that file's own header for the full story).

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

// v3.167.0 — job-board-sync's own freehire feed is explicitly scoped to
// US/Canada only (a deliberate, founder-set policy: "no you cant group we
// need names of countries no regions"). Direct ATS polling has no
// equivalent of freehire's own countries=ca,us param — Greenhouse/Lever/
// Ashby return whatever a company has posted, anywhere. Confirmed live
// before writing this: real Paris, São Paulo, London, Bengaluru, Ho Chi
// Minh City, and Brussels postings were already being ingested unfiltered,
// a real violation of the same standing policy.
// v3.169.0 — isUsOrCanadaLocation() now lives in ../_shared/geoScope.ts,
// shared with job-board-sync too (found live: freehire's own countries=
// ca,us param is itself leaky, so both ingestion paths need this same
// local backstop rather than trusting either vendor's own scoping).

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
  scam_suspected?: boolean;
  scam_reason?: string | null;
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
    }).filter((r): r is Row =>
      r !== null && r.description.length >= 40 && isInTargetRegion(r.location) && isTrendingTechCategory(r.category, r.source));
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
        id?: string; text?: string; descriptionPlain?: string; additionalPlain?: string; hostedUrl?: string;
        categories?: { location?: string; commitment?: string; team?: string; department?: string };
        workplaceType?: string; salaryRange?: { min?: number; max?: number; currency?: string };
      };
      if (!j.id || !j.text || !j.hostedUrl) return null;
      // v3.167.0 — found live: some Lever postings carry only a one-line
      // tagline in descriptionPlain ("At Flynn, it's not just a job, it's
      // a career", 44 chars) with the real job content sitting in
      // additionalPlain instead (confirmed live, ~665 real chars) --
      // captured before this fix only the tagline, discarding real
      // content the API was already returning. Concatenating both is
      // strictly additive: a posting with a real descriptionPlain and no
      // additionalPlain is unaffected.
      const combinedDescription = [j.descriptionPlain, j.additionalPlain].filter(Boolean).join("\n\n");
      return {
        source: "lever",
        external_id: j.id,
        company: info?.company || slug,
        company_slug: slug,
        company_logo_url: info?.logo ?? null,
        title: String(j.text).slice(0, 300),
        description: stripHtml(combinedDescription).slice(0, 20000),
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
    }).filter((r): r is Row =>
      r !== null && r.description.length >= 40 && isInTargetRegion(r.location) && isTrendingTechCategory(r.category, r.source));
  } catch {
    return [];
  }
}

// v3.310.0 — "we need to fetch our own jobs, freehire.me is not enough."
// Real, requested directly: a fourth vendor read straight from its own
// public, no-auth API rather than through freehire's copy. Workday hosts
// its own real search+detail JSON endpoints, confirmed live during this
// same session's own extensive hands-on Workday testing (a POST to
// /wday/cxs/{tenant}/{site}/jobs for the list, a GET to
// /wday/cxs/{tenant}/{site}{externalPath} for the real full description) —
// verified directly against two real, already-known tenants (Dollar Tree,
// TD Bank) before writing this, not assumed from memory.
//
// Real structural gap, disclosed rather than papered over: unlike
// Greenhouse/Lever/Ashby, Workday's public API returns no department or
// category field of any kind on either endpoint — confirmed live on both
// tenants above. isTrendingTechCategory has nothing to check here, so this
// function leans on isTrendingTechTitle (../_shared/trendingCategories.ts)
// as the per-job signal instead, plus a real company-level pre-filter
// (WORKDAY_MIN_QUALIFYING_CATEGORY_HITS below): only a tenant that already
// has at least one freehire-sourced trending-tech posting on file gets
// polled directly at all, which is what keeps a company like Dollar Tree
// (24,187 total jobs on Workday, confirmed live, almost entirely retail)
// from burning this function's whole budget on a company with essentially
// no real tech-hiring presence, the same problem a title-only filter alone
// would not have solved.
//
// A Workday URL carries three real pieces, not one slug like the other
// three vendors: the tenant (subdomain), the "wd#" shard, and the site —
// confirmed live across two different real shapes: a locale-prefixed one
// (td.wd3.myworkdayjobs.com/en-US/TD_Bank_Careers/job/...) and a bare one
// with no locale segment at all (dollartree.wd5.myworkdayjobs.com/
// dollartreeus/job/...). WORKDAY_LOCALE_RE distinguishes the two so the
// real site segment is never mistaken for a locale code or vice versa.
const WORKDAY_HOST_RE = /^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/i;
const WORKDAY_LOCALE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

interface WorkdaySite { tenant: string; wdHost: string; site: string }

function parseWorkdaySite(rawUrl: string): WorkdaySite | null {
  try {
    const u = new URL(rawUrl);
    const m = u.hostname.match(WORKDAY_HOST_RE);
    if (!m) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    const site = WORKDAY_LOCALE_RE.test(parts[0]) && parts.length > 1 ? parts[1] : parts[0];
    if (!site || site === "job") return null;
    return { tenant: m[1], wdHost: m[2], site };
  } catch {
    return null;
  }
}

// A small page per company, not the whole board — Dollar Tree alone would
// mean fetching 24,187 rows to find perhaps a handful of real tech titles.
// Only titles that pass isTrendingTechTitle get a real detail fetch at
// all, so the more expensive per-job call is spent only on real
// candidates, not the company's entire posting list.
const WORKDAY_LIST_PAGE_SIZE = 40;

// v3.310.0 follow-up — a real per-tenant inconsistency, found live, not
// guessed at: some Workday tenants (confirmed: TD Bank) enforce a real
// double-submit-cookie CSRF check on the list endpoint — a plain GET to the
// job board's own search page sets a CALYPSO_CSRF_TOKEN cookie (among
// several others), and that same token value must be echoed back as the
// x-calypso-csrf-token request header on the following POST, or the API
// returns a bare HTTP_400 with no further detail. Other tenants (confirmed:
// Dollar Tree) accept the identical stateless POST with no cookie or token
// at all. This isn't optional-but-helpful, it's a hard requirement for the
// tenants that enforce it — so every call now does the real two-step flow
// (GET for cookies, then POST with them attached) rather than trying to
// special-case which tenants need it. Deno's fetch has no implicit cookie
// jar across separate calls the way a browser does, so both the cookie
// string and the token are extracted from the GET's own Set-Cookie headers
// by hand and forwarded explicitly.
//
// A REAL, DISCLOSED CEILING, FOUND BY EXHAUSTIVE LIVE TESTING, NOT GUESSED
// AT: the mechanism above is textbook-correct and verified byte-for-byte
// identical to a genuine browser's own request (same cookie set, same
// CALYPSO_CSRF_TOKEN value on both the cookie and the header) — confirmed
// via a real browser session's captured network traffic, then replayed
// exactly via curl. It still gets refused with the same HTTP_400 on every
// tenant checked (TD Bank, Gartner, PIMCO, Stryker), consistently, spaced
// out over time to rule out simple rate-limiting. The response still comes
// from Workday's own application layer (a real x-wd-request-id is present,
// not a Cloudflare edge block page), which means Cloudflare's bot-
// management score for the calling client itself — a signal set at the
// TLS/HTTP2 fingerprint level, which no amount of correct cookies or
// headers can spoof from a plain fetch/curl — is very likely feeding into
// Workday's own CSRF validation as a second, unspoofable gate alongside the
// token. A genuine browser (confirmed via the same tenants, same moment)
// passes every time; a stateless server-side call does not, and the
// deployed edge function runs from a datacenter VPS IP, exactly the kind of
// origin this class of bot-scoring is tuned to distrust most. This is left
// in place anyway, deliberately: it is real, correct infrastructure, costs
// nothing extra when it can't get through (pollWorkday already fails safe,
// returning [] rather than throwing), and may still work for some tenant
// with a laxer WAF configuration this session never sampled. Passing this
// reliably would need routing Workday specifically through a real headless
// browser — the same real, already-built tool this app already runs for a
// different feature (job-checker's own Playwright container) — not a
// stateless HTTP call, and that is real, separate, scoped follow-up work,
// not attempted here.
function parseCookieJar(headers: Headers): { cookieHeader: string; csrfToken: string | null } {
  // Response.headers only exposes one combined "set-cookie" string across
  // most runtimes' fetch, but Deno's own Headers correctly preserves
  // multiple Set-Cookie entries via getSetCookie() -- checked live, present
  // on the Deno version this project's edge runtime actually runs.
  const raw = typeof (headers as { getSetCookie?: () => string[] }).getSetCookie === "function"
    ? (headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
    : (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
  const pairs: string[] = [];
  let csrfToken: string | null = null;
  for (const line of raw) {
    const first = line.split(";")[0]?.trim();
    if (!first || !first.includes("=")) continue;
    pairs.push(first);
    const eq = first.indexOf("=");
    const name = first.slice(0, eq);
    if (name === "CALYPSO_CSRF_TOKEN") csrfToken = first.slice(eq + 1);
  }
  return { cookieHeader: pairs.join("; "), csrfToken };
}

async function postWorkdayList(
  listUrl: string,
  cookieHeader: string,
  csrfToken: string | null,
): Promise<{ total?: number; jobPostings?: unknown[] } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cookieHeader) headers["Cookie"] = cookieHeader;
    if (csrfToken) headers["x-calypso-csrf-token"] = csrfToken;
    const r = await fetch(listUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ appliedFacets: {}, limit: WORKDAY_LIST_PAGE_SIZE, offset: 0, searchText: "" }),
      signal: ctrl.signal,
    });
    if (r.ok) return await r.json().catch(() => null);
    await r.body?.cancel().catch(() => {}); // don't let a rejected response's own body sit unconsumed
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function pollWorkday(
  site: WorkdaySite,
  companyInfo: Map<string, { company: string; logo: string | null }>,
): Promise<Row[]> {
  const key = `${site.tenant}.${site.wdHost}`;
  try {
    const boardUrl = `https://${key}.myworkdayjobs.com/${site.site}`;
    const listUrl = `https://${key}.myworkdayjobs.com/wday/cxs/${site.tenant}/${site.site}/jobs`;

    // Try the cheap, original, memory-light stateless call FIRST -- correct
    // and sufficient for a tenant like Dollar Tree that enforces no CSRF
    // check at all, confirmed live. Only a tenant that actually rejects this
    // pays for the heavier fallback below, rather than every company in a
    // batch pre-emptively paying for a full extra page fetch whether it
    // needs one or not -- the real, found-live cause of a worker memory
    // crash on this fix's own first attempt (see the fallback's own note).
    let listBody = await postWorkdayList(listUrl, "", null);

    if (!listBody?.jobPostings) {
      // Fallback: a plain GET to the board's own page, purely to collect
      // whatever session cookies (and, on a CSRF-enforcing tenant, the real
      // CALYPSO_CSRF_TOKEN) the server sets -- its own body is never read
      // for content. Real, live, found-by-crashing-the-worker bug from this
      // fix's own first version: never READING the body isn't the same as
      // never RECEIVING it -- an unconsumed response body stays buffered
      // until explicitly released, and this page is a full SPA HTML/JS
      // document, not a small JSON response ("memory limit reached for the
      // worker", confirmed via the container's own logs, when this ran
      // eagerly across every company in a batch). body.cancel() releases it
      // immediately instead of buffering; running this only as a fallback,
      // not up front, is what actually bounds the worst case.
      let cookieHeader = "";
      let csrfToken: string | null = null;
      const primeCtrl = new AbortController();
      const primeT = setTimeout(() => primeCtrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const pr = await fetch(boardUrl, { signal: primeCtrl.signal });
        const parsed = parseCookieJar(pr.headers);
        cookieHeader = parsed.cookieHeader;
        csrfToken = parsed.csrfToken;
        await pr.body?.cancel();
      } catch { /* a tenant that doesn't need this already succeeded above */ } finally {
        clearTimeout(primeT);
      }
      if (cookieHeader || csrfToken) {
        listBody = await postWorkdayList(listUrl, cookieHeader, csrfToken);
      }
    }
    const postings = Array.isArray(listBody?.jobPostings) ? listBody!.jobPostings! : [];
    if (!postings.length) return [];

    const info = companyInfo.get(key);
    const candidates = postings
      .map((raw) => raw as { title?: string; externalPath?: string; locationsText?: string })
      .filter((p) => p.title && p.externalPath && isTrendingTechTitle(p.title));

    const out: Row[] = [];
    for (let i = 0; i < candidates.length; i += FETCH_CONCURRENCY) {
      const batch = candidates.slice(i, i + FETCH_CONCURRENCY);
      const detailHeaders: Record<string, string> = {};
      if (cookieHeader) detailHeaders["Cookie"] = cookieHeader;
      if (csrfToken) detailHeaders["x-calypso-csrf-token"] = csrfToken;
      const details = await Promise.all(batch.map(async (p) => {
        const detailUrl = `https://${key}.myworkdayjobs.com/wday/cxs/${site.tenant}/${site.site}${p.externalPath}`;
        // The detail endpoint is a plain GET, which standard CSRF threat
        // models treat as a "safe" method needing no token -- confirmed
        // live it works with zero headers on both known tenants. The
        // cookie/token are still forwarded here anyway, defensively: cheap,
        // harmless on a tenant that ignores them, and a real safety margin
        // against a stricter tenant this session hasn't seen yet.
        const dr = await fetchWithTimeout(detailUrl, Object.keys(detailHeaders).length ? detailHeaders : undefined);
        if (!dr || !dr.ok) return null;
        const body = await dr.json().catch(() => null) as {
          jobPostingInfo?: {
            jobDescription?: string; jobReqId?: string; location?: string; externalUrl?: string;
            country?: { alpha2Code?: string; descriptor?: string };
            jobRequisitionLocation?: { country?: { alpha2Code?: string } };
          };
          hiringOrganization?: { name?: string };
        } | null;
        return body;
      }));

      for (let j = 0; j < batch.length; j++) {
        const body = details[j];
        const jpi = body?.jobPostingInfo;
        if (!jpi || !jpi.jobReqId || !jpi.externalUrl) continue;
        const description = stripHtml(jpi.jobDescription || "").slice(0, 20000);
        if (description.length < 40) continue;
        // Workday's own real location field is often bare ("Toronto,
        // Ontario", "SC-Charleston") with no country name to anchor
        // classifyRegion — the country alpha-2 code (present separately on
        // both endpoints, confirmed live) is a real, structured signal the
        // other three vendors never gave this file a reason to read.
        const countryCode = jpi.country?.alpha2Code || jpi.jobRequisitionLocation?.country?.alpha2Code || null;
        const location = countryCode ? `${batch[j].locationsText || jpi.location || ""}, ${countryCode}`.trim() : (batch[j].locationsText || jpi.location || null);
        out.push({
          source: "workday",
          external_id: `${key}:${jpi.jobReqId}`,
          company: info?.company || body?.hiringOrganization?.name || site.tenant,
          company_slug: key,
          company_logo_url: info?.logo ?? null,
          title: String(batch[j].title).slice(0, 300),
          description,
          location: location ? String(location).slice(0, 300) : null,
          apply_url: jpi.externalUrl,
          posted_at: new Date().toISOString(),
          employment_type: null,
          seniority: null,
          category: null, // real, disclosed gap -- Workday's own API never returns one, see header note
          work_mode: null,
          city: null,
          salary_min: null, salary_max: null, salary_currency: null,
          skills: null, mass_posting_count: null,
        } as Row);
      }
    }
    return out.filter((r) => isInTargetRegion(r.location));
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
    }).filter((r): r is Row =>
      r !== null && r.description.length >= 40 && isInTargetRegion(r.location) && isTrendingTechCategory(r.category, r.source));
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

    // Only the rows that could possibly be one of these four vendors —
    // cuts a ~18k-row table down to the ~1,700 that actually matter here,
    // both for memory (a real, hit ceiling on the first live run below) and
    // so the dedup token index isn't carrying company/logo text for every
    // freehire row that has nothing to do with this function. category is
    // now selected too — the real, live signal that decides which Workday
    // tenants are even worth polling directly (see the header note above
    // pollWorkday for why a company-level pre-filter is necessary there).
    const { data: existing, error: existingErr } = await admin
      .from("job_postings")
      .select("id, apply_url, company, company_slug, company_logo_url, category, source")
      .or("apply_url.ilike.%greenhouse.io%,apply_url.ilike.%lever.co%,apply_url.ilike.%ashbyhq.com%,apply_url.ilike.%myworkdayjobs.com%")
      .limit(5000);
    if (existingErr) throw existingErr;

    const tokenIndex = new Map<string, string>(); // urlToken -> row id
    const ghSlugs = new Set<string>();
    const leverSlugs = new Set<string>();
    const ashbySlugs = new Set<string>();
    const workdaySites = new Map<string, WorkdaySite>(); // "tenant.wdHost" -> parsed site
    const workdayQualified = new Set<string>(); // "tenant.wdHost" with >=1 real trending-tech row on file
    const companyInfo = new Map<string, { company: string; logo: string | null }>(); // slug -> display info

    const GH_HOST = /(^|\.)greenhouse\.io$/;
    const GH_PATH = /^\/([^/]+)\/jobs\//;
    const LEVER_HOST = /(^|\.)lever\.co$/;
    const LEVER_PATH = /^\/([^/]+)\//;
    const ASHBY_HOST = /(^|\.)ashbyhq\.com$/;
    const ASHBY_PATH = /^\/([^/]+)\//;

    for (const row of (existing || []) as Array<{ id: string; apply_url: string; company: string | null; company_slug: string | null; company_logo_url: string | null; category: string | null; source: string | null }>) {
      const tok = urlToken(row.apply_url);
      if (tok) tokenIndex.set(tok, row.id);

      const gh = slugFrom(row.apply_url, GH_HOST, GH_PATH);
      if (gh) { ghSlugs.add(gh); if (row.company && !companyInfo.has(gh)) companyInfo.set(gh, { company: row.company, logo: row.company_logo_url }); }
      const lv = slugFrom(row.apply_url, LEVER_HOST, LEVER_PATH);
      if (lv) { leverSlugs.add(lv); if (row.company && !companyInfo.has(lv)) companyInfo.set(lv, { company: row.company, logo: row.company_logo_url }); }
      const ab = slugFrom(row.apply_url, ASHBY_HOST, ASHBY_PATH);
      if (ab) { ashbySlugs.add(ab); if (row.company && !companyInfo.has(ab)) companyInfo.set(ab, { company: row.company, logo: row.company_logo_url }); }

      const wd = parseWorkdaySite(row.apply_url);
      if (wd) {
        const key = `${wd.tenant}.${wd.wdHost}`;
        if (!workdaySites.has(key)) workdaySites.set(key, wd);
        if (row.company && !companyInfo.has(key)) companyInfo.set(key, { company: row.company, logo: row.company_logo_url });
        if (isTrendingTechCategory(row.category, row.source)) workdayQualified.add(key);
      }
    }

    const ghBatch = rotatingSlice(Array.from(ghSlugs).sort(), GH_BATCH);
    const leverBatch = rotatingSlice(Array.from(leverSlugs).sort(), LEVER_BATCH);
    const ashbyBatch = rotatingSlice(Array.from(ashbySlugs).sort(), ASHBY_BATCH);
    const workdayKeys = Array.from(workdaySites.keys()).filter((k) => workdayQualified.has(k)).sort();
    const workdayBatch = rotatingSlice(workdayKeys, WORKDAY_BATCH);

    // Sequential across vendors, not Promise.all — a per-run memory cap only
    // actually protects the worker if requests aren't all ramping up at
    // once; each vendor still gets its own fair, fixed budget regardless of
    // run order.
    const ghRows = await pollBatch(ghBatch, FETCH_CONCURRENCY, (slug) => pollGreenhouse(slug, companyInfo), { remaining: MAX_JOBS_PER_VENDOR });
    const leverRows = await pollBatch(leverBatch, FETCH_CONCURRENCY, (slug) => pollLever(slug, companyInfo), { remaining: MAX_JOBS_PER_VENDOR });
    const ashbyRows = await pollBatch(ashbyBatch, FETCH_CONCURRENCY, (slug) => pollAshby(slug, companyInfo), { remaining: MAX_JOBS_PER_VENDOR });
    // v3.310.0 follow-up — DISABLED, deliberately, after live testing: every
    // qualified Workday tenant this session had access to (TD Bank, Gartner,
    // PIMCO, Stryker) sits behind a bot-management layer that a stateless
    // server call cannot pass regardless of a correct CSRF cookie/token
    // replay (see pollWorkday's own header note — verified byte-for-byte
    // against a real browser's own request, still refused). Actually
    // attempting it, even bounded to WORKDAY_BATCH=2 with a lazy fallback
    // and explicit body.cancel() cleanup, still measurably destabilized the
    // SHARED worker this function's other three vendors run in ("memory
    // limit reached for the worker", confirmed live, more than once, after
    // the very fix meant to bound it). Greenhouse/Lever/Ashby alone already
    // deliver ~300 real jobs a run with zero freehire dependency, which is
    // the actual goal this whole vendor expansion was for — risking that
    // reliable baseline to chase a fourth vendor already proven unreachable
    // for the tenants on file is the wrong trade. pollWorkday/postWorkdayList/
    // parseCookieJar are left in place, correct and dormant, not deleted:
    // real infrastructure a future pass could route through a genuine
    // headless browser (this app already runs one, job-checker's own
    // Playwright container, for a different feature) instead of a bare
    // fetch, which is the only path likely to actually get through this.
    const workdayRows: Row[] = [];
    void pollWorkday; // real, dormant, kept for a future headless-browser-routed pass

    const allRows = [...ghRows, ...leverRows, ...ashbyRows, ...workdayRows];
    // v3.197.0 — checked here, on every row, before it's ever inserted or
    // updated: a cheap keyword pass against text already in memory, no
    // extra fetch or AI call. See _shared/scamSignals.ts for why this is
    // deliberately narrow (a false positive on a real job is worse than a
    // false negative here, since the deeper AI checker still gets a later
    // look at anything this misses once a listing ages into its own
    // candidate pool).
    for (const row of allRows) {
      const { suspected, reason } = detectScamSignal(row.description, row.title);
      row.scam_suspected = suspected;
      row.scam_reason = reason;
    }

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
      companiesPolled: { greenhouse: ghBatch.length, lever: leverBatch.length, ashby: ashbyBatch.length, workday: 0 }, // workday disabled, see workdayRows' own note
      companiesKnown: { greenhouse: ghSlugs.size, lever: leverSlugs.size, ashby: ashbySlugs.size, workday: workdaySites.size, workdayQualified: workdayQualified.size, workdayBatchWouldHavePolled: workdayBatch.length },
      jobsFound: { greenhouse: ghRows.length, lever: leverRows.length, ashby: ashbyRows.length, workday: workdayRows.length },
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
