import { useState, memo } from 'react';

import { Brain, Sparkles, Globe, Shield, Zap, Bot, BarChart3, TrendingUp, Eye, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthModal } from './auth/AuthModal';
import { useLanguage } from '@/contexts/LanguageContext';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { cn } from '@/lib/utils';
import { Hero } from '@/components/landing/Hero';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import featureBusinessImg from '@/assets/feature-business.jpg';
import featureMarketImg from '@/assets/feature-market.jpg';
import featurePredictImg from '@/assets/feature-predict.jpg';
import { SEO, organizationSchema, websiteSchema, softwareApplicationSchema, createFAQSchema } from '@/components/shared/SEO';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';

// ScrollReveal component - defined outside to prevent recreation on re-renders
const ScrollReveal = ({
  children,
  direction = 'up',
  delay = 0,
  debugLabel = 'ScrollReveal'
}: {
  children: React.ReactNode;
  direction?: 'up' | 'left' | 'right' | 'scale';
  delay?: number;
  debugLabel?: string;
}) => {
  const [ref, isVisible] = useScrollAnimation({
    debugLabel
  });
  return <div ref={ref as React.RefObject<HTMLDivElement>} className={cn('scroll-animate', direction === 'left' && 'scroll-animate-left', direction === 'right' && 'scroll-animate-right', direction === 'scale' && 'scroll-animate-scale', isVisible && 'visible')} style={{
    transitionDelay: `${delay}s`
  }}>
      {children}
    </div>;
};
const LandingPage = memo(() => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string>('');
  const {
    t,
    language,
    direction
  } = useLanguage();





  // FAQ Schema for rich snippets
  const faqSchema = createFAQSchema([{
    question: "What is AYN AI?",
    answer: "AYN (عين) is a business intelligence AI that monitors global markets, analyzes geopolitical risks, tracks supply chains, and delivers real-time insights to help you make better decisions."
  }, {
    question: "What can I ask AYN?",
    answer: "You can ask AYN about commodity prices, market trends, country risk profiles, supply chain disruptions, trading signals, geopolitical events, and business strategy — it synthesizes live intelligence and gives you direct answers."
  }, {
    question: "Does AYN support Arabic?",
    answer: "Yes. AYN (عين — Arabic for 'eye') is fully bilingual in Arabic and English, built for the MENA market and beyond."
  }, {
    question: "Is AYN free to try?",
    answer: "Yes — AYN has a free tier that lets you start immediately with no credit card required."
  }]);
  return <>
    <SEO title="AYN AI — Business Intelligence & Market Analysis | Real-Time AI" description="AYN monitors global markets, analyzes geopolitical risks, and delivers instant business intelligence. AI-powered insights for smarter decisions." canonical="/" keywords="AYN AI, business intelligence AI, market analysis AI, geopolitical risk analysis, AI market monitor, real-time market intelligence, AYN artificial intelligence, عين AI, Arabic AI assistant, supply chain intelligence, trading intelligence AI" jsonLd={{
      '@graph': [organizationSchema, websiteSchema, softwareApplicationSchema, faqSchema]
    }} />
    <div dir={direction} className="min-h-screen bg-background scroll-smooth">
      {/* Shared Header */}
      <Header />
      {/* Hero Section - Premium AI Eye Experience */}
      <Hero onGetStarted={prefillMessage => {
        if (prefillMessage) {
          setPendingMessage(prefillMessage);
          localStorage.setItem('ayn_pending_message', prefillMessage);
        }
        setShowAuthModal(true);
      }} />

      {/* About AYN - Value Proposition Section */}
      <section id="about" className="py-16 md:py-32 px-4 md:px-6">
        <div className="container mx-auto max-w-6xl text-center">
          <ScrollReveal>
            <span className="text-sm font-mono text-muted-foreground tracking-wider uppercase mb-4 block">
              {language === 'ar' ? 'من نحن' : language === 'fr' ? 'À Propos d\'AYN' : 'About AYN'}
            </span>

            <h2 className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold mb-4 md:mb-6">
              {language === 'ar' ? 'ذكاء أعمال لا يتوقف' : language === 'fr' ? 'Intelligence qui ne s\'arrête jamais' : 'Business Intelligence That Never Sleeps'}
            </h2>

            <p className="text-base md:text-xl text-muted-foreground max-w-3xl mx-auto mb-10 md:mb-16">
              {language === 'ar' ? 'AYN يراقب الأسواق ويحلل المخاطر ويقدم لك الأجوبة التي تحتاجها — على الفور.' : language === 'fr' ? 'AYN surveille les marchés, analyse les risques et vous donne les réponses dont vous avez besoin — immédiatement.' : 'AYN monitors markets, analyzes risks, and gives you the answers you need — instantly.'}
            </p>
          </ScrollReveal>

          {/* 6 Value Props - 2 Rows */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {/* Row 1: AI Capabilities */}
            <ScrollReveal delay={0.1}>
              <div className="text-center space-y-3 md:space-y-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-muted/50 mx-auto flex items-center justify-center">
                  <Brain className="w-7 h-7 md:w-8 md:h-8 text-foreground" />
                </div>
                <h3 className="text-lg md:text-xl font-bold">
                  {language === 'ar' ? 'يتكيّف معك' : language === 'fr' ? 'Compréhension Adaptative' : 'Adaptive Understanding'}
                </h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                  {language === 'ar' ? 'يتعلم تفضيلاتك ويقدم إرشادات تناسبك.' : language === 'fr' ? 'Apprend vos préférences et offre des conseils personnalisés.' : 'Learns your preferences and offers personalized guidance tailored to you.'}
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={0.2}>
              <div className="text-center space-y-3 md:space-y-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-muted/50 mx-auto flex items-center justify-center">
                  <Sparkles className="w-7 h-7 md:w-8 md:h-8 text-foreground" />
                </div>
                <h3 className="text-lg md:text-xl font-bold">
                  {language === 'ar' ? 'دائماً بجانبك' : language === 'fr' ? 'Toujours Disponible' : 'Always Available'}
                </h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                  {language === 'ar' ? 'رفيق متاح ٢٤ ساعة جاهز لمساعدتك.' : language === 'fr' ? 'Un compagnon disponible 24/7, prêt à vous aider.' : 'A thoughtful companion available 24/7, ready to help whenever you need.'}
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={0.3}>
              <div className="text-center space-y-3 md:space-y-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-muted/50 mx-auto flex items-center justify-center">
                  <Shield className="w-7 h-7 md:w-8 md:h-8 text-foreground" />
                </div>
                <h3 className="text-lg md:text-xl font-bold">
                  {language === 'ar' ? 'خصوصيتك محمية' : language === 'fr' ? 'Vie Privée Protégée' : 'Your Privacy, Protected'}
                </h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                  {language === 'ar' ? 'محادثاتك وبياناتك مشفرة بالكامل.' : language === 'fr' ? 'Vos données sont sécurisées avec chiffrement.' : 'Your conversations and data are secured with end-to-end encryption.'}
                </p>
              </div>
            </ScrollReveal>

            {/* Row 2: Business Tools */}
            <ScrollReveal delay={0.4}>
              <div className="text-center space-y-3 md:space-y-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-muted/50 mx-auto flex items-center justify-center">
                  <Zap className="w-7 h-7 md:w-8 md:h-8 text-foreground" />
                </div>
                <h3 className="text-lg md:text-xl font-bold">
                  {language === 'ar' ? 'أتمتة ذكية' : language === 'fr' ? 'Automatisation Intelligente' : 'Smart Automation'}
                </h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                  {language === 'ar' ? 'أتمتة المهام المتكررة لتوفير الوقت والموارد.' : language === 'fr' ? 'Automatisez les tâches répétitives pour économiser temps et ressources.' : 'Automate repetitive tasks to save time and resources.'}
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={0.5}>
              <div className="text-center space-y-3 md:space-y-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-muted/50 mx-auto flex items-center justify-center">
                  <Bot className="w-7 h-7 md:w-8 md:h-8 text-foreground" />
                </div>
                <h3 className="text-lg md:text-xl font-bold">
                  {language === 'ar' ? 'وكلاء مخصصون' : language === 'fr' ? 'Agents Personnalisés' : 'Custom AI Agents'}
                </h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                  {language === 'ar' ? 'وكلاء ذكاء اصطناعي مدربون على بيانات شركتك.' : language === 'fr' ? 'Agents IA entraînés sur les données de votre entreprise.' : 'AI agents trained on your company data for 24/7 support.'}
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={0.6}>
              <div className="text-center space-y-3 md:space-y-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-muted/50 mx-auto flex items-center justify-center">
                  <BarChart3 className="w-7 h-7 md:w-8 md:h-8 text-foreground" />
                </div>
                <h3 className="text-lg md:text-xl font-bold">
                  {language === 'ar' ? 'تحليلات متقدمة' : language === 'fr' ? 'Analyses Avancées' : 'Advanced Analytics'}
                </h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                  {language === 'ar' ? 'رؤى عميقة لاتخاذ قرارات أفضل لأعمالك.' : language === 'fr' ? 'Des insights approfondis pour de meilleures décisions commerciales.' : 'Deep insights to make better business decisions.'}
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>



      {/* Features Section */}
      <section id="features" className="py-20 md:py-32 px-4 md:px-6 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <ScrollReveal>
            <div className="text-center mb-16 md:mb-24">
              <span className="text-sm font-mono text-muted-foreground tracking-wider uppercase mb-4 block">
                {language === 'ar' ? 'قدرات عين' : language === 'fr' ? 'Capacités d\'AYN' : 'AYN Capabilities'}
              </span>
              <h2 className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold mb-4 md:mb-6">
                {language === 'ar' ? 'ثلاث قوى في منصة واحدة' : language === 'fr' ? 'Trois Forces en Une Plateforme' : 'Three Powers, One Platform'}
              </h2>
              <p className="text-base md:text-xl text-muted-foreground max-w-2xl mx-auto">
                {language === 'ar' ? 'عين يجمع بين التحليل العميق والرؤية الاستباقية لحماية أعمالك وتنميتها.' : language === 'fr' ? 'AYN combine analyse profonde et vision proactive pour protéger et développer votre entreprise.' : 'AYN combines deep analysis and proactive vision to protect and grow your business.'}
              </p>
            </div>
          </ScrollReveal>

          {/* Feature 1: Business Intelligence */}
          <ScrollReveal>
            <motion.div 
              className="grid md:grid-cols-2 gap-0 mb-16 md:mb-24 rounded-3xl overflow-hidden bg-card shadow-[0_4px_40px_-12px_hsl(var(--foreground)/0.1)] border border-border/30"
              whileHover={{ y: -4 }}
              transition={{ duration: 0.5 }}
            >
              <div className="relative overflow-hidden aspect-[16/10] md:aspect-auto">
                <img src={featureBusinessImg} alt="AI Business Intelligence Dashboard" className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-card/20" />
              </div>
              <div className="p-8 md:p-12 lg:p-16 flex flex-col justify-center">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-2xl md:text-3xl font-serif font-bold mb-4">
                  {language === 'ar' ? 'بناء ودراسة الأعمال' : language === 'fr' ? 'Construire & Étudier les Affaires' : 'Build & Study Business'}
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  {language === 'ar' ? 'عين يحلل بيانات شركتك ويساعدك في اتخاذ القرارات الاستراتيجية. من دراسة المنافسين إلى تحليل السوق المستهدف، يوفر لك رؤى عميقة تبني عليها نمو أعمالك.' : language === 'fr' ? 'AYN analyse les données de votre entreprise et vous aide à prendre des décisions stratégiques. De l\'étude des concurrents à l\'analyse du marché cible, il fournit des insights profonds.' : 'AYN analyzes your company data and helps you make strategic decisions. From competitor analysis to target market research, it provides deep insights to fuel your business growth.'}
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" /> {language === 'ar' ? 'تحليل المنافسين والسوق' : language === 'fr' ? 'Analyse des concurrents et du marché' : 'Competitor & market analysis'}</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" /> {language === 'ar' ? 'استراتيجيات النمو المدعومة بالبيانات' : language === 'fr' ? 'Stratégies de croissance basées sur les données' : 'Data-driven growth strategies'}</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" /> {language === 'ar' ? 'تقارير أداء ذكية' : language === 'fr' ? 'Rapports de performance intelligents' : 'Intelligent performance reports'}</li>
                </ul>
              </div>
            </motion.div>
          </ScrollReveal>

          {/* Feature 2: Market Intelligence */}
          <ScrollReveal>
            <motion.div 
              className="grid md:grid-cols-2 gap-0 mb-16 md:mb-24 rounded-3xl overflow-hidden bg-card shadow-[0_4px_40px_-12px_hsl(var(--foreground)/0.1)] border border-border/30"
              whileHover={{ y: -4 }}
              transition={{ duration: 0.5 }}
            >
              <div className="p-8 md:p-12 lg:p-16 flex flex-col justify-center order-2 md:order-1">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                  <Eye className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-2xl md:text-3xl font-serif font-bold mb-4">
                  {language === 'ar' ? 'رصد الأسواق والتحولات' : language === 'fr' ? 'Surveillance des Marchés & Tendances' : 'Market Shifts & Intelligence'}
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  {language === 'ar' ? 'عين يراقب الأسواق العالمية في الوقت الفعلي ويكشف التحولات قبل أن تصبح واضحة. من أسعار النفط إلى العملات الرقمية، لا يفوتك أي تغيير.' : language === 'fr' ? 'AYN surveille les marchés mondiaux en temps réel et détecte les changements avant qu\'ils ne deviennent évidents. Du pétrole aux cryptomonnaies, rien ne vous échappe.' : 'AYN monitors global markets in real-time and detects shifts before they become obvious. From oil prices to crypto, no change goes unnoticed.'}
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" /> {language === 'ar' ? 'تتبع الأسواق في الوقت الفعلي' : language === 'fr' ? 'Suivi des marchés en temps réel' : 'Real-time market tracking'}</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" /> {language === 'ar' ? 'تحليل القطاعات والاتجاهات' : language === 'fr' ? 'Analyse sectorielle et tendances' : 'Sector analysis & trend detection'}</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" /> {language === 'ar' ? 'تنبيهات الفرص الاستثمارية' : language === 'fr' ? 'Alertes d\'opportunités d\'investissement' : 'Investment opportunity alerts'}</li>
                </ul>
              </div>
              <div className="relative overflow-hidden aspect-[16/10] md:aspect-auto order-1 md:order-2">
                <img src={featureMarketImg} alt="Global Market Intelligence Dashboard" className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-l from-transparent to-card/20" />
              </div>
            </motion.div>
          </ScrollReveal>

          {/* Feature 3: Predictive Intelligence */}
          <ScrollReveal>
            <motion.div 
              className="grid md:grid-cols-2 gap-0 rounded-3xl overflow-hidden bg-card shadow-[0_4px_40px_-12px_hsl(var(--foreground)/0.1)] border border-border/30"
              whileHover={{ y: -4 }}
              transition={{ duration: 0.5 }}
            >
              <div className="relative overflow-hidden aspect-[16/10] md:aspect-auto">
                <img src={featurePredictImg} alt="Predictive AI World Events Analysis" className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-card/20" />
              </div>
              <div className="p-8 md:p-12 lg:p-16 flex flex-col justify-center">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                  <AlertTriangle className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-2xl md:text-3xl font-serif font-bold mb-4">
                  {language === 'ar' ? 'التنبؤ بالأحداث العالمية' : language === 'fr' ? 'Prédiction des Événements Mondiaux' : 'World Event Predictions'}
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  {language === 'ar' ? 'عين يحلل الأحداث الجيوسياسية وسلاسل الإمداد والصراعات العالمية ليتنبأ بتأثيرها على أعمالك. استعد للمستقبل قبل أن يصل.' : language === 'fr' ? 'AYN analyse les événements géopolitiques, les chaînes d\'approvisionnement et les conflits mondiaux pour prédire leur impact sur votre entreprise.' : 'AYN analyzes geopolitical events, supply chains, and global conflicts to predict their impact on your business. Prepare for the future before it arrives.'}
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" /> {language === 'ar' ? 'تحليل المخاطر الجيوسياسية' : language === 'fr' ? 'Analyse des risques géopolitiques' : 'Geopolitical risk analysis'}</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" /> {language === 'ar' ? 'تنبيهات اضطراب سلاسل الإمداد' : language === 'fr' ? 'Alertes de perturbation de la chaîne d\'approvisionnement' : 'Supply chain disruption alerts'}</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" /> {language === 'ar' ? 'سيناريوهات التأثير على الأعمال' : language === 'fr' ? 'Scénarios d\'impact commercial' : 'Business impact scenarios'}</li>
                </ul>
              </div>
            </motion.div>
          </ScrollReveal>
        </div>
      </section>

      <Footer />
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </div>
  </>;
});
export default LandingPage;