// job-board-sync — v3.135.0
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
const FRESHNESS_DAYS = 7;

// A cleaner, more precise language signal than a Unicode-script heuristic
// — freehire's own documented, filterable `posting_language` facet.
// looksNonLatinScript (below) is kept as a cheap, free backstop in case a
// posting is miscategorized, not as the primary check anymore.
const LANGUAGE_FILTER = "en";

// v3.134.0 — region restriction, requested directly: Canada, US, Europe,
// and the Middle East only, named explicitly rather than left as an
// inferred region (Jordan, Lebanon, Iraq, Yemen, Turkey, and Egypt were
// asked out by name). Russia and Belarus are excluded too (grouped under
// CIS, not Europe).
//
// REGION_GROUPS, not one combined list — found live, not assumed: a single
// query across all target countries sorted by recency starved the Middle
// East down to ~2 rows out of 386, not because supply was low (a direct
// check found 16,819 real Middle East postings available in the same
// 7-day window) but because US/Canada alone had 541,029 available in the
// same window — 32x more, so the "most recent 500 across everything"
// was almost entirely US/Canada by simple volume. Each group below now
// runs its own separate query with its own page budget, so the Middle
// East (or any smaller region) gets guaranteed real representation
// instead of being crowded out by a larger one.
//
// maxPages bumped 3 to 8 (300 to 800 per region per run) alongside the
// cron moving from every 4 hours to every 2 (see the job-board-sync
// pg_cron entry) — discussed directly first: a higher-volume region like
// North America (~77,000 new postings/day, measured live) generates far
// more in a single window than any one run can capture, so the real lever
// for catching more of that moving stream is checking MORE often with a
// meaningful page budget each time, not less often with a single bigger
// pull — a once-daily run, no matter how large, would structurally miss
// postings that appear and get buried by newer ones before the next check,
// the exact failure mode a bigger MAX_PAGES alone can't fix without also
// tightening the interval.
const REGION_GROUPS: Array<{ name: string; countries: string; maxPages: number }> = [
  { name: "north_america", countries: "ca,us", maxPages: 8 },
  {
    name: "europe",
    countries: [
      "gb", "ie", "fr", "de", "nl", "be", "lu", "ch", "at", "it", "es", "pt",
      "se", "no", "dk", "fi", "is", "pl", "cz", "sk", "hu", "ro", "bg", "gr",
      "hr", "si", "ee", "lv", "lt", "mt", "cy", "li", "ad", "mc", "sm",
    ].join(","),
    maxPages: 8,
  },
  { name: "middle_east", countries: "ae,sa,il,qa,kw,bh,om", maxPages: 8 },
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

/** freehire's description field is HTML. AYN's own gap-matching and AI
 * calls expect readable plain text, same as every other JD source in this
 * app (parsed uploads, pasted text, the extension's own extraction). */
function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
  countries: string,
  maxPages: number,
  knownLogos: Map<string, string | null>,
): Promise<{ fetched: number; upserted: number }> {
  let fetched = 0;
  let upserted = 0;

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
      .map((j) => ({
        source: "freehire",
        external_id: j.public_slug!,
        company: String(j.company).slice(0, 300),
        company_slug: j.company_slug ? String(j.company_slug).slice(0, 300) : null,
        title: String(j.title).slice(0, 300),
        description: stripHtml(j.description || "").slice(0, 20000),
        location: j.location ? String(j.location).slice(0, 300) : null,
        apply_url: j.url!,
        posted_at: j.posted_at!,
      }))
      .filter((row) => row.description.length >= 40) // skip anything too thin to score against
      .filter((row) => !looksNonLatinScript(row.description) && !looksNonLatinScript(row.title));

    // v3.135.0 — resolve this page's distinct companies before upserting,
    // so company_logo_url lands in the same write as everything else
    // rather than a second pass. Best-effort: a slow/failed freehire
    // companies lookup only ever leaves a row's logo null, never blocks
    // the posting itself from saving.
    const slugs = rows.map((row) => row.company_slug).filter((s): s is string => !!s);
    if (slugs.length) {
      await resolveLogosForSlugs(slugs, knownLogos).catch(() => { /* individual lookups already fail soft */ });
    }
    const rowsWithLogos = rows.map((row) => ({
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

  return { fetched, upserted };
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

    const byRegion: Record<string, { fetched: number; upserted: number }> = {};
    for (const group of REGION_GROUPS) {
      byRegion[group.name] = await syncRegion(admin, group.countries, group.maxPages, knownLogos);
    }
    const fetched = Object.values(byRegion).reduce((n, r) => n + r.fetched, 0);
    const upserted = Object.values(byRegion).reduce((n, r) => n + r.upserted, 0);

    const cutoff = new Date(Date.now() - FRESHNESS_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error: pruneErr, count } = await admin
      .from("job_postings")
      .delete({ count: "exact" })
      .lt("posted_at", cutoff);
    if (pruneErr) throw pruneErr;

    const companiesKnown = knownLogos.size;
    const companiesWithLogo = Array.from(knownLogos.values()).filter((v) => v).length;

    return new Response(JSON.stringify({
      ok: true, fetched, upserted, pruned: count ?? 0, byRegion, companiesKnown, companiesWithLogo,
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
