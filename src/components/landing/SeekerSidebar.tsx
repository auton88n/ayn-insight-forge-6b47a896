import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, FileCheck2, FileText, Briefcase, Target, Inbox, ClipboardCheck, GraduationCap, Settings, Menu, PanelLeftClose, PanelLeftOpen, LogOut, LogIn, ChevronDown, Building2, LifeBuoy, Tag, type LucideIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AuthModal } from '@/components/auth/AuthModal';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';
import aynWordmark from '@/assets/ayn-logo.png';
import { TAB_META, type HomeTabId } from './homeTabMeta';
import type { User } from '@supabase/supabase-js';

type Props = { activeTab?: HomeTabId; onSelectTab?: (tab: HomeTabId) => void };
const WORKSPACE: { id: HomeTabId; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: 'Resume & profile', icon: FileText },
  { id: 'matched-jobs', label: 'Job matches', icon: Target },
  { id: 'saved-jobs', label: 'Saved jobs', icon: Briefcase },
];
const OPPORTUNITIES: typeof WORKSPACE = [
  { id: 'proposals', label: 'Proposals', icon: Inbox },
  { id: 'assessments', label: 'Assessments', icon: ClipboardCheck },
  { id: 'skills-to-learn', label: 'Skills to learn', icon: GraduationCap },
];

export function SeekerSidebar({ activeTab, onSelectTab }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('ayn_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'signin' | 'signup'>('signup');
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => { setMobileOpen(false); }, [location.pathname, location.hash]);
  const selectTab = (tab: HomeTabId) => {
    if (location.pathname === '/' && onSelectTab) onSelectTab(tab);
    else navigate('/#' + tab);
    setMobileOpen(false);
  };
  const isActive = (id: HomeTabId) => location.pathname === '/' && activeTab === id;
  const showAuth = (tab: 'signin' | 'signup') => { setMobileOpen(false); setAuthTab(tab); setAuthOpen(true); };
  const toggle = () => setCollapsed(previous => {
    try { localStorage.setItem('ayn_sidebar_collapsed', previous ? '0' : '1'); } catch { /* optional preference */ }
    return !previous;
  });
  const tabButton = ({ id, label, icon: Icon }: typeof WORKSPACE[number]) => (
    <button key={id} type="button" className={'lp-sidebar-link ' + (isActive(id) ? 'is-active' : '')} aria-current={isActive(id) ? 'page' : undefined} onClick={() => selectTab(id)} title={label}>
      <Icon size={18} className="lp-sidebar-link-icon" /><span className="lp-sidebar-link-label">{label}</span>
    </button>
  );
  const learnActive = TAB_META.some(item => isActive(item.id)) || ['about', 'contact', 'faq'].some(id => isActive(id as HomeTabId));
  const navigation = (mobile = false) => <>
    <div className="lp-sidebar-top">
      <Link to="/#search" aria-label="AYN home" className="lp-sidebar-brand">
        <img src={collapsed && !mobile ? '/ayn-mark.svg' : aynWordmark} alt="AYN" width={collapsed && !mobile ? 28 : 80} height={28} />
      </Link>
      {!mobile && <button type="button" className="ayn-rail-toggle" onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>}
    </div>
    <nav className="lp-sidebar-nav" aria-label={mobile ? 'Mobile navigation' : 'Main navigation'}>
      <div className="lp-sidebar-group">
        <button type="button" className={'lp-sidebar-link ' + ((isActive('search') || location.pathname.startsWith('/jobs')) ? 'is-active' : '')} onClick={() => selectTab('search')} title="Job search" aria-current={isActive('search') || location.pathname.startsWith('/jobs') ? 'page' : undefined}>
          <Search size={18} className="lp-sidebar-link-icon" /><span className="lp-sidebar-link-label">Job search</span>
        </button>
        <Link to="/check-resume" className={'lp-sidebar-link ' + (location.pathname === '/check-resume' ? 'is-active' : '')} title="Check my resume" aria-current={location.pathname === '/check-resume' ? 'page' : undefined}><FileCheck2 size={18} className="lp-sidebar-link-icon" /><span className="lp-sidebar-link-label">Check my resume</span></Link>
      </div>
      <div className="lp-sidebar-group"><span className="lp-sidebar-group-label">Your workspace</span>{WORKSPACE.map(tabButton)}</div>
      <div className="lp-sidebar-group"><span className="lp-sidebar-group-label">Opportunities</span>{OPPORTUNITIES.map(tabButton)}</div>
      <div className="lp-sidebar-group">
        {tabButton({ id: 'pricing', label: 'Plans & credits', icon: Tag })}
        {tabButton({ id: 'help', label: 'Help', icon: LifeBuoy })}
        {tabButton({ id: 'account-settings', label: 'Settings', icon: Settings })}
        <button type="button" className="lp-sidebar-link" aria-expanded={moreOpen || learnActive} onClick={() => { if (collapsed && !mobile) toggle(); setMoreOpen(value => !value); }} title="About AYN">
          <ChevronDown size={18} className="lp-sidebar-link-icon" /><span className="lp-sidebar-link-label">About AYN</span>
        </button>
        {(moreOpen || learnActive) && (!collapsed || mobile) && <div className="ayn-secondary-nav">
          {TAB_META.map(item => <button key={item.id} type="button" aria-current={isActive(item.id) ? 'page' : undefined} onClick={() => selectTab(item.id)}>{item.label}</button>)}
          <button type="button" onClick={() => selectTab('about')}>About us</button>
          <button type="button" onClick={() => selectTab('contact')}>Contact</button>
          <Link to="/salary-guide">Salary guide</Link><Link to="/legal">Legal & privacy</Link>
        </div>}
        <Link to="/employers" className="lp-sidebar-link" title="For employers"><Building2 size={18} className="lp-sidebar-link-icon" /><span className="lp-sidebar-link-label">For employers</span></Link>
      </div>
    </nav>
    <div className="lp-sidebar-bottom">
      {user ? <div className="ayn-account-row"><span className="lp-sidebar-user-avatar">{(user.email || 'A')[0].toUpperCase()}</span><span className="lp-sidebar-link-label ayn-account-email">{user.email}</span><button type="button" className="ayn-rail-toggle" aria-label="Sign out" onClick={async () => { const { error } = await supabase.auth.signOut(); if (error) toast.error('Could not sign out. Please try again.'); }}><LogOut size={17} /></button></div> : <>
        <button type="button" className="lp-btn lp-btn-primary lp-sidebar-cta" onClick={() => showAuth('signup')} title="Start free"><LogIn size={17} /><span className="lp-sidebar-link-label">Start free</span></button>
        {(!collapsed || mobile) && <button type="button" className="ayn-sign-in" onClick={() => showAuth('signin')}>Already a member? Sign in</button>}
      </>}
    </div>
  </>;
  return <>
    <div className="lp-sidebar-mobile-bar">
      <Link to="/#search" aria-label="AYN home"><img src={aynWordmark} alt="AYN" width={72} height={25} /></Link>
      <div className="ayn-mobile-actions"><button type="button" onClick={() => selectTab('profile')}><FileText size={17} /> Resume</button>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetTrigger asChild><button type="button" aria-label="Open menu"><Menu size={20} /></button></SheetTrigger>
          <SheetContent side="left" className="lp ayn-mobile-navigation" aria-describedby={undefined}><SheetTitle className="sr-only">AYN navigation</SheetTitle>{navigation(true)}</SheetContent>
        </Sheet>
      </div>
    </div>
    <aside className={'lp-sidebar ayn-navigation ' + (collapsed ? 'is-collapsed' : '')}>{navigation()}</aside>
    <AuthModal open={authOpen} onOpenChange={setAuthOpen} initialRole="job_seeker" initialTab={authTab} />
  </>;
}
