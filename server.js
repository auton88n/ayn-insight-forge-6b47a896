import express from 'express';
import compression from 'compression';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, 'dist');
const INDEX_HTML = path.join(DIST, 'index.html');

// v3.133.0 — real security headers. script-src and style-src both drop
// 'unsafe-inline': the two theme-init scripts that used to sit inline in
// index.html now live at /theme-init-head.js and /theme-init-body.js, and
// the one literal style="..." attribute (on #root) moved to a real CSS
// class, so nothing in this app actually needs either exception. Verified
// live against a real production build before shipping — see the CI/README
// note for how to re-check after a template change.
// v3.159.0 — self-hosted deployments point this app at a different
// Supabase backend (a different origin entirely), so the CSP's own allow
// list has to follow. SUPABASE_ORIGIN reads from the same env var the
// build itself uses (VITE_SUPABASE_URL).
//
// v3.339.0 (correction) — the fallback here used to be the old Lovable
// Cloud project's URL, reasoned at the time as "an unconfigured deploy is
// still the normal case." That's backwards now: self-hosted (ayn.careers)
// is the real, current, only production deployment, and the old Cloud
// project is meant to be reached from exactly one place in this whole
// app — resume-hub's own server-to-server AI relay (lib/ai.ts,
// AI_RELAY_URL) — never from here. A fallback pointing at Cloud meant
// that if this env var were ever unset on a container rebuild, the CSP
// would silently start allowing the BROWSER to talk to the old cloud
// project, and this file's own job_postings fetch below would silently
// hit the wrong database, both violating "only AI touches Cloud, local
// Supabase for everything else." The fallback now matches src/config.ts's
// own default instead: the real self-hosted domain, so an unconfigured
// deploy fails toward the correct backend, not the wrong one.
const SUPABASE_ORIGIN = process.env.VITE_SUPABASE_URL || 'https://ayn.careers';
const SUPABASE_WS_ORIGIN = 'wss://' + SUPABASE_ORIGIN.replace(/^https?:\/\//, '');
const CSP = [
  "default-src 'self'",
  `script-src 'self' https://www.googletagmanager.com`,
  // 'unsafe-inline' here only: verified live that React/Radix/framer-motion
  // set real style="..." attributes at runtime (not just CSSOM property
  // assignment), which a strict style-src blocks outright. script-src has
  // no such exception — it came back clean with zero violations, which is
  // the directive that actually matters against injection.
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com data:`,
  `img-src 'self' data: blob: https:`,
  `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS_ORIGIN} https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

// v3.202.0 — real, live-measured finding: every asset (928KB of JS/CSS on
// a bare landing-page load) was being served completely uncompressed, no
// content-encoding at all, despite every real browser sending
// "Accept-Encoding: gzip, br" on every request. express.static() does not
// gzip on its own, and neither does anything upstream of it here. One
// middleware line cuts that 928KB to roughly a third, a direct hit on LCP
// and every page-speed-driven ranking signal, for every visitor, on every
// route, at zero cost.
app.use(compression());

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), interest-cohort=()'
  );
  // Real production traffic is HTTPS-only (verified in v3.85.0's domain
  // migration); this header only ever reaches a browser over a connection
  // that already terminated TLS in front of this process.
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  next();
});

// Log only crawler endpoints, never query strings, IPs, cookies or raw agents.
// Agent labels are unverified claims, not authenticated Google requests.
const sitemapPaths = new Set(['/sitemap.xml', '/sitemap-jobs.xml', '/sitemap-insights.xml', '/sitemap-companies.xml']);
app.use((req, res, next) => {
  if (!sitemapPaths.has(req.path)) return next();
  const started = performance.now();
  const pathname = req.path;
  const ua = req.get('user-agent') || '';
  const agentClaim = /Google-InspectionTool/i.test(ua) ? 'google-inspection'
    : /Googlebot/i.test(ua) ? 'googlebot' : 'other';
  let recorded = false;
  const record = (completed) => {
    if (recorded) return;
    recorded = true;
    console.log(JSON.stringify({
      event: 'sitemap_response', time: new Date().toISOString(),
      path: pathname, method: req.method, agentClaim,
      status: res.statusCode, completed,
      contentType: res.getHeader('content-type') || null,
      durationMs: Math.round(performance.now() - started),
    }));
  };
  res.once('finish', () => record(true));
  res.once('close', () => record(res.writableFinished));
  next();
});

// Vite empties the live-mounted dist folder during deployment. Hold the
// tracked sitemap in memory, as we already do for the SPA shell, rather
// than allowing a transient missing dist file to fall through to HTML 404.
const mainSitemap = fs.readFileSync(path.join(__dirname, 'public/sitemap.xml'), 'utf8');
app.get('/sitemap.xml', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.type('application/xml').send(mainSitemap);
});

// Serve static files with proper caching:
// - /assets/* are content-hashed by Vite — cache forever
// - /frames/* are the hero animation frames (~22 MB total) — cache 7 days
app.use(express.static(DIST, {
  // The homepage is rendered by the SPA fallback below so it can carry real text.
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.includes(`${path.sep}fonts${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.includes(`${path.sep}frames${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  },
}));

// v3.202.0 — real, individually-crawlable content (~23,000 job postings
// right now) that no sitemap has ever listed. A static file can't hold
// these: the catalog changes constantly (a posting is pruned within 3
// days of going stale — see job-board-sync's FRESHNESS_DAYS), so this
// queries job_postings live, the exact same public, scam-excluded anon
// read the /jobs page itself already uses (job_postings_select_anon RLS
// policy, v3.201.0) — no new backend surface, no new risk. Capped at
// 45,000 rows, a safety margin under the sitemap protocol's real
// 50,000-URL ceiling; today's real count is well under half that.
// Sept 2026 security review: removed the hardcoded literal fallback (the
// same anon key was also duplicated in src/config.ts, a stale-drift risk
// on rotation, not a secrecy one -- this key is meant to be public, RLS
// protects the data). Read lazily, inside the one route that uses it, so
// a missing env var degrades just this crawler-only endpoint to its
// existing empty-sitemap fail-safe below rather than crashing the whole
// static-file server that serves the entire site.
function requireSupabaseAnonKey() {
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!key) throw new Error('VITE_SUPABASE_ANON_KEY is not set in the server environment');
  return key;
}

let jobsSitemapCache = { xml: null, at: 0 };
// A crawler refetching more often than this is rare, and this only ever
// protects the database from repeat load on a hot crawl — a posting stays
// live for days, so 10 minutes of sitemap staleness never matters.
const JOBS_SITEMAP_CACHE_MS = 10 * 60 * 1000;

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

app.get('/sitemap-jobs.xml', async (req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  const now = Date.now();
  if (jobsSitemapCache.xml && now - jobsSitemapCache.at < JOBS_SITEMAP_CACHE_MS) {
    res.send(jobsSitemapCache.xml);
    return;
  }
  try {
    const SUPABASE_ANON_KEY = requireSupabaseAnonKey();
    // PostgREST caps rows per request at its own configured max (1000 on
    // this instance) regardless of the "limit" query param requested --
    // confirmed live testing this route: asking for 45,000 silently came
    // back as exactly 1,000. Page through with the Range header instead,
    // up to the same 45,000 safety cap.
    const PAGE = 1000;
    const CAP = 45000;
    const rows = [];
    for (let offset = 0; offset < CAP; offset += PAGE) {
      const url = `${SUPABASE_ORIGIN}/rest/v1/job_postings`
        + `?select=id,posted_at&order=posted_at.desc`
        + `&or=(scam_suspected.is.null,scam_suspected.eq.false)`;
      const r = await fetch(url, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Range: `${offset}-${offset + PAGE - 1}`,
        },
      });
      if (!r.ok) throw new Error(`job_postings fetch failed: ${r.status}`);
      const page = await r.json();
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    const urls = rows.map((j) => (
      `  <url>\n`
      + `    <loc>https://ayn.careers/jobs/${escapeXml(j.id)}</loc>\n`
      + `    <lastmod>${new Date(j.posted_at).toISOString().slice(0, 10)}</lastmod>\n`
      + `    <changefreq>daily</changefreq>\n`
      + `    <priority>0.6</priority>\n`
      + `  </url>`
    )).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
    jobsSitemapCache = { xml, at: now };
    res.send(xml);
  } catch (err) {
    console.error('sitemap-jobs.xml failed:', err.message);
    // Fail safe: a valid, empty sitemap rather than a 500 a crawler might
    // hold against the whole site's crawl health.
    res.send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n');
  }
});

// v3.X — SEO/AEO articles (/insights). The one real gap this closes: every
// other page on this site is a client-rendered SPA shell, confirmed by
// reading this whole file -- indexHtml is sent byte-identical for every
// route, and the real <title>/meta/JSON-LD only ever get set client side,
// after JS runs (src/components/shared/SEO.tsx). GPTBot, ClaudeBot, and
// PerplexityBot all fetch a page but never execute its JavaScript, so a
// client-rendered SPA is structurally invisible to them -- confirmed
// against SEOMonster's own ai_citation_readiness tool, whose single
// leading check is exactly this render-blindness problem. An /insights
// article therefore gets real, complete HTML at the first byte -- the
// actual article text, not a shell -- same live-fetch-then-cache shape
// the sitemap-jobs.xml route above already uses. Once JS loads, React
// Router mounts the identical client route over the same #root and the
// page becomes the normal interactive site; createRoot (not hydrateRoot,
// confirmed in src/main.tsx) replaces the server-rendered markup cleanly
// rather than trying to match it node for node.
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
const purify = createDOMPurify(new JSDOM('').window);

const insightsCache = new Map(); // slug -> { html, at }
let insightsIndexCache = { html: null, at: 0 };
// Short TTL keeps admin archives from remaining publicly visible for long.
const INSIGHTS_CACHE_MS = 60 * 1000;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Real, targeted swaps on the already-loaded, build-current indexHtml --
// never a hand-reconstructed document, so the content-hashed asset tags
// Vite injected at build time are never duplicated or gone stale.
//
// Every .replace() below uses a FUNCTION as the second argument, never a
// plain template string. Found live, on the very first real render: a
// plain string second argument is special-cased by JS itself -- "$1"
// means "capture group 1", "$$" means a literal "$", etc. -- and real
// generated content is full of real dollar figures ("$160,000"), so
// "...is $160,000..." silently became "...is <div id="root"...>60,000..."
// the instant it hit a replacement string with a capturing group. A
// replacer function's return value is inserted completely literally, no
// special-pattern parsing at all, which is what every call here needs.
function swapMeta(html, { title, description, canonical }) {
  return html
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)}</title>`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, () => `<link rel="canonical" href="${escapeHtml(canonical)}" />`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, () => `<meta name="description" content="${escapeHtml(description)}">`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, () => `<meta property="og:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, () => `<meta name="twitter:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, () => `<meta property="og:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/, () => `<meta name="twitter:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, () => `<meta property="og:url" content="${escapeHtml(canonical)}" />`)
    .replace(/<link rel="alternate" hreflang="(en|x-default)" href="[^"]*"\s*\/?>/g, (_m, lang) => `<link rel="alternate" hreflang="${lang}" href="${escapeHtml(canonical)}" />`);
}

function injectHead(html, extraHeadHtml) {
  return html.replace('</head>', () => `${extraHeadHtml}\n  </head>`);
}

// The text and links in #root are for crawlers that do not run JavaScript
// (search and AI bots). People must never see them: they are visually hidden
// with the standard screen-reader-only pattern (inline, so it works before any
// CSS loads) and React replaces everything inside #root the moment it mounts.
// The page behind it is the plain warm background, so there is no flash.
const PRERENDER_STYLE = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
function injectRoot(html, rootInnerHtml) {
  const content = `<div data-prerender style="${PRERENDER_STYLE}"><header><a href="/">AYN</a><nav aria-label="Main navigation"><a href="/jobs">Jobs</a><a href="/salary-guide">Salary guide</a><a href="/insights">Insights</a><a href="/pricing">Pricing</a></nav></header>${rootInnerHtml}</div>`;
  // The first-paint skeleton (#ayn-boot) stays; the crawler text goes right after it.
  return html.replace('<!--/ayn-boot-->', () => `<!--/ayn-boot-->${content}`);
}

function articleJsonLd(article) {
  const url = `https://ayn.careers/insights/${article.slug}`;
  const blocks = [{
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.meta_description,
    datePublished: article.published_at,
    dateModified: article.refreshed_at || article.published_at,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: { '@type': 'Organization', name: 'AYN', url: 'https://ayn.careers' },
    publisher: { '@type': 'Organization', name: 'AYN', url: 'https://ayn.careers', logo: { '@type': 'ImageObject', url: 'https://ayn.careers/favicon.png' } },
  }];
  // FAQPage schema only when the article genuinely has real, distinct Q&A
  // content -- never force-added. SEOMonster's own ai_citation_readiness
  // research is explicit that schema like this isn't a measured citation
  // driver in 2026; it's here because it's honestly true of the content
  // when present, not as an SEO trick.
  if (Array.isArray(article.faq) && article.faq.length) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: article.faq.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    });
  }
  // JSON.stringify alone leaves a literal </script> in text fields. Escape
  // '<' so an AI-produced title or FAQ cannot terminate this script element.
  return blocks.map((b) => `<script type="application/ld+json">\n${JSON.stringify(b).replace(/</g, '\\u003c')}\n</script>`).join('\n');
}

function renderArticleBody(article) {
  const rawHtml = marked.parse(article.body_md || '');
  const safeHtml = purify.sanitize(rawHtml);
  const faqHtml = Array.isArray(article.faq) && article.faq.length
    ? `<section><h2>Questions</h2>${article.faq.map((f) => `<h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p>`).join('')}</section>`
    : '';
  const dateStr = new Date(article.refreshed_at || article.published_at).toISOString().slice(0, 10);
  const source = article.source_data || {};
  const openRoles = Number(source.open_roles);
  const salarySample = Number(source.salary_sample_size);
  const sampleNote = Number.isFinite(openRoles) && openRoles >= 0
    ? `<p>Snapshot: ${openRoles} current listings${Number.isFinite(salarySample) && salarySample > 0 ? `; ${salarySample} listings with comparable USD salary data` : ''}. These are AYN catalog samples, not the entire job market.</p>`
    : '';
  return (
    `<article>`
    + `<h1>${escapeHtml(article.title)}</h1>`
    + `<p>${escapeHtml(article.dek)}</p>`
    + safeHtml
    + faqHtml
    + `<section><h2>About this data</h2>${sampleNote}<p>Figures come from AYN's current job listings and can change as listings expire or new ones appear. Last updated ${dateStr}.</p></section>`
    + `<nav aria-label="Related pages"><a href="/jobs/category/${encodeURIComponent(article.category)}">Browse related jobs</a> · <a href="/salary-guide">Salary guide</a> · <a href="/insights">All insights</a></nav>`
    + `</article>`
  );
}

async function fetchJson(pathAndQuery) {
  const SUPABASE_ANON_KEY = requireSupabaseAnonKey();
  const r = await fetch(`${SUPABASE_ORIGIN}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
  return r.json();
}

app.get('/insights/:slug', async (req, res) => {
  if (indexHtml === null) { res.status(503).send('Service temporarily unavailable, please retry.'); return; }
  const { slug } = req.params;
  const now = Date.now();
  const cached = insightsCache.get(slug);
  if (cached && now - cached.at < INSIGHTS_CACHE_MS) {
    res.type('html').send(cached.html);
    return;
  }
  try {
    const rows = await fetchJson(`articles?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=*&limit=1`);
    const article = rows[0];
    if (!article) {
      // Archived or unknown articles must not be a crawler-visible soft 404.
      res.status(404).type('html').send(indexHtml);
      return;
    }
    const canonical = `https://ayn.careers/insights/${article.slug}`;
    let html = swapMeta(indexHtml, { title: `${article.title} | AYN`, description: article.meta_description, canonical });
    html = injectHead(html, articleJsonLd(article));
    html = injectRoot(html, renderArticleBody(article));
    insightsCache.set(slug, { html, at: now });
    res.type('html').send(html);
  } catch (err) {
    console.error('/insights/:slug failed:', err.message);
    // A backend outage is transient, not a successful empty article page.
    res.status(503).type('html').send(indexHtml);
  }
});

app.get('/insights', async (req, res) => {
  if (indexHtml === null) { res.status(503).send('Service temporarily unavailable, please retry.'); return; }
  const now = Date.now();
  if (insightsIndexCache.html && now - insightsIndexCache.at < INSIGHTS_CACHE_MS) {
    res.type('html').send(insightsIndexCache.html);
    return;
  }
  try {
    const rows = await fetchJson(`articles?status=eq.published&select=slug,title,dek,category,city,published_at&order=published_at.desc&limit=200`);
    const listHtml = rows.map((a) => (
      `<li><a href="/insights/${escapeHtml(a.slug)}">${escapeHtml(a.title)}</a><p>${escapeHtml(a.dek)}</p></li>`
    )).join('');
    const title = 'Real hiring data, from AYN’s own job catalog | AYN';
    const description = 'Salary and hiring-trend reports based on AYN’s job catalog, with counts and salary figures computed from current listings.';
    const canonical = 'https://ayn.careers/insights';
    let html = swapMeta(indexHtml, { title, description, canonical });
    html = injectRoot(html, `<main><h1>Real hiring data</h1><p>${escapeHtml(description)}</p><ul>${listHtml}</ul></main>`);
    insightsIndexCache = { html, at: now };
    res.type('html').send(html);
  } catch (err) {
    console.error('/insights index failed:', err.message);
    res.type('html').send(indexHtml);
  }
});

let insightsSitemapCache = { xml: null, at: 0 };
app.get('/sitemap-insights.xml', async (req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  const now = Date.now();
  if (insightsSitemapCache.xml && now - insightsSitemapCache.at < INSIGHTS_CACHE_MS) {
    res.send(insightsSitemapCache.xml);
    return;
  }
  try {
    const rows = await fetchJson(`articles?status=eq.published&select=slug,refreshed_at,published_at&order=published_at.desc&limit=5000`);
    const urls = rows.map((a) => (
      `  <url>\n`
      + `    <loc>https://ayn.careers/insights/${escapeXml(a.slug)}</loc>\n`
      + `    <lastmod>${new Date(a.refreshed_at || a.published_at).toISOString().slice(0, 10)}</lastmod>\n`
      + `    <changefreq>weekly</changefreq>\n`
      + `    <priority>0.7</priority>\n`
      + `  </url>`
    )).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
    insightsSitemapCache = { xml, at: now };
    res.send(xml);
  } catch (err) {
    console.error('sitemap-insights.xml failed:', err.message);
    res.send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n');
  }
});


// Individual job pages. The sitemap lists every /jobs/<id>, but a client
// that does not run JavaScript used to get the homepage's tags for each of
// them. Render the real posting at the first byte, with the same
// JobPosting schema the client adds, using the same public scam-excluded
// read /jobs itself uses. A posting that was pruned or flagged is a 404.
const JOB_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const jobPageCache = new Map(); // id -> { html, at }
const JOB_PAGE_CACHE_MS = 5 * 60 * 1000;
const JOB_PAGE_CACHE_MAX = 500;

function jobPostingJsonLd(j) {
  const validThrough = j.apply_by || undefined;
  const ld = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: j.title,
    description: j.description,
    datePosted: j.posted_at,
    ...(validThrough ? { validThrough } : {}),
    hiringOrganization: { '@type': 'Organization', name: j.company },
    identifier: { '@type': 'PropertyValue', name: 'AYN', value: j.id },
    directApply: false,
    ...((j.work_mode || j.work_mode_text) === 'remote' ? {
      jobLocationType: 'TELECOMMUTE',
      ...(j.remote_region ? { applicantLocationRequirements: { '@type': 'AdministrativeArea', name: j.remote_region } } : {}),
    } : {}),
    ...(j.location ? { jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: j.location } } } : {}),
    ...(j.employment_type ? { employmentType: String(j.employment_type).toUpperCase() } : {}),
    ...(j.salary_min && j.salary_max ? {
      baseSalary: {
        '@type': 'MonetaryAmount',
        currency: j.salary_currency || 'USD',
        value: { '@type': 'QuantitativeValue', minValue: j.salary_min, maxValue: j.salary_max, unitText: 'YEAR' },
      },
    } : {}),
  };
  return `<script type="application/ld+json">\n${JSON.stringify(ld).replace(/</g, '\\u003c')}\n</script>`;
}

function renderJobBody(j) {
  const paras = String(j.description || '').slice(0, 8000).split(/\n{1,}/).map((t) => t.trim()).filter(Boolean);
  const where = [j.location, j.work_mode].filter(Boolean).join(' · ');
  const salary = j.salary_min && j.salary_max ? `${j.salary_currency || 'USD'} ${Number(j.salary_min).toLocaleString('en-US')} to ${Number(j.salary_max).toLocaleString('en-US')} a year` : '';
  const apply = /^https?:\/\//i.test(j.apply_url || '') ? `<p><a href="${escapeHtml(j.apply_url)}" rel="nofollow noopener">Apply on the employer’s site</a></p>` : '';
  return `<main><article><h1>${escapeHtml(j.title)}</h1><p>${escapeHtml(j.company)}${where ? ` · ${escapeHtml(where)}` : ''}</p>${salary ? `<p>${escapeHtml(salary)}</p>` : ''}${paras.map((t) => `<p>${escapeHtml(t)}</p>`).join('')}${apply}<nav><a href="/jobs">Browse all jobs</a> · <a href="/check-resume">Check my resume</a></nav></article></main>`;
}

app.get('/jobs/:id', async (req, res, next) => {
  const { id } = req.params;
  if (!JOB_ID_RE.test(id)) { next(); return; }
  if (indexHtml === null) { res.status(503).send('Service temporarily unavailable, please retry.'); return; }
  const now = Date.now();
  const cached = jobPageCache.get(id);
  if (cached && now - cached.at < JOB_PAGE_CACHE_MS) { res.type('html').send(cached.html); return; }
  try {
    const rows = await fetchJson(`job_postings?id=eq.${encodeURIComponent(id)}&or=(scam_suspected.is.null,scam_suspected.eq.false)&select=*&limit=1`);
    const j = rows[0];
    if (!j) { res.status(404).type('html').send(indexHtml); return; }
    const where = j.location ? `, ${j.location}` : '';
    let html = swapMeta(indexHtml, {
      title: `${j.title} at ${j.company} | AYN`,
      description: `${j.title} at ${j.company}${where}. Sourced directly from the company's own career page.`.slice(0, 300),
      canonical: `${SITE}/jobs/${j.id}`,
    });
    html = injectHead(html, jobPostingJsonLd(j));
    html = injectRoot(html, renderJobBody(j));
    if (jobPageCache.size >= JOB_PAGE_CACHE_MAX) jobPageCache.delete(jobPageCache.keys().next().value);
    jobPageCache.set(id, { html, at: now });
    res.type('html').send(html);
  } catch (err) {
    console.error('/jobs/:id failed:', err.message);
    res.status(503).type('html').send(indexHtml);
  }
});

// Company pages: a public page per company with its open roles and what AYN has observed about how it
// hires. Rendered here too, so a crawler that does not run JavaScript sees the real text.
const COMPANY_SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,120}$/i;
const COMPANY_PAGE_CACHE_MS = 10 * 60 * 1000;
const COMPANY_PAGE_CACHE_MAX = 500;
const companyPageCache = new Map();

async function fetchRpc(name, body, range) {
  const SUPABASE_ANON_KEY = requireSupabaseAnonKey();
  const r = await fetch(`${SUPABASE_ORIGIN}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', ...(range ? { Range: range } : {}) },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`rpc ${name} failed: ${r.status}`);
  return r.json();
}

function renderCompanyBody(p) {
  const i = p.insights || {};
  const lines = [`<p>${escapeHtml(p.name)} has ${i.open_roles} open roles on AYN.</p>`];
  if (i.pay) lines.push(`<p>${escapeHtml(p.name)} shows pay on ${i.pay.pct}% of its ${i.pay.postings} open postings.</p>`);
  if (i.speed) lines.push(`<p>Postings at ${escapeHtml(p.name)} typically remain in AYN's catalog about ${i.speed.median_days_open} days, based on ${i.speed.closed_tracked} removals. Includes employer closure and freshness pruning; not time to hire.</p>`);
  if (p.relisted_roles > 0) lines.push(`<p>${p.relisted_roles} of its live roles have been listed before.</p>`);
  lines.push(`<p>${Number(p.edits_30d) || 0} posting field ${Number(p.edits_30d) === 1 ? 'change' : 'changes'} observed in the last 30 days. One posting may have several changes; this is not a count of hires.</p>`);
  const cats = (p.top_categories || []).map((c) => `${escapeHtml(String(c.category).replace(/_/g, ' '))} (${c.open_roles})`).join(', ');
  if (cats) lines.push(`<p>Roles it is hiring for: ${cats}.</p>`);
  const classifiedModes = Object.entries(p.work_mode || {}).filter(([mode]) => ['remote','hybrid','onsite'].includes(mode));
  const classified = classifiedModes.reduce((sum, [, count]) => sum + Number(count), 0);
  if (classifiedModes.length) lines.push(`<p>AYN has classified work mode for ${classified} of ${Number(i.open_roles)} postings. ${Math.max(0, Number(i.open_roles) - classified)} remain unclassified.</p>`);
  const ben = (p.common_benefits || []).map((b) => `${escapeHtml(b.benefit)} (${b.roles})`).join(', ');
  if (ben) lines.push(`<p>Benefits its postings name: ${ben}.</p>`);
  const jobs = (p.jobs || []).map((j) => `<li><a href="/jobs/${escapeHtml(j.id)}">${escapeHtml(j.title)}</a>${j.location ? ` (${escapeHtml(j.location)})` : ''}</li>`).join('');
  return `<main><h1>${escapeHtml(p.name)}: open roles and hiring stats</h1>${lines.join('')}<h2>Open roles</h2><ul>${jobs}</ul></main>`;
}

app.get('/companies/:slug', async (req, res, next) => {
  const { slug } = req.params;
  if (!COMPANY_SLUG_RE.test(slug)) { next(); return; }
  if (indexHtml === null) { res.status(503).send('Service temporarily unavailable, please retry.'); return; }
  const key = slug.toLowerCase();
  const now = Date.now();
  const cached = companyPageCache.get(key);
  if (cached && now - cached.at < COMPANY_PAGE_CACHE_MS) { res.status(cached.status).type('html').send(cached.html); return; }
  try {
    const p = await fetchRpc('company_profile', { p_company_slug: key });
    if (!p) {
      // A company with no live roles must not be a crawler-visible soft 404.
      res.status(404).type('html').send(indexHtml);
      return;
    }
    const title = `${p.name} jobs and hiring stats | AYN`;
    const description = `${p.name} has ${p.insights.open_roles} open roles on AYN. See pay transparency, posting updates and observed time in AYN's catalog.`.slice(0, 300);
    let html = swapMeta(indexHtml, { title, description, canonical: `${SITE}/companies/${encodeURIComponent(key)}` });
    html = injectHead(html, `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: p.name, ...(p.logo_url ? { logo: p.logo_url } : {}) }).replace(/</g, '\\u003c')}</script>`);
    html = injectRoot(html, renderCompanyBody(p));
    if (companyPageCache.size >= COMPANY_PAGE_CACHE_MAX) companyPageCache.delete(companyPageCache.keys().next().value);
    companyPageCache.set(key, { html, at: now, status: 200 });
    res.type('html').send(html);
  } catch (err) {
    console.error('/companies/:slug failed:', err.message);
    res.status(503).type('html').send(indexHtml);
  }
});

let companiesSitemapCache = { xml: null, at: 0 };
app.get('/sitemap-companies.xml', async (req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  const now = Date.now();
  if (companiesSitemapCache.xml && now - companiesSitemapCache.at < 30 * 60 * 1000) { res.send(companiesSitemapCache.xml); return; }
  try {
    // The database answers at most 1,000 rows per request, so page through with the Range header.
    const rows = [];
    for (let offset = 0; offset < 5000; offset += 1000) {
      const page = await fetchRpc('company_sitemap_list', { p_min: 3, p_limit: 5000 }, `${offset}-${offset + 999}`);
      rows.push(...page);
      if (page.length < 1000) break;
    }
    const urls = rows.map((r) => `  <url>\n    <loc>${SITE}/companies/${encodeURIComponent(r.slug)}</loc>\n    <lastmod>${new Date(r.last_posted).toISOString().slice(0, 10)}</lastmod>\n  </url>`).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
    companiesSitemapCache = { xml, at: now };
    res.send(xml);
  } catch (err) {
    console.error('sitemap-companies.xml failed:', err.message);
    res.send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n');
  }
});

// Every real route in src/App.tsx. Anything not in here is a genuine 404,
// so we still serve the SPA shell but with a 404 status, otherwise Google
// indexes every junk path as a live page.
const ROUTES = [
  '/', '/pricing', '/resume-hub', '/contact', '/support', '/help', '/about', '/check-resume', '/jobs', '/salary-guide', '/insights',
  '/terms', '/privacy', '/legal', '/cookies', '/security', '/subprocessors', '/dpa', '/sla', '/copyright', '/do-not-sell',
  '/settings', '/billing',
  '/employer/pending', '/employers', '/reset-password',
  '/approval-result', '/subscription-success', '/subscription-canceled',
  '/dashboard', '/admin',
];
const PREFIXES = ['/resume-hub/', '/dashboard/', '/admin/', '/manage-', '/jobs/', '/insights/', '/companies/'];

function isKnownRoute(pathname) {
  if (ROUTES.includes(pathname)) return true;
  return PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// React Router handles rendering; the status code is decided here.
// Express 5's path-to-regexp requires a named wildcard. This form includes
// the root path as well as every SPA route, preserving Express 4's `*`.
//
// Sept 2026 -- reported directly: "the app pages being slow and refrash...
// dont feel the app is stable." Traced through docker logs, not guessed.
// First fix (below the surface here, superseded by this one): delay
// app.listen() until dist/index.html exists, closing the startup half of
// the race. Deployed, then a REAL live 503 on the very next deploy proved
// that fix was still only half the story -- it protects a container's own
// startup, but does nothing for the container that's ALREADY running and
// ALREADY serving traffic the moment auto_deploy.sh's build step reaches
// dist/ (Vite's own emptyOutDir wipes the directory before writing the
// fresh build back), since the OLD process has long since called
// app.listen() and has no reason to ever re-check the file again on its
// own. sendFile() reads straight off disk on every single request, so
// that live container hit a real, repeatable ENOENT the instant a request
// landed in that window -- confirmed directly in docker logs, seconds
// after "deploy complete," on the very next deploy after the first fix
// shipped.
//
// The actual fix: index.html is 7-8KB of static markup that never changes
// for the life of a running process (a real content change always ships
// with a restart, since auto_deploy.sh calls docker restart on every
// deploy) -- there was never a good reason to touch the filesystem for it
// on every request at all. Read once, held in memory, served from RAM.
// A container can now no longer be affected by a build wiping the very
// file out from under it after start, because it never looks at that file
// again after the one read below.
let indexHtml = null;

// Public pages that are plain React routes. A crawler that does not run
// JavaScript (GPTBot, ClaudeBot, PerplexityBot) used to receive the
// homepage's title, canonical and almost no text for every one of these.
// Each entry gives that page its own title, description, canonical and a
// short block of real, visible text; React replaces it on mount, the same
// way the /insights pages work.
const SITE = 'https://ayn.careers';
const PAGE_META = {
  '/': {
    h1: 'A resume tailored to every job you apply to',
    body: [
      'AYN finds real jobs on company career pages, never LinkedIn or Indeed, so you never waste an application on a ghost job.',
      'Score how well you match a job, then get a tailored resume and cover letter built only from your real work history. Nothing is invented.',
    ],
  },
  '/jobs': {
    title: 'Browse real jobs from company career pages | AYN',
    description: 'Search current jobs sourced straight from company career pages. No ghost listings, no account needed to browse.',
    h1: 'Browse real jobs',
    body: [
      'Every listing on AYN comes from a company’s own career page and is removed shortly after it stops being confirmed live.',
      'Search by title, city or remote, filter by category, then check how well your resume matches before you apply.',
    ],
    links: [['/salary-guide', 'Salary guide'], ['/insights', 'Hiring reports'], ['/check-resume', 'Check my resume']],
  },
  '/salary-guide': {
    title: 'Salary guide from real job listings | AYN',
    description: 'Median salaries, open roles and work-mode splits by category, computed from AYN’s current job listings.',
    h1: 'Salary guide',
    body: [
      'Median salary, number of open roles and the remote, hybrid and onsite split for each job category, computed from listings currently in AYN’s catalog.',
      'Only listings with a plausible USD salary are counted, and a category only appears once it has enough listings to be meaningful.',
    ],
    links: [['/insights', 'Hiring reports'], ['/jobs', 'Browse jobs']],
  },
  '/check-resume': {
    title: 'Check your resume against a job description | AYN',
    description: 'Paste your resume and a job description to see which requirements you match and which you are missing. Free, no account needed.',
    h1: 'Check my resume',
    body: [
      'Paste your resume and a job description to see which stated requirements your resume covers by wording, and which it does not.',
      'This is a free keyword check that needs no account. Sign up for the deeper match that understands meaning, not just matching words.',
    ],
  },
  '/pricing': {
    title: 'Pricing | AYN',
    description: 'AYN has a free plan for job seekers and paid plans with credits for tailored resumes and cover letters. Employers get a free first month.',
    h1: 'Pricing',
    body: [
      'Browsing jobs and scoring a match is free. Tailored resumes and cover letters use credits, and paid plans include more of them.',
      'Employers start with a free month, then choose a plan by how many searches, proposals and assessments they need.',
    ],
  },
  '/about': {
    title: 'About AYN',
    description: 'Why AYN exists: replace application volume with evidence, so being seen depends on what you have done.',
    h1: 'About AYN',
    body: [
      'AI made applying effortless, so everyone did. Hiring managers now open hundreds of applications and read none of them properly.',
      'AYN replaces volume with evidence: real jobs, matches grounded in your real history, and candidates who choose to be found.',
    ],
  },
  '/help': {
    title: 'Help Center | AYN',
    description: 'Answers about credits, tailored resumes, job matching, discoverability, accounts and billing.',
    h1: 'Help Center',
    body: ['Search answers about credits and billing, tailoring a resume, how job matching works, getting discovered by employers, and your account.'],
  },
  '/contact': {
    title: 'Contact AYN',
    description: 'Send AYN a message about an issue, a question, privacy, or employer access.',
    h1: 'Contact us',
    body: ['Use the form to tell us what is not working, ask a question, or raise a privacy or employer-access request.'],
  },
  '/employers': {
    title: 'AYN for employers: three real candidates, not a resume pile',
    description: 'Describe a role once and AYN returns the three strongest opted-in candidates with the evidence behind each. Every company is reviewed by hand.',
    h1: 'Three real people to read. Not a resume pile.',
    body: [
      'Every company is reviewed by hand before it can search. Describe the role once and AYN matches it against candidates who chose to be found.',
      'Each match shows the evidence behind it. Contact details are shared only when the candidate accepts.',
    ],
  },
  '/legal': { title: 'Legal | AYN', description: 'AYN’s terms, privacy policy and other legal documents.', h1: 'Legal', body: ['Terms of Service, Privacy Policy, Cookie Policy, Security Overview, Subprocessors, Data Processing Agreement, Service Level Agreement and Copyright Policy.'] },
  '/terms': { title: 'Terms of Service | AYN', description: 'The terms that apply when you use AYN.', h1: 'Terms of Service', body: ['The terms that apply when you use AYN.'] },
  '/privacy': { title: 'Privacy Policy | AYN', description: 'What personal information AYN collects, why, and the choices you have.', h1: 'Privacy Policy', body: ['What personal information AYN collects, why, and the choices you have.'] },
  '/cookies': { title: 'Cookie Policy | AYN', description: 'How AYN uses cookies and how to change your choice.', h1: 'Cookie Policy', body: ['How AYN uses cookies and how to change your choice.'] },
  '/security': { title: 'Security Overview | AYN', description: 'How AYN protects your data.', h1: 'Security Overview', body: ['How AYN protects your data.'] },
  '/subprocessors': { title: 'Subprocessors | AYN', description: 'The third parties AYN uses to process data.', h1: 'Subprocessors', body: ['The third parties AYN uses to process data.'] },
  '/dpa': { title: 'Data Processing Agreement | AYN', description: 'AYN’s data processing agreement for business customers.', h1: 'Data Processing Agreement', body: ['AYN’s data processing agreement for business customers.'] },
  '/sla': { title: 'Service Level Agreement | AYN', description: 'AYN’s service commitments for employer plans.', h1: 'Service Level Agreement', body: ['AYN’s service commitments for employer plans.'] },
  '/copyright': { title: 'Copyright Policy | AYN', description: 'How to report copyright infringement on AYN.', h1: 'Copyright Policy', body: ['How to report copyright infringement on AYN.'] },
  '/do-not-sell': { title: 'Do Not Sell or Share My Information | AYN', description: 'AYN does not sell personal information. How California residents exercise their rights.', h1: 'Do Not Sell or Share My Information', body: ['AYN does not sell personal information and does not share it for cross-context behavioural advertising.'] },
};

function renderPublicPage(pathname) {
  const meta = PAGE_META[pathname];
  if (!meta || indexHtml === null) return null;
  const canonical = pathname === '/' ? `${SITE}/` : `${SITE}${pathname}`;
  // The homepage keeps the title and description already in index.html.
  let html = indexHtml;
  if (meta.title) html = swapMeta(html, { title: meta.title, description: meta.description, canonical });
  const links = (meta.links || []).map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`).join(' · ');
  return injectRoot(html, `<main><h1>${escapeHtml(meta.h1)}</h1>${meta.body.map((t) => `<p>${escapeHtml(t)}</p>`).join('')}${links ? `<nav>${links}</nav>` : ''}</main>`);
}

// First page of jobs (and the first job's full posting) for the home and /jobs
// pages. Without this the browser loads the page, then the app, then asks for
// the list, then asks for the first job's details: two server round trips, in
// sequence, before anything shows. With it the data arrives inside the HTML.
// Must match PUBLIC_JOB_SUMMARY_COLUMNS, page size and ordering in
// src/components/landing/JobsBrowser.tsx. Served stale while it refreshes in
// the background, so a slow backend can never hold up the page.
const JOB_SUMMARY_COLUMNS = 'id,source,company,company_slug,company_logo_url,title,location,apply_url,posted_at,employment_type,seniority,salary_min,salary_max,salary_currency,category,work_mode,city,last_seen_at,first_seen_at,closure_status,closure_checked_at,closure_last_open_at,repost_count,years_required,sponsorship,salary_text_min,salary_text_max,salary_text_currency,salary_text_period,work_mode_text,benefits,remote_region,apply_by';
const JOBS_BOOT_FRESH_MS = 60 * 1000;
let jobsBoot = { data: null, at: 0, refreshing: null };

async function loadJobsBootstrap() {
  const key = requireSupabaseAnonKey();
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const base = `${SUPABASE_ORIGIN}/rest/v1/job_postings`;
  const filter = 'or=(scam_suspected.is.null,scam_suspected.eq.false)';
  const listRes = await fetch(`${base}?select=${JOB_SUMMARY_COLUMNS}&${filter}&order=posted_at.desc,id.asc`, {
    headers: { ...headers, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-24' },
    signal: AbortSignal.timeout(2500),
  });
  if (!listRes.ok) throw new Error(`jobs bootstrap list ${listRes.status}`);
  const rows = await listRes.json();
  const total = Number((listRes.headers.get('content-range') || '').split('/')[1]);
  if (!Array.isArray(rows) || !rows.length || !Number.isFinite(total)) throw new Error('jobs bootstrap empty');
  let detail = null;
  try {
    const dRes = await fetch(`${base}?select=${JOB_SUMMARY_COLUMNS},description,skills&id=eq.${encodeURIComponent(rows[0].id)}&${filter}&limit=1`, {
      headers, signal: AbortSignal.timeout(2500),
    });
    if (dRes.ok) detail = (await dRes.json())[0] || null;
  } catch { /* the page falls back to fetching it */ }
  return { rows, total, detail, at: Date.now() };
}

async function getJobsBootstrap() {
  const age = Date.now() - jobsBoot.at;
  if (jobsBoot.data && age < JOBS_BOOT_FRESH_MS) return jobsBoot.data;
  if (!jobsBoot.refreshing) {
    jobsBoot.refreshing = loadJobsBootstrap()
      .then((data) => { jobsBoot.data = data; jobsBoot.at = Date.now(); })
      .catch((err) => { console.error('jobs bootstrap failed:', err.message); })
      .finally(() => { jobsBoot.refreshing = null; });
  }
  if (jobsBoot.data) return jobsBoot.data;       // stale is fine; refresh runs behind it
  await jobsBoot.refreshing;                      // first request only
  return jobsBoot.data;
}

app.get('/{*path}', async (req, res) => {
  const status = isKnownRoute(req.path) ? 200 : 404;
  if (indexHtml === null) {
    // Only reachable if startWhenBuilt gave up after its own retries and
    // started the server anyway (a genuinely broken build) -- a real,
    // rare failure, not the transient race this whole fix targets.
    res.status(503).send('Service temporarily unavailable, please retry.');
    return;
  }
  let html = (status === 200 && renderPublicPage(req.path)) || indexHtml;
  // Only the plain, unfiltered job list: any search term or filter in the URL is a different query.
  if (status === 200 && (req.path === '/' || req.path === '/jobs') && Object.keys(req.query).length === 0) {
    try {
      const boot = await getJobsBootstrap();
      if (boot) {
        html = injectHead(html, `<script type="application/json" id="ayn-jobs-bootstrap">${JSON.stringify(boot).replace(/</g, '\\u003c')}</script>`);
      }
    } catch { /* serve the page without it */ }
  }
  res.status(status).type('html').send(html);
});

function startWhenBuilt(attemptsLeft = 30) {
  if (fs.existsSync(INDEX_HTML)) {
    indexHtml = fs.readFileSync(INDEX_HTML, 'utf8');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    return;
  }
  if (attemptsLeft <= 0) {
    console.error(`dist/index.html never appeared, starting anyway: ${INDEX_HTML}`);
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    return;
  }
  setTimeout(() => startWhenBuilt(attemptsLeft - 1), 200);
}

startWhenBuilt();
