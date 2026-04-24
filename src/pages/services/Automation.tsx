import { useState, memo } from 'react';
import { ArrowLeft, Brain, Zap, Clock, Settings, Link2, BarChart3, Shield, Bell, FileText, Mail, Calendar, Database, Share2, Workflow, Play, CheckCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { SEO, createServiceSchema, createBreadcrumbSchema } from '@/components/shared/SEO';
import AutomationFlowMockup from '@/components/services/AutomationFlowMockup';

const AutomationCard = memo(({ automation, t }: { automation: any; t: any }) => (
  <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 hover:border-emerald-500/30 transition-colors">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center">
          <automation.icon className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="font-medium text-white">{automation.title}</h3>
          <p className="text-xs text-neutral-500">{automation.description}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-emerald-400 font-bold">{t.save} {automation.hours}</p>
        <p className="text-xs text-neutral-500">{t.hrsWeek}</p>
      </div>
    </div>
  </div>
));
AutomationCard.displayName = 'AutomationCard';

const FeatureCard = memo(({ feature }: { feature: any }) => (
  <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 hover:border-emerald-500/30 transition-colors">
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center mb-4">
      <feature.icon className="w-6 h-6 text-emerald-400" />
    </div>
    <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
    <p className="text-neutral-400 text-sm">{feature.description}</p>
  </div>
));
FeatureCard.displayName = 'FeatureCard';

const StepCard = memo(({ step }: { step: any }) => (
  <div className="text-center">
    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center text-white font-bold text-xl">
      {step.number}
    </div>
    <h3 className="text-xl font-bold mb-2">{step.title}</h3>
    <p className="text-neutral-400">{step.description}</p>
  </div>
));
StepCard.displayName = 'StepCard';

const Automation = () => {
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
    heroTitle: language === 'ar' ? 'أتمتة العمليات' : language === 'fr' ? 'Automatisation des Processus' : 'Process Automation',
    heroSubtitle: language === 'ar' ? 'وفّر أكثر من ١٥ ساعة أسبوعياً بأتمتة المهام المتكررة. ركّز على الأهم ودعنا نهتم بالباقي.' : language === 'fr' ? 'Économisez 15+ heures par semaine en automatisant les tâches répétitives. Concentrez-vous sur l\'essentiel.' : 'Save 15+ hours per week by automating repetitive tasks. Focus on what matters while we handle the rest.',
    startAutomating: language === 'ar' ? 'ابدأ الآن' : language === 'fr' ? 'Commencer l\'Automatisation' : 'Start Automating',
    viewAllServices: language === 'ar' ? 'عرض كل الخدمات' : language === 'fr' ? 'Voir Tous les Services' : 'View All Services',
    whatYoullGet: language === 'ar' ? 'ماذا ستحصل' : language === 'fr' ? 'Ce Que Vous Obtiendrez' : "What You'll Get",
    workflowDashboard: language === 'ar' ? 'لوحة التحكم' : language === 'fr' ? 'Tableau de Bord des Flux' : 'Workflow Dashboard',
    dashboardDesc: language === 'ar' ? 'أداة بناء مرئية تجعل الأتمتة سهلة لكل فريقك.' : language === 'fr' ? 'Constructeur de flux visuel qui rend l\'automatisation accessible à toute votre équipe.' : 'Visual workflow builder that makes automation accessible to everyone on your team.',
    templates: language === 'ar' ? 'القوالب' : language === 'fr' ? 'Modèles' : 'Templates',
    popularAutomations: language === 'ar' ? 'أتمتة شائعة' : language === 'fr' ? 'Automatisations Populaires' : 'Popular Automations',
    templatesDesc: language === 'ar' ? 'ابدأ بقوالب جاهزة وخصصها حسب احتياجك.' : language === 'fr' ? 'Commencez avec des modèles éprouvés et personnalisez-les.' : 'Start with proven templates and customize them to fit your workflow.',
    features: language === 'ar' ? 'المميزات' : language === 'fr' ? 'Fonctionnalités' : 'Features',
    everythingYouNeed: language === 'ar' ? 'كل ما تحتاجه' : language === 'fr' ? 'Tout Ce Dont Vous Avez Besoin' : 'Everything You Need',
    process: language === 'ar' ? 'الخطوات' : language === 'fr' ? 'Processus' : 'Process',
    howItWorks: language === 'ar' ? 'طريقة العمل' : language === 'fr' ? 'Comment Ça Marche' : 'How It Works',
    readyToReclaim: language === 'ar' ? 'جاهز لتوفير وقتك؟' : language === 'fr' ? 'Prêt à Récupérer Votre Temps?' : 'Ready to Reclaim Your Time?',
    ctaDesc: language === 'ar' ? 'انضم لآلاف الشركات التي توفر أكثر من ١٥ ساعة أسبوعياً مع الأتمتة الذكية.' : language === 'fr' ? 'Rejoignez des milliers d\'entreprises qui économisent 15+ heures chaque semaine.' : 'Join thousands of businesses saving 15+ hours every week with intelligent automation.',
    formTitle: language === 'ar' ? 'ابدأ مع الأتمتة' : language === 'fr' ? 'Commencer avec l\'Automatisation' : 'Get Started with Automation',
    formDesc: language === 'ar' ? 'أخبرنا عنك وسنتواصل معك خلال ٢٤-٤٨ ساعة.' : language === 'fr' ? 'Parlez-nous de vous et nous vous contacterons dans 24-48 heures.' : 'Tell us a bit about yourself and we\'ll reach out within 24-48 hours.',
    fullName: language === 'ar' ? 'الاسم الكامل' : language === 'fr' ? 'Nom Complet' : 'Full Name',
    email: language === 'ar' ? 'البريد الإلكتروني' : language === 'fr' ? 'Email' : 'Email',
    phone: language === 'ar' ? 'رقم الجوال' : language === 'fr' ? 'Téléphone' : 'Phone',
    optional: language === 'ar' ? 'اختياري' : language === 'fr' ? 'optionnel' : 'optional',
    message: language === 'ar' ? 'رسالتك' : language === 'fr' ? 'Message Bref' : 'Brief Message',
    submit: language === 'ar' ? 'إرسال الطلب' : language === 'fr' ? 'Soumettre la Demande' : 'Submit Application',
    submitting: language === 'ar' ? 'جاري الإرسال...' : language === 'fr' ? 'Envoi...' : 'Submitting...',
    successTitle: language === 'ar' ? 'تم الإرسال!' : language === 'fr' ? 'Demande Soumise!' : 'Application Submitted!',
    successDesc: language === 'ar' ? 'سنتواصل معك خلال ٢٤-٤٨ ساعة.' : language === 'fr' ? 'Nous vous contacterons dans 24-48 heures.' : 'We\'ll be in touch within 24-48 hours.',
    close: language === 'ar' ? 'إغلاق' : language === 'fr' ? 'Fermer' : 'Close',
    needMoreOptions: language === 'ar' ? 'تحتاج المزيد؟' : language === 'fr' ? 'Besoin de plus d\'options?' : 'Need more options?',
    detailedForm: language === 'ar' ? 'املأ النموذج المفصل' : language === 'fr' ? 'Remplir le formulaire détaillé' : 'Fill out the detailed form',
    active: language === 'ar' ? 'نشط' : language === 'fr' ? 'Actif' : 'Active',
    runNow: language === 'ar' ? 'تشغيل' : language === 'fr' ? 'Exécuter' : 'Run Now',
    save: language === 'ar' ? 'وفّر' : language === 'fr' ? 'Économisez' : 'Save',
    hrsWeek: language === 'ar' ? 'س/أسبوع' : language === 'fr' ? 'h/sem' : 'hrs/week',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error: dbError } = await supabase.from('service_applications').insert({
        full_name: formData.fullName,
        email: formData.email,
        phone: formData.phone || null,
        message: formData.message || null,
        service_type: 'automation',
        status: 'new'
      });

      if (dbError) throw dbError;

      const { error: emailError } = await supabase.functions.invoke('send-application-email', {
        body: {
          applicantName: formData.fullName,
          applicantEmail: formData.email,
          serviceType: 'Process Automation',
          formData: {
            'Full Name': formData.fullName,
            'Email': formData.email,
            'Phone': formData.phone || 'Not provided',
            'Message': formData.message || 'No message provided'
          }
        }
      });

      if (emailError) console.error('Email error:', emailError);

      setIsSuccess(true);
      toast({
        title: language === 'ar' ? 'تم إرسال الطلب' : language === 'fr' ? 'Demande soumise' : 'Application submitted',
        description: t.successDesc,
      });

    } catch (error) {
      console.error('Submission error:', error);
      toast({
        title: language === 'ar' ? 'خطأ' : language === 'fr' ? 'Erreur' : 'Error',
        description: language === 'ar' ? 'حدث خطأ. يرجى المحاولة مرة أخرى.' : language === 'fr' ? 'Une erreur s\'est produite. Veuillez réessayer.' : 'Something went wrong. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsSuccess(false);
    setFormData({ fullName: '', email: '', phone: '', message: '' });
  };

  const automations = [
    { icon: Mail, title: language === 'ar' ? 'ربط البريد بالـ CRM' : language === 'fr' ? 'Sync Email vers CRM' : 'Email to CRM Sync', hours: '5', description: language === 'ar' ? 'حفظ الرسائل وإنشاء جهات اتصال تلقائياً' : language === 'fr' ? 'Journaliser les emails et créer des contacts automatiquement' : 'Auto-log emails and create contacts' },
    { icon: FileText, title: language === 'ar' ? 'معالجة الفواتير' : language === 'fr' ? 'Traitement des Factures' : 'Invoice Processing', hours: '8', description: language === 'ar' ? 'استخراج البيانات وتحديث الحسابات' : language === 'fr' ? 'Extraire les données et mettre à jour la comptabilité' : 'Extract data and update accounting' },
    { icon: Database, title: language === 'ar' ? 'تأهيل العملاء' : language === 'fr' ? 'Qualification des Leads' : 'Lead Qualification', hours: '10', description: language === 'ar' ? 'تقييم وتوزيع العملاء تلقائياً' : language === 'fr' ? 'Noter et router les leads automatiquement' : 'Score and route leads automatically' },
    { icon: BarChart3, title: language === 'ar' ? 'إنشاء التقارير' : language === 'fr' ? 'Génération de Rapports' : 'Report Generation', hours: '6', description: language === 'ar' ? 'تقارير أسبوعية وشهرية آلية' : language === 'fr' ? 'Rapports hebdomadaires/mensuels automatisés' : 'Automated weekly/monthly reports' },
    { icon: Calendar, title: language === 'ar' ? 'جدولة الاجتماعات' : language === 'fr' ? 'Planificateur de Réunions' : 'Meeting Scheduler', hours: '3', description: language === 'ar' ? 'حجز ذكي مع تذكيرات' : language === 'fr' ? 'Réservation intelligente et rappels' : 'Smart booking and reminders' },
    { icon: Share2, title: language === 'ar' ? 'النشر على السوشيال' : language === 'fr' ? 'Publication Sociale' : 'Social Publishing', hours: '4', description: language === 'ar' ? 'جدولة ونشر المحتوى تلقائياً' : language === 'fr' ? 'Planifier et publier du contenu' : 'Schedule and cross-post content' }
  ];

  const features = [
    { icon: Settings, title: language === 'ar' ? 'بدون برمجة' : language === 'fr' ? 'Constructeur Sans Code' : 'No-Code Builder', description: language === 'ar' ? 'أنشئ الأتمتة بدون كتابة كود' : language === 'fr' ? 'Créez des flux sans écrire de code' : 'Build workflows without writing code' },
    { icon: Link2, title: language === 'ar' ? 'أكثر من ٥٠٠ تطبيق' : language === 'fr' ? '500+ Intégrations' : '500+ Integrations', description: language === 'ar' ? 'اربط جميع أدواتك المفضلة' : language === 'fr' ? 'Connectez tous vos outils favoris' : 'Connect all your favorite tools' },
    { icon: BarChart3, title: language === 'ar' ? 'متابعة مباشرة' : language === 'fr' ? 'Surveillance en Temps Réel' : 'Real-time Monitoring', description: language === 'ar' ? 'تابع كل أتمتة لحظة بلحظة' : language === 'fr' ? 'Suivez chaque automatisation en temps réel' : 'Track every automation in real-time' },
    { icon: Shield, title: language === 'ar' ? 'معالجة الأخطاء' : language === 'fr' ? 'Gestion des Erreurs' : 'Error Handling', description: language === 'ar' ? 'إعادة محاولة ذكية عند الفشل' : language === 'fr' ? 'Réessai intelligent et récupération d\'échec' : 'Smart retry and failure recovery' },
    { icon: Clock, title: language === 'ar' ? 'جدولة مرنة' : language === 'fr' ? 'Déclencheurs Programmés' : 'Scheduled Triggers', description: language === 'ar' ? 'شغّل الأتمتة بالوقت المناسب' : language === 'fr' ? 'Exécutez les automatisations selon votre planning' : 'Run automations on your schedule' },
    { icon: Zap, title: language === 'ar' ? 'ربط مخصص' : language === 'fr' ? 'Webhooks Personnalisés' : 'Custom Webhooks', description: language === 'ar' ? 'تفعيل من أي تطبيق خارجي' : language === 'fr' ? 'Déclenchez depuis n\'importe quel événement externe' : 'Trigger from any external event' }
  ];

  const steps = [
    { number: '01', title: language === 'ar' ? 'التحديد' : language === 'fr' ? 'Identifier' : 'Identify', description: language === 'ar' ? 'نحدد المهام المتكررة معاً' : language === 'fr' ? 'Cartographiez vos tâches répétitives' : 'Map your repetitive tasks and bottlenecks' },
    { number: '02', title: language === 'ar' ? 'التصميم' : language === 'fr' ? 'Concevoir' : 'Design', description: language === 'ar' ? 'نصمم خطة العمل المناسبة' : language === 'fr' ? 'Créez des flux de travail optimisés' : 'Create optimized workflow blueprints' },
    { number: '03', title: language === 'ar' ? 'البناء' : language === 'fr' ? 'Automatiser' : 'Automate', description: language === 'ar' ? 'نبني ونختبر الأتمتة' : language === 'fr' ? 'Construisez et testez vos automatisations' : 'Build and test your automations' },
    { number: '04', title: language === 'ar' ? 'المتابعة' : language === 'fr' ? 'Surveiller' : 'Monitor', description: language === 'ar' ? 'نتابع الأداء ونحسّنه' : language === 'fr' ? 'Suivez les performances et optimisez' : 'Track performance and optimize' }
  ];

  const breadcrumbSchema = createBreadcrumbSchema([
    { name: 'Home', url: 'https://aynn.io/' },
    { name: 'Services', url: 'https://aynn.io/#services' },
    { name: 'Process Automation', url: 'https://aynn.io/services/automation' }
  ]);

  const serviceSchema = createServiceSchema({ 
    name: 'Process Automation', 
    description: 'Automate repetitive tasks and streamline your workflows with AI.', 
    url: 'https://aynn.io/services/automation' 
  });

  return (
    <>
      <SEO
        title="Business Process Automation Solutions"
        description="Save 15+ hours per week by automating repetitive tasks. Email sync, invoice processing, lead qualification, and more."
        canonical="/services/automation"
        keywords="business automation, workflow automation, process automation, productivity, efficiency"
        jsonLd={{ '@graph': [breadcrumbSchema, serviceSchema] }}
        language={language as 'en' | 'ar' | 'fr'}
      />
      <div dir={direction} className="min-h-screen bg-neutral-950 text-white">
        {/* Back Button */}
        <Link to="/services" className="fixed top-4 md:top-6 left-4 md:left-6 z-50">
          <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 gap-2 bg-neutral-900/80 backdrop-blur-xl border border-neutral-800 rounded-full px-4 py-2">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{t.back}</span>
          </Button>
        </Link>

        {/* Hero Section */}
        <section className="min-h-screen flex items-center justify-center px-4 md:px-6 py-20 md:py-24 relative overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-emerald-500/20 rounded-full blur-[150px]" />
            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-green-500/15 rounded-full blur-[120px]" />
          </div>

          <div className="container mx-auto max-w-6xl relative z-10">
            <div className="text-center animate-fade-in">
              <h1 className="text-4xl md:text-6xl lg:text-8xl font-serif font-bold mb-6">
                {language === 'ar' ? (
                  <>أتمتة <span className="text-emerald-400">العمليات</span></>
                ) : language === 'fr' ? (
                  <>Automatisation des <span className="text-emerald-400">Processus</span></>
                ) : (
                  <>Process <span className="text-emerald-400">Automation</span></>
                )}
              </h1>
              <p className="text-lg md:text-xl lg:text-2xl text-neutral-400 max-w-3xl mx-auto mb-8 md:mb-10 px-4">
                {t.heroSubtitle}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  size="lg" 
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-6 text-lg rounded-full"
                  onClick={() => setIsModalOpen(true)}
                >
                  {t.startAutomating}
                </Button>
                <Link to="/#services">
                  <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10 px-8 py-6 text-lg rounded-full">
                    {t.viewAllServices}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Workflow Dashboard Section */}
        <section className="py-16 md:py-24 px-4 md:px-6">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <span className="text-sm font-mono text-emerald-400 tracking-wider uppercase mb-4 block">
                {t.whatYoullGet}
              </span>
              <h2 className="text-3xl md:text-5xl font-serif font-bold mb-4">{t.workflowDashboard}</h2>
              <p className="text-neutral-400 max-w-xl mx-auto">{t.dashboardDesc}</p>
            </div>
            <div className="max-w-2xl mx-auto bg-neutral-900/80 border border-neutral-800 rounded-2xl p-8">
              <AutomationFlowMockup />
            </div>
          </div>
        </section>

        {/* Popular Automations */}
        <section className="py-16 md:py-24 px-4 md:px-6 bg-neutral-900/50">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <span className="text-sm font-mono text-emerald-400 tracking-wider uppercase mb-4 block">
                {t.templates}
              </span>
              <h2 className="text-3xl md:text-5xl font-serif font-bold mb-4">{t.popularAutomations}</h2>
              <p className="text-neutral-400 max-w-xl mx-auto">{t.templatesDesc}</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {automations.map((automation, index) => (
                <AutomationCard key={index} automation={automation} t={t} />
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-16 md:py-24 px-4 md:px-6">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <span className="text-sm font-mono text-emerald-400 tracking-wider uppercase mb-4 block">
                {t.features}
              </span>
              <h2 className="text-3xl md:text-5xl font-serif font-bold">{t.everythingYouNeed}</h2>
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
              <span className="text-sm font-mono text-emerald-400 tracking-wider uppercase mb-4 block">
                {t.process}
              </span>
              <h2 className="text-3xl md:text-5xl font-serif font-bold">{t.howItWorks}</h2>
            </div>
            <div className="grid md:grid-cols-4 gap-8">
              {steps.map((step, index) => (
                <StepCard key={index} step={step} />
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 md:py-24 px-4 md:px-6">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl md:text-5xl font-serif font-bold mb-6">{t.readyToReclaim}</h2>
            <p className="text-lg text-neutral-400 mb-8">{t.ctaDesc}</p>
            <Button 
              size="lg" 
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-12 py-6 text-lg rounded-full"
              onClick={() => setIsModalOpen(true)}
            >
              {t.startAutomating}
            </Button>
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
                  <Button type="submit" disabled={isSubmitting} className="w-full bg-emerald-500 hover:bg-emerald-600">
                    {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t.submitting}</> : t.submit}
                  </Button>
                  <div className="text-center text-sm text-neutral-500">
                    {t.needMoreOptions}{' '}
                    <Link to="/services/automation/apply" className="text-emerald-400 hover:underline">{t.detailedForm}</Link>
                  </div>
                </form>
              </>
            ) : (
              <div className="text-center py-8">
                <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
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

export default Automation;
