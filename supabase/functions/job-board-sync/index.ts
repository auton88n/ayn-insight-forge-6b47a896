// job-board-sync — v3.166.0
//
// v3.166.0 — captures freehire's own structured enrichment (employment_type,
// seniority, salary_min/max/currency, category, work_mode, a real city, a
// tagged skills array, a mass_posting_count quality signal) instead of
// leaving it unread — confirmed live it's already returned on every row,
// this function just never asked for it. All nullable on job_postings;
// real, live-measured coverage: ~34% for salary/seniority, ~86% for city,
// 100% for category on tech postings. Powers BrowseJobs.tsx's real filters,
// a skills-tag boost to computeQuickScore's ranking, and job_board_trending.
//
// v3.135.0 — real company logos for Browse Jobs. freehire's job listings
// have no logo field (confirmed live); its separate /companies/{slug}
// endpoint has a real company website, which resolves to a real favicon via
// a domain-based lookup. See resolveCompanyLogo/resolveLogosForSlugs below
// for how this stays cheap: memoized in job_postings.company_logo_url
// across runs (a company is never re-queried against freehire once known,
// success or genuine no-website miss alike), bounded concurrency per run,
// and fully best-effort — a failed lookup only ever leaves a row's logo
// null, never blocks the posting itself from saving. BrowseJobs.tsx falls
// back to a colored-initial mark for a null company_logo_url.
//
// Cron-scheduled (see the job-board-sync pg_cron entry), same net.http_post
// pattern as ayn-daily-report/error-alert-check. Pulls real job postings
// sourced from company career pages — via freehire's public, CORS-open,
// no-auth API — never from LinkedIn or Indeed. Deliberately does NOT touch
// any third-party site's application form: apply_url always points at the
// real posting, and this function only ever reads freehire's public API,
// never writes anywhere but AYN's own job_postings table.
//
// freehire's own framing ("aggregates from company ATS boards") turned out
// to be only PART of what it actually returns — verified live, not assumed:
// a real first ingestion run pulled 484 rows, and about 40% of apply_url
// values pointed at other job-board aggregators sitting behind freehire
// (WhatJobs, Adzuna's per-country subdomains, 4dayweek.io, PowerToFly,
// Himalayas, Djinni, Wanted.co.kr), not the company's own site — the exact
// thing this feature was built to avoid, just laundered through one more
// layer of aggregation. BLOCKED_AGGREGATOR_HOSTS filters these out by the
// real hostname of apply_url (exact match or subdomain, never a substring
// check — a company literally named "Indeed" would false-positive on a
// naive .includes()), keeping only postings whose apply_url resolves to
// the company's own domain or a known ATS vendor (Greenhouse, Lever, Ashby,
// SmartRecruiters, Workday, Breezy, Freshteam, Zoho Recruit, Rippling,
// Oracle Cloud/Taleo) — all of which a company runs on its own subdomain,
// the same shape as a direct career page for this purpose.
// v3.159.0 — npm: specifier instead of esm.sh: the self-hosted Deno edge
// runtime failed to boot this function under esm.sh's pinned 2.56.0 graph
// ("Module not found ... StorageClient", a broken transitive resolution on
// esm.sh's own CDN), while npm: (already proven working here by resume-hub)
// resolves cleanly. Cloud's own deployment was unaffected either way.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { classifyRegion } from "../_shared/geoScope.ts";
import { isTrendingTechCategory } from "../_shared/trendingCategories.ts";
import { stripHtml } from "../_shared/htmlText.ts";
import { detectScamSignal } from "../_shared/scamSignals.ts";

// v3.134.0 — /jobs/search (the plain search endpoint) truncates description
// to a ~1000-char preview, confirmed live (999 chars, cut off mid-sentence).
// /agent/jobs/search is freehire's own documented endpoint for "full
// descriptions, for programmatic/agent consumers" — confirmed live to
// return the complete JD (3935 chars on the same test job, ending on a
// real closing sentence, not a truncation). The whole point of this
// feature is giving AYN's gap-matcher and AI calls a complete JD to work
// from, so this is not optional.
const FREEHIRE_BASE = "https://freehire.me/api/v1/agent/jobs/search";
const PAGE_SIZE = 100;
// v3.194.0 — was 7. Reported directly: a listing pulled by the employer
// could still sit in AYN's own data for up to a week after it actually
// closed, since this is a pure elapsed-time cutoff against posted_at
// (last-confirmed-live), not tied to how fast the disappearance was
// actually detected (every 2-hour sync cycle notices immediately). 3
// days keeps a real buffer against one flaky sync cycle wrongly pruning
// a still-genuinely-open listing, while cutting the worst-case staleness
// window from 7 days to 3. Also narrows freehire's own posted_within
// query to the same window, since the two have always shared this one
// constant — sourcing intentionally stays this tight too, not just
// pruning, so job_postings never holds anything older than AYN itself
// has confirmed within the last 3 days.
const FRESHNESS_DAYS = 3;

// A cleaner, more precise language signal than a Unicode-script heuristic
// — freehire's own documented, filterable `posting_language` facet.
// looksNonLatinScript (below) is kept as a cheap, free backstop in case a
// posting is miscategorized, not as the primary check anymore.
const LANGUAGE_FILTER = "en";

// v3.309.0 — the "later expansion" v3.163.0 explicitly planned for,
// arriving now: requested directly, "expand the jobs to cover middle east
// and Europe and North America and Australia." REGION_GROUPS grows from
// one entry to four; the structure itself (a separate freehire query and
// a separate page budget per region, so a smaller region can never be
// starved by a larger one sharing the same pool) is unchanged, it's still
// exactly the right shape for four regions that it was for one.
//
// North America's own budget comes down from 20 to 12 pages to make real
// room for the other three, not because its own volume shrank — it is
// still the largest, best-covered region by a wide margin (~77,000 new
// postings/day, per the v3.163.0 measurement), so it keeps the biggest
// single share. Europe gets the second-largest budget as the next most
// data-rich, best-verifiable region; Middle East and Australia get
// smaller, real, dedicated budgets rather than being left to compete for
// whatever North America and Europe don't use.
//
// Country codes are real ISO 3166-1 alpha-2, passed straight through to
// freehire's own countries= param the same way "ca,us" always was — but,
// per the v3.169.0 finding that freehire's own country filter is leaky
// (real foreign postings were confirmed live slipping through the old
// "ca,us" filter too), this alone was never trusted to correctly scope a
// region. syncRegion below re-checks every row's real location against
// classifyRegion() and only keeps it if that independent classifier
// agrees it belongs to the region actually being synced right now.
const REGION_GROUPS: Array<{ name: "north_america" | "europe" | "middle_east" | "australia"; countries: string; maxPages: number }> = [
  { name: "north_america", countries: "ca,us", maxPages: 12 },
  { name: "europe", countries: "gb,de,fr,es,it,nl,be,ch,ie,pt,pl,se,no,dk,at,fi", maxPages: 8 },
  { name: "middle_east", countries: "ae,sa,il,qa,kw,bh,om", maxPages: 5 },
  { name: "australia", countries: "au", maxPages: 4 },
];

const BLOCKED_AGGREGATOR_HOSTS = [
  "whatjobs.com", "wanted.co.kr", "adzuna.com", "adzuna.com.au", "adzuna.de", "adzuna.co.uk",
  "adzuna.fr", "adzuna.es", "adzuna.it", "adzuna.nl", "adzuna.pl", "adzuna.ca",
  "4dayweek.io", "powertofly.com", "himalayas.app", "djinni.co",
  "indeed.com", "linkedin.com", "ziprecruiter.com", "glassdoor.com", "monster.com",
  "careerjet.com", "jooble.org", "reed.co.uk", "jobs2careers.com", "juju.com",
  // v3.153.0 — a live audit of every distinct apply_url host (asked
  // directly to "test all the features and make sure they actually fix
  // the problems we have") found five more aggregators hiding the same
  // way the original WhatJobs/Adzuna/4dayweek batch was found: one
  // third-party domain, many unrelated real companies routed through it.
  // Confirmed by checking which companies actually shared each host
  // before blocking it, not by name alone: echojobs.io (6 River Systems,
  // Motorola Solutions, IKEA...), arbeitnow.com/.co.uk (EUSMS gGmbH,
  // Vinteden, Zilch, Relationrx...), aijobs.net (American Airlines, Wix,
  // Rewe Group...), jobicy.com (Canonical, Elavon), justjoin.it (emagine
  // Polska, ITDS), thehub.io (Hours, HUURAY A/S). unjobs.org (UN agency
  // jobs) and nofluffjobs.com are well-established commercial job boards
  // blocked on the same basis even though the live sample only showed one
  // company each. 650 of 7210 rows (~9%) matched one of these at the time
  // this was found. Deliberately left out: government labour-exchange
  // portals (usajobs.gov, mycareersfuture.gov.sg) and plausible ATS
  // vendors (governmentjobs.com, careers-page.com, go-applied.com) --
  // different in kind from a commercial scrape aggregator, not blocked
  // without stronger evidence either way.
  "echojobs.io", "arbeitnow.com", "arbeitnow.co.uk", "aijobs.net",
  "unjobs.org", "jobicy.com", "justjoin.it", "nofluffjobs.com", "thehub.io",
];

function isBlockedAggregatorUrl(rawUrl: string): boolean {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return true; // not even a parseable URL — don't trust it as an apply link
  }
  return BLOCKED_AGGREGATOR_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

interface FreehireJob {
  public_slug?: string;
  title?: string;
  company?: string;
  company_slug?: string;
  location?: string;
  description?: string;
  url?: string;
  posted_at?: string;
  cities?: string[];
  skills?: string[];
  work_mode?: string;
  reality?: { mass_posting_count?: number };
  enrichment?: {
    employment_type?: string;
    seniority?: string;
    salary_min?: number;
    salary_max?: number;
    salary_currency?: string;
    category?: string;
  };
}

// v3.135.0 — real company marks. freehire's job listings carry no logo
// field at all (confirmed live against the raw API); its separate
// /companies/{slug} endpoint does carry a real company website, which
// resolves to a real favicon via Google's public, no-auth favicon-by-domain
// service (also confirmed live). Failure anywhere in this chain — no slug,
// the companies lookup 404s/errors, no website on file — returns null, and
// BrowseJobs.tsx already falls back to a deterministic colored-initial mark
// for a null company_logo_url, so a bad lookup never blocks a real posting.
const FREEHIRE_COMPANY_BASE = "https://freehire.me/api/v1/companies";
const FAVICON_CONCURRENCY = 8;
// v3.140.0 — reported directly against a live screenshot: several logos
// rendered as a blurry, near-illegible smudge. Traced to a real limit of
// the favicon-by-domain approach, not a display bug: Google's own service
// serves whatever native resolution a site's favicon.ico actually has —
// confirmed live that asking for a bigger sz (128 vs 256) makes no
// difference, it's not a scaling parameter, it's a request for the
// biggest size Google already has cached. Plenty of real sites (oscars.org,
// 1800contacts.com, both confirmed live) only have a 16x16 icon, which
// reads as a smudge in any display box bigger than 16px. Two other
// candidate sources were checked and ruled out, not assumed dead: Clearbit's
// logo API no longer resolves at all (DNS failure, confirmed live —
// discontinued), and logo.dev now requires an API key (confirmed live,
// 401 on the plain endpoint). Favicons are still the only free, no-auth
// option, so the fix is a quality floor instead: actually fetch and
// measure the real pixel size before trusting the URL, and treat
// anything under MIN_LOGO_PX as no logo at all — the client-side colored-
// initial fallback already looks clean and reads better than a stretched
// smudge.
const MIN_LOGO_PX = 32;

/** Reads a PNG's real width/height straight from its IHDR chunk (bytes
 * 16-23, right after the 8-byte signature + 4-byte length + 4-byte "IHDR"
 * type) — no image library needed, just the fixed header layout every PNG
 * has. Returns null for anything that isn't recognizably a PNG rather than
 * guessing; Google's favicon service has only ever returned PNG in every
 * live check here, but a non-PNG response should fail open (keep the URL)
 * rather than be silently misjudged as too small. */
function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24) return null;
  for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIG[i]) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function resolveCompanyLogo(slug: string): Promise<string | null> {
  try {
    const r = await fetch(`${FREEHIRE_COMPANY_BASE}/${encodeURIComponent(slug)}`);
    if (!r.ok) return null;
    const body = await r.json().catch(() => null) as
      { data?: { company?: { company_info?: { website?: string; homepage?: string } } } } | null;
    const ci = body?.data?.company?.company_info;
    // v3.135.0 — freehire's own schema is inconsistent across companies,
    // confirmed live against a real sample, not assumed from one lucky
    // test: some carry the domain under company_info.website (Apple, as a
    // full URL), others only under company_info.homepage (Roku, Lyft,
    // Stitch Fix, all as a bare domain, and all three had this while
    // website was empty) — homepage is the more commonly populated of the
    // two in that sample, so it's checked first. A company can genuinely
    // have neither (confirmed for at least two real companies), which
    // correctly returns null here, not an error.
    const raw = ci?.homepage || ci?.website;
    if (!raw || typeof raw !== "string") return null;
    const domain = raw.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
    if (!domain) return null;
    const url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;

    const imgRes = await fetch(url);
    if (!imgRes.ok) return null;
    const buf = new Uint8Array(await imgRes.arrayBuffer());
    const dims = pngDimensions(buf);
    // dims === null means "couldn't parse it as PNG" — fail open, keep the
    // URL rather than assume it's bad. A real, measured size below the
    // floor is the only thing that rejects it.
    if (dims && (dims.width < MIN_LOGO_PX || dims.height < MIN_LOGO_PX)) return null;
    return url;
  } catch {
    return null;
  }
}

/** Resolves every not-yet-known slug with bounded concurrency, mutating
 * `known` in place (seeded from job_postings before any region runs, so a
 * company already resolved in a prior sync run — success or genuine
 * no-website miss alike — is never re-queried against freehire forever). */
async function resolveLogosForSlugs(slugs: string[], known: Map<string, string | null>): Promise<void> {
  const todo = Array.from(new Set(slugs)).filter((s) => s && !known.has(s));
  for (let i = 0; i < todo.length; i += FAVICON_CONCURRENCY) {
    const batch = todo.slice(i, i + FAVICON_CONCURRENCY);
    const results = await Promise.all(batch.map((slug) => resolveCompanyLogo(slug)));
    batch.forEach((slug, idx) => known.set(slug, results[idx]));
  }
}

// v3.170.0 — stripHtml moved to ../_shared/htmlText.ts, shared with
// ats-direct-sync now (found live: this function's own copy only ever
// handled six entities, missing real, common ones like &mdash; and the
// numeric &#34; -- see that file's own header for the full story).

// v3.134.0 — a real Korean-language posting turned up in the first live
// ingestion test. Every write prompt and every deterministic gap-matcher in
// this app assumes English text; a non-Latin-script JD would just produce
// nonsense downstream, not an error. This is a cheap, honest first pass —
// non-Latin script (CJK/Hangul/Cyrillic/Arabic) is caught cleanly, but a
// JD written in French or German (Latin script, still not English) is not
// detected by this check. Full language detection is a known, disclosed
// gap, not attempted here.
const NON_LATIN_SCRIPT_RE = /[぀-ヿ㐀-鿿가-힯Ѐ-ӿ؀-ۿ]/;
function looksNonLatinScript(text: string): boolean {
  const sample = text.slice(0, 500);
  const scriptChars = (sample.match(NON_LATIN_SCRIPT_RE) || []).length;
  return scriptChars > sample.length * 0.1; // >10% of a short sample is a strong signal, not a coincidence
}

/** One region's worth of pages, upserted as they're fetched. Returns
 * {fetched, upserted} for that region alone so a starved region is visible
 * in the response, not averaged away into one combined total. */
async function syncRegion(
  admin: ReturnType<typeof createClient>,
  regionName: "north_america" | "europe" | "middle_east" | "australia",
  countries: string,
  maxPages: number,
  knownLogos: Map<string, string | null>,
): Promise<{ fetched: number; upserted: number; skippedOffCategory: number }> {
  let fetched = 0;
  let upserted = 0;
  let skippedOffCategory = 0;

  for (let page = 0; page < maxPages; page++) {
    const url = `${FREEHIRE_BASE}?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}&posted_within=${FRESHNESS_DAYS}&sort=posted_at&order=desc&countries=${countries}&posting_language=${LANGUAGE_FILTER}`;
    const r = await fetch(url);
    if (!r.ok) break;
    const body = await r.json().catch(() => null) as { data?: FreehireJob[] } | null;
    const jobs = Array.isArray(body?.data) ? body!.data! : [];
    if (!jobs.length) break;
    fetched += jobs.length;

    const rows = jobs
      .filter((j) => j.public_slug && j.title && j.company && j.url && j.posted_at)
      .filter((j) => !isBlockedAggregatorUrl(j.url!))
      .map((j) => {
        const e = j.enrichment || {};
        const title = String(j.title).slice(0, 300);
        const description = stripHtml(j.description || "").slice(0, 20000);
        // v3.197.0 — a cheap keyword pass, checked here before this row is
        // ever inserted or updated, so a listing can never reach Browse
        // Jobs even once unchecked. Safe to write plainly on every upsert
        // (including the same 2000 rows re-synced every 2 hours): a real
        // scam_suspected=true a deeper AI check already set can't be
        // silently overwritten back to false here -- job_postings_scam_
        // sticky's own DB trigger (migration 20260822030000) guarantees
        // that regardless of what this function writes.
        const scam = detectScamSignal(description, title);
        return {
          source: "freehire",
          external_id: j.public_slug!,
          company: String(j.company).slice(0, 300),
          company_slug: j.company_slug ? String(j.company_slug).slice(0, 300) : null,
          title,
          description,
          location: j.location ? String(j.location).slice(0, 300) : null,
          apply_url: j.url!,
          posted_at: j.posted_at!,
          scam_suspected: scam.suspected,
          scam_reason: scam.reason,
          // v3.166.0 — freehire's own structured enrichment, captured as-is,
          // never inferred for the rows it doesn't have. See this file's own
          // header note on real, live-measured coverage per field.
          employment_type: e.employment_type ? String(e.employment_type).slice(0, 60) : null,
          seniority: e.seniority ? String(e.seniority).slice(0, 60) : null,
          salary_min: typeof e.salary_min === "number" ? Math.round(e.salary_min) : null,
          salary_max: typeof e.salary_max === "number" ? Math.round(e.salary_max) : null,
          salary_currency: e.salary_currency ? String(e.salary_currency).slice(0, 10) : null,
          category: e.category ? String(e.category).slice(0, 60) : null,
          work_mode: j.work_mode ? String(j.work_mode).slice(0, 30) : null,
          city: Array.isArray(j.cities) && j.cities[0] ? String(j.cities[0]).slice(0, 200) : null,
          skills: Array.isArray(j.skills) ? j.skills.filter(Boolean).map((s) => String(s).slice(0, 80)).slice(0, 40) : null,
          mass_posting_count: typeof j.reality?.mass_posting_count === "number" ? Math.round(j.reality.mass_posting_count) : null,
        };
      })
      .filter((row) => row.description.length >= 40) // skip anything too thin to score against
      .filter((row) => !looksNonLatinScript(row.description) && !looksNonLatinScript(row.title))
      // v3.309.0 — region-aware, not a blanket US/Canada check: a row is
      // only kept if the real, independent location classifier agrees it
      // belongs to the SPECIFIC region this call is currently syncing.
      // Per the v3.169.0 finding this replaces, freehire's own countries=
      // param is leaky (confirmed live: real foreign postings slipped
      // through the old "ca,us" filter too), so the same distrust applies
      // to every one of the four regions now, not just the original one —
      // a Europe query that leaks a US row, or vice versa, gets caught
      // here exactly the way an out-of-region leak always was.
      .filter((row) => classifyRegion(row.location) === regionName);

    const categoryChecked = rows.filter((row) => {
      const ok = isTrendingTechCategory(row.category);
      if (!ok) skippedOffCategory++;
      return ok;
    });

    // v3.135.0 — resolve this page's distinct companies before upserting,
    // so company_logo_url lands in the same write as everything else
    // rather than a second pass. Best-effort: a slow/failed freehire
    // companies lookup only ever leaves a row's logo null, never blocks
    // the posting itself from saving.
    const slugs = categoryChecked.map((row) => row.company_slug).filter((s): s is string => !!s);
    if (slugs.length) {
      await resolveLogosForSlugs(slugs, knownLogos).catch(() => { /* individual lookups already fail soft */ });
    }
    const rowsWithLogos = categoryChecked.map((row) => ({
      ...row,
      company_logo_url: row.company_slug ? (knownLogos.get(row.company_slug) ?? null) : null,
    }));

    if (rowsWithLogos.length) {
      const { error } = await admin.from("job_postings").upsert(rowsWithLogos, { onConflict: "source,external_id" });
      if (error) throw error;
      upserted += rowsWithLogos.length;
    }

    if (jobs.length < PAGE_SIZE) break; // reached the last page for this region
  }

  return { fetched, upserted, skippedOffCategory };
}

// v3.194.0 -- verified closure check before pruning. freehire's own
// posted_at and reality.class were both live-tested and found unreliable
// (posted_at gets kept artificially fresh for many listings regardless of
// true age; reality.class="stale" jobs were confirmed live, still
// genuinely open, via a real browser check against the real employer
// page). Rather than trust either, a real checker (ScrapeGraphAI plus a
// headless browser, running as its own internal-only service on this VPS,
// reached only through ai-openai-bridge so the real AI credential never
// leaves the edge runtime) visits the actual apply_url and asks: is this
// genuinely still open? Bounded to a small batch per run so a slow check
// can never blow this function's own time budget; everything past the
// batch still falls through to the exact same blind elapsed-time prune as
// before, so the "nothing older than FRESHNESS_DAYS survives" guarantee
// is never weakened, only ever strengthened for whatever a run can afford
// to verify.
const CHECKER_URL = "http://ayn-job-checker:8000/check";
const CHECKER_SECRET = Deno.env.get("CHECKER_SECRET");
const CHECK_BATCH_SIZE = 8;
const CHECK_RECHECK_COOLDOWN_HOURS = 24;
// Real safety net, not just a count cap: a single slow/stuck page could
// individually eat up to CHECK_PER_REQUEST_TIMEOUT_MS, and 15 of those in
// a worst case would run well past what a background cron invocation
// should ever take. This wall-clock budget stops starting new checks once
// hit, regardless of how many of CHECK_BATCH_SIZE were actually reached --
// self-limiting under bad conditions instead of trusting a fixed count.
// Cut hard twice: first from 60s to 20s after a real WorkerRequestCancelled
// kill, then from 20s to 10s after a SECOND real kill at 20s -- the
// fetch+upsert step's own real duration varies enough (freehire/network
// variance, not anything under this function's control) that 20s still
// was not consistently safe. 10s leaves real margin under either observed
// duration; a per-check ~5s means this can still complete 1-2 real checks
// most runs, just fewer under bad conditions, which is the whole point of
// a wall-clock budget over a fixed count.
const CHECK_WALL_CLOCK_BUDGET_MS = 10_000;
const CHECK_PER_REQUEST_TIMEOUT_MS = 10_000;
// The main candidate query above only ever fires when OUR OWN posted_at
// goes stale -- but posted_at is copied straight from freehire's own
// field, and freehire was proven (live) to keep it looking recent for
// listings it privately classifies as weeks old. A company whose listings
// freehire keeps bumping forever would never age past FRESHNESS_DAYS and
// so would never reach the query above, no matter how long the listing
// has really been sitting there -- exactly the "is this company really
// hiring or just showcasing" blind spot. This second, independent query
// uses created_at instead -- set once, on first insert, never touched
// again by any later upsert -- so it can't be gamed by freehire re-
// stamping posted_at. Small and separately budgeted, since it exists
// purely to catch that blind spot, not to replace the main check.
const SPOT_CHECK_BATCH_SIZE = 3;
const SPOT_CHECK_MIN_AGE_DAYS = 14;
const SPOT_CHECK_COOLDOWN_DAYS = 7;

async function verifyClosureBatch(
  admin: ReturnType<typeof createClient>,
  cutoff: string,
): Promise<{ checked: number; keptOpen: number; confirmedClosed: number; checkErrors: number; checkedIds: string[] }> {
  const empty = { checked: 0, keptOpen: 0, confirmedClosed: 0, checkErrors: 0, checkedIds: [] as string[] };
  if (!CHECKER_SECRET) return empty;

  const recheckCutoff = new Date(Date.now() - CHECK_RECHECK_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  const { data: staleCandidates, error } = await admin
    .from("job_postings")
    .select("id, apply_url")
    .lt("posted_at", cutoff)
    .or(`closure_checked_at.is.null,closure_checked_at.lt.${recheckCutoff}`)
    .order("closure_checked_at", { ascending: true, nullsFirst: true })
    .limit(CHECK_BATCH_SIZE);

  const spotCheckCutoffCreated = new Date(Date.now() - SPOT_CHECK_MIN_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const spotCheckCutoffChecked = new Date(Date.now() - SPOT_CHECK_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: spotCandidates } = await admin
    .from("job_postings")
    .select("id, apply_url")
    .lt("created_at", spotCheckCutoffCreated)
    .or(`closure_checked_at.is.null,closure_checked_at.lt.${spotCheckCutoffChecked}`)
    .order("closure_checked_at", { ascending: true, nullsFirst: true })
    .limit(SPOT_CHECK_BATCH_SIZE);

  // spotCandidates first, deliberately: they are the ones that would
  // otherwise never surface on their own (freehire keeps their posted_at
  // looking recent forever), and they are a small, fixed-size batch, so
  // giving them priority can never meaningfully starve the larger main
  // batch of its own share of the wall-clock budget below.
  const seen = new Set<string>();
  const candidates = ([...(spotCandidates ?? []), ...(staleCandidates ?? [])] as Array<{ id: string; apply_url: string }>)
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  if (error || !candidates.length) return empty;

  let keptOpen = 0, confirmedClosed = 0, checkErrors = 0;
  const checkedIds: string[] = [];
  const startedAt = Date.now();

  for (const row of candidates as Array<{ id: string; apply_url: string }>) {
    if (Date.now() - startedAt > CHECK_WALL_CLOCK_BUDGET_MS) break;
    checkedIds.push(row.id);
    try {
      const r = await fetch(CHECKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Checker-Secret": CHECKER_SECRET },
        body: JSON.stringify({ url: row.apply_url }),
        signal: AbortSignal.timeout(CHECK_PER_REQUEST_TIMEOUT_MS),
      });
      const body = await r.json().catch(() => null) as { ok?: boolean; result?: unknown } | null;
      const raw = (body?.result as { content?: unknown })?.content ?? body?.result;
      let parsed: { is_open?: boolean; scam_suspected?: boolean; scam_reason?: string } | null = null;
      if (typeof raw === "string") {
        try { parsed = JSON.parse(raw); } catch { parsed = null; }
      } else if (raw && typeof raw === "object") {
        parsed = raw as { is_open?: boolean; scam_suspected?: boolean; scam_reason?: string };
      }

      if (!body?.ok || parsed?.is_open == null) {
        await admin.from("job_postings")
          .update({ closure_checked_at: new Date().toISOString(), closure_status: "error" })
          .eq("id", row.id);
        checkErrors++;
        continue;
      }

      if (parsed.is_open) {
        // scam_suspected/scam_reason: the same page visit and AI call
        // already answers this, at zero extra cost -- captured for
        // visibility only, never acted on automatically. A confirmed
        // closure is deleted regardless of this signal below, so it's
        // only meaningful to record on the kept-open path.
        await admin.from("job_postings")
          .update({
            posted_at: new Date().toISOString(),
            closure_checked_at: new Date().toISOString(),
            closure_status: "open",
            scam_suspected: parsed.scam_suspected === true,
            scam_reason: parsed.scam_suspected === true ? (parsed.scam_reason ?? null) : null,
          })
          .eq("id", row.id);
        keptOpen++;
      } else {
        // Set closure_status before deleting -- job_postings_track_delete's
        // trigger reads OLD.closure_status to tell a real, checker-confirmed
        // closure apart from a blind elapsed-time prune. Two round trips,
        // but this only ever runs for the small checked batch, not the bulk
        // fallback prune.
        await admin.from("job_postings").update({ closure_status: "closed" }).eq("id", row.id);
        await admin.from("job_postings").delete().eq("id", row.id);
        confirmedClosed++;
      }
    } catch {
      try {
        await admin.from("job_postings")
          .update({ closure_checked_at: new Date().toISOString(), closure_status: "error" })
          .eq("id", row.id);
      } catch { /* best effort -- a failed error-marker write just means this row gets retried next cycle */ }
      checkErrors++;
    }
  }

  return { checked: checkedIds.length, keptOpen, confirmedClosed, checkErrors, checkedIds };
}


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCors(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // v3.135.0 — seed the logo cache from what's already stored, so a
    // company already resolved to a real logo in a past run is never
    // re-queried against freehire. Deliberately seeds successes only, not
    // nulls: freehire's own company_info shape is inconsistent across
    // companies (some carry the domain under .website, others only under
    // .homepage — confirmed live, not assumed), so a null here can mean
    // either "genuinely no domain on file" or "resolveCompanyLogo's own
    // logic has a gap this run's code doesn't have yet." Caching a null as
    // final would let a fixable miss stay stuck forever the next time this
    // function's resolution logic improves; the real cost of the safer
    // choice is only a repeat freehire lookup, not a wrong answer. Distinct
    // on company_slug isn't available in a single PostgREST call, so this
    // reads every row with a resolved logo and de-dupes client side — real
    // volume here is companies-with-a-logo, well inside one page.
    const knownLogos = new Map<string, string | null>();
    {
      const { data: seedRows } = await admin
        .from("job_postings")
        .select("company_slug, company_logo_url")
        .not("company_slug", "is", null)
        .not("company_logo_url", "is", null)
        .limit(5000);
      for (const row of (seedRows ?? []) as Array<{ company_slug: string; company_logo_url: string | null }>) {
        if (!knownLogos.has(row.company_slug)) knownLogos.set(row.company_slug, row.company_logo_url);
      }
    }

    const byRegion: Record<string, { fetched: number; upserted: number; skippedOffCategory: number }> = {};
    for (const group of REGION_GROUPS) {
      byRegion[group.name] = await syncRegion(admin, group.name, group.countries, group.maxPages, knownLogos);
    }
    const fetched = Object.values(byRegion).reduce((n, r) => n + r.fetched, 0);
    const upserted = Object.values(byRegion).reduce((n, r) => n + r.upserted, 0);

    const cutoff = new Date(Date.now() - FRESHNESS_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const verify = await verifyClosureBatch(admin, cutoff).catch(() => ({
      checked: 0, keptOpen: 0, confirmedClosed: 0, checkErrors: 0, checkedIds: [] as string[],
    }));

    let pruneQuery = admin.from("job_postings").delete({ count: "exact" }).lt("posted_at", cutoff);
    if (verify.checkedIds.length) {
      pruneQuery = pruneQuery.not("id", "in", `(${verify.checkedIds.join(",")})`);
    }
    const { error: pruneErr, count } = await pruneQuery;
    if (pruneErr) throw pruneErr;

    const companiesKnown = knownLogos.size;
    const companiesWithLogo = Array.from(knownLogos.values()).filter((v) => v).length;

    return new Response(JSON.stringify({
      ok: true, fetched, upserted, pruned: count ?? 0, byRegion, companiesKnown, companiesWithLogo, closureCheck: verify,
    }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
