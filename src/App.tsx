import { lazy, Suspense, useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { LanguageProvider } from "@/contexts/LanguageContext";
// Emotion state now managed by Zustand store (src/stores/emotionStore.ts)
// Sound state now managed by Zustand store (src/stores/soundStore.ts)
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
// Debug state now managed by Zustand store (src/stores/debugStore.ts)

import { PageLoader } from "@/components/ui/page-loader";
// Skeleton layouts removed — using PageLoader for all route fallbacks
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { OfflineBanner } from "@/components/shared/OfflineBanner";
import { ScrollToTop } from "@/components/shared/ScrollToTop";
import { useVisitorTracking } from "@/hooks/useVisitorTracking";
import { HelmetProvider } from 'react-helmet-async';

// Warm only the routes used inside the dashboard. Preloading the whole site
// caused script/network contention and made page-to-page movement feel laggy.
function PreloadRoutes() {
  useEffect(() => {
    const preload = () => {
      // Warm chunks for the routes users actually click between, so
      // navigations don't flash the Suspense PageLoader.
      import('./pages/WorldIntelligence');
      import('./pages/Settings');
      import('./pages/Pricing');
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

// const AIEmployee = lazy(() => import("./pages/services/AIEmployee"));
// const AIEmployeeApply = lazy(() => import("./pages/services/AIEmployeeApply"));
// HIDDEN: Content Creator Sites and Engineering tools temporarily disabled
// const InfluencerSites = lazy(() => import("./pages/services/InfluencerSites"));
// const InfluencerSitesApply = lazy(() => import("./pages/services/InfluencerSitesApply"));
// const SolutionsPage = lazy(() => import("./pages/Solutions"));
const ContactPage = lazy(() => import("./pages/Contact"));
// const AIAgents = lazy(() => import("./pages/services/AIAgents"));
// const AIAgentsApply = lazy(() => import("./pages/services/AIAgentsApply"));
// const Automation = lazy(() => import("./pages/services/Automation"));
// const AutomationApply = lazy(() => import("./pages/services/AutomationApply"));
// const Ticketing = lazy(() => import("./pages/services/Ticketing"));
// const TicketingApply = lazy(() => import("./pages/services/TicketingApply"));
const Support = lazy(() => import("./pages/Support"));
// HIDDEN: Engineering & Compliance features temporarily disabled
// const Engineering = lazy(() => import("./pages/EngineeringWorkspacePage"));
// const Compliance = lazy(() => import("./pages/CompliancePage"));
// const AIGradingDesigner = lazy(() => import("./pages/AIGradingDesigner"));
// HIDDEN: CivilEngineering service page temporarily disabled
// const CivilEngineering = lazy(() => import('./pages/services/CivilEngineering'));
const Pricing = lazy(() => import("./pages/Pricing"));
const DashboardPricing = lazy(() => import("./components/dashboard/DashboardPricing"));
const SubscriptionSuccess = lazy(() => import("./pages/SubscriptionSuccess"));
const SubscriptionCanceled = lazy(() => import("./pages/SubscriptionCanceled"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const WorldIntelligence = lazy(() => import("./pages/WorldIntelligence"));
const AdminCustomOrders = lazy(() => import("./pages/AdminCustomOrders"));
const ClientSign = lazy(() => import("./pages/ClientSign"));
const NDASign = lazy(() => import("./pages/NDASign"));

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
  
  // Track page visits for analytics
  useVisitorTracking();

  // Fast routes skip animation for instant navigation
  const fastRoutes = ['/settings', '/pricing', '/dashboard/pricing'];
  const isFastRoute = fastRoutes.some(route => location.pathname.startsWith(route));
  
  const routes = (
    <Routes location={location}>
      <Route path="/" element={<Suspense fallback={<PageLoader />}><Index /></Suspense>} />
      {/* Guard: stray /dashboard links bounce to the real dashboard at / */}
      <Route path="/dashboard" element={<Navigate to="/" replace />} />
      {/* Fast routes - no animation wrapper */}
      <Route path="/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
      <Route path="/pricing" element={<Suspense fallback={<PageLoader />}><Pricing /></Suspense>} />
      <Route path="/dashboard/pricing" element={<Suspense fallback={<PageLoader />}><DashboardPricing /></Suspense>} />

      <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />



      <Route path="/contact" element={<Suspense fallback={<PageLoader />}><ContactPage /></Suspense>} />
      <Route path="/support" element={<Support />} />
      {/* HIDDEN: Engineering & Compliance routes temporarily disabled
      <Route path="/engineering" element={<Suspense fallback={<PageLoader />}><Engineering /></Suspense>} />
      <Route path="/compliance" element={<Suspense fallback={<PageLoader />}><Compliance /></Suspense>} />
      <Route path="/engineering/grading" element={<Suspense fallback={<PageLoader />}><AIGradingDesigner /></Suspense>} />
      */}
      {/* HIDDEN: Civil engineering redirect disabled */}
      {/* <Route path="/solutions/civil-engineering" element={<Navigate to="/" replace />} /> */}
      <Route path="/approval-result" element={<ApprovalResult />} />
      <Route path="/subscription-success" element={<SubscriptionSuccess />} />
      <Route path="/subscription-canceled" element={<SubscriptionCanceled />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/world-intelligence" element={<Suspense fallback={<PageLoader />}><WorldIntelligence /></Suspense>} />
      <Route path="/admin/custom-orders" element={<Suspense fallback={<PageLoader />}><AdminCustomOrders /></Suspense>} />
      <Route path="/sign/:token" element={<Suspense fallback={<PageLoader />}><ClientSign /></Suspense>} />
      <Route path="/nda/:token" element={<Suspense fallback={<PageLoader />}><NDASign /></Suspense>} />
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
              <SubscriptionProvider>
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
                    </BrowserRouter>
                  </TooltipProvider>
              </SubscriptionProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  </HelmetProvider>
);
};

export default App;
