import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, 'dist');

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
  '/', '/pricing', '/resume-match', '/resume-hub', '/contact', '/support', '/help', '/about',
  '/world-intelligence', '/terms', '/privacy', '/settings', '/billing',
  '/handoff', '/extension/approve', '/employer/pending', '/reset-password',
  '/approval-result', '/subscription-success', '/subscription-canceled',
  '/dashboard', '/admin',
];
const PREFIXES = ['/resume-hub/', '/dashboard/', '/admin/', '/sign/', '/nda/', '/manage-'];

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
