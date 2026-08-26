/**
 * SeekerSidebar -- the collapsible left nav for the seeker home page.
 *
 * v3.215.0 -- direct instruction, with a reference screenshot: the site
 * needs a slider-collapsible sidebar, home is the job search, the other
 * pages are the explanations, reached from the sidebar -- the same
 * STRUCTURAL pattern Resume Hub's own icon rail already uses once someone
 * signs in.
 *
 * v3.216.0 -- "when you make a page open dont take me to new page keep
 * within the same page all sections should open within it." The seven
 * explanation items (Features through FAQ) are no longer routes at all;
 * they're plain buttons that flip local tab state on Home, the identical
 * mechanism Resume Hub's own tabs use (never a URL change). Job search,
 * Check my resume, Salary guide, Pricing and Contact stay real routes --
 * each is a substantial, independently useful, SEO-real page in its own
 * right, not an explanation of the product.
 *
 * v3.223.0 -- "Browse jobs" (-> /jobs) is gone as its own nav item.
 * Reported directly: "why we have job search and browser delete the
 * browser only the job search is the browser not having two" -- Job
 * search (this button, right below) already renders the exact same
 * JobsBrowser component /jobs does, just embedded on Home instead of
 * wrapped in its own route, so the two entries read as two different
 * tools when they're the same one. /jobs itself is untouched -- it's
 * still a real, separately reachable, SEO-crawlable route (JobPosting
 * schema, the sitemap, category/location hub pages, CheckResume and
 * SalaryGuide's own cross-links into it all still work), it's just not
 * repeated a second time in this list next to its own duplicate.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Search, FileCheck2, Tag, Sparkles, Route, Scale, Radar,
  CheckCircle2, HelpCircle, Mail, Info, LifeBuoy, LogIn,
  LogOut, User, Menu, X, Briefcase, Inbox, ClipboardCheck, Settings as SettingsIcon, Target, Gavel,
  ChevronDown, Building2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AuthModal } from '@/components/auth/AuthModal';
import aynWordmark from '@/assets/ayn-logo.png';
import { TAB_META, MORE_TAB_META, ACCOUNT_TAB_META, HOME_TAB_HANDOFF_KEY, type HomeTabId } from './HomeTabs';
import type { User as SupabaseUser } from '@supabase/supabase-js';

// v3.216.0 -- the full wordmark reads broken/clipped at collapsed rail
// width; the icon-only mark (already used by AdminApp/AynLoader/
// ErrorBoundary) is the correct asset once there's no room for text.
const AYN_ICON = '/ayn-mark.svg';

const TAB_ICONS: Record<Exclude<HomeTabId, 'search'>, typeof Search> = {
  features: Sparkles,
  'how-it-works': Route,
  'why-ayn': Scale,
  'get-discovered': Radar,
  proof: CheckCircle2,
  faq: HelpCircle,
  pricing: Tag,
  contact: Mail,
  about: Info,
  help: LifeBuoy,
  profile: User,
  'matched-jobs': Target,
  'saved-jobs': Briefcase,
  proposals: Inbox,
  assessments: ClipboardCheck,
  'account-settings': SettingsIcon,
};

const TOOL_LINKS = [
  { to: '/check-resume', label: 'Check my resume', icon: FileCheck2 },
  { to: '/salary-guide', label: 'Salary guide', icon: Tag },
];

const COLLAPSE_KEY = 'ayn_sidebar_collapsed';

// v3.220.0 -- both now optional: /jobs, /salary-guide and /check-resume
// stay real, separate, SEO-crawlable routes (JobPosting schema, the
// sitemap and the category/location hub pages all need a real URL) but
// still render this exact sidebar, not the old Header/Footer chrome, so
// it's never gone just because you're on a page that isn't Home. On one
// of those routes there's no local tab state to flip -- clicking a tab
// button there hands off to Home the same way an old /pricing link does.
type Props = {
  activeTab?: HomeTabId;
  onSelectTab?: (tab: HomeTabId) => void;
};

export const SeekerSidebar = ({ activeTab, onSelectTab }: Props) => {
  const location = useLocation();
  const navigate = useNavigate();
  const onHome = location.pathname === '/';
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  // null = the visitor hasn't touched this toggle yet, so it follows the
  // default (expanded signed out, collapsed signed in unless the active
  // tab already lives in this group); a real click always wins after that.
  const [learnManuallyOpen, setLearnManuallyOpen] = useState<boolean | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
    // v3.242.0 -- the brand button above renders inside the mobile drawer
    // too (same shared `nav`), where the rail never actually collapses
    // (the mobile media query never applies `.is-collapsed` to it) -- a
    // tap there closes the drawer instead, the one thing tapping the logo
    // usefully does in that context, rather than silently flipping a
    // desktop-only state that only surfaces later if the window is resized.
    setMobileOpen(false);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const activeInLearnGroup = onHome && TAB_META.some((t) => t.id === activeTab);
  const learnOpen = learnManuallyOpen ?? (!user || activeInLearnGroup);

  const selectTab = (tab: HomeTabId) => {
    if (onHome && onSelectTab) {
      onSelectTab(tab);
    } else {
      try { sessionStorage.setItem(HOME_TAB_HANDOFF_KEY, tab); } catch { /* ignore */ }
      navigate('/');
    }
    setMobileOpen(false);
  };

  const nav = (
    <>
      <div className="lp-sidebar-top">
        {/* v3.242.0 -- reported directly against two cropped screenshots
            (the AYN mark, and the separate panel-collapse icon next to
            it): make the AYN icon itself the thing that opens and closes
            the rail. The logo no longer navigates home on desktop -- "Job
            search", the very first nav item below, already does that
            (selectTab('search'), the same handler this link used to
            call), so nothing is lost by retiring the second path to the
            same place. The standalone collapse/expand button is gone;
            this is now the only control for it. */}
        <button
          type="button"
          className="lp-sidebar-brand"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <img src={AYN_ICON} alt="" style={{ height: 26, width: 26 }} />
            : <img src={aynWordmark} alt="AYN" style={{ height: 24, width: 'auto' }} />}
        </button>
        <button type="button" className="lp-sidebar-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      <nav className="lp-sidebar-nav" aria-label="AYN">
        <div className="lp-sidebar-group">
          {/* v3.237.0 -- reported directly, against a screenshot of this
              exact active-highlight pill: real routes this same tool also
              answers to (/jobs and its /jobs/:id, /jobs/category/:x,
              /jobs/location/:x variants -- the identical JobsBrowser
              component this button's own Home tab embeds, per v3.223.0's
              own history) left the whole sidebar with nothing highlighted
              at all, since neither this check nor TOOL_LINKS' own
              exact-pathname check ever matched them. */}
          <button
            type="button"
            className={`lp-sidebar-link ${(onHome && activeTab === 'search') || location.pathname.startsWith('/jobs') ? 'is-active' : ''}`}
            onClick={() => selectTab('search')}
            title={collapsed ? 'Job search' : undefined}
          >
            <Search size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
            <span className="lp-sidebar-link-label">Job search</span>
          </button>
          {TOOL_LINKS.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to} to={item.to}
                className={`lp-sidebar-link ${active ? 'is-active' : ''}`}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
                <span className="lp-sidebar-link-label">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* v3.228.0 -- Profile/Saved jobs/Proposals/Assessments/Settings,
            the pages that used to only exist behind the separate
            /resume-hub shell. Always visible here, signed in or not --
            what's gated is the content each tab shows once open. */}
        <div className="lp-sidebar-group">
          <span className="lp-sidebar-group-label">Your account</span>
          {ACCOUNT_TAB_META.map((item) => {
            const Icon = TAB_ICONS[item.id as Exclude<HomeTabId, 'search'>];
            const active = onHome && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`lp-sidebar-link ${active ? 'is-active' : ''}`}
                onClick={() => selectTab(item.id)}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
                <span className="lp-sidebar-link-label">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="lp-sidebar-group">
          {collapsed ? (
            <span className="lp-sidebar-group-label">Learn about AYN</span>
          ) : (
            <button
              type="button"
              className="lp-sidebar-group-toggle"
              onClick={() => setLearnManuallyOpen(!learnOpen)}
              aria-expanded={learnOpen}
            >
              <span className="lp-sidebar-group-label">Learn about AYN</span>
              <ChevronDown size={13} strokeWidth={2.2} className={`lp-sidebar-group-chevron ${learnOpen ? 'is-open' : ''}`} />
            </button>
          )}
          {(collapsed || learnOpen) && TAB_META.map((item) => {
            const Icon = TAB_ICONS[item.id as Exclude<HomeTabId, 'search'>];
            const active = onHome && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`lp-sidebar-link ${active ? 'is-active' : ''}`}
                onClick={() => selectTab(item.id)}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
                <span className="lp-sidebar-link-label">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="lp-sidebar-group">
          <span className="lp-sidebar-group-label">Company</span>
          {MORE_TAB_META.map((item) => {
            const Icon = TAB_ICONS[item.id as Exclude<HomeTabId, 'search'>];
            const active = onHome && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`lp-sidebar-link ${active ? 'is-active' : ''}`}
                onClick={() => selectTab(item.id)}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
                <span className="lp-sidebar-link-label">{item.label}</span>
              </button>
            );
          })}
          {/* v3.248.0 -- reported directly: "we need to add the employer
              portal." It already existed, fully built (EmployerHub.tsx,
              the whole intake/search/proposal/assessment flow) -- a
              repo-wide grep for any link to /employers turned up zero
              results anywhere in src/, confirmed live too: a brand new
              signed-out visitor lands on the seeker's own Browse Jobs
              view with no hero, no toggle, and no door at all to the
              other audience, since v3.213.0/v3.218.0 removed the hero
              (and its own toggle/door) from the seeker route entirely and
              nothing replaced it once the sidebar became the primary
              nav. A real route with zero way to reach it from anywhere
              in the live app. Added here, in Company, deliberately at the
              same quiet weight as every other link in this group -- the
              site still commits to the seeker identity as its default
              (v3.210.0's own standing design), this is a real door, not
              equal billing with it. */}
          <Link
            to="/employers"
            className={`lp-sidebar-link ${location.pathname === '/employers' ? 'is-active' : ''}`}
            onClick={() => setMobileOpen(false)}
            title={collapsed ? 'For employers' : undefined}
          >
            <Building2 size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
            <span className="lp-sidebar-link-label">For employers</span>
          </Link>
          <Link
            to="/legal"
            className={`lp-sidebar-link ${location.pathname === '/legal' ? 'is-active' : ''}`}
            onClick={() => setMobileOpen(false)}
            title={collapsed ? 'Legal' : undefined}
          >
            <Gavel size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
            <span className="lp-sidebar-link-label">Legal</span>
          </Link>
        </div>
      </nav>

      <div className="lp-sidebar-bottom">
        {user ? (
          <div className="lp-sidebar-user">
            <span className="lp-sidebar-user-avatar" title={user.email} aria-label={user.email} style={{ fontSize: 12, fontWeight: 700 }}>
              {(user.email || '?')[0].toUpperCase()}
            </span>
            <button type="button" onClick={handleSignOut} className="lp-sidebar-signout" title="Sign out" aria-label="Sign out" style={{ marginLeft: 'auto' }}>
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="lp-btn lp-btn-primary lp-sidebar-cta"
            onClick={() => setAuthOpen(true)}
            title={collapsed ? 'Sign in or start free' : undefined}
          >
            {/* v3.242.0 -- reported directly: "better icon for sign in."
                This button had no icon at all, so collapsing the rail left
                a solid, completely blank pill with nothing telling anyone
                what it does -- confirmed live, the exact shape in the
                report's own screenshot. */}
            <LogIn size={16} className="lp-sidebar-link-icon" />
            <span className="lp-sidebar-link-label">Start free</span>
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Slim mobile bar: hamburger opens the sidebar as a drawer. */}
      <div className="lp-sidebar-mobile-bar">
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu" className="lp-sidebar-mobile-trigger">
          <Menu size={20} />
        </button>
        <Link to="/" aria-label="AYN home" onClick={() => selectTab('search')}>
          <img src={aynWordmark} alt="AYN" style={{ height: 24, width: 'auto' }} />
        </Link>
        <span style={{ width: 20 }} />
      </div>

      <aside className={`lp-sidebar ${collapsed ? 'is-collapsed' : ''}`}>{nav}</aside>

      {mobileOpen && (
        <div className="lp-sidebar-scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}
      <aside className={`lp-sidebar lp-sidebar-mobile ${mobileOpen ? 'is-open' : ''}`}>{nav}</aside>

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} initialRole="job_seeker" />
    </>
  );
};
