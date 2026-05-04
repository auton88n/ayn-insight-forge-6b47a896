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
    { question: 'What is AYN AI?', answer: 'AYN (عين) is a business intelligence AI that monitors global markets, analyzes geopolitical risks, and delivers real-time insights.' },
    { question: 'Does AYN support Arabic?', answer: 'Yes. AYN is fully bilingual in Arabic and English, built for the MENA market and beyond.' },
    { question: 'Is AYN free to try?', answer: 'Absolutely. AYN has a free tier with no credit card required.' },
  ]);

  return (
    <>
      <SEO
        title="AYN AI | Business Intelligence & Market Analysis | Real-Time AI"
        description="AYN monitors global markets, analyzes geopolitical risks, and delivers instant business intelligence."
        canonical="/"
        keywords="AYN AI, business intelligence AI, market analysis AI, geopolitical risk"
        jsonLd={{ '@graph': [organizationSchema, websiteSchema, softwareApplicationSchema, faqSchema] }}
      />
      <div dir={direction} className="landing-white-page" style={{ background: '#ffffff', minHeight: '100vh' }}>
        <Header />
        <HeroScroll />
        <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      </div>
    </>
  );
});

export default LandingPage;
