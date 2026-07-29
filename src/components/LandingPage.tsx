import { memo, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { SEO, organizationSchema, websiteSchema, softwareApplicationSchema, createFAQSchema } from '@/components/shared/SEO';
import { Header } from '@/components/shared/Header';
import { AuthModal } from './auth/AuthModal';
import { HeroScroll } from '@/components/landing/HeroScroll';
import { useState } from 'react';

const LandingPage = memo(() => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { direction } = useLanguage();

  // Safety net: ensure white bg even if ThemeProvider hasn't synced yet
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    html.classList.remove("dark")
    html.classList.add("light")
    html.style.backgroundColor = "#ffffff"
    body.style.backgroundColor = "#ffffff"
  }, []);

  const faqSchema = createFAQSchema([
    { question: 'What is AYN?', answer: 'AYN reads a job posting, scores how well you match it, fills the application, and writes you a tailored resume and cover letter.' },
    { question: 'Which job sites does AYN work on?', answer: 'Greenhouse, Lever, Workday, Ashby, iCIMS, SmartRecruiters and most company career pages.' },
    { question: 'Is AYN free to try?', answer: 'Yes. AYN is free to start and no credit card is required.' },
  ]);

  return (
    <>
      <SEO
        title="AYN, autofill job applications and tailor your resume"
        description="AYN reads the job posting, scores your match, fills the application, and writes a tailored resume and cover letter. Works on Greenhouse, Lever, Workday, Ashby and more. Free to start."
        canonical="/"
        keywords="autofill job applications, job application autofill, tailored resume, AI cover letter, Greenhouse autofill, Workday autofill"
        jsonLd={{ '@graph': [organizationSchema, websiteSchema, softwareApplicationSchema, faqSchema] }}
      />
      <div dir={direction} className="landing-white-page" style={{ background: '#ffffff', minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif", fontFeatureSettings: "'cv11','ss01','ss03'" }}>
        <Header />
        <HeroScroll onStartFree={() => setShowAuthModal(true)} />
        <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      </div>
    </>
  );
});

export default LandingPage;
