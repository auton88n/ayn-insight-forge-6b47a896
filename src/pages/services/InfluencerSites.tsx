import { useState, memo } from 'react';
import { Link } from 'react-router-dom';
import influencerWomanBg from '@/assets/influencer-woman-bg.jpg';
import { Brain, ArrowLeft, ArrowRight, Palette, Smartphone, Zap, Layout, TrendingUp, Globe, Instagram, Play, Heart, Eye, BarChart3, Users, Star, CheckCircle, MessageCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { SEO, createServiceSchema, createBreadcrumbSchema } from '@/components/shared/SEO';
import MobileMockup from '@/components/services/MobileMockup';

const FeatureCard = memo(({ feature }: { feature: any }) => (
  <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 hover:border-rose-500/50 transition-all duration-300">
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500/20 to-pink-500/20 flex items-center justify-center mb-4">
      <feature.icon className="w-6 h-6 text-rose-400" />
    </div>
    <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
    <p className="text-neutral-400 text-sm">{feature.description}</p>
  </div>
));
FeatureCard.displayName = 'FeatureCard';

const ProcessStep = memo(({ step, index }: { step: any; index: number }) => (
  <div className="text-center">
    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center text-white font-bold text-xl">
      {step.step}
    </div>
    <h3 className="text-xl font-bold mb-2">{step.title}</h3>
    <p className="text-neutral-400">{step.description}</p>
  </div>
));
ProcessStep.displayName = 'ProcessStep';

const InfluencerSites = () => {
  const { language, direction } = useLanguage();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    message: ''
  });

  const t = {
    back: language === 'ar' ? 'عودة' : language === 'fr' ? 'Retour' : 'Back',
    heroTitle: language === 'ar' ? 'مواقع احترافية لصناع المحتوى' : language === 'fr' ? 'Sites Premium pour Créateurs de Contenu' : 'Premium Content Creator Sites',
    heroSubtitle: language === 'ar' ? 'مواقع احترافية مصممة خصيصاً لصناع المحتوى. احصل على شراكات أكثر وطوّر علامتك التجارية.' : language === 'fr' ? 'Sites web de luxe conçus pour les créateurs de contenu. Attirez plus de partenariats et élevez votre marque personnelle.' : 'Luxury websites custom-built for content creators. Attract more partnerships and elevate your personal brand.',
    startProject: language === 'ar' ? 'ابدأ الآن' : language === 'fr' ? 'Démarrer Votre Projet' : 'Start Your Project',
    whatYoullGet: language === 'ar' ? 'ماذا ستحصل' : language === 'fr' ? 'Ce Que Vous Obtiendrez' : "What You'll Get",
    stunningHero: language === 'ar' ? 'واجهة رئيسية مميزة' : language === 'fr' ? 'Section Hero Époustouflante' : 'Stunning Hero Section',
    heroDesc: language === 'ar' ? 'اترك انطباعاً أولياً قوياً بواجهة تعكس هويتك' : language === 'fr' ? 'Faites une première impression puissante avec un hero captivant' : 'Make a powerful first impression with a captivating hero that showcases your brand',
    analytics: language === 'ar' ? 'لوحة الإحصائيات' : language === 'fr' ? 'Tableau de Bord Analytique' : 'Analytics Dashboard',
    platformStats: language === 'ar' ? 'إحصائيات المنصات' : language === 'fr' ? 'Statistiques Plateformes' : 'Platform Stats',
    analyticsDesc: language === 'ar' ? 'أظهر للعلامات التجارية لماذا يجب التعاون معك. لوحة الإحصائيات تعرض عدد المتابعين ونسب التفاعل مباشرة.' : language === 'fr' ? 'Montrez aux marques pourquoi elles devraient travailler avec vous. Votre tableau de bord affiche les statistiques en temps réel.' : 'Show brands exactly why they should work with you. Your analytics dashboard displays real-time follower counts, engagement rates, and audience demographics across all platforms.',
    features: language === 'ar' ? 'المميزات' : language === 'fr' ? 'Fonctionnalités' : 'Features',
    premiumFeatures: language === 'ar' ? 'مميزات حصرية' : language === 'fr' ? 'Fonctionnalités Premium' : 'Premium Features',
    everythingYouNeed: language === 'ar' ? 'كل ما تحتاجه للتميز على الإنترنت' : language === 'fr' ? 'Tout ce dont vous avez besoin pour briller dans le monde digital' : 'Everything you need to stand out in the digital world',
    howItWorks: language === 'ar' ? 'طريقة العمل' : language === 'fr' ? 'Comment Ça Marche' : 'How It Works',
    ourProcess: language === 'ar' ? 'خطوات العمل' : language === 'fr' ? 'Notre Processus' : 'Our Process',
    fromConceptToLaunch: language === 'ar' ? 'من الفكرة إلى الإطلاق في أربع خطوات' : language === 'fr' ? 'Du concept au lancement en quatre étapes simples' : 'From concept to launch in four simple steps',
    readyToStandOut: language === 'ar' ? 'جاهز للبداية؟' : language === 'fr' ? 'Prêt à Vous Démarquer?' : 'Ready to Stand Out?',
    ctaDesc: language === 'ar' ? 'انضم لأفضل صناع المحتوى الذين يثقون بنا لبناء مواقعهم' : language === 'fr' ? 'Rejoignez les créateurs de contenu d\'élite qui nous font confiance pour leur présence web premium' : 'Join elite content creators who trust us with their premium web presence',
    startYourProject: language === 'ar' ? 'ابدأ مشروعك' : language === 'fr' ? 'Démarrer Votre Projet' : 'Start Your Project',
    viewAllServices: language === 'ar' ? 'عرض كل الخدمات' : language === 'fr' ? 'Voir Tous les Services' : 'View All Services',
    formTitle: language === 'ar' ? 'ابدأ مشروعك' : language === 'fr' ? 'Démarrer Votre Projet' : 'Start Your Project',
    formDesc: language === 'ar' ? 'أخبرنا عن مشروعك وسنتواصل معك قريباً.' : language === 'fr' ? 'Parlez-nous de votre projet et nous vous contacterons.' : 'Tell us about your project and we\'ll get back to you.',
    fullName: language === 'ar' ? 'الاسم الكامل' : language === 'fr' ? 'Nom Complet' : 'Full Name',
    email: language === 'ar' ? 'البريد الإلكتروني' : language === 'fr' ? 'Email' : 'Email',
    phone: language === 'ar' ? 'رقم الجوال' : language === 'fr' ? 'Téléphone' : 'Phone',
    message: language === 'ar' ? 'رسالتك' : language === 'fr' ? 'Message' : 'Message',
    optional: language === 'ar' ? 'اختياري' : language === 'fr' ? 'Optionnel' : 'Optional',
    submit: language === 'ar' ? 'إرسال الطلب' : language === 'fr' ? 'Soumettre la Demande' : 'Submit Application',
    submitting: language === 'ar' ? 'جاري الإرسال...' : language === 'fr' ? 'Envoi...' : 'Submitting...',
    successTitle: language === 'ar' ? 'تم الإرسال!' : language === 'fr' ? 'Soumission Réussie!' : 'Application Submitted!',
    successDesc: language === 'ar' ? 'شكراً لك! سنتواصل معك خلال ٢٤-٤٨ ساعة.' : language === 'fr' ? 'Merci pour votre intérêt! Nous vous contacterons dans 24-48 heures.' : 'Thank you for your interest! We\'ll be in touch within 24-48 hours.',
    close: language === 'ar' ? 'إغلاق' : language === 'fr' ? 'Fermer' : 'Close',
    needMoreOptions: language === 'ar' ? 'تحتاج المزيد؟' : language === 'fr' ? 'Besoin de plus d\'options?' : 'Need more options?',
    detailedForm: language === 'ar' ? 'املأ النموذج المفصل' : language === 'fr' ? 'Remplir le formulaire détaillé' : 'Fill out the detailed form'
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.email) {
      toast({
        title: language === 'ar' ? 'يرجى ملء الحقول المطلوبة' : language === 'fr' ? 'Veuillez remplir les champs requis' : 'Please fill in required fields',
        variant: 'destructive'
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error: dbError } = await supabase.from('service_applications').insert({
        full_name: formData.fullName,
        email: formData.email,
        phone: formData.phone || null,
        message: formData.message || null,
        service_type: 'content_creator',
        status: 'new'
      });
      
      if (dbError) throw dbError;

      await supabase.functions.invoke('send-application-email', {
        body: {
          applicantName: formData.fullName,
          applicantEmail: formData.email,
          applicantPhone: formData.phone,
          message: formData.message,
          serviceType: 'Content Creator Sites'
        }
      });
      setIsSuccess(true);
      setFormData({ fullName: '', email: '', phone: '', message: '' });
    } catch (error) {
      console.error('Submission error:', error);
      toast({
        title: language === 'ar' ? 'حدث خطأ. يرجى المحاولة مرة أخرى.' : language === 'fr' ? 'Une erreur s\'est produite. Veuillez réessayer.' : 'Something went wrong. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsSuccess(false);
  };

  const features = [
    { icon: Palette, title: language === 'ar' ? 'تصميم احترافي مخصص' : language === 'fr' ? 'Design Luxueux Personnalisé' : 'Custom Luxury Design', description: language === 'ar' ? 'تصميم فريد يعكس هويتك ويميزك عن الآخرين' : language === 'fr' ? 'Design unique qui reflète votre marque personnelle' : 'Unique design that reflects your personal brand and sets you apart from competitors' },
    { icon: Smartphone, title: language === 'ar' ? 'متوافق مع الجوال' : language === 'fr' ? 'Mobile First' : 'Mobile First', description: language === 'ar' ? 'تجربة مثالية على جميع الأجهزة' : language === 'fr' ? 'Expérience parfaite sur tous les appareils' : 'Perfect experience across all devices, from mobile to desktop' },
    { icon: Zap, title: language === 'ar' ? 'سرعة عالية' : language === 'fr' ? 'Ultra Rapide' : 'Lightning Fast', description: language === 'ar' ? 'تحميل سريع يبقي الزوار على موقعك' : language === 'fr' ? 'Chargement rapide pour garder les visiteurs engagés' : 'Fast loading keeps visitors engaged and improves your search rankings' },
    { icon: Layout, title: language === 'ar' ? 'معرض أعمال احترافي' : language === 'fr' ? 'Portfolio Interactif' : 'Interactive Portfolio', description: language === 'ar' ? 'اعرض أعمالك بشكل احترافي لجذب الشراكات' : language === 'fr' ? 'Présentez votre travail professionnellement' : 'Showcase your work professionally to attract brand partnerships' },
    { icon: TrendingUp, title: language === 'ar' ? 'مُحسّن للنتائج' : language === 'fr' ? 'Optimisé Conversion' : 'Conversion Optimized', description: language === 'ar' ? 'صفحات مصممة لتحويل الزوار إلى عملاء' : language === 'fr' ? 'Pages conçues pour convertir les visiteurs' : 'Pages designed to convert visitors into clients and partnerships' },
    { icon: Globe, title: language === 'ar' ? 'دعم لغات متعددة' : language === 'fr' ? 'Support Multilingue' : 'Multi-language Support', description: language === 'ar' ? 'وصول عالمي بدعم لغات متعددة' : language === 'fr' ? 'Touchez une audience mondiale' : 'Reach a global audience with multi-language content support' }
  ];

  const process = [
    { step: '01', title: language === 'ar' ? 'التعرف' : language === 'fr' ? 'Découverte' : 'Discovery', description: language === 'ar' ? 'نتعرف على هويتك وأهدافك' : language === 'fr' ? 'Nous comprenons votre marque et vos objectifs' : 'We understand your brand and goals' },
    { step: '02', title: language === 'ar' ? 'التصميم' : language === 'fr' ? 'Design' : 'Design', description: language === 'ar' ? 'نصمم تجربة فريدة لك' : language === 'fr' ? 'Nous créons une expérience unique pour vous' : 'We craft a unique experience for you' },
    { step: '03', title: language === 'ar' ? 'البرمجة' : language === 'fr' ? 'Développement' : 'Development', description: language === 'ar' ? 'نبني موقعك بأحدث التقنيات' : language === 'fr' ? 'Nous construisons avec les dernières technologies' : 'We build with cutting-edge tech' },
    { step: '04', title: language === 'ar' ? 'الإطلاق' : language === 'fr' ? 'Lancement' : 'Launch', description: language === 'ar' ? 'نطلق موقعك للعالم' : language === 'fr' ? 'Nous lançons votre site au monde' : 'We launch your site to the world' }
  ];

  const breadcrumbSchema = createBreadcrumbSchema([
    { name: 'Home', url: 'https://aynn.io/' },
    { name: 'Services', url: 'https://aynn.io/#services' },
    { name: 'Content Creator Sites', url: 'https://aynn.io/services/content-creator-sites' }
  ]);

  const serviceSchema = createServiceSchema({ 
    name: 'Content Creator Sites', 
    description: 'Premium websites designed for influencers and content creators.', 
    url: 'https://aynn.io/services/content-creator-sites' 
  });

  return (
    <>
      <SEO
        title="Premium Websites for Content Creators"
        description="Luxury websites custom-built for content creators and influencers. Attract more partnerships and elevate your personal brand."
        canonical="/services/content-creator-sites"
        keywords="content creator websites, influencer sites, portfolio websites, personal brand, creator economy"
        jsonLd={{ '@graph': [breadcrumbSchema, serviceSchema] }}
        language={language as 'en' | 'ar' | 'fr'}
      />
      <div dir={direction} className="min-h-screen bg-neutral-950 text-white">
        {/* Navigation */}
        <nav className="fixed top-4 md:top-6 left-4 md:left-6 z-50">
          <Link to="/services">
            <Button variant="ghost" className="gap-2 bg-neutral-900/80 backdrop-blur-xl border border-neutral-800 rounded-full px-4 py-2 hover:bg-neutral-800 text-white">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{t.back}</span>
            </Button>
          </Link>
        </nav>

        {/* Hero Section */}
        <section className="pt-24 pb-16 md:pt-32 md:pb-24 px-4 md:px-6">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center animate-fade-in">
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif font-bold mb-6 leading-tight">
                {language === 'ar' ? <>مواقع فاخرة لصنّاع <br /><span className="text-rose-400">المحتوى</span></> : language === 'fr' ? <>Sites Premium pour <br /><span className="text-rose-400">Créateurs</span></> : <>Premium Content Creator<br /><span className="text-rose-400">Sites</span></>}
              </h1>
              <p className="text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto mb-8">
                {t.heroSubtitle}
              </p>
              <Button size="lg" className="rounded-full px-8 bg-white text-neutral-950 hover:bg-neutral-200" onClick={() => setIsModalOpen(true)}>
                {t.startProject}
              </Button>
            </div>
          </div>
        </section>

        {/* Phone Mockup Section */}
        <section className="py-16 md:py-24 px-4 md:px-6 bg-neutral-900/50">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <span className="text-sm font-mono text-rose-400 tracking-wider uppercase mb-4 block">
                {t.whatYoullGet}
              </span>
              <h2 className="text-3xl md:text-5xl font-serif font-bold mb-4">
                {language === 'ar' ? <>قسم رئيسي <span className="text-rose-400">مذهل</span></> : language === 'fr' ? <>Section Hero <span className="text-rose-400">Époustouflante</span></> : <>Stunning <span className="text-rose-400">Hero Section</span></>}
              </h2>
              <p className="text-neutral-400 max-w-xl mx-auto">{t.heroDesc}</p>
            </div>
            <div className="flex justify-center">
              <MobileMockup />
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-16 md:py-24 px-4 md:px-6">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <span className="text-sm font-mono text-rose-400 tracking-wider uppercase mb-4 block">
                {t.features}
              </span>
              <h2 className="text-3xl md:text-5xl font-serif font-bold mb-4">{t.premiumFeatures}</h2>
              <p className="text-neutral-400 max-w-xl mx-auto">{t.everythingYouNeed}</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <FeatureCard key={index} feature={feature} />
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 md:py-24 px-4 md:px-6 bg-neutral-900/50">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <span className="text-sm font-mono text-rose-400 tracking-wider uppercase mb-4 block">
                {t.howItWorks}
              </span>
              <h2 className="text-3xl md:text-5xl font-serif font-bold mb-4">{t.ourProcess}</h2>
              <p className="text-neutral-400 max-w-xl mx-auto">{t.fromConceptToLaunch}</p>
            </div>
            <div className="grid md:grid-cols-4 gap-8">
              {process.map((step, index) => (
                <ProcessStep key={index} step={step} index={index} />
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 md:py-24 px-4 md:px-6">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl md:text-5xl font-serif font-bold mb-6">{t.readyToStandOut}</h2>
            <p className="text-lg text-neutral-400 mb-8">{t.ctaDesc}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="rounded-full px-8 bg-white text-neutral-950 hover:bg-neutral-200" onClick={() => setIsModalOpen(true)}>
                {t.startYourProject}
              </Button>
              <Link to="/#services">
                <Button size="lg" variant="outline" className="rounded-full px-8 border-neutral-700 hover:bg-neutral-800 text-white hover:text-white">
                  {t.viewAllServices}
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Modal */}
        <Dialog open={isModalOpen} onOpenChange={handleCloseModal}>
          <DialogContent className="bg-neutral-900 border-neutral-800 text-white max-w-md">
            {!isSuccess ? (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">{t.formTitle}</DialogTitle>
                  <DialogDescription className="text-neutral-400">{t.formDesc}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="fullName" className="text-white">{t.fullName}</Label>
                    <Input id="fullName" value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })} required className="bg-neutral-800 border-neutral-700 text-white mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-white">{t.email}</Label>
                    <Input id="email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} required className="bg-neutral-800 border-neutral-700 text-white mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-white">{t.phone} <span className="text-neutral-500">({t.optional})</span></Label>
                    <Input id="phone" type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="bg-neutral-800 border-neutral-700 text-white mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="message" className="text-white">{t.message} <span className="text-neutral-500">({t.optional})</span></Label>
                    <Textarea id="message" value={formData.message} onChange={e => setFormData({ ...formData, message: e.target.value })} className="bg-neutral-800 border-neutral-700 text-white mt-1" rows={3} />
                  </div>
                  <Button type="submit" disabled={isSubmitting} className="w-full bg-white text-neutral-950 hover:bg-neutral-200">
                    {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t.submitting}</> : t.submit}
                  </Button>
                  <div className="text-center text-sm text-neutral-500">
                    {t.needMoreOptions}{' '}
                    <Link to="/services/influencer-sites/apply" className="text-rose-400 hover:underline">{t.detailedForm}</Link>
                  </div>
                </form>
              </>
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="w-16 h-16 text-rose-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">{t.successTitle}</h3>
                <p className="text-neutral-400 mb-6">{t.successDesc}</p>
                <Button onClick={handleCloseModal} variant="outline" className="border-neutral-700 text-white hover:text-white">{t.close}</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default InfluencerSites;
