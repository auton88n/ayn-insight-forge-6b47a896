/**
 * HomeTabRedirect -- v3.219.0. /pricing, /contact, /about and /help used
 * to be real pages with their own <Header/>/<Footer/> chrome, no sidebar.
 * Reported directly: "i click pricing... it does not take me to a
 * different page where i dont see the sidebar anymore." Their content now
 * lives as a tab on Home; these routes still exist so an old link,
 * bookmark, or search result keeps working, but land here first and hand
 * straight off to the real tab instead of rendering their own page.
 */
import { Navigate } from 'react-router-dom';
import { HOME_TAB_HANDOFF_KEY } from '@/components/LandingPage';
import type { HomeTabId } from './HomeTabs';

export const HomeTabRedirect = ({ tab }: { tab: HomeTabId }) => {
  try { sessionStorage.setItem(HOME_TAB_HANDOFF_KEY, tab); } catch { /* ignore */ }
  return <Navigate to="/" replace />;
};
