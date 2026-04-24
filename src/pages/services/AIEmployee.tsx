import { useState, memo } from 'react';
import { Link } from 'react-router-dom';
import { Brain, ArrowLeft, ArrowRight, Users, Headphones, TrendingUp, Calculator, FileText, MessageCircle, Clock, DollarSign, Heart, Plane, GraduationCap, CheckCircle, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { SEO, createServiceSchema, createBreadcrumbSchema } from '@/components/shared/SEO';

const RoleCard = memo(({ role, index }: { role: any; index: number }) => (
  <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 hover:border-cyan-500/50 transition-all duration-300 group">
    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center mb-4`}>
      <role.icon className={`w-6 h-6 ${role.color}`} />
    </div>
    <h3 className="text-xl font-bold mb-2">{role.title}</h3>
    <p className="text-neutral-400 text-sm mb-4">{role.description}</p>
    <ul className="space-y-2">
      {role.benefits.map((benefit: string, i: number) => (
        <li key={i} className="flex items-center gap-2 text-sm text-neutral-300">
          <CheckCircle className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          {benefit}
        </li>
      ))}
    </ul>
  </div>
));
RoleCard.displayName = 'RoleCard';

const ComparisonRow = memo(({ item }: { item: any }) => (
  <div className="grid grid-cols-3 gap-4 py-4 border-b border-neutral-800 last:border-0">
    <div className="flex items-center gap-3">
      <item.icon className="w-5 h-5 text-neutral-400" />
      <span className="text-neutral-300">{item.label}</span>
    </div>
    <div className="text-red-400 font-medium">{item.traditional}</div>
    <div className="text-cyan-400 font-medium">{item.ai}</div>
  </div>
));
ComparisonRow.displayName = 'ComparisonRow';

const AIEmployee = () => {
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
    heroTitle: language === 'ar' ? 'موظفين بالذكاء الاصطناعي' : language === 'fr' ? 'Employés IA' : 'AI Employees',
    heroSubtitle: language === 'ar' ? 'وظّف موظفين بالذكاء الاصطناعي يعملون ٢٤ ساعة، لا يحتاجون إجازات، ويكلفون جزءاً بسيطاً من الموظف التقليدي.' : language === 'fr' ? 'Embauchez des employés IA qui travaillent 24h/24, ne prennent jamais de vacances et coûtent une fraction des employés traditionnels.' : 'Hire AI team members who work 24/7, never take vacations, and cost a fraction of traditional employees.',
    startProject: language === 'ar' ? 'ابدأ الآن' : language === 'fr' ? 'Commencer' : 'Get Started',
    availableRoles: language === 'ar' ? 'الوظائف المتاحة' : language === 'fr' ? 'Rôles Disponibles' : 'Available Roles',
    rolesSubtitle: language === 'ar' ? 'اختر الوظيفة التي يحتاجها عملك' : language === 'fr' ? 'Choisissez le rôle dont votre entreprise a besoin' : 'Choose the role your business needs',
    costSavings: language === 'ar' ? 'توفير التكاليف' : language === 'fr' ? 'Économies' : 'Cost Savings',
    compareTitle: language === 'ar' ? 'قارن التكلفة' : language === 'fr' ? 'Comparez les Coûts' : 'Compare the Costs',
    compareSubtitle: language === 'ar' ? 'اكتشف كم يمكنك توفيره مع موظفي الذكاء الاصطناعي' : language === 'fr' ? 'Découvrez combien vous pouvez économiser avec les employés IA' : 'See how much you can save with AI employees',
    traditional: language === 'ar' ? 'موظف تقليدي' : language === 'fr' ? 'Employé Traditionnel' : 'Traditional Employee',
    aiEmployee: language === 'ar' ? 'موظف ذكاء اصطناعي' : language === 'fr' ? 'Employé IA' : 'AI Employee',
    readyToHire: language === 'ar' ? 'جاهز للتوظيف؟' : language === 'fr' ? 'Prêt à Embaucher?' : 'Ready to Hire?',
    ctaDesc: language === 'ar' ? 'ابدأ مع موظف ذكاء اصطناعي اليوم ووفّر آلاف الدولارات سنوياً' : language === 'fr' ? 'Commencez avec un employé IA aujourd\'hui et économisez des milliers par an' : 'Start with an AI employee today and save thousands per year',
    formTitle: language === 'ar' ? 'احصل على موظف AI' : language === 'fr' ? 'Obtenez un Employé IA' : 'Get an AI Employee',
    formDesc: language === 'ar' ? 'أخبرنا عن احتياجاتك وسنتواصل معك قريباً.' : language === 'fr' ? 'Parlez-nous de vos besoins et nous vous contacterons.' : 'Tell us about your needs and we\'ll get back to you.',
    fullName: language === 'ar' ? 'الاسم الكامل' : language === 'fr' ? 'Nom Complet' : 'Full Name',
    email: language === 'ar' ? 'البريد الإلكتروني' : language === 'fr' ? 'Email' : 'Email',
    phone: language === 'ar' ? 'رقم الجوال' : language === 'fr' ? 'Téléphone' : 'Phone',
    message: language === 'ar' ? 'ما الوظيفة التي تحتاجها؟' : language === 'fr' ? 'De quel rôle avez-vous besoin?' : 'What role do you need?',
    optional: language === 'ar' ? 'اختياري' : language === 'fr' ? 'Optionnel' : 'Optional',
    submit: language === 'ar' ? 'إرسال الطلب' : language === 'fr' ? 'Soumettre' : 'Submit Request',
    submitting: language === 'ar' ? 'جاري الإرسال...' : language === 'fr' ? 'Envoi...' : 'Submitting...',
    successTitle: language === 'ar' ? 'تم الإرسال!' : language === 'fr' ? 'Soumis!' : 'Request Submitted!',
    successDesc: language === 'ar' ? 'شكراً لك! سنتواصل معك خلال ٢٤-٤٨ ساعة.' : language === 'fr' ? 'Merci! Nous vous contacterons dans 24-48 heures.' : 'Thank you! We\'ll be in touch within 24-48 hours.',
    close: language === 'ar' ? 'إغلاق' : language === 'fr' ? 'Fermer' : 'Close'
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
        service_type: 'ai_employee',
        status: 'new'
      });
      
      if (dbError) throw dbError;
      const { error: emailError } = await supabase.functions.invoke('send-application-email', {
        body: {
          applicantName: formData.fullName,
          applicantEmail: formData.email,
          applicantPhone: formData.phone,
          message: formData.message,
          serviceType: 'AI Employee'
        }
      });
      if (emailError) {
        console.error('Email notification failed:', emailError);
        // Don't throw — application was saved, just email failed
      }
      setIsSuccess(true);
      setFormData({ fullName: '', email: '', phone: '', message: '' });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Submission error:', error);
      }
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

  const roles = [
    { icon: Users, title: language === 'ar' ? 'مساعد موارد بشرية' : language === 'fr' ? 'Assistant RH' : 'HR Assistant', description: language === 'ar' ? 'يتعامل مع استفسارات التوظيف، فرز المتقدمين، جدولة المقابلات، وتأهيل الموظفين الجدد' : language === 'fr' ? 'Gère les demandes d\'emploi, trie les candidats, planifie les entretiens et intègre les nouvelles recrues' : 'Handle job inquiries, screen applicants, schedule interviews, and onboard new hires', benefits: [language === 'ar' ? 'لا حاجة لقسم موارد بشرية' : language === 'fr' ? 'Pas besoin de département RH' : 'No HR department needed', language === 'ar' ? 'فرز آلي للسير الذاتية' : language === 'fr' ? 'Tri automatique des CV' : 'Automatic resume screening', language === 'ar' ? 'جدولة ذكية للمقابلات' : language === 'fr' ? 'Planification intelligente des entretiens' : 'Smart interview scheduling'], color: 'text-blue-400' },
    { icon: Headphones, title: language === 'ar' ? 'دعم العملاء' : language === 'fr' ? 'Support Client' : 'Customer Support', description: language === 'ar' ? 'يجيب على الأسئلة الشائعة، يتعامل مع الشكاوى، ويحول المشاكل المعقدة للفريق' : language === 'fr' ? 'Répond aux FAQ, gère les plaintes et transmet les problèmes complexes à l\'équipe' : 'Answer FAQs, handle complaints, and route complex issues to your team', benefits: [language === 'ar' ? 'صفر تكاليف تأمين صحي' : language === 'fr' ? 'Zéro frais d\'assurance santé' : '$0 healthcare costs', language === 'ar' ? 'متاح ٢٤/٧' : language === 'fr' ? 'Disponible 24/7' : '24/7 availability', language === 'ar' ? 'ردود فورية' : language === 'fr' ? 'Réponses instantanées' : 'Instant responses'], color: 'text-green-400' },
    { icon: TrendingUp, title: language === 'ar' ? 'مندوب مبيعات' : language === 'fr' ? 'Commercial' : 'Sales Rep', description: language === 'ar' ? 'يؤهل العملاء المحتملين، يتابع الاستفسارات، ويجدول العروض التقديمية' : language === 'fr' ? 'Qualifie les prospects, suit les demandes et planifie les démos' : 'Qualify leads, follow up on inquiries, and schedule demos', benefits: [language === 'ar' ? 'لا يفوّت أي عميل' : language === 'fr' ? 'Ne manque jamais un prospect' : 'Never misses a lead', language === 'ar' ? 'يعمل أثناء نومك' : language === 'fr' ? 'Travaille pendant que vous dormez' : 'Works while you sleep', language === 'ar' ? 'متابعة تلقائية' : language === 'fr' ? 'Suivi automatique' : 'Automatic follow-ups'], color: 'text-purple-400' },
    { icon: Calculator, title: language === 'ar' ? 'مساعد محاسبة' : language === 'fr' ? 'Assistant Comptable' : 'Accounting Assistant', description: language === 'ar' ? 'تذكيرات الفواتير، تصنيف المصروفات، وإنشاء التقارير المالية' : language === 'fr' ? 'Rappels de factures, catégorisation des dépenses et génération de rapports' : 'Invoice reminders, expense categorization, and report generation', benefits: [language === 'ar' ? 'لا حاجة لتغطية الإجازات' : language === 'fr' ? 'Pas besoin de couverture vacances' : 'No vacation coverage needed', language === 'ar' ? 'دقة عالية' : language === 'fr' ? 'Haute précision' : 'High accuracy', language === 'ar' ? 'تقارير آلية' : language === 'fr' ? 'Rapports automatisés' : 'Automated reports'], color: 'text-yellow-400' },
    { icon: FileText, title: language === 'ar' ? 'مساعد إداري' : language === 'fr' ? 'Assistant Administratif' : 'Admin Assistant', description: language === 'ar' ? 'إدارة البريد الإلكتروني، الجدولة، وتنظيم المستندات' : language === 'fr' ? 'Gestion des emails, planification et organisation des documents' : 'Email management, scheduling, and document organization', benefits: [language === 'ar' ? 'يعمل في العطلات بدون أجر إضافي' : language === 'fr' ? 'Travaille les jours fériés sans heures supplémentaires' : 'Works holidays without overtime', language === 'ar' ? 'لا يمرض أبداً' : language === 'fr' ? 'Ne tombe jamais malade' : 'Never gets sick', language === 'ar' ? 'تنظيم مثالي' : language === 'fr' ? 'Organisation parfaite' : 'Perfect organization'], color: 'text-orange-400' },
    { icon: MessageCircle, title: language === 'ar' ? 'مدير وسائل التواصل' : language === 'fr' ? 'Community Manager' : 'Social Media Manager', description: language === 'ar' ? 'جدولة المحتوى، الرد على التفاعلات، وتتبع التحليلات' : language === 'fr' ? 'Planification du contenu, réponses aux interactions et suivi des analyses' : 'Content scheduling, engagement responses, and analytics tracking', benefits: [language === 'ar' ? 'نشر متسق عبر المناطق الزمنية' : language === 'fr' ? 'Publication cohérente sur tous les fuseaux horaires' : 'Consistent posting across time zones', language === 'ar' ? 'ردود سريعة' : language === 'fr' ? 'Réponses rapides' : 'Fast responses', language === 'ar' ? 'تحليلات مفصلة' : language === 'fr' ? 'Analyses détaillées' : 'Detailed analytics'], color: 'text-pink-400' }
  ];

  const comparisons = [
    { label: language === 'ar' ? 'الراتب السنوي' : language === 'fr' ? 'Salaire Annuel' : 'Annual Salary', traditional: '$35,000 - $65,000', ai: '$1000 - $2000/month', icon: DollarSign },
    { label: language === 'ar' ? 'التأمين الصحي' : language === 'fr' ? 'Assurance Santé' : 'Health Insurance', traditional: '$6,000 - $12,000/yr', ai: '$0', icon: Heart },
    { label: language === 'ar' ? 'الإجازات المدفوعة' : language === 'fr' ? 'Congés Payés' : 'Paid Vacations', traditional: '10-15 days/yr', ai: language === 'ar' ? 'يعمل ٢٤/٧/٣٦٥' : language === 'fr' ? 'Travaille 24/7/365' : 'Works 24/7/365', icon: Plane },
    { label: language === 'ar' ? 'الأيام المرضية' : language === 'fr' ? 'Jours de Maladie' : 'Sick Days', traditional: '5-8 days/yr', ai: language === 'ar' ? 'لا يمرض أبداً' : language === 'fr' ? 'Ne tombe jamais malade' : 'Never gets sick', icon: Heart },
    { label: language === 'ar' ? 'وقت التدريب' : language === 'fr' ? 'Temps de Formation' : 'Training Time', traditional: '1-3 months', ai: language === 'ar' ? 'نشر فوري' : language === 'fr' ? 'Déploiement instantané' : 'Instant deployment', icon: GraduationCap },
    { label: language === 'ar' ? 'ساعات العمل' : language === 'fr' ? 'Heures de Travail' : 'Working Hours', traditional: '40 hrs/week', ai: language === 'ar' ? 'غير محدود' : language === 'fr' ? 'Illimité' : 'Unlimited', icon: Clock }
  ];

  const breadcrumbSchema = createBreadcrumbSchema([
    { name: 'Home', url: 'https://aynn.io/' },
    { name: 'Services', url: 'https://aynn.io/#services' },
    { name: 'AI Employees', url: 'https://aynn.io/services/ai-employee' }
  ]);

  const serviceSchema = createServiceSchema({ 
    name: 'AI Employees', 
    description: 'Hire AI employees that work 24/7, never take vacations, and cost a fraction of traditional staff.', 
    url: 'https://aynn.io/services/ai-employee' 
  });

  return (
    <>
      <SEO
        title="AI Employees - Hire 24/7 AI Team Members"
        description="Hire AI employees that work 24/7, never take vacations, and cost a fraction of traditional staff. HR, support, sales, and more."
        canonical="/services/ai-employee"
        keywords="AI employees, virtual employees, AI workers, 24/7 support, business automation"
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
                {language === 'ar' ? <>موظفين بالذكاء<br /><span className="text-cyan-400">الاصطناعي</span></> : language === 'fr' ? <>Employés<br /><span className="text-cyan-400">IA</span></> : <>AI<br /><span className="text-cyan-400">Employees</span></>}
              </h1>
              <p className="text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto mb-8">
                {t.heroSubtitle}
              </p>
              <Button size="lg" className="rounded-full px-8 bg-cyan-500 text-neutral-950 hover:bg-cyan-400" onClick={() => setIsModalOpen(true)}>
                {t.startProject}
              </Button>
            </div>
          </div>
        </section>

        {/* Available Roles Section */}
        <section className="py-16 md:py-24 px-4 md:px-6 bg-neutral-900/50">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <span className="text-sm font-mono text-cyan-400 tracking-wider uppercase mb-4 block">
                {t.availableRoles}
              </span>
              <h2 className="text-3xl md:text-5xl font-serif font-bold mb-4">
                {language === 'ar' ? <>اختر <span className="text-cyan-400">موظفك</span></> : language === 'fr' ? <>Choisissez Votre <span className="text-cyan-400">Employé</span></> : <>Choose Your <span className="text-cyan-400">Employee</span></>}
              </h2>
              <p className="text-neutral-400 max-w-xl mx-auto">{t.rolesSubtitle}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {roles.map((role, index) => (
                <RoleCard key={index} role={role} index={index} />
              ))}
            </div>
          </div>
        </section>

        {/* Cost Comparison Section */}
        <section className="py-16 md:py-24 px-4 md:px-6">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-12">
              <span className="text-sm font-mono text-cyan-400 tracking-wider uppercase mb-4 block">
                {t.costSavings}
              </span>
              <h2 className="text-3xl md:text-5xl font-serif font-bold mb-4">{t.compareTitle}</h2>
              <p className="text-neutral-400 max-w-xl mx-auto">{t.compareSubtitle}</p>
            </div>

            <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-3 gap-4 px-6 py-4 bg-neutral-800/50 font-bold">
                <div></div>
                <div className="text-red-400">{t.traditional}</div>
                <div className="text-cyan-400">{t.aiEmployee}</div>
              </div>
              <div className="px-6">
                {comparisons.map((item, index) => (
                  <ComparisonRow key={index} item={item} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 md:py-24 px-4 md:px-6 bg-neutral-900/50">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl md:text-5xl font-serif font-bold mb-6">{t.readyToHire}</h2>
            <p className="text-lg text-neutral-400 mb-8">{t.ctaDesc}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="rounded-full px-8 bg-cyan-500 text-neutral-950 hover:bg-cyan-400" onClick={() => setIsModalOpen(true)}>
                {t.startProject}
              </Button>
              <Link to="/services/ai-employee/apply">
                <Button size="lg" variant="outline" className="rounded-full px-8 border-neutral-700 hover:bg-neutral-800 text-white hover:text-white">
                  {language === 'ar' ? 'النموذج المفصل' : language === 'fr' ? 'Formulaire détaillé' : 'Detailed Form'}
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
                  <Button type="submit" disabled={isSubmitting} className="w-full bg-cyan-500 hover:bg-cyan-400 text-neutral-950">
                    {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t.submitting}</> : t.submit}
                  </Button>
                </form>
              </>
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="w-16 h-16 text-cyan-400 mx-auto mb-4" />
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

export default AIEmployee;
