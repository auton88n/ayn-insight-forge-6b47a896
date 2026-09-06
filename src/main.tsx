// v3.34.0 — fonts, trimmed to what the product actually renders.
//
// The entry stylesheet used to carry 129 font files and 244 kB of CSS because
// every family was imported with every subset (latin, latin-ext, cyrillic,
// greek, vietnamese) and two families were not used anywhere. Latin subsets
// only, and only the weights in use.
import '@fontsource/syne/latin-500.css';
import '@fontsource/syne/latin-600.css';
import '@fontsource/syne/latin-700.css';
import '@fontsource/inter-tight/latin-600.css';
import '@fontsource/inter-tight/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';

import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initAnalyticsFromConsent } from '@/lib/analytics';
import { reportClientError } from '@/lib/errorReporting';

// v3.357.0 -- ErrorBoundary.tsx only ever hears about a bug that crashes
// the whole page while React is rendering it. A promise that rejects
// with nothing awaiting it, or an error thrown inside a plain click
// handler or a setTimeout, never reaches an Error Boundary at all --
// React only catches errors during render/lifecycle/constructors of the
// tree beneath it. Both of those used to just print to the console and
// vanish; both now report through the same reportClientError() pipeline
// ErrorBoundary uses, so they reach the same admin-panel/email alert a
// page-crashing bug already did. Installed here, before the app even
// mounts, so a genuinely early boot-time failure is covered too.
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  const reason: any = event.reason;
  reportClientError({
    message: reason?.message ? String(reason.message) : String(reason),
    stack: reason?.stack || null,
    source: 'unhandled_rejection',
  });
});

window.addEventListener('error', (event) => {
  // A resource-loading failure (a broken <img>/<script>) fires an Event
  // on the failing element itself in the capture phase, not on window
  // in the bubble phase -- this listener never sees those (no `capture:
  // true` below), so only a real, bubbling JS runtime error reaches it.
  reportClientError({
    message: event.message || 'Unknown error',
    stack: event.error?.stack || null,
    source: 'global_error',
  });
});

createRoot(document.getElementById("root")!).render(<App />);
initAnalyticsFromConsent();



// Register service worker for offline support
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
