import { useState, memo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, QrCode, Smartphone, BarChart3, Calendar, Wifi, Palette, Check, Loader2, Ticket, ShieldCheck, Users, Brain, MessageCircle, Crown, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SEO } from '@/components/shared/SEO';
import TicketingMockup from '@/components/services/TicketingMockup';

const StepCard = memo(({ step, index }: { step: any; index: number }) => (
  <div className="text-center">
    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xl">
      {step.number}
    </div>
    <h3 className="text-xl font-bold mb-2">{step.title}</h3>
    <p className="text-muted-foreground">{step.description}</p>
  </div>
));
StepCard.displayName = 'StepCard';

const FeatureCard = memo(({ feature }: { feature: any }) => (
  <div className="p-6 rounded-2xl bg-muted/50 border border-border hover:border-purple-500/30 transition-colors">
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-4">
      <feature.icon className="w-6 h-6 text-purple-500" />
    </div>
    <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
    <p className="text-sm text-muted-foreground">{feature.description}</p>
  </div>
));
FeatureCard.displayName = 'FeatureCard';

const AIFeatureCard = memo(({ feature }: { feature: any }) => (
  <div className="p-6 rounded-2xl border border-border bg-card hover:border-purple-500/30 transition-colors">
    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4`}>
      <feature.icon className="w-6 h-6 text-white" />
    </div>
    <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
    <p className="text-sm text-muted-foreground">{feature.description}</p>
  </div>
));
AIFeatureCard.displayName = 'AIFeatureCard';

const Ticketing = () => {
  const { language, direction } = useLanguage();
  const { toast } = useToast();
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
    title: language === 'ar' ? 'نظام التذاكر الذكي' : language === 'fr' ? 'Système de Billetterie Intelligent' : 'Smart Ticketing System',
    subtitle: language === 'ar' ? 'بيع التذاكر عبر الإنترنت والتحقق بمسح رمز QR من الهاتف' : language === 'fr' ? 'Vendez des billets en ligne et validez par code QR' : 'Sell tickets online and validate with phone QR scanning',
    heroDescription: language === 'ar' 
      ? 'نظام متكامل لإدارة الفعاليات: بيع التذاكر إلكترونياً، إرسال رموز QR للهواتف، والتحقق الفوري عند الدخول.'
      : language === 'fr' 
      ? 'Système complet de gestion d\'événements : vente de billets en ligne, codes QR mobiles et validation instantanée à l\'entrée.'
      : 'Complete event management: online ticket sales, mobile QR codes, and instant validation at entry.',
    getStarted: language === 'ar' ? 'ابدأ الآن' : language === 'fr' ? 'Commencer' : 'Get Started',
    back: language === 'ar' ? 'العودة' : language === 'fr' ? 'Retour' : 'Back',
    howItWorks: language === 'ar' ? 'كيف يعمل النظام' : language === 'fr' ? 'Comment ça fonctionne' : 'How It Works',
    features: language === 'ar' ? 'المميزات' : language === 'fr' ? 'Fonctionnalités' : 'Features',
    applyNow: language === 'ar' ? 'قدّم طلبك الآن' : language === 'fr' ? 'Postulez maintenant' : 'Apply Now',
    aiFeatures: language === 'ar' ? 'مميزات الذكاء الاصطناعي' : language === 'fr' ? 'Fonctionnalités IA' : 'AI-Powered Features',
    aiSubtitle: language === 'ar' ? 'دع الذكاء الاصطناعي يتولى المهام المعقدة نيابةً عنك' : language === 'fr' ? 'Laissez l\'intelligence artificielle gérer les tâches complexes' : 'Let artificial intelligence handle the heavy lifting',
    aiPowered: language === 'ar' ? 'مدعوم بالذكاء الاصطناعي' : language === 'fr' ? 'Propulsé par l\'IA' : 'AI-Powered',
    aiCustomerService: language === 'ar' ? 'خدمة العملاء الذكية' : language === 'fr' ? 'Service Client IA' : 'AI Customer Service',
    aiCustomerServiceDesc: language === 'ar' 
      ? 'روبوت محادثة ذكي يعمل على مدار الساعة للرد على استفسارات الحضور حول الفعاليات والتذاكر ومعلومات المكان'
      : language === 'fr' 
      ? 'Chatbot intelligent disponible 24h/24 répondant aux questions des participants sur les événements, billets et informations du lieu'
      : '24/7 AI chatbot answers attendee questions about events, tickets, and venue info',
    aiVipInvitations: language === 'ar' ? 'دعوات VIP الذكية' : language === 'fr' ? 'Invitations VIP IA' : 'AI VIP Invitations',
    aiVipInvitationsDesc: language === 'ar' 
      ? 'إنشاء دعوات VIP مخصصة تلقائياً بناءً على سجل الضيوف وتفضيلاتهم السابقة'
      : language === 'fr' 
      ? 'Génération automatique d\'invitations VIP personnalisées basées sur l\'historique et les préférences des invités'
      : 'Auto-generate personalized VIP invitations based on guest history and preferences',
    aiMarketing: language === 'ar' ? 'حملات التسويق الذكية' : language === 'fr' ? 'Campagnes Marketing IA' : 'AI Marketing Campaigns',
    aiMarketingDesc: language === 'ar' 
      ? 'حملات بريد إلكتروني ورسائل نصية ذكية تُحسّن التوقيت والمحتوى لتحقيق أقصى مبيعات للتذاكر'
      : language === 'fr' 
      ? 'Campagnes email et SMS intelligentes optimisant le timing et le contenu pour maximiser les ventes de billets'
      : 'Smart email and SMS campaigns that optimize timing and messaging for maximum ticket sales',
    ctaTitle: language === 'ar' ? 'جاهز لإدارة فعالياتك؟' : language === 'fr' ? 'Prêt à gérer vos événements ?' : 'Ready to manage your events?',
    ctaDesc: language === 'ar' ? 'ابدأ اليوم وحوّل طريقة إدارة التذاكر لديك' : language === 'fr' ? 'Commencez aujourd\'hui et transformez votre gestion des billets' : 'Start today and transform your ticket management',
    formTitle: language === 'ar' ? 'ابدأ مع التذاكر الذكية' : language === 'fr' ? 'Commencer avec la Billetterie' : 'Get Started with Smart Ticketing',
    formDesc: language === 'ar' ? 'أخبرنا عن فعاليتك وسنتواصل معك قريباً.' : language === 'fr' ? 'Parlez-nous de votre événement et nous vous contacterons.' : 'Tell us about your event and we\'ll get back to you.',
    fullName: language === 'ar' ? 'الاسم الكامل' : language === 'fr' ? 'Nom Complet' : 'Full Name',
    email: language === 'ar' ? 'البريد الإلكتروني' : language === 'fr' ? 'Email' : 'Email',
    phone: language === 'ar' ? 'رقم الجوال' : language === 'fr' ? 'Téléphone' : 'Phone',
    message: language === 'ar' ? 'رسالتك' : language === 'fr' ? 'Message' : 'Message',
    optional: language === 'ar' ? 'اختياري' : language === 'fr' ? 'Optionnel' : 'Optional',
    submit: language === 'ar' ? 'إرسال الطلب' : language === 'fr' ? 'Soumettre' : 'Submit',
    submitting: language === 'ar' ? 'جاري الإرسال...' : language === 'fr' ? 'Envoi...' : 'Submitting...',
    successTitle: language === 'ar' ? 'تم الإرسال!' : language === 'fr' ? 'Soumis!' : 'Submitted!',
    successDesc: language === 'ar' ? 'سنتواصل معك قريباً.' : language === 'fr' ? 'Nous vous contacterons bientôt.' : 'We\'ll contact you soon.',
    close: language === 'ar' ? 'إغلاق' : language === 'fr' ? 'Fermer' : 'Close'
  };

  const aiFeatures = [
    { icon: MessageCircle, title: t.aiCustomerService, description: t.aiCustomerServiceDesc, gradient: 'from-cyan-500 to-blue-500' },
    { icon: Crown, title: t.aiVipInvitations, description: t.aiVipInvitationsDesc, gradient: 'from-amber-500 to-orange-500' },
    { icon: Megaphone, title: t.aiMarketing, description: t.aiMarketingDesc, gradient: 'from-pink-500 to-rose-500' }
  ];

  const features = [
    { icon: QrCode, title: language === 'ar' ? 'تذاكر QR آمنة' : language === 'fr' ? 'Billets QR Sécurisés' : 'Secure QR Tickets', description: language === 'ar' ? 'رمز QR فريد ومشفر لكل تذكرة' : language === 'fr' ? 'Code QR unique et crypté pour chaque billet' : 'Unique, encrypted QR code for each ticket' },
    { icon: Smartphone, title: language === 'ar' ? 'مسح بالجوال' : language === 'fr' ? 'Scan Mobile' : 'Phone Scanning', description: language === 'ar' ? 'تحقق فوري باستخدام أي هاتف ذكي' : language === 'fr' ? 'Validation instantanée avec n\'importe quel smartphone' : 'Instant validation with any smartphone' },
    { icon: BarChart3, title: language === 'ar' ? 'لوحة تحكم مباشرة' : language === 'fr' ? 'Tableau de Bord en Direct' : 'Real-time Dashboard', description: language === 'ar' ? 'تتبع المبيعات والحضور والإيرادات لحظياً' : language === 'fr' ? 'Suivez les ventes, la participation et les revenus en direct' : 'Track sales, attendance, and revenue live' },
    { icon: Calendar, title: language === 'ar' ? 'إدارة فعاليات متعددة' : language === 'fr' ? 'Multi-événements' : 'Multi-Event Support', description: language === 'ar' ? 'إدارة جميع فعالياتك من لوحة واحدة' : language === 'fr' ? 'Gérez tous vos événements depuis un tableau de bord' : 'Manage all your events from one dashboard' },
    { icon: Wifi, title: language === 'ar' ? 'وضع بدون إنترنت' : language === 'fr' ? 'Mode Hors Ligne' : 'Offline Mode', description: language === 'ar' ? 'مسح التذاكر حتى بدون اتصال إنترنت' : language === 'fr' ? 'Scannez les billets même sans connexion' : 'Scan tickets even without internet connection' },
    { icon: Palette, title: language === 'ar' ? 'تخصيص العلامة التجارية' : language === 'fr' ? 'Personnalisation de Marque' : 'Custom Branding', description: language === 'ar' ? 'شعارك وألوانك على كل تذكرة' : language === 'fr' ? 'Votre logo et couleurs sur chaque billet' : 'Your logo and colors on every ticket' }
  ];

  const steps = [
    { number: '01', title: language === 'ar' ? 'أنشئ فعاليتك' : language === 'fr' ? 'Créez votre événement' : 'Create Your Event', description: language === 'ar' ? 'حدد التفاصيل والأسعار والسعة' : language === 'fr' ? 'Définissez les détails, prix et capacité' : 'Set up details, pricing, and capacity' },
    { number: '02', title: language === 'ar' ? 'بيع التذاكر' : language === 'fr' ? 'Vendez les billets' : 'Sell Tickets', description: language === 'ar' ? 'العملاء يشترون ويستلمون رموز QR' : language === 'fr' ? 'Les clients achètent et reçoivent des codes QR' : 'Customers purchase and receive QR codes' },
    { number: '03', title: language === 'ar' ? 'امسح وادخل' : language === 'fr' ? 'Scannez et entrez' : 'Scan & Enter', description: language === 'ar' ? 'فريقك يتحقق من التذاكر بالجوال' : language === 'fr' ? 'Votre équipe valide avec téléphone' : 'Staff validates tickets with phone camera' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const { error: dbError } = await supabase.from('service_applications').insert({
        service_type: 'ticketing',
        full_name: formData.fullName.trim(),
        email: formData.email.trim(),
        phone: formData.phone?.trim() || null,
        message: formData.message?.trim() || null
      });

      if (dbError) throw dbError;

      await supabase.functions.invoke('send-application-email', {
        body: {
          service: 'Smart Ticketing System',
          name: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          message: formData.message
        }
      });

      setIsSuccess(true);
      toast({
        title: language === 'ar' ? 'تم الإرسال بنجاح' : 'Application Submitted',
        description: language === 'ar' ? 'سنتواصل معك قريباً' : "We'll contact you soon"
      });
    } catch (error) {
      console.error('Submission error:', error);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'حدث خطأ. يرجى المحاولة مرة أخرى' : 'Something went wrong. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    if (isSuccess) {
      setIsSuccess(false);
      setFormData({ fullName: '', email: '', phone: '', message: '' });
    }
  };

  const breadcrumbSchema = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://aynn.io' },
      { '@type': 'ListItem', position: 2, name: 'Smart Ticketing System', item: 'https://aynn.io/services/ticketing' }
    ]
  };

  return (
    <>
      <SEO
        title={`${t.title} | AYN`}
        description={t.heroDescription}
        canonical="/services/ticketing"
        keywords="ticketing system, QR code tickets, event management, mobile scanning, ticket validation"
        jsonLd={breadcrumbSchema}
        language={language as 'en' | 'ar' | 'fr'}
      />
      
      <div dir={direction} className="min-h-screen bg-background">
        {/* Back Button */}
        <div className="fixed top-4 left-4 z-50">
          <Link to="/services">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              {t.back}
            </Button>
          </Link>
        </div>

        {/* Hero Section */}
        <section className="w-full pt-24 pb-16 md:pt-32 md:pb-24">
          <div className="container mx-auto max-w-6xl px-4 md:px-6">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="animate-fade-in">
                <span className="inline-flex items-center gap-2 text-sm font-mono text-purple-500 tracking-wider uppercase mb-4">
                  <Ticket className="w-4 h-4" />
                  {language === 'ar' ? 'جديد' : 'NEW'}
                </span>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-[1.35] overflow-visible">
                  <span className="inline-block overflow-visible pt-[0.06em] pb-[0.42em] bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                    {t.title}
                  </span>
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground mb-8">
                  {t.heroDescription}
                </p>
                <div className="flex flex-wrap gap-4">
                  <Button size="lg" onClick={() => setIsModalOpen(true)} className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
                    {t.getStarted}
                  </Button>
                  <Link to="/services/ticketing/apply">
                    <Button size="lg" variant="outline" className="border-border">
                      {t.applyNow}
                    </Button>
                  </Link>
                </div>
              </div>
              
              <div className="flex justify-center animate-fade-in" style={{ animationDelay: '150ms' }}>
                <div className="w-full max-w-3xl h-[480px] flex items-center justify-center">
                  <TicketingMockup />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="w-full py-16 md:py-24 bg-muted/30">
          <div className="container mx-auto max-w-6xl px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.howItWorks}</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {steps.map((step, index) => (
                <StepCard key={index} step={step} index={index} />
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="w-full py-16 md:py-24">
          <div className="container mx-auto max-w-6xl px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.features}</h2>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <FeatureCard key={index} feature={feature} />
              ))}
            </div>
          </div>
        </section>

        {/* AI-Powered Features Section */}
        <section className="w-full py-16 md:py-24 bg-muted/30">
          <div className="container mx-auto max-w-6xl px-4 md:px-6">
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-2 text-sm font-mono text-purple-500 tracking-wider uppercase mb-4">
                <Brain className="w-4 h-4" />
                {t.aiPowered}
              </span>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.aiFeatures}</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{t.aiSubtitle}</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {aiFeatures.map((feature, index) => (
                <AIFeatureCard key={index} feature={feature} />
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="w-full py-16 md:py-24">
          <div className="container mx-auto max-w-4xl px-4 md:px-6 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.ctaTitle}</h2>
            <p className="text-lg text-muted-foreground mb-8">{t.ctaDesc}</p>
            <Button size="lg" onClick={() => setIsModalOpen(true)} className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
              {t.getStarted}
            </Button>
          </div>
        </section>

        {/* Modal */}
        <Dialog open={isModalOpen} onOpenChange={handleCloseModal}>
          <DialogContent className="max-w-md">
            {!isSuccess ? (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">{t.formTitle}</DialogTitle>
                  <DialogDescription>{t.formDesc}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="fullName">{t.fullName}</Label>
                    <Input id="fullName" value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })} required className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="email">{t.email}</Label>
                    <Input id="email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} required className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="phone">{t.phone} <span className="text-muted-foreground">({t.optional})</span></Label>
                    <Input id="phone" type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="message">{t.message} <span className="text-muted-foreground">({t.optional})</span></Label>
                    <Textarea id="message" value={formData.message} onChange={e => setFormData({ ...formData, message: e.target.value })} className="mt-1" rows={3} />
                  </div>
                  <Button type="submit" disabled={isSubmitting} className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
                    {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t.submitting}</> : t.submit}
                  </Button>
                </form>
              </>
            ) : (
              <div className="text-center py-8">
                <Check className="w-16 h-16 text-purple-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">{t.successTitle}</h3>
                <p className="text-muted-foreground mb-6">{t.successDesc}</p>
                <Button onClick={handleCloseModal} variant="outline">{t.close}</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default Ticketing;
