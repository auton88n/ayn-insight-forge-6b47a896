/**
 * SeekerSidebar -- the collapsible left nav shell for every seeker page
 * (Home plus the nine explanation pages), replacing the old fixed top
 * Header + horizontal MarketingSubNav strip.
 *
 * v3.215.0 -- direct instruction, with a reference screenshot: the site
 * needs a slider-collapsible sidebar, home is the job search, the other
 * pages are the explanations, reached from the sidebar -- the same
 * STRUCTURAL pattern (not the reference's own dark purple branding) that
 * Resume Hub's own icon rail already uses once someone signs in. This is
 * the fix for the standing complaint that signing in shows "a different
 * dashboard": both now share the same shell shape, a collapsible sidebar
 * plus a main content pane, not a fixed top bar for one and a sidebar for
 * the other.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Search, Briefcase, FileCheck2, Tag, Sparkles, Route, Scale, Bot, Radar,
  MessageSquare, Building2, CheckCircle2, HelpCircle, Mail, PanelLeftClose,
  PanelLeftOpen, LogOut, User, Menu, X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AuthModal } from '@/components/auth/AuthModal';
import aynMark from '@/assets/ayn-logo.png';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const NAV_GROUPS: { items: { to: string; label: string; icon: typeof Search }[] }[] = [
  {
    items: [
      { to: '/', label: 'Job search', icon: Search },
      { to: '/jobs', label: 'Browse jobs', icon: Briefcase },
      { to: '/check-resume', label: 'Check my resume', icon: FileCheck2 },
      { to: '/salary-guide', label: 'Salary guide', icon: Tag },
    ],
  },
  {
    items: [
      { to: '/features', label: 'Features', icon: Sparkles },
      { to: '/how-it-works', label: 'How it works', icon: Route },
      { to: '/why-ayn', label: 'Why AYN', icon: Scale },
      { to: '/real-ai', label: 'Real AI', icon: Bot },
      { to: '/get-discovered', label: 'Get discovered', icon: Radar },
      { to: '/messaging', label: 'Messaging', icon: MessageSquare },
      { to: '/sourcing', label: 'Where jobs come from', icon: Building2 },
      { to: '/proof', label: 'Proof', icon: CheckCircle2 },
      { to: '/faq', label: 'FAQ', icon: HelpCircle },
    ],
  },
  {
    items: [
      { to: '/pricing', label: 'Pricing', icon: Tag },
      { to: '/contact', label: 'Contact', icon: Mail },
    ],
  },
];

const COLLAPSE_KEY = 'ayn_sidebar_collapsed';

export const SeekerSidebar = () => {
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

  const nav = (
    <>
      <div className="lp-sidebar-top">
        <Link to="/" className="lp-sidebar-brand" aria-label="AYN home">
          <img src={aynMark} alt="" style={{ height: 26, width: 'auto' }} />
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
        {NAV_GROUPS.map((group, gi) => (
          <div className="lp-sidebar-group" key={gi}>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
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
        ))}
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
        <Link to="/" aria-label="AYN home">
          <img src={aynMark} alt="AYN" style={{ height: 24, width: 'auto' }} />
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
