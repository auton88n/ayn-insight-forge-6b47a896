import type { Audience } from '@/lib/landingAudience';

export type HomeTabId =
  | 'search' | 'features' | 'how-it-works' | 'why-ayn'
  | 'get-discovered' | 'proof' | 'faq'
  | 'pricing' | 'contact' | 'about' | 'help'
  | 'profile' | 'matched-jobs' | 'saved-jobs' | 'proposals' | 'assessments' | 'account-settings' | 'skills-to-learn';

// v3.219.0 -- every tab now takes the same two callbacks, whether it needs
// them or not (a plain () => JSX.Element is still a valid value here --
// TypeScript allows a function that takes fewer parameters wherever one
// taking more is expected). onSelectTab lets a tab link to another tab
// without ever leaving the page (Help -> Contact); onStartFree opens the
// one AuthModal the shell owns, instead of a tab mounting a second one.
export type TabProps = {
  onSelectTab: (id: HomeTabId) => void;
  // v3.233.0 -- the optional second argument lets a caller open straight
  // to Sign In instead of the default Sign Up tab, without a second
  // callback threaded through every tab component. Omitted, it behaves
  // exactly as before.
  onStartFree: (role?: Audience, tab?: 'signin' | 'signup') => void;
};

// v3.229.0 -- Messaging removed as its own entry, folded into Get
// discovered (one continuous story: turn on discovery, then here's what
// happens once someone reaches out), part of the same sidebar reorg pass.
export const TAB_META: { id: HomeTabId; label: string }[] = [
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'why-ayn', label: 'Why AYN' },
  { id: 'get-discovered', label: 'Get discovered' },
  { id: 'proof', label: 'Proof' },
  // v3.233.0 -- renamed from "FAQ" so the nav label matches the page's own
  // heading ("Good to know"), the friendlier of the two, rather than the
  // reader landing on a heading that never echoes the word they clicked.
  { id: 'faq', label: 'Good to know' },
];

export const MORE_TAB_META: { id: HomeTabId; label: string }[] = [
  { id: 'pricing', label: 'Pricing' },
  { id: 'contact', label: 'Contact' },
  { id: 'about', label: 'About' },
  { id: 'help', label: 'Help' },
];

// v3.228.0 -- the five tabs that used to only exist behind the separate
// /resume-hub shell (see AccountTabs.tsx). Real content, gated on being
// signed in; the nav item itself is always visible, signed in or not.
export const ACCOUNT_TAB_META: { id: HomeTabId; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'matched-jobs', label: 'Job matches' },
  { id: 'saved-jobs', label: 'Saved jobs' },
  { id: 'proposals', label: 'Proposals' },
  { id: 'assessments', label: 'Assessments' },
  // v3.315.0 — the real follow-through on a confirm-first choice made in
  // Saved jobs: when a person adds a skill a job wants that they don't
  // have yet, it lands here too, not just on the resume.
  { id: 'skills-to-learn', label: 'Skills to learn' },
  { id: 'account-settings', label: 'Settings' },
];

// v3.219.0 -- the sessionStorage key LandingPage.tsx reads on mount to land
// on a specific tab, used by HomeTabRedirect (old /pricing etc. links) and,
// as of v3.220.0, by SeekerSidebar itself when it's rendered on a real,
// separate route (like /jobs) rather than on Home -- clicking a tab button
// there has to navigate to "/" first, so it stashes the target the same way.
export const HOME_TAB_HANDOFF_KEY = 'ayn_home_tab';

