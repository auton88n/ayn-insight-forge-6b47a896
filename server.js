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

// Every real route in src/App.tsx. Anything not in here is a genuine 404,
// so we still serve the SPA shell but with a 404 status, otherwise Google
// indexes every junk path as a live page.
const ROUTES = [
  '/', '/pricing', '/resume-hub', '/contact', '/support', '/help', '/about', '/check-resume', '/jobs',
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
