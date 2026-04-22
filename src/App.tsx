import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { PageLoader } from "@/components/ui/page-loader";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { OfflineBanner } from "@/components/shared/OfflineBanner";
import { AnimatePresence } from 'framer-motion';
import PageTransition from "@/components/shared/PageTransition";
import { ScrollToTop } from "@/components/shared/ScrollToTop";
import { useVisitorTracking } from "@/hooks/useVisitorTracking";
import { HelmetProvider } from 'react-helmet-async';

// Lazy load all route pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const Settings = lazy(() => import("./pages/Settings"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ApprovalResult = lazy(() => import("./pages/ApprovalResult"));

const AIEmployee = lazy(() => import("./pages/services/AIEmployee"));
const AIEmployeeApply = lazy(() => import("./pages/services/AIEmployeeApply"));
const ServicesPage = lazy(() => import("./pages/Services"));
const ContactPage = lazy(() => import("./pages/Contact"));
const AIAgents = lazy(() => import("./pages/services/AIAgents"));
const AIAgentsApply = lazy(() => import("./pages/services/AIAgentsApply"));
const Automation = lazy(() => import("./pages/services/Automation"));
const AutomationApply = lazy(() => import("./pages/services/AutomationApply"));
const Ticketing = lazy(() => import("./pages/services/Ticketing"));
const TicketingApply = lazy(() => import("./pages/services/TicketingApply"));
const Support = lazy(() => import("./pages/Support"));
const Pricing = lazy(() => import("./pages/Pricing"));
const DashboardPricing = lazy(() => import("./components/dashboard/DashboardPricing"));
const SubscriptionSuccess = lazy(() => import("./pages/SubscriptionSuccess"));
const SubscriptionCanceled = lazy(() => import("./pages/SubscriptionCanceled"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const WorldIntelligence = lazy(() => import("./pages/WorldIntelligence"));
const PredictionGraphPage = lazy(() => import("./pages/PredictionGraphPage"));
const PredictionControlPanel = lazy(() => import("./pages/PredictionControlPanel"));
const AdminCustomOrders = lazy(() => import("./pages/AdminCustomOrders"));
const ClientSign = lazy(() => import("./pages/ClientSign"));
const NDASign = lazy(() => import("./pages/NDASign"));

// Admin Panel
const AdminApp = lazy(() => import('./admin-app/AdminApp'));

// Feature Gating
const ComingSoon = lazy(() => import("./components/shared/ComingSoon"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const AnimatedRoutes = () => {
  const location = useLocation();
  useVisitorTracking();

  const fastRoutes = ['/settings', '/pricing', '/dashboard/pricing'];
  const isFastRoute = fastRoutes.some(route => location.pathname.startsWith(route));
  
  const routes = (
    <Routes location={location} key={isFastRoute ? 'fast' : location.pathname}>
      <Route path="/" element={<Suspense fallback={<PageLoader />}><PageTransition><Index /></PageTransition></Suspense>} />
      <Route path="/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
      <Route path="/pricing" element={<Suspense fallback={<PageLoader />}><Pricing /></Suspense>} />
      <Route path="/dashboard/pricing" element={<Suspense fallback={<PageLoader />}><DashboardPricing /></Suspense>} />
      <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><PageTransition><ResetPassword /></PageTransition></Suspense>} />
      
      <Route path="/services" element={<Suspense fallback={<PageLoader />}><PageTransition><ServicesPage /></PageTransition></Suspense>} />
      <Route path="/services/ai-employee" element={<Suspense fallback={<PageLoader />}><PageTransition><AIEmployee /></PageTransition></Suspense>} />
      <Route path="/services/ai-employee/apply" element={<Suspense fallback={<PageLoader />}><PageTransition><AIEmployeeApply /></PageTransition></Suspense>} />
      
      {/* Ghost Routes -> ComingSoon */}
      <Route path="/services/content-creator-sites" element={<Suspense fallback={<PageLoader />}><ComingSoon /></Suspense>} />
      <Route path="/services/content-creator-sites/apply" element={<Suspense fallback={<PageLoader />}><ComingSoon /></Suspense>} />
      <Route path="/engineering" element={<Suspense fallback={<PageLoader />}><ComingSoon /></Suspense>} />
      <Route path="/compliance" element={<Suspense fallback={<PageLoader />}><ComingSoon /></Suspense>} />
      <Route path="/engineering/grading" element={<Suspense fallback={<PageLoader />}><ComingSoon /></Suspense>} />
      
      <Route path="/services/ai-agents" element={<Suspense fallback={<PageLoader />}><PageTransition><AIAgents /></PageTransition></Suspense>} />
      <Route path="/services/ai-agents/apply" element={<Suspense fallback={<PageLoader />}><PageTransition><AIAgentsApply /></PageTransition></Suspense>} />
      <Route path="/services/automation" element={<Suspense fallback={<PageLoader />}><PageTransition><Automation /></PageTransition></Suspense>} />
      <Route path="/services/automation/apply" element={<Suspense fallback={<PageLoader />}><PageTransition><AutomationApply /></PageTransition></Suspense>} />
      <Route path="/services/ticketing" element={<Suspense fallback={<PageLoader />}><PageTransition><Ticketing /></PageTransition></Suspense>} />
      <Route path="/services/ticketing/apply" element={<Suspense fallback={<PageLoader />}><PageTransition><TicketingApply /></PageTransition></Suspense>} />
      <Route path="/contact" element={<Suspense fallback={<PageLoader />}><PageTransition><ContactPage /></PageTransition></Suspense>} />
      <Route path="/support" element={<PageTransition><Support /></PageTransition>} />
      
      <Route path="/approval-result" element={<PageTransition><ApprovalResult /></PageTransition>} />
      <Route path="/subscription-success" element={<PageTransition><SubscriptionSuccess /></PageTransition>} />
      <Route path="/subscription-canceled" element={<PageTransition><SubscriptionCanceled /></PageTransition>} />
      <Route path="/terms" element={<PageTransition><Terms /></PageTransition>} />
      <Route path="/privacy" element={<PageTransition><Privacy /></PageTransition>} />
      <Route path="/world-intelligence" element={<Suspense fallback={<PageLoader />}><WorldIntelligence /></Suspense>} />
      <Route path="/prediction-graph" element={<Suspense fallback={<PageLoader />}><PredictionGraphPage /></Suspense>} />
      <Route path="/prediction-control" element={<Suspense fallback={<PageLoader />}><PredictionControlPanel /></Suspense>} />
      <Route path="/sign/:token" element={<Suspense fallback={<PageLoader />}><ClientSign /></Suspense>} />
      <Route path="/nda/:token" element={<Suspense fallback={<PageLoader />}><NDASign /></Suspense>} />
      
      {/* Standard Admin Routes */}
      <Route path="/admin" element={<Suspense fallback={<PageLoader />}><AdminApp /></Suspense>} />
      <Route path="/admin/*" element={<Suspense fallback={<PageLoader />}><AdminApp /></Suspense>} />
      <Route path="/admin/custom-orders" element={<Suspense fallback={<PageLoader />}><AdminCustomOrders /></Suspense>} />
      
      {/* Legacy Redirects */}
      <Route path="/manage-bae76e99d97e188b/*" element={<Navigate to="/admin" replace />} />

      <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
    </Routes>
  );

  if (isFastRoute) return routes;

  return (
    <AnimatePresence mode="wait">
      {routes}
    </AnimatePresence>
  );
};

const App = () => {
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
