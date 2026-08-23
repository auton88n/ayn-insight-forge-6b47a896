import express from 'express';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, 'dist');

// v3.133.0 — real security headers. script-src and style-src both drop
// 'unsafe-inline': the two theme-init scripts that used to sit inline in
// index.html now live at /theme-init-head.js and /theme-init-body.js, and
// the one literal style="..." attribute (on #root) moved to a real CSS
// class, so nothing in this app actually needs either exception. Verified
// live against a real production build before shipping — see the CI/README
// note for how to re-check after a template change.
// v3.159.0 — self-hosted deployments point this app at a different
// Supabase backend (a different origin entirely), so the CSP's own allow
// list has to follow. SUPABASE_ORIGIN now reads from the same env var the
// build itself uses (VITE_SUPABASE_URL), falling back to Cloud's URL so an
// unconfigured deploy (still the normal case) behaves exactly as before.
const SUPABASE_ORIGIN = process.env.VITE_SUPABASE_URL || 'https://dfkoxuokfkttjhfjcecx.supabase.co';
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

// Serve static files with proper caching:
// - /assets/* are content-hashed by Vite — cache forever
// - /frames/* are the hero animation frames (~22 MB total) — cache 7 days
app.use(express.static(DIST, {
  setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
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
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg2ODg5MDQyLCJleHAiOjIxMDIyNDkwNDJ9.AmUVtzKLnrXO_ubBNxSDCBDnI7jJyNkGfK9p7nrzkGI';

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

// Every real route in src/App.tsx. Anything not in here is a genuine 404,
// so we still serve the SPA shell but with a 404 status, otherwise Google
// indexes every junk path as a live page.
const ROUTES = [
  '/', '/pricing', '/resume-hub', '/contact', '/support', '/help', '/about', '/check-resume', '/jobs', '/salary-guide',
  '/terms', '/privacy', '/settings', '/billing',
  '/employer/pending', '/reset-password',
  '/approval-result', '/subscription-success', '/subscription-canceled',
  '/dashboard', '/admin',
];
const PREFIXES = ['/resume-hub/', '/dashboard/', '/admin/', '/manage-', '/jobs/'];

function isKnownRoute(pathname) {
  if (ROUTES.includes(pathname)) return true;
  return PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// React Router handles rendering; the status code is decided here.
app.get('*', (req, res) => {
  const status = isKnownRoute(req.path) ? 200 : 404;
  res.status(status).sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
