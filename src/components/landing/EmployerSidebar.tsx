/**
 * EmployerSidebar -- the employer side's own collapsible left nav,
 * structurally the same shell as SeekerSidebar (the same .lp-sidebar*
 * classes, the same collapse-to-icons behavior, the same mobile drawer),
 * just carrying employer-appropriate content instead of the seeker's.
 *
 * v3.249.0 -- reported directly, after being asked where the employer
 * experience felt confusing, and answered with a clarifying question first:
 * "it needs something like joob seaker same sidebar the pages will start
 * about the featuers they have everything listed once they sign in they
 * can go and see but we dont want to show everything once they sign the
 * other pages show in the sidebar but what shows for sekers diffrent for
 * employer." Read as: a persistent sidebar, same shape as the seeker's,
 * showing the marketing/explainer content before sign-in (and while a
 * signed-in account is still pending approval) -- but NOT the real
 * functional dashboard nav (Search/Proposals/Assessments/Company), which
 * stays exactly where it already lives, EmployerHub.tsx's own rh-rail,
 * shown only once an account is actually approved.
 *
 * This component intentionally does NOT try to replace EmployerHub's own
 * rail -- that one is already real, already correct, and switching it to
 * this shell too would mean rebuilding a working, tested dashboard nav for
 * no reason. This is the piece that was missing: a sidebar for the state
 * BEFORE that rail exists (signed out, or signed in but not yet approved),
 * where the site used to fall back to the old fixed Header/Footer chrome
 * every other real page moved off years ago.
 */
import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2, Route, Tag, Mail, User as UserIcon,
  LogIn, LogOut, Menu, X, ArrowLeftRight, Clock, Ban, ShieldAlert,
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

type Props = {
  // Set by EmployerPending.tsx, which already polls employer_accounts for
  // this -- shown as a small status row above sign out instead of this
  // component re-querying the same table a second time.
  status?: EmpStatus | null;
};

export const EmployerSidebar = ({ status }: Props) => {
  const location = useLocation();
  const navigate = useNavigate();
  const onEmployers = location.pathname === '/employers';
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
          <Link
            to="/contact"
            className={`lp-sidebar-link ${location.pathname === '/contact' ? 'is-active' : ''}`}
            onClick={() => setMobileOpen(false)}
            title={collapsed ? 'Contact' : undefined}
          >
            <Mail size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
            <span className="lp-sidebar-link-label">Contact</span>
          </Link>
        </div>

        <div className="lp-sidebar-group">
          <span className="lp-sidebar-group-label">Company</span>
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
