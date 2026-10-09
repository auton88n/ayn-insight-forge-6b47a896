import { lazy, Suspense, useRef } from 'react';
import type { Audience } from '@/lib/landingAudience';
import type { HomeTabId } from './homeTabMeta';
import HomeTabPanel from './HomeTabPanel';
import { LandingFooter } from './LandingFooter';
import { AynLoaderBlock } from '@/components/shared/AynLoader';
import { useRevealContent } from './useRevealContent';

const JobsBrowser = lazy(() => import('./JobsBrowser').then(module => ({ default: module.JobsBrowser })));
const EmployerLandingSections = lazy(() => import('./EmployerLandingSections').then(module => ({ default: module.LandingSections })));

type Props = {
  onStartFree?: (role?: Audience, tab?: 'signin' | 'signup') => void;
  forcedAudience?: Audience;
  activeTab?: HomeTabId;
  onSelectTab?: (id: HomeTabId) => void;
};

/** Public shell: search, one selected tab, or employer marketing — never all three. */
export function LandingSections({ onStartFree, forcedAudience = 'job_seeker', activeTab = 'search', onSelectTab }: Props) {
  const root = useRef<HTMLDivElement>(null);
  useRevealContent(root);
  return (
    <div className="lp lp-page-col" ref={root}>
      <Suspense fallback={<AynLoaderBlock />}>
        {forcedAudience === 'employer' ? <EmployerLandingSections forcedAudience="employer" onStartFree={onStartFree} /> : <>
          {activeTab === 'search' ? (
            <section className="lp-section" style={{ paddingBlockEnd: 0 }}>
              <div className="lp-shell">
                <JobsBrowser showHeading asH1 onStartFree={() => onStartFree?.('job_seeker')} />
                <p className="lp-note" style={{ marginTop: 22, textAlign: 'center' }}>
                  Fit scores and tailored documents, grounded in your real experience. Want AYN to score every job against your resume automatically?{' '}
                  <button type="button" className="lp-quiet-link" style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }} onClick={() => onStartFree?.('job_seeker')}>Start free</button>.
                </p>
              </div>
            </section>
          ) : (
            <div className="lp-audience" key={`tab-${activeTab}`}>
              <HomeTabPanel tab={activeTab} onSelectTab={id => onSelectTab?.(id)} onStartFree={(role, tab) => onStartFree?.(role, tab)} />
            </div>
          )}
          <LandingFooter />
        </>}
      </Suspense>
    </div>
  );
}
