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
    { question: 'What is AYN AI?', answer: 'AYN is an AI career assistant that helps you find jobs, match your resume, fill applications, and track your search in one place.' },
    { question: 'Does AYN work with LinkedIn and Indeed?', answer: 'Yes. AYN scans job pages on LinkedIn, Indeed, Greenhouse, Lever, Ashby, and other boards so you can save roles and autofill faster.' },
    { question: 'Is AYN free to try?', answer: 'Absolutely. AYN has a free tier with no credit card required.' },
  ]);

  return (
    <>
      <SEO
        title="AYN AI | Job Search Assistant | Land Your Next Role"
        description="AYN helps you find jobs, match your resume, autofill applications, write cover letters, and track every opportunity in one place."
        canonical="/"
        keywords="AYN AI, job search AI, resume assistant, AI job application, LinkedIn job assistant"
        jsonLd={{ '@graph': [organizationSchema, websiteSchema, softwareApplicationSchema, faqSchema] }}
      />
      <div dir={direction} className="landing-white-page" style={{ background: '#ffffff', minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif", fontFeatureSettings: "'cv11','ss01','ss03'" }}>
        <Header />
        <HeroScroll />
        <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      </div>
    </>
  );
});

export default LandingPage;
