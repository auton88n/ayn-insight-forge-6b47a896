import { memo, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { SEO, organizationSchema, websiteSchema, softwareApplicationSchema, createFAQSchema } from '@/components/shared/SEO';
import { Header } from '@/components/shared/Header';
import { AuthModal } from './auth/AuthModal';
import { LandingSections } from '@/components/landing/LandingSections';
import { useState } from 'react';

const LandingPage = memo(() => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authRole, setAuthRole] = useState<'job_seeker' | 'employer'>('employer');
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
    { question: 'What is AYN?', answer: 'Two products, one profile. For job seekers, AYN reads a posting and writes a resume and cover letter for it. For employers, AYN returns the strongest fits from people who chose to be found.' },
    { question: 'Which job sites does it work on?', answer: 'Greenhouse, Lever, Workday, Ashby, iCIMS, SmartRecruiters and most company career pages.' },
    { question: 'Does AYN apply for me?', answer: 'No. It only reads the page. It never types into a form and never submits anything for you.' },
    { question: 'Can employers see my name and email?', answer: 'Not until you accept their proposal. Before that they see your profile and your match evidence only.' },
    { question: 'What is a verification assessment?', answer: 'A short set of questions built from a candidate own background. The employer sees the score, the candidate sees growth notes only.' },
    { question: 'Is AYN free to try?', answer: 'Yes, free to start and no credit card needed. Employers are onboarded one at a time.' },
  ]);

  return (
    <>
      <SEO
        title="AYN, tailored applications for job seekers, verified candidates for employers"
        description="AYN sources real jobs straight from company career pages, never LinkedIn or Indeed, so you never waste an application on a ghost job. Score the match, then get a tailored resume and cover letter from your real history. Employers search candidates who chose to be found and verify them before reaching out."
        canonical="/"
        keywords="tailored resume for a job description, AI cover letter, job match score, candidate sourcing, verified candidates, hiring without job boards"
        jsonLd={{ '@graph': [organizationSchema, websiteSchema, softwareApplicationSchema, faqSchema] }}
      />

      <div dir={direction} style={{ background: '#faf8f3', minHeight: '100vh' }}>
        <Header />
        <LandingSections
          onStartFree={(role) => {
            setAuthRole(role || 'employer');
            setShowAuthModal(true);
          }}
        />
        <AuthModal key={authRole} open={showAuthModal} onOpenChange={setShowAuthModal} initialRole={authRole} />
      </div>
    </>
  );
});

export default LandingPage;
