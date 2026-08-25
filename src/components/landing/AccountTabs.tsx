/**
 * AccountTabs -- the five signed-in-only tabs (Profile, Saved jobs,
 * Proposals, Assessments, Settings) that used to only exist behind the
 * separate /resume-hub shell, folded into the same SeekerSidebar/HomeTabs
 * system every other seeker page already uses.
 *
 * v3.228.0 -- reported directly: "i dont see the perposal and the assmint
 * and the profile and the other pages for the jobseeker you can have them
 * and in order to be shown they need to sign in or signup." The nav item
 * is always visible and clickable, signed in or not ("you can have them")
 * -- what's gated is the CONTENT: a signed-out click shows a plain sign-in
 * prompt right there in the tab, in place, never a navigation away and
 * never a silently-opened modal with no context for why. This closes the
 * one piece flagged repeatedly since early in this whole redesign and
 * never started: "the /resume-hub hard redirect on sign-in... this is the
 * actual 'sign in and I see a different dashboard' fix."
 *
 * Every real component here (ProfileTab, JobsTab, ProposalsTab,
 * AssessmentsTab, SettingsPanel) is the exact same, already-built,
 * already-proven component /resume-hub used -- nothing rewritten, only
 * where it's mounted from changed. They render on the resume-hub design
 * system (--rh-* tokens, resume-hub.css), a different scope from this
 * page's own .lp system, so .resume-hub-theme is applied to <body> only
 * while one of these five tabs is actually open, the same trick already
 * used for .contact-surface/.employer-surface elsewhere in this app.
 */
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { AynLoader } from '@/components/shared/AynLoader';
import type { TabProps } from './HomeTabs';
import '@/styles/resume-hub.css';

const SettingsPanel = lazy(() => import('@/components/shared/SettingsPanel'));
const JobsTab = lazy(() => import('@/components/resume-hub/JobsTab'));
const ProfileTab = lazy(() => import('@/components/resume-hub/ProfileTab'));
const ProposalsTab = lazy(() => import('@/components/resume-hub/ProposalsTab'));
const BrowseJobs = lazy(() => import('@/components/resume-hub/BrowseJobs'));
const AssessmentsTab = lazy(() => import('@/components/resume-hub/AssessmentsTab'));

function useAccountAuth() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let alive = true;
    const apply = (s: Session | null) => {
      if (!alive) return;
      setSession(s);
      setUserId(s?.user?.id ?? null);
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => apply(s));
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  return { userId, session };
}

function SignInPrompt({ label, onStartFree }: { label: string; onStartFree: TabProps['onStartFree'] }) {
  return (
    <section className="lp-section">
      <div className="lp-shell" style={{ maxWidth: 640, textAlign: 'center' }}>
        <p className="lp-eyebrow" style={{ justifyContent: 'center' }}>{label}</p>
        <h2 className="lp-display lp-h2">Sign in to see this</h2>
        <p className="lp-lead" style={{ marginInline: 'auto' }}>
          {label} is part of your own account. Sign in, or start free in a few seconds, to open it.
        </p>
        <div className="lp-cta-row" style={{ justifyContent: 'center', marginTop: 26 }}>
          <button type="button" className="lp-btn lp-btn-primary" onClick={() => onStartFree('job_seeker')}>
            Sign in or start free
          </button>
        </div>
      </div>
    </section>
  );
}

// Applies the resume-hub theme scope to <body> only while a signed-in
// account tab is actually mounted -- ProfileTab/JobsTab/etc read --rh-*
// tokens that only exist under this scope, and Radix portals (dialogs,
// selects) render straight onto <body>, outside this component's own tree.
function RhScope({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.body.classList.add('resume-hub-theme');
    return () => document.body.classList.remove('resume-hub-theme');
  }, []);
  return <div className="resume-hub-theme rh-account-embed">{children}</div>;
}

const TabFallback = () => (
  <div className="rh-tab-loading" style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <AynLoader size="md" />
  </div>
);

export const ProfileAccountTab = ({ onStartFree }: TabProps) => {
  const { userId } = useAccountAuth();
  if (userId === undefined) return <TabFallback />;
  if (!userId) return <SignInPrompt label="Profile" onStartFree={onStartFree} />;
  return (
    <RhScope>
      <Suspense fallback={<TabFallback />}>
        <ProfileTab userId={userId} onCreditsChanged={() => undefined} />
      </Suspense>
    </RhScope>
  );
};

export const SavedJobsAccountTab = ({ onSelectTab, onStartFree }: TabProps) => {
  const { userId } = useAccountAuth();
  if (userId === undefined) return <TabFallback />;
  if (!userId) return <SignInPrompt label="Saved jobs" onStartFree={onStartFree} />;
  return (
    <RhScope>
      <Suspense fallback={<TabFallback />}>
        <JobsTab
          userId={userId}
          onOpenJob={() => onSelectTab('saved-jobs')}
          onOpenProfile={() => onSelectTab('profile')}
          onCreditsChanged={() => undefined}
          onBackToBrowse={() => onSelectTab('matched-jobs')}
        />
      </Suspense>
    </RhScope>
  );
};

// v3.228.0 -- BrowseJobs.tsx (real match scores against the signed-in
// user's own resume, unlike the public Job search tab's plain JobsBrowser)
// was /resume-hub's own sixth tab, easy to lose sight of once that shell
// went away. Labeled "Job matches," not "Browse jobs" a second time -- Job
// search already owns that name (see v3.223.0's own fix for exactly this
// duplication), this is a genuinely different, signed-in-only capability.
export const MatchedJobsAccountTab = ({ onSelectTab, onStartFree }: TabProps) => {
  const { userId } = useAccountAuth();
  if (userId === undefined) return <TabFallback />;
  if (!userId) return <SignInPrompt label="Job matches" onStartFree={onStartFree} />;
  return (
    <RhScope>
      <Suspense fallback={<TabFallback />}>
        <BrowseJobs
          userId={userId}
          onAdded={(jobId) => {
            sessionStorage.setItem('ayn_focus_job', jobId);
            sessionStorage.setItem('ayn_focus_job_from', 'browse');
            onSelectTab('saved-jobs');
          }}
          onOpenProfile={() => onSelectTab('profile')}
        />
      </Suspense>
    </RhScope>
  );
};

export const ProposalsAccountTab = ({ onStartFree }: TabProps) => {
  const { userId } = useAccountAuth();
  if (userId === undefined) return <TabFallback />;
  if (!userId) return <SignInPrompt label="Proposals" onStartFree={onStartFree} />;
  return (
    <RhScope>
      <Suspense fallback={<TabFallback />}>
        <ProposalsTab />
      </Suspense>
    </RhScope>
  );
};

export const AssessmentsAccountTab = ({ onStartFree }: TabProps) => {
  const { userId } = useAccountAuth();
  if (userId === undefined) return <TabFallback />;
  if (!userId) return <SignInPrompt label="Assessments" onStartFree={onStartFree} />;
  return (
    <RhScope>
      <Suspense fallback={<TabFallback />}>
        <AssessmentsTab />
      </Suspense>
    </RhScope>
  );
};

export const SettingsAccountTab = ({ onStartFree }: TabProps) => {
  const { userId, session } = useAccountAuth();
  if (userId === undefined) return <TabFallback />;
  if (!userId) return <SignInPrompt label="Settings" onStartFree={onStartFree} />;
  return (
    <RhScope>
      <Suspense fallback={<TabFallback />}>
        <SettingsPanel userId={userId} session={session} />
      </Suspense>
    </RhScope>
  );
};
