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

  // Force landing page to pure white regardless of saved dark theme.
  // Removes 'dark', adds 'light', sets inline bg before paint.
  // Fully restores dashboard theme on unmount.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;
    const prevColorScheme = html.style.colorScheme;
    const wasDark = html.classList.contains('dark');

    html.classList.remove('dark');
    html.classList.add('light');
    html.style.colorScheme = 'light';
    html.style.backgroundColor = '#ffffff';
    body.style.backgroundColor = '#ffffff';

    return () => {
      html.classList.remove('light');
      if (wasDark) html.classList.add('dark');
      html.style.colorScheme = prevColorScheme || (wasDark ? 'dark' : 'light');
      html.style.backgroundColor = prevHtmlBg;
      body.style.backgroundColor = prevBodyBg;
    };
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
