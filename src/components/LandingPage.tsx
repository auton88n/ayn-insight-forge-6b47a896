import { memo, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { SEO, organizationSchema, websiteSchema, softwareApplicationSchema, createFAQSchema } from '@/components/shared/SEO';
import { Header } from '@/components/shared/Header';
import { SeekerSidebar } from '@/components/landing/SeekerSidebar';
import { AuthModal } from './auth/AuthModal';
import { LandingSections } from '@/components/landing/LandingSections';
import type { Audience } from '@/lib/landingAudience';
import { TAB_META, MORE_TAB_META, ACCOUNT_TAB_META, HOME_TAB_HANDOFF_KEY, type HomeTabId } from '@/components/landing/HomeTabs';
import { useState } from 'react';

// v3.219.0 -- /pricing, /contact, /about and /help still exist as real
// routes (old links and bookmarks keep working), but now redirect here
// with the tab to land on stashed first -- the same cross-page handoff
// pattern EmployerHub/ResumeHub already use for "land on this exact tab."
// v3.220.0 -- HOME_TAB_HANDOFF_KEY itself moved into HomeTabs.tsx: this
// file already imports from there, and SeekerSidebar needs the same key
// for its own standalone-route fallback -- importing it back from here
// would be a circular dependency (LandingPage -> SeekerSidebar ->
// LandingPage), since LandingPage already imports SeekerSidebar directly.
const ALL_TAB_IDS = new Set<HomeTabId>([
  'search', ...TAB_META.map((t) => t.id), ...MORE_TAB_META.map((t) => t.id), ...ACCOUNT_TAB_META.map((t) => t.id),
]);
function readHandoffTab(): HomeTabId {
  try {
    const v = sessionStorage.getItem(HOME_TAB_HANDOFF_KEY);
    if (v && ALL_TAB_IDS.has(v as HomeTabId)) {
      sessionStorage.removeItem(HOME_TAB_HANDOFF_KEY);
      return v as HomeTabId;
    }
  } catch { /* ignore */ }
  return 'search';
}

// v3.210.0 -- "/" and "/employers" are now two real, separately-identified
// pages sharing one component, not one page describing two audiences at
// once. Each gets its own canonical, title, description and FAQ schema
// matching what actually renders in that audience, the same discipline
// this app already applies to every other route (see the JobPosting-
// schema-on-listing-pages fix, v3.205.0): structured data has to match
// the real page, never describe a second page bolted on beside it.
const SEEKER_FAQ = createFAQSchema([
  { question: 'What is AYN?', answer: 'AYN reads a real job posting in full and scores you against it. Then it writes a one page resume and a cover letter from your own history.' },
  { question: 'Where do the jobs come from?', answer: 'Real company career pages, sourced automatically and refreshed every two hours, never LinkedIn or Indeed.' },
  { question: 'Does AYN apply for me?', answer: 'No. It only reads the page. It never types into a form and never submits anything for you.' },
  { question: 'Can employers see my name and email?', answer: 'Not until you accept their proposal. Before that they see your profile and your match evidence only.' },
  { question: 'Is AYN free to try?', answer: 'Yes, free to start and no credit card needed.' },
]);

const EMPLOYER_FAQ = createFAQSchema([
  { question: 'How does AYN find candidates?', answer: 'From people who built a profile and turned on discovery. Nobody is scraped.' },
  { question: 'How does this compare to a recruiter?', answer: 'There is no placement fee. You pay a flat monthly rate no matter how many people you hire.' },
  { question: 'What is a verification assessment?', answer: 'A short set of questions built from a candidate’s own background and your role. You see the score and the observations, the candidate sees growth notes only.' },
  { question: 'When do I get contact details?', answer: 'Only when the candidate accepts. Everything before that is anonymous, enforced on the server.' },
  { question: 'How do I get access?', answer: 'Request employer access. Every company is reviewed and approved by hand, one at a time.' },
]);

const COPY: Record<Audience, { title: string; description: string; canonical: string; keywords: string }> = {
  job_seeker: {
    title: 'AYN, real jobs and a resume tailored to every one you apply to',
    description: "AYN sources real jobs straight from company career pages, never LinkedIn or Indeed, so you never waste an application on a ghost job. Score the match, then get a tailored resume and cover letter from your real history, free to try.",
    canonical: '/',
    keywords: 'real job postings, no ghost jobs, tailored resume for a job description, AI cover letter, job match score',
  },
  employer: {
    title: 'AYN for employers, verified candidates who chose to be found',
    description: "Describe a role once. AYN searches candidates who opted into discovery, verifies them with an assessment built from their own background, and every company is approved by hand before it can search. No placement fee.",
    canonical: '/employers',
    keywords: 'candidate sourcing, verified candidates, hiring without a staffing agency, candidate assessment',
  },
};

const LandingPage = memo(({ forcedAudience = 'job_seeker' }: { forcedAudience?: Audience }) => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authRole, setAuthRole] = useState<Audience>(forcedAudience);
  // v3.233.0 -- onStartFree's own second argument lets a caller (the
  // sign-in gate's "already have an account" link) open straight to the
  // Sign In tab instead of always defaulting to Sign Up.
  const [authTab, setAuthTab] = useState<'signin' | 'signup'>('signup');
  const [activeTab, setActiveTab] = useState<HomeTabId>(readHandoffTab);
  const { direction } = useLanguage();

  // The landing page owns a warm paper canvas, independent of app theme.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;
    html.style.backgroundColor = '#faf8f3';
    body.style.backgroundColor = '#faf8f3';
    return () => {
      html.style.backgroundColor = prevHtmlBg;
      body.style.backgroundColor = prevBodyBg;
    };
  }, []);

  const copy = COPY[forcedAudience];
  const faqSchema = forcedAudience === 'employer' ? EMPLOYER_FAQ : SEEKER_FAQ;

  return (
    <>
      <SEO
        title={copy.title}
        description={copy.description}
        canonical={copy.canonical}
        keywords={copy.keywords}
        jsonLd={{ '@graph': [organizationSchema, websiteSchema, softwareApplicationSchema, faqSchema] }}
      />

      <div dir={direction} style={{ background: '#faf8f3', minHeight: '100vh' }}>
        {forcedAudience === 'employer' ? (
          <>
            <Header />
            <LandingSections
              forcedAudience={forcedAudience}
              onStartFree={(role, tab) => {
                setAuthRole(role || forcedAudience);
                setAuthTab(tab || 'signup');
                setShowAuthModal(true);
              }}
            />
          </>
        ) : (
          // v3.215.0 -- "home is the job search, other sections have the
          // explanations, reached from a sidebar" -- the same collapsible
          // shell Resume Hub's own icon rail already uses once someone
          // signs in, so signing in never means landing on a differently
          // shaped site.
          // v3.216.0 -- the explanations are tabs on this one page now
          // (activeTab, owned here), not separate routes: clicking one in
          // SeekerSidebar swaps the main pane's content in place.
          <div className="lp lp-shell-with-sidebar">
            <SeekerSidebar activeTab={activeTab} onSelectTab={setActiveTab} />
            <main className="lp-sidebar-main">
              <LandingSections
                forcedAudience={forcedAudience}
                activeTab={activeTab}
                onSelectTab={setActiveTab}
                onStartFree={(role, tab) => {
                  setAuthRole(role || forcedAudience);
                  setAuthTab(tab || 'signup');
                  setShowAuthModal(true);
                }}
              />
            </main>
          </div>
        )}
        <AuthModal key={`${authRole}-${authTab}`} open={showAuthModal} onOpenChange={setShowAuthModal} initialRole={authRole} initialTab={authTab} />
      </div>
    </>
  );
});

export default LandingPage;
