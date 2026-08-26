/**
 * EmployerSidebar -- the ONE employer nav, every state, structurally the
 * same shell as SeekerSidebar (the same .lp-sidebar* classes, the same
 * collapse-to-icons behavior, the same mobile drawer), just carrying
 * employer-appropriate content instead of the seeker's.
 *
 * v3.249.0 -- reported directly, after being asked where the employer
 * experience felt confusing, and answered with a clarifying question first:
 * "it needs something like joob seaker same sidebar the pages will start
 * about the featuers they have everything listed once they sign in they
 * can go and see but we dont want to show everything once they sign the
 * other pages show in the sidebar but what shows for sekers diffrent for
 * employer." First pass only fixed the signed-out/pending half, leaving
 * EmployerHub.tsx's own separate rh-rail (a completely different visual
 * system -- dark, icon-only, resume-hub-theme) untouched for an approved
 * account. Reported again immediately, against a screenshot of exactly
 * that rail: "why i have another dashboard needs to be in the same as the
 * one we built also add the questions... about AYN." One sidebar now
 * covers every real state: signed out, pending approval, and the real
 * approved dashboard, matching the seeker side's own v3.228.0 precedent
 * ("Signing in no longer swaps a job seeker onto a completely separate
 * dashboard").
 *
 * v3.250.0 -- EmployerHub.tsx now passes `tab`/`onSelectTab`/`dashboardReady`
 * once an account is approved: a real "Employer" nav group (Search,
 * Proposals, Assessments, Company, Settings) renders above the marketing
 * content instead of a second, separate rail. The "Learn about AYN" group
 * (How it works, Features & pricing) stays present the whole time, exactly
 * like SeekerSidebar's own always-there explanation tabs -- collapsed by
 * default once there's a real dashboard to show, expanded by default
 * before that, same open/closed default logic SeekerSidebar already uses.
 */
import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2, Route, Tag, Mail, User as UserIcon, Search, ClipboardCheck,
  Settings as SettingsIcon, LogIn, LogOut, Menu, X, ArrowLeftRight,
  Clock, Ban, ShieldAlert, ChevronDown,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AuthModal } from '@/components/auth/AuthModal';
import aynWordmark from '@/assets/ayn-logo.png';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const AYN_ICON = '/ayn-mark.svg';
const COLLAPSE_KEY = 'ayn_employer_sidebar_collapsed';

type EmpStatus = 'pending_approval' | 'declined' | 'suspended';

const STATUS_COPY: Record<EmpStatus, { label: string; icon: typeof Clock }> = {
  pending_approval: { label: 'Pending approval', icon: Clock },
  declined: { label: 'Not approved', icon: Ban },
  suspended: { label: 'On hold', icon: ShieldAlert },
};

export type EmployerDashTab = 'search' | 'proposals' | 'assessments' | 'company' | 'settings';

const DASHBOARD_NAV: { key: EmployerDashTab; label: string; icon: typeof Search }[] = [
  { key: 'search', label: 'Search', icon: Search },
  { key: 'proposals', label: 'Proposals', icon: Mail },
  { key: 'assessments', label: 'Assessments', icon: ClipboardCheck },
  { key: 'company', label: 'Company', icon: Building2 },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

type Props = {
  // Set by EmployerPending.tsx, which already polls employer_accounts for
  // this -- shown as a small status row above sign out instead of this
  // component re-querying the same table a second time.
  status?: EmpStatus | null;
  // Set by EmployerHub.tsx once an account is real, approved, and past its
  // own company-profile onboarding gate -- the same condition that used to
  // decide whether the old, separate rh-rail rendered at all.
  dashboardReady?: boolean;
  tab?: EmployerDashTab;
  onSelectTab?: (tab: EmployerDashTab) => void;
  proposalsBadge?: number;
};

export const EmployerSidebar = ({ status, dashboardReady, tab, onSelectTab, proposalsBadge = 0 }: Props) => {
  const location = useLocation();
  const navigate = useNavigate();
  const onEmployers = location.pathname === '/employers';
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  // null = the visitor hasn't touched this toggle yet, so it follows the
  // default (expanded until there's a real dashboard to show, collapsed
  // once there is one); a real click always wins after that -- the exact
  // same default logic SeekerSidebar's own "Learn about AYN" group uses.
  const [learnManuallyOpen, setLearnManuallyOpen] = useState<boolean | null>(null);
  const learnOpen = learnManuallyOpen ?? !dashboardReady;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
    setMobileOpen(false);
  };

  const goOverview = () => {
    if (onEmployers) window.scrollTo({ top: 0, behavior: 'smooth' });
    else navigate('/employers');
    setMobileOpen(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const anchorActive = (hash: string) => onEmployers && location.hash === hash;

  const statusInfo = status ? STATUS_COPY[status] : null;
  const StatusIcon = statusInfo?.icon;

  const nav = (
    <>
      <div className="lp-sidebar-top">
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

      <nav className="lp-sidebar-nav" aria-label="AYN for employers">
        {dashboardReady && onSelectTab ? (
          <div className="lp-sidebar-group">
            <span className="lp-sidebar-group-label">Employer</span>
            {DASHBOARD_NAV.map((item) => {
              const Icon = item.icon;
              const active = tab === item.key;
              const badge = item.key === 'proposals' ? proposalsBadge : 0;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`lp-sidebar-link ${active ? 'is-active' : ''}`}
                  onClick={() => { onSelectTab(item.key); setMobileOpen(false); }}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
                  <span className="lp-sidebar-link-label" style={{ flex: 1 }}>{item.label}</span>
                  {badge > 0 && !collapsed && (
                    <span
                      aria-hidden
                      style={{
                        background: 'hsl(var(--lp-ember))', color: '#fff', fontSize: 10, fontWeight: 700,
                        borderRadius: 999, minWidth: 16, height: 16, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', padding: '0 4px', flexShrink: 0,
                      }}
                    >
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="lp-sidebar-group">
            <button
              type="button"
              className={`lp-sidebar-link ${onEmployers && !location.hash ? 'is-active' : ''}`}
              onClick={goOverview}
              title={collapsed ? 'Overview' : undefined}
            >
              <Building2 size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
              <span className="lp-sidebar-link-label">Overview</span>
            </button>
          </div>
        )}

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
          {(collapsed || learnOpen) && (
            <>
              <Link
                to="/employers#employers-how"
                className={`lp-sidebar-link ${anchorActive('#employers-how') ? 'is-active' : ''}`}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? 'How it works' : undefined}
              >
                <Route size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
                <span className="lp-sidebar-link-label">How it works</span>
              </Link>
              <Link
                to="/employers#employers-features"
                className={`lp-sidebar-link ${anchorActive('#employers-features') ? 'is-active' : ''}`}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? 'Features & pricing' : undefined}
              >
                <Tag size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
                <span className="lp-sidebar-link-label">Features & pricing</span>
              </Link>
            </>
          )}
        </div>

        <div className="lp-sidebar-group">
          <span className="lp-sidebar-group-label">Company</span>
          <Link
            to="/contact"
            className={`lp-sidebar-link ${location.pathname === '/contact' ? 'is-active' : ''}`}
            onClick={() => setMobileOpen(false)}
            title={collapsed ? 'Contact' : undefined}
          >
            <Mail size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
            <span className="lp-sidebar-link-label">Contact</span>
          </Link>
          <Link
            to="/"
            className="lp-sidebar-link"
            onClick={() => setMobileOpen(false)}
            title={collapsed ? 'Looking for a job instead?' : undefined}
          >
            <ArrowLeftRight size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
            <span className="lp-sidebar-link-label">Looking for a job instead?</span>
          </Link>
        </div>
      </nav>

      <div className="lp-sidebar-bottom">
        {user ? (
          <div className="lp-sidebar-user" style={{ flexDirection: statusInfo ? 'column' : undefined, alignItems: statusInfo ? 'stretch' : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <span className="lp-sidebar-user-avatar"><UserIcon size={14} /></span>
              <span className="lp-sidebar-link-label lp-sidebar-user-email">{user.email}</span>
              <button type="button" onClick={handleSignOut} className="lp-sidebar-signout" title="Sign out" aria-label="Sign out">
                <LogOut size={15} />
              </button>
            </div>
            {statusInfo && StatusIcon && !collapsed && (
              <span className="lp-sidebar-link-label" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                <StatusIcon size={13} /> {statusInfo.label}
              </span>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="lp-btn lp-btn-primary lp-sidebar-cta"
            onClick={() => setAuthOpen(true)}
            title={collapsed ? 'Request employer access' : undefined}
          >
            <LogIn size={16} className="lp-sidebar-link-icon" />
            <span className="lp-sidebar-link-label">Request access</span>
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      <div className="lp-sidebar-mobile-bar">
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu" className="lp-sidebar-mobile-trigger">
          <Menu size={20} />
        </button>
        <Link to="/employers" aria-label="AYN for employers" onClick={() => setMobileOpen(false)}>
          <img src={aynWordmark} alt="AYN" style={{ height: 24, width: 'auto' }} />
        </Link>
        <span style={{ width: 20 }} />
      </div>

      <aside className={`lp-sidebar ${collapsed ? 'is-collapsed' : ''}`}>{nav}</aside>

      {mobileOpen && (
        <div className="lp-sidebar-scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}
      <aside className={`lp-sidebar lp-sidebar-mobile ${mobileOpen ? 'is-open' : ''}`}>{nav}</aside>

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} initialRole="employer" />
    </>
  );
};
