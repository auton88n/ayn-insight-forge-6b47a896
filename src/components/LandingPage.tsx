import { memo, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { SEO, organizationSchema, websiteSchema, softwareApplicationSchema, createFAQSchema } from '@/components/shared/SEO';
import { Header } from '@/components/shared/Header';
import { AuthModal } from './auth/AuthModal';
import { LandingSections } from '@/components/landing/LandingSections';
import { useState } from 'react';

const LandingPage = memo(() => {
  const [showAuthModal, setShowAuthModal] = useState(false);
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
    { question: 'What is AYN?', answer: 'AYN reads a job posting, scores how well you match it, and writes you a tailored resume and cover letter for that role.' },
    { question: 'Which job sites does AYN work on?', answer: 'Greenhouse, Lever, Workday, Ashby, iCIMS, SmartRecruiters and most company career pages.' },
    { question: 'Is AYN free to try?', answer: 'Yes. AYN is free to start and no credit card is required.' },
    { question: 'Does AYN fill or submit applications for me?', answer: 'No. AYN only reads the page. It never types into a form and never submits anything on your behalf.' },
  ]);

  return (
    <>
      <SEO
        title="AYN, a resume tailored to every job you apply to"
        description="AYN rewrites your resume and cover letter for every job you apply to. It reads the posting, uses your real experience, and never invents anything. Free to start."
        canonical="/"
        keywords="job match score, resume match to job description, tailored resume, AI cover letter, job search copilot, Chrome extension for job seekers"
        jsonLd={{ '@graph': [organizationSchema, websiteSchema, softwareApplicationSchema, faqSchema] }}
      />

      <div dir={direction} style={{ background: '#faf8f3', minHeight: '100vh' }}>
        <Header />
        <LandingSections onStartFree={() => setShowAuthModal(true)} />
        <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      </div>
    </>
  );
});

export default LandingPage;
