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
 *
 * v3.252.0 -- reported directly: "these dose not work when im sign in is
 * that for security perposes?" Not security -- a real gap. How it works/
 * Features & pricing still pointed at /employers#employers-how and
 * #employers-features even in dashboard mode, but Employers.tsx (and
 * Index.tsx) render EmployerHub, never LandingSections, for a signed-in
 * approved account -- the anchor those links pointed at was never in the
 * DOM at all once signed in, so the link changed the URL and did nothing.
 * In dashboard mode these are now real tab switches (onSelectTab, the
 * same mechanism the Employer nav group above already uses) into two new
 * EmployerHub tabs carrying the real content, not a link to a page that
 * can't render it for this account. Signed out / pending, where /employers
 * genuinely does render that content, they stay plain links exactly as
 * before -- no need to duplicate content into a dashboard tab nobody in
 * that state can even reach yet.
 *
 * v3.254.0 -- reported directly against three screenshots of the dashboard
 * (the sign out row, the "Looking for a job instead?" door, and the
 * seeker sidebar's own Company group for comparison): "i dont want to
 * look like this and remove this the only way the employer needs leave
 * the account is to signout also add the other pages so they have
 * exactly what seeker have but diffrent portal." Two changes, both
 * dashboard-mode only: the seeker door is gone once signed in (sign out
 * is the one way out of the account; the door itself is untouched
 * signed-out/pending, where it's still a legitimate, reciprocal audience
 * switch, not an "exit"), and Company gained About, Help and Legal,
 * matching SeekerSidebar's own group one for one. About and Legal reuse
 * real, already-correct content (AboutTab is audience-neutral prose,
 * /legal is a plain unguarded route with no redirect to dodge); Help is a
 * new, employer-scoped FAQ in EmployerHub.tsx, not the seeker HelpTab's
 * own credits/discoverability questions, which don't apply here. About
 * and Help are dashboard-only for the same reason How it works/Features
 * are: their signed-out routes (/about, /help) are HomeTabRedirect, which
 * always lands on "/" in job_seeker mode, the wrong portal entirely for
 * a signed-out visitor arriving from /employers -- adding them there
 * would be a fresh bug, not a fix, so they're deliberately left out of
 * that state rather than guessed at.
 *
 * v3.255.0 -- reported directly, immediately after: "remove the leagel
 * and about from the employer also for the user just his first alphabet
 * icon not full email and remove the user icon." About and Legal both
 * removed again from the Company group (Help and Contact stay); the
 * matching "about" tab/heading/content in EmployerHub.tsx and its
 * AboutTab import were removed too, since nothing can set that tab
 * anymore. The account row's generic person-silhouette icon and the
 * full email address are both gone, replaced with the one real,
 * identifying thing about the account -- its own first letter, in the
 * same ember circle the icon used to sit in -- with the full email still
 * reachable as a title tooltip, not deleted outright.
 */
import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2, Route, Tag, Mail, Search, ClipboardCheck,
  Settings as SettingsIcon, LogIn, LogOut, Menu, X, ArrowLeftRight,
  Clock, Ban, ShieldAlert, ChevronDown, LifeBuoy,
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

export type EmployerDashTab =
  | 'search' | 'proposals' | 'assessments' | 'company' | 'settings'
  | 'how-it-works' | 'features' | 'contact' | 'help';

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
            dashboardReady && onSelectTab ? (
              <>
                <button
                  type="button"
                  className={`lp-sidebar-link ${tab === 'how-it-works' ? 'is-active' : ''}`}
                  onClick={() => { onSelectTab('how-it-works'); setMobileOpen(false); }}
                  title={collapsed ? 'How it works' : undefined}
                >
                  <Route size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
                  <span className="lp-sidebar-link-label">How it works</span>
                </button>
                <button
                  type="button"
                  className={`lp-sidebar-link ${tab === 'features' ? 'is-active' : ''}`}
                  onClick={() => { onSelectTab('features'); setMobileOpen(false); }}
                  title={collapsed ? 'Features & pricing' : undefined}
                >
                  <Tag size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
                  <span className="lp-sidebar-link-label">Features & pricing</span>
                </button>
              </>
            ) : (
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
            )
          )}
        </div>

        <div className="lp-sidebar-group">
          <span className="lp-sidebar-group-label">Company</span>
          {/* v3.253.0 -- "employer should have their own contact us": the
              same dead-link bug as How it works/Features & pricing, just
              via a different path. /contact is HomeTabRedirect, which
              stashes the tab and navigates to "/" -- for a signed-in
              employer that lands back on EmployerHub (Index.tsx's own
              AuthedShell), which never reads that handoff key, so the
              form never appeared. Dashboard mode now mounts a real,
              dedicated TicketForm instance directly in this tab, not a
              second trip through a redirect built for the seeker side. */}
          {dashboardReady && onSelectTab ? (
            <>
              <button
                type="button"
                className={`lp-sidebar-link ${tab === 'help' ? 'is-active' : ''}`}
                onClick={() => { onSelectTab('help'); setMobileOpen(false); }}
                title={collapsed ? 'Help' : undefined}
              >
                <LifeBuoy size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
                <span className="lp-sidebar-link-label">Help</span>
              </button>
              <button
                type="button"
                className={`lp-sidebar-link ${tab === 'contact' ? 'is-active' : ''}`}
                onClick={() => { onSelectTab('contact'); setMobileOpen(false); }}
                title={collapsed ? 'Contact' : undefined}
              >
                <Mail size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
                <span className="lp-sidebar-link-label">Contact</span>
              </button>
            </>
          ) : (
            <>
              <Link
                to="/contact"
                className={`lp-sidebar-link ${location.pathname === '/contact' ? 'is-active' : ''}`}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? 'Contact' : undefined}
              >
                <Mail size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
                <span className="lp-sidebar-link-label">Contact</span>
              </Link>
              {/* v3.254.0 -- reported directly: "the only way the employer
                  needs leave the account is to signout." This reciprocal
                  audience door stays for a genuinely signed-out or pending
                  visitor (the same real, legitimate switch SeekerSidebar's
                  own "For employers" link offers in the other direction),
                  just gone once there's a real account and dashboard to
                  leave -- sign out, in the account area below, is the one
                  way out from there. */}
              <Link
                to="/"
                className="lp-sidebar-link"
                onClick={() => setMobileOpen(false)}
                title={collapsed ? 'Looking for a job instead?' : undefined}
              >
                <ArrowLeftRight size={17} strokeWidth={1.9} className="lp-sidebar-link-icon" />
                <span className="lp-sidebar-link-label">Looking for a job instead?</span>
              </Link>
            </>
          )}
        </div>
      </nav>

      <div className="lp-sidebar-bottom">
        {user ? (
          <div className="lp-sidebar-user" style={{ flexDirection: statusInfo ? 'column' : undefined, alignItems: statusInfo ? 'stretch' : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              {/* v3.255.0 -- reported directly against a screenshot of this
                  exact row: "just his first alphabet icon not full email
                  and remove the user icon." A generic person-silhouette
                  icon plus the full email address, replaced with the one
                  real, identifying thing about this account -- its own
                  first letter -- in the same ember circle. The full email
                  is still there for anyone who needs it, as a title
                  tooltip on the circle itself, not gone, just not spelled
                  out in the row by default. */}
              <span className="lp-sidebar-user-avatar" title={user.email} aria-label={user.email} style={{ fontSize: 12, fontWeight: 700 }}>
                {(user.email || '?')[0].toUpperCase()}
              </span>
              <button type="button" onClick={handleSignOut} className="lp-sidebar-signout" title="Sign out" aria-label="Sign out" style={{ marginLeft: 'auto' }}>
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

      <div
        className={`lp-sidebar-scrim ${mobileOpen ? 'is-open' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
      <aside className={`lp-sidebar lp-sidebar-mobile ${mobileOpen ? 'is-open' : ''}`}>{nav}</aside>

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} initialRole="employer" />
    </>
  );
};
