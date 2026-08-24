import { lazy, Suspense, useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { LanguageProvider } from "@/contexts/LanguageContext";
// Emotion state now managed by Zustand store (src/stores/emotionStore.ts)
// Debug state now managed by Zustand store (src/stores/debugStore.ts)

import { PageLoader } from "@/components/ui/page-loader";
// Skeleton layouts removed — using PageLoader for all route fallbacks
import { ErrorBoundary, isStaleChunkError } from "@/components/shared/ErrorBoundary";
import { OfflineBanner } from "@/components/shared/OfflineBanner";
import { ScrollToTop } from "@/components/shared/ScrollToTop";
// v3.34.0 — visitor tracking removed. It posted to an edge function that was
// deleted in v3.21.0, so every page view was a failed request.

import { HelmetProvider } from 'react-helmet-async';

// Warm only the routes used inside the dashboard. Preloading the whole site
// caused script/network contention and made page-to-page movement feel laggy.
function PreloadRoutes() {
  useEffect(() => {
    // A failed warm-up here used to be a silent, uncaught promise
    // rejection — it never reaches React's render cycle, so the
    // ErrorBoundary that recovers from this exact failure on a real
    // navigation could never see it happen here first. Since a stale
    // chunk on a background preload means the WHOLE app is running on a
    // build the server has already moved past (not just this one route),
    // reload once now — proactively, before the user ever hits it as a
    // stuck loading screen on a real click.
    const warm = (mod: () => Promise<unknown>) => {
      mod().catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        if (!isStaleChunkError(message)) return;
        try {
          if (sessionStorage.getItem('ayn_auto_reload_stale_chunk')) return;
          sessionStorage.setItem('ayn_auto_reload_stale_chunk', '1');
          window.location.reload();
        } catch { /* sessionStorage unavailable — not worth reloading blind */ }
      });
    };
    const preload = () => {
      // Warm chunks for the routes users actually click between, so
      // navigations don't flash the Suspense PageLoader.
      warm(() => import('./pages/Settings'));
    };
    const idleId = 'requestIdleCallback' in window
      ? window.requestIdleCallback(preload, { timeout: 3000 })
      : globalThis.setTimeout(preload, 3000);
    return () => {
      if ('cancelIdleCallback' in window) window.cancelIdleCallback(idleId as number);
      else globalThis.clearTimeout(idleId as number);
    };
  }, []);
  return null;
}

// Lazy load all route pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const Settings = lazy(() => import("./pages/Settings"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ApprovalResult = lazy(() => import("./pages/ApprovalResult"));
const EmployerPending = lazy(() => import("./pages/EmployerPending"));
const Employers = lazy(() => import("./pages/Employers"));

// const AIEmployee = lazy(() => import("./pages/services/AIEmployee"));
// const AIEmployeeApply = lazy(() => import("./pages/services/AIEmployeeApply"));
// HIDDEN: Content Creator Sites temporarily disabled
// const InfluencerSites = lazy(() => import("./pages/services/InfluencerSites"));
// const InfluencerSitesApply = lazy(() => import("./pages/services/InfluencerSitesApply"));
// const SolutionsPage = lazy(() => import("./pages/Solutions"));
const CheckResumePage = lazy(() => import("./pages/CheckResume"));
const PublicJobsPage = lazy(() => import("./pages/PublicJobs"));
const SalaryGuidePage = lazy(() => import("./pages/SalaryGuide"));
const ResumeHub = lazy(() => import("./pages/ResumeHub"));
// const AIAgents = lazy(() => import("./pages/services/AIAgents"));
// const AIAgentsApply = lazy(() => import("./pages/services/AIAgentsApply"));
// const Automation = lazy(() => import("./pages/services/Automation"));
// const AutomationApply = lazy(() => import("./pages/services/AutomationApply"));
// const Ticketing = lazy(() => import("./pages/services/Ticketing"));
// const TicketingApply = lazy(() => import("./pages/services/TicketingApply"));
const HomeTabRedirect = lazy(() => import("./components/landing/HomeTabRedirect").then(m => ({ default: m.HomeTabRedirect })));
const Billing = lazy(() => import("./pages/Billing"));
const SubscriptionSuccess = lazy(() => import("./pages/SubscriptionSuccess"));
const SubscriptionCanceled = lazy(() => import("./pages/SubscriptionCanceled"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const DoNotSell = lazy(() => import("./pages/DoNotSell"));
// v3.32.0 — every other legal document is the same renderer with a different slug.
const LegalIndex = lazy(() => import("./pages/LegalIndex"));
const LegalDoc = lazy(() => import("./components/legal/LegalPage"));
import { CookieConsent } from "@/components/shared/CookieConsent";

// Admin — lazy loaded so 3D/globe/main app code never loads for admin users
const AdminApp = lazy(() => import('./admin-app/AdminApp'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default freshness: 1 minute. Individual hooks override per CACHE_FRESHNESS class.
      // See src/lib/cacheFreshness.ts for freshness tiers.
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const AnimatedRoutes = () => {
  const location = useLocation();
  

  // Fast routes skip animation for instant navigation
  const fastRoutes = ['/settings', '/pricing'];
  const isFastRoute = fastRoutes.some(route => location.pathname.startsWith(route));
  
  const routes = (
    <Routes location={location}>
      <Route path="/" element={<Suspense fallback={<PageLoader />}><Index /></Suspense>} />
      {/* v3.12.0 — the legacy dashboard is gone. Anything pointing at it
          bounces to "/", which routes by role: Resume Hub for a seeker, the
          employer surface for an approved employer. */}
      <Route path="/dashboard" element={<Navigate to="/" replace />} />
      <Route path="/dashboard/*" element={<Navigate to="/" replace />} />
      {/* Fast routes - no animation wrapper */}
      <Route path="/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
      <Route path="/pricing" element={<Suspense fallback={<PageLoader />}><HomeTabRedirect tab="pricing" /></Suspense>} />

      <Route path="/billing" element={<Suspense fallback={<PageLoader />}><Billing /></Suspense>} />
      <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />



      <Route path="/contact" element={<Suspense fallback={<PageLoader />}><HomeTabRedirect tab="contact" /></Suspense>} />
      <Route path="/check-resume" element={<Suspense fallback={<PageLoader />}><CheckResumePage /></Suspense>} />
      <Route path="/jobs" element={<Suspense fallback={<PageLoader />}><PublicJobsPage /></Suspense>} />
      <Route path="/jobs/category/:category" element={<Suspense fallback={<PageLoader />}><PublicJobsPage /></Suspense>} />
      <Route path="/jobs/location/:location" element={<Suspense fallback={<PageLoader />}><PublicJobsPage /></Suspense>} />
      <Route path="/jobs/:id" element={<Suspense fallback={<PageLoader />}><PublicJobsPage /></Suspense>} />
      <Route path="/salary-guide" element={<Suspense fallback={<PageLoader />}><SalaryGuidePage /></Suspense>} />
      {/* v3.216.0 -- /features, /how-it-works, /why-ayn, /real-ai,
          /get-discovered, /messaging, /sourcing, /proof and /faq are gone.
          That content now lives as tabs on Home itself (SeekerSidebar +
          HomeTabs.tsx), never a route change -- "keep within the same
          page, all sections should open within it." */}
      <Route path="/resume-hub" element={<Suspense fallback={<PageLoader />}><ResumeHub /></Suspense>} />
      <Route path="/resume-hub/*" element={<Suspense fallback={<PageLoader />}><ResumeHub /></Suspense>} />
      <Route path="/employer/pending" element={<Suspense fallback={<PageLoader />}><EmployerPending /></Suspense>} />
      <Route path="/employers" element={<Suspense fallback={<PageLoader />}><Employers /></Suspense>} />
      <Route path="/help" element={<Suspense fallback={<PageLoader />}><HomeTabRedirect tab="help" /></Suspense>} />
      <Route path="/support" element={<Suspense fallback={<PageLoader />}><HomeTabRedirect tab="help" /></Suspense>} />
      <Route path="/about" element={<Suspense fallback={<PageLoader />}><HomeTabRedirect tab="about" /></Suspense>} />
      <Route path="/approval-result" element={<ApprovalResult />} />
      <Route path="/subscription-success" element={<SubscriptionSuccess />} />
      <Route path="/subscription-canceled" element={<SubscriptionCanceled />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/do-not-sell" element={<Suspense fallback={<PageLoader />}><DoNotSell /></Suspense>} />
      <Route path="/legal" element={<Suspense fallback={<PageLoader />}><LegalIndex /></Suspense>} />
      <Route path="/cookies" element={<Suspense fallback={<PageLoader />}><LegalDoc slug="cookies" /></Suspense>} />
      <Route path="/security" element={<Suspense fallback={<PageLoader />}><LegalDoc slug="security" /></Suspense>} />
      <Route path="/subprocessors" element={<Suspense fallback={<PageLoader />}><LegalDoc slug="subprocessors" /></Suspense>} />
      <Route path="/dpa" element={<Suspense fallback={<PageLoader />}><LegalDoc slug="dpa" /></Suspense>} />
      <Route path="/sla" element={<Suspense fallback={<PageLoader />}><LegalDoc slug="sla" /></Suspense>} />
      <Route path="/copyright" element={<Suspense fallback={<PageLoader />}><LegalDoc slug="copyright" /></Suspense>} />

      <Route path="/manage-bae76e99d97e188b" element={<Suspense fallback={<PageLoader />}><AdminApp /></Suspense>} />
      <Route path="/manage-bae76e99d97e188b/*" element={<Suspense fallback={<PageLoader />}><AdminApp /></Suspense>} />
      <Route path="/admin" element={<Navigate to="/404" replace />} />
      <Route path="/admin/*" element={<Navigate to="/404" replace />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );

  // PageTransition was a no-op wrapper and AnimatePresence mode="wait" was
  // delaying every navigation by waiting for an exit animation that doesn't
  // exist. Render routes directly for instant navigation.
  return routes;
};

const App = () => {
  // Detect admin subdomain and serve admin panel
  return (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeProvider defaultTheme="light" storageKey="ayn-theme">
                  <TooltipProvider>
                    <OfflineBanner />
                    <Toaster />
                    <Sonner />
                    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                      <ScrollToTop />
                      <PreloadRoutes />
                      <ErrorBoundary>
                        <Suspense fallback={<PageLoader />}>
                          <AnimatedRoutes />
                        </Suspense>
                      </ErrorBoundary>
                      <CookieConsent />
                    </BrowserRouter>
                  </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  </HelmetProvider>
);
};

export default App;
