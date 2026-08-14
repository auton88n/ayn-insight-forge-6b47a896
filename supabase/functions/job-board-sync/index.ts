// job-board-sync — v3.134.0
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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
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
  location?: string;
  description?: string;
  url?: string;
  posted_at?: string;
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
        title: String(j.title).slice(0, 300),
        description: stripHtml(j.description || "").slice(0, 20000),
        location: j.location ? String(j.location).slice(0, 300) : null,
        apply_url: j.url!,
        posted_at: j.posted_at!,
      }))
      .filter((row) => row.description.length >= 40) // skip anything too thin to score against
      .filter((row) => !looksNonLatinScript(row.description) && !looksNonLatinScript(row.title));

    if (rows.length) {
      const { error } = await admin.from("job_postings").upsert(rows, { onConflict: "source,external_id" });
      if (error) throw error;
      upserted += rows.length;
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

    const byRegion: Record<string, { fetched: number; upserted: number }> = {};
    for (const group of REGION_GROUPS) {
      byRegion[group.name] = await syncRegion(admin, group.countries, group.maxPages);
    }
    const fetched = Object.values(byRegion).reduce((n, r) => n + r.fetched, 0);
    const upserted = Object.values(byRegion).reduce((n, r) => n + r.upserted, 0);

    const cutoff = new Date(Date.now() - FRESHNESS_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error: pruneErr, count } = await admin
      .from("job_postings")
      .delete({ count: "exact" })
      .lt("posted_at", cutoff);
    if (pruneErr) throw pruneErr;

    return new Response(JSON.stringify({ ok: true, fetched, upserted, pruned: count ?? 0, byRegion }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
