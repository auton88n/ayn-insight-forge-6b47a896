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

// Global handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

createRoot(document.getElementById("root")!).render(<App />);
initAnalyticsFromConsent();



// Register service worker for offline support
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
