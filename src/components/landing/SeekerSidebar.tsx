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
 * Browse jobs, Check my resume, Salary guide, Pricing and Contact stay
 * real routes -- each is a substantial, independently useful, SEO-real
 * page in its own right, not an explanation of the product.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Search, Briefcase, FileCheck2, Tag, Sparkles, Route, Scale, Radar,
  MessageSquare, CheckCircle2, HelpCircle, Mail, Info, LifeBuoy, PanelLeftClose,
  PanelLeftOpen, LogOut, User, Menu, X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AuthModal } from '@/components/auth/AuthModal';
import aynWordmark from '@/assets/ayn-logo.png';
import { TAB_META, MORE_TAB_META, type HomeTabId } from './HomeTabs';
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
  messaging: MessageSquare,
  proof: CheckCircle2,
  faq: HelpCircle,
  pricing: Tag,
  contact: Mail,
  about: Info,
  help: LifeBuoy,
};

const TOOL_LINKS = [
  { to: '/jobs', label: 'Browse jobs', icon: Briefcase },
  { to: '/check-resume', label: 'Check my resume', icon: FileCheck2 },
  { to: '/salary-guide', label: 'Salary guide', icon: Tag },
];

const COLLAPSE_KEY = 'ayn_sidebar_collapsed';

type Props = {
  activeTab: HomeTabId;
  onSelectTab: (tab: HomeTabId) => void;
};

export const SeekerSidebar = ({ activeTab, onSelectTab }: Props) => {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

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
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const selectTab = (tab: HomeTabId) => {
    onSelectTab(tab);
    setMobileOpen(false);
  };

  const nav = (
    <>
      <div className="lp-sidebar-top">
        <Link to="/" className="lp-sidebar-brand" aria-label="AYN home" onClick={() => selectTab('search')}>
          {collapsed
            ? <img src={AYN_ICON} alt="" style={{ height: 26, width: 26 }} />
            : <img src={aynWordmark} alt="AYN" style={{ height: 24, width: 'auto' }} />}
        </Link>
        <button
          type="button"
          className="lp-sidebar-toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
        <button type="button" className="lp-sidebar-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      <nav className="lp-sidebar-nav" aria-label="AYN">
        <div className="lp-sidebar-group">
          <button
            type="button"
            className={`lp-sidebar-link ${activeTab === 'search' && location.pathname === '/' ? 'is-active' : ''}`}
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

        <div className="lp-sidebar-group">
          {TAB_META.map((item) => {
            const Icon = TAB_ICONS[item.id as Exclude<HomeTabId, 'search'>];
            const active = location.pathname === '/' && activeTab === item.id;
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
          {MORE_TAB_META.map((item) => {
            const Icon = TAB_ICONS[item.id as Exclude<HomeTabId, 'search'>];
            const active = location.pathname === '/' && activeTab === item.id;
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
      </nav>

      <div className="lp-sidebar-bottom">
        {user ? (
          <div className="lp-sidebar-user">
            <span className="lp-sidebar-user-avatar"><User size={14} /></span>
            <span className="lp-sidebar-link-label lp-sidebar-user-email">{user.email}</span>
            <button type="button" onClick={handleSignOut} className="lp-sidebar-signout" title="Sign out" aria-label="Sign out">
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <button type="button" className="lp-btn lp-btn-primary lp-sidebar-cta" onClick={() => setAuthOpen(true)}>
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
