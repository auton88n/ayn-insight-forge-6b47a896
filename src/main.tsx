// Self-hosted fonts via @fontsource (replaces Google Fonts CDN)
import '@fontsource/syne/400.css';
import '@fontsource/syne/500.css';
import '@fontsource/syne/600.css';
import '@fontsource/syne/700.css';
import '@fontsource/syne/800.css';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/500.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/noto-sans-arabic/400.css';
import '@fontsource/noto-sans-arabic/500.css';
import '@fontsource/noto-sans-arabic/600.css';
import '@fontsource/noto-sans-arabic/700.css';

import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initPerformanceMonitoring } from '@/lib/performanceMonitor';

// Global handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  const message = event.reason?.message || String(event.reason) || 'Unhandled rejection';
  console.error('Unhandled promise rejection:', event.reason);
  // Log to Supabase — fire and forget
  import('@/integrations/supabase/client').then(({ supabase }) => {
    (supabase as any).from('error_logs').insert({
      source: 'frontend',
      severity: 'warning',
      error_message: message.slice(0, 1000),
      error_stack: event.reason?.stack?.slice(0, 3000) || null,
      url: window.location.href,
      user_agent: navigator.userAgent,
      status: 'open',
      context: { type: 'unhandledrejection' },
    }).then(() => {}).catch(() => {});
  }).catch(() => {});
});

createRoot(document.getElementById("root")!).render(<App />);
initPerformanceMonitoring();

// Register service worker for offline support
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
