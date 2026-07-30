import { memo, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { SEO, organizationSchema, websiteSchema, softwareApplicationSchema, createFAQSchema } from '@/components/shared/SEO';
import { Header } from '@/components/shared/Header';
import { AuthModal } from './auth/AuthModal';
import { LandingSections } from '@/components/landing/LandingSections';
import { useState } from 'react';

const LandingPage = memo(() => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authRole, setAuthRole] = useState<'job_seeker' | 'employer'>('job_seeker');
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

  const faqSchema = createFAQSchema([
    { question: 'What is AYN?', answer: 'Two things that share one profile. For job seekers, AYN reads a posting and writes a resume and cover letter tailored to it. For employers, AYN searches people who chose to be found and returns the strongest fits with evidence.' },
    { question: 'Which job sites does the extension work on?', answer: 'Greenhouse, Lever, Workday, Ashby, iCIMS, SmartRecruiters and most company career pages.' },
    { question: 'Does AYN fill or submit applications for me?', answer: 'No. AYN only reads the page. It never types into a form and never submits anything on your behalf.' },
    { question: 'Can employers see my name and email?', answer: 'Not until you accept their proposal. Before that they see your professional profile and your match evidence, never your email or phone.' },
    { question: 'What is a verification assessment?', answer: 'A short set of questions generated from a candidate own claimed background. It probes lived experience rather than textbook knowledge. The employer sees the score, the candidate only ever sees growth notes.' },
    { question: 'Is AYN free to try?', answer: 'Yes, free to start for job seekers and no credit card is required. Employers are onboarded one at a time.' },
  ]);

  return (
    <>
      <SEO
        title="AYN, tailored applications for job seekers, verified candidates for employers"
        description="AYN reads the job posting and writes you a tailored resume and cover letter from your real experience. Employers search candidates who chose to be found and verify them before reaching out."
        canonical="/"
        keywords="tailored resume for a job description, AI cover letter, job match score, candidate sourcing, verified candidates, hiring without job boards, Chrome extension for job seekers"
        jsonLd={{ '@graph': [organizationSchema, websiteSchema, softwareApplicationSchema, faqSchema] }}
      />

      <div dir={direction} style={{ background: '#faf8f3', minHeight: '100vh' }}>
        <Header />
        <LandingSections
          onStartFree={(role) => {
            setAuthRole(role || 'job_seeker');
            setShowAuthModal(true);
          }}
        />
        <AuthModal key={authRole} open={showAuthModal} onOpenChange={setShowAuthModal} initialRole={authRole} />
      </div>
    </>
  );
});

export default LandingPage;
