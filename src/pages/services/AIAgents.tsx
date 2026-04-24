import { useState, memo } from 'react';
import { ArrowLeft, Brain, MessageSquare, Zap, Globe, Users, BarChart3, Clock, Bot, Headphones, Languages, UserCheck, Shield, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
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

// Memoized card components
const FeatureCard = memo(({ feature, index }: { feature: { icon: any; title: string; description: string }; index: number }) => (
  <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 hover:border-purple-500/30 transition-colors duration-300">
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-violet-500/20 flex items-center justify-center mb-4">
      <feature.icon className="w-6 h-6 text-purple-400" />
    </div>
    <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
    <p className="text-neutral-400 text-sm">{feature.description}</p>
  </div>
));
FeatureCard.displayName = 'FeatureCard';

const ChannelCard = memo(({ channel }: { channel: { name: string; icon: any; color: string } }) => (
  <div className="flex items-center gap-3 bg-neutral-900/60 border border-neutral-800 rounded-xl px-4 py-3">
    <div className={`w-10 h-10 rounded-lg ${channel.color} flex items-center justify-center`}>
      <channel.icon className="w-5 h-5 text-white" />
    </div>
    <span className="font-medium">{channel.name}</span>
  </div>
));
ChannelCard.displayName = 'ChannelCard';

const StepCard = memo(({ step, index }: { step: { number: string; title: string; description: string }; index: number }) => (
  <div className="text-center">
    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center text-white font-bold text-xl">
      {step.number}
    </div>
    <h3 className="text-xl font-bold mb-2">{step.title}</h3>
    <p className="text-neutral-400">{step.description}</p>
  </div>
));
StepCard.displayName = 'StepCard';

const AIAgents = () => {
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
    heroTitle: language === 'ar' ? 'مساعدين ذكاء اصطناعي' : language === 'fr' ? 'Agents IA Personnalisés' : 'Custom AI Agents',
    heroSubtitle: language === 'ar' ? 'مساعدون أذكياء يعملون ٢٤ ساعة، مدربون على بيانات عملك للرد على العملاء وتأهيل المبيعات.' : language === 'fr' ? 'Assistants intelligents 24/7 formés sur les données de votre entreprise pour gérer les demandes clients et qualifier les prospects.' : '24/7 intelligent assistants trained on your business data to handle customer inquiries, qualify leads, and drive conversions.',
    startProject: language === 'ar' ? 'ابدأ الآن' : language === 'fr' ? 'Démarrer Votre Projet' : 'Start Your Project',
    viewAllServices: language === 'ar' ? 'عرض كل الخدمات' : language === 'fr' ? 'Voir Tous les Services' : 'View All Services',
    whatYoullGet: language === 'ar' ? 'ماذا ستحصل' : language === 'fr' ? 'Ce Que Vous Obtiendrez' : "What You'll Get",
    intelligentChat: language === 'ar' ? 'محادثة ذكية' : language === 'fr' ? 'Interface de Chat Intelligente' : 'Intelligent Chat Interface',
    chatDesc: language === 'ar' ? 'مساعد ذكي يفهم السياق ويتذكر المحادثات ويرد بشكل طبيعي.' : language === 'fr' ? 'Un assistant IA puissant qui comprend le contexte et livre des réponses humaines.' : 'A powerful AI assistant that understands context, remembers conversations, and delivers human-like responses.',
    deployment: language === 'ar' ? 'النشر' : language === 'fr' ? 'Déploiement' : 'Deployment',
    oneAiEverywhere: language === 'ar' ? 'مساعد واحد، في كل مكان' : language === 'fr' ? 'Une IA, Partout' : 'One AI, Everywhere',
    deployDesc: language === 'ar' ? 'انشر مساعدك الذكي على جميع المنصات التي يستخدمها عملاؤك.' : language === 'fr' ? 'Déployez votre agent IA sur tous les canaux où se trouvent vos clients.' : 'Deploy your AI agent across all the channels where your customers are, with a unified knowledge base.',
    features: language === 'ar' ? 'المميزات' : language === 'fr' ? 'Fonctionnalités' : 'Features',
    everythingYouNeed: language === 'ar' ? 'كل ما تحتاجه' : language === 'fr' ? 'Tout Ce Dont Vous Avez Besoin' : 'Everything You Need',
    process: language === 'ar' ? 'الخطوات' : language === 'fr' ? 'Processus' : 'Process',
    howItWorks: language === 'ar' ? 'طريقة العمل' : language === 'fr' ? 'Comment Ça Marche' : 'How It Works',
    readyToAutomate: language === 'ar' ? 'جاهز لأتمتة خدمة العملاء؟' : language === 'fr' ? 'Prêt à Automatiser le Support Client?' : 'Ready to Automate Customer Support?',
    ctaDesc: language === 'ar' ? 'انضم للشركات التي توفر أكثر من ٤٠ ساعة أسبوعياً مع خدمة عملاء ذكية.' : language === 'fr' ? 'Rejoignez les entreprises qui économisent 40+ heures par semaine avec un service client IA.' : 'Join businesses saving 40+ hours per week with AI-powered customer service that never sleeps.',
    formTitle: language === 'ar' ? 'ابدأ مع المساعد الذكي' : language === 'fr' ? 'Commencer avec les Agents IA' : 'Get Started with AI Agents',
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
    connected: language === 'ar' ? 'متصل' : language === 'fr' ? 'Connecté' : 'Connected',
    avgResponse: language === 'ar' ? 'متوسط الاستجابة' : language === 'fr' ? 'Réponse Moy.' : 'Avg. Response',
    avgResponseValue: language === 'ar' ? 'أقل من ٢ ثانية' : language === 'fr' ? '< 2 secondes' : '< 2 seconds',
    accuracyRate: language === 'ar' ? 'نسبة الدقة' : language === 'fr' ? 'Taux de Précision' : 'Accuracy Rate',
    languages: language === 'ar' ? 'اللغات' : language === 'fr' ? 'Langues' : 'Languages',
    languagesValue: language === 'ar' ? '+١٢ لغة مدعومة' : language === 'fr' ? '12+ Supportées' : '12+ Supported',
    chatGreeting: language === 'ar' ? 'مرحباً! أنا مساعدك الذكي. كيف يمكنني مساعدتك اليوم؟' : language === 'fr' ? 'Bonjour ! Je suis votre assistant IA. Comment puis-je vous aider ?' : "Hello! I'm your AI assistant. How can I help you today?",
    chatQuestion: language === 'ar' ? 'ما هي خيارات الأسعار لديكم؟' : language === 'fr' ? 'Quelles sont vos options de tarification ?' : 'What are your pricing options?',
    chatAnswer: language === 'ar' ? 'سؤال رائع! نقدم ثلاث خطط مرنة:' : language === 'fr' ? 'Excellente question ! Nous proposons trois formules flexibles :' : 'Great question! We offer three flexible plans:',
    planStarter: language === 'ar' ? 'المبتدئ: $99/شهر - مثالي للشركات الصغيرة' : language === 'fr' ? 'Starter: 99$/mois - Parfait pour les petites entreprises' : 'Starter: $99/mo - Perfect for small businesses',
    planPro: language === 'ar' ? 'الاحترافي: $249/شهر - مثالي للفرق النامية' : language === 'fr' ? 'Pro: 249$/mois - Idéal pour les équipes en croissance' : 'Pro: $249/mo - Ideal for growing teams',
    planEnterprise: language === 'ar' ? 'المؤسسات: أسعار مخصصة للمؤسسات الكبيرة' : language === 'fr' ? 'Entreprise: Tarification personnalisée' : 'Enterprise: Custom pricing for large organizations',
    chatFollowUp: language === 'ar' ? 'هل تريد أن أشرح لك ميزات كل خطة؟' : language === 'fr' ? 'Voulez-vous que je vous explique les fonctionnalités ?' : 'Would you like me to explain the features of each plan?',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error: dbError } = await supabase
        .from('service_applications')
        .insert({
          full_name: formData.fullName,
          email: formData.email,
          phone: formData.phone || null,
          message: formData.message || null,
          service_type: 'ai_agents',
          status: 'new'
        });

      if (dbError) throw dbError;

      const { error: emailError } = await supabase.functions.invoke('send-application-email', {
        body: {
          applicantName: formData.fullName,
          applicantEmail: formData.email,
          serviceType: 'AI Agents',
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

  const features = [
    { icon: Clock, title: language === 'ar' ? 'متاح ٢٤ ساعة' : language === 'fr' ? 'Disponible 24/7' : '24/7 Availability', description: language === 'ar' ? 'لا تفوت أي رسالة من العملاء' : language === 'fr' ? 'Ne manquez jamais une demande client, jour et nuit' : 'Never miss a customer inquiry, day or night' },
    { icon: Brain, title: language === 'ar' ? 'تدريب مخصص' : language === 'fr' ? 'Formation Personnalisée' : 'Custom Training', description: language === 'ar' ? 'مدرب على بيانات عملك' : language === 'fr' ? 'Formé spécifiquement sur les données de votre entreprise' : 'Trained specifically on your business data' },
    { icon: Languages, title: language === 'ar' ? 'يدعم لغات متعددة' : language === 'fr' ? 'Multilingue' : 'Multi-language', description: language === 'ar' ? 'يتحدث العربية والإنجليزية وغيرها' : language === 'fr' ? 'Parle arabe, anglais et plus' : 'Fluent in Arabic, English, and more' },
    { icon: UserCheck, title: language === 'ar' ? 'تحويل للفريق' : language === 'fr' ? 'Transfert Humain' : 'Human Handoff', description: language === 'ar' ? 'يحول الحالات المعقدة للفريق' : language === 'fr' ? 'Transfère les problèmes complexes en douceur' : 'Seamlessly escalates complex issues' },
    { icon: BarChart3, title: language === 'ar' ? 'لوحة تحكم' : language === 'fr' ? 'Tableau de Bord' : 'Analytics Dashboard', description: language === 'ar' ? 'تابع الأداء والإحصائيات' : language === 'fr' ? 'Suivez les performances et les insights' : 'Track performance and insights' },
    { icon: Shield, title: language === 'ar' ? 'هوية علامتك' : language === 'fr' ? 'Voix de Marque' : 'Brand Voice', description: language === 'ar' ? 'يتحدث بأسلوب شركتك' : language === 'fr' ? 'Correspond parfaitement au ton de votre entreprise' : 'Matches your company tone perfectly' }
  ];

  const channels = [
    { name: language === 'ar' ? 'موقعك الإلكتروني' : language === 'fr' ? 'Widget Web' : 'Website Widget', icon: Globe, color: 'bg-purple-500' },
    { name: 'WhatsApp', icon: MessageSquare, color: 'bg-green-500' },
    { name: 'Telegram', icon: Zap, color: 'bg-blue-500' },
    { name: 'Facebook', icon: Users, color: 'bg-indigo-500' }
  ];

  const steps = [
    { number: '01', title: language === 'ar' ? 'التعرف' : language === 'fr' ? 'Découverte' : 'Discovery', description: language === 'ar' ? 'نتعرف على عملك بالتفصيل' : language === 'fr' ? 'Nous apprenons votre entreprise de fond en comble' : 'We learn your business inside and out' },
    { number: '02', title: language === 'ar' ? 'التدريب' : language === 'fr' ? 'Formation' : 'Training', description: language === 'ar' ? 'نُدرب المساعد على بياناتك' : language === 'fr' ? 'L\'IA apprend de vos documents et FAQ' : 'AI learns from your documents and FAQs' },
    { number: '03', title: language === 'ar' ? 'الربط' : language === 'fr' ? 'Intégration' : 'Integration', description: language === 'ar' ? 'ننشره على جميع منصاتك' : language === 'fr' ? 'Déployez sur tous vos canaux' : 'Deploy across all your channels' },
    { number: '04', title: language === 'ar' ? 'الإطلاق' : language === 'fr' ? 'Lancement' : 'Launch', description: language === 'ar' ? 'ابدأ مع دعم ذكي ٢٤ ساعة' : language === 'fr' ? 'Lancez avec un support IA 24/7' : 'Go live with 24/7 AI support' }
  ];

  const breadcrumbSchema = createBreadcrumbSchema([
    { name: 'Home', url: 'https://aynn.io/' },
    { name: 'Services', url: 'https://aynn.io/#services' },
    { name: 'AI Agents', url: 'https://aynn.io/services/ai-agents' }
  ]);

  const serviceSchema = createServiceSchema({ 
    name: 'Custom AI Agents', 
    description: 'Build intelligent AI agents trained on your business data for 24/7 support.', 
    url: 'https://aynn.io/services/ai-agents' 
  });

  return (
    <>
      <SEO
        title="Custom AI Agents for Your Business"
        description="Build intelligent AI agents trained on your business data. 24/7 customer support, lead qualification, and conversions."
        canonical="/services/ai-agents"
        keywords="AI agents, chatbots, customer support AI, lead qualification, business AI"
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
            <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-purple-500/20 rounded-full blur-[150px]" />
            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-violet-500/15 rounded-full blur-[120px]" />
          </div>

          <div className="container mx-auto max-w-6xl relative z-10">
            <div className="text-center animate-fade-in">
              <h1 className="text-4xl md:text-6xl lg:text-8xl font-serif font-bold mb-6">
                {language === 'ar' ? (
                  <>وكلاء <span className="text-purple-400">ذكاء اصطناعي</span></>
                ) : language === 'fr' ? (
                  <>Agents <span className="text-purple-400">IA</span> Personnalisés</>
                ) : (
                  <>Custom AI <span className="text-purple-400">Agents</span></>
                )}
              </h1>
              <p className="text-lg md:text-xl lg:text-2xl text-neutral-400 max-w-3xl mx-auto mb-8 md:mb-10 px-4">
                {t.heroSubtitle}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  size="lg" 
                  className="bg-purple-500 hover:bg-purple-600 text-white px-8 py-6 text-lg rounded-full"
                  onClick={() => setIsModalOpen(true)}
                >
                  {t.startProject}
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

        {/* Chat Mockup Section */}
        <section className="py-16 md:py-24 px-4 md:px-6 bg-neutral-900/50">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <span className="text-sm font-mono text-purple-400 tracking-wider uppercase mb-4 block">
                {t.whatYoullGet}
              </span>
              <h2 className="text-3xl md:text-5xl font-serif font-bold mb-4">
                {t.intelligentChat}
              </h2>
              <p className="text-neutral-400 max-w-xl mx-auto">{t.chatDesc}</p>
            </div>

            {/* Chat Mockup */}
            <div className="max-w-2xl mx-auto bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-800">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-medium text-white">AI Assistant</p>
                  <p className="text-xs text-green-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    {t.connected}
                  </p>
                </div>
              </div>
              <div className="p-4 space-y-4 max-h-[400px]">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-violet-500 flex-shrink-0 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-neutral-800 rounded-2xl rounded-tl-none px-4 py-3 max-w-[80%]">
                    <p className="text-neutral-200">{t.chatGreeting}</p>
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <div className="bg-purple-500 rounded-2xl rounded-tr-none px-4 py-3 max-w-[80%]">
                    <p className="text-white">{t.chatQuestion}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-violet-500 flex-shrink-0 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-neutral-800 rounded-2xl rounded-tl-none px-4 py-3 max-w-[80%]">
                    <p className="text-neutral-200 mb-2">{t.chatAnswer}</p>
                    <ul className="space-y-1 text-sm text-neutral-300">
                      <li>• {t.planStarter}</li>
                      <li>• {t.planPro}</li>
                      <li>• {t.planEnterprise}</li>
                    </ul>
                    <p className="text-neutral-200 mt-2">{t.chatFollowUp}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Deployment Channels */}
        <section className="py-16 md:py-24 px-4 md:px-6">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <span className="text-sm font-mono text-purple-400 tracking-wider uppercase mb-4 block">
                {t.deployment}
              </span>
              <h2 className="text-3xl md:text-5xl font-serif font-bold mb-4">{t.oneAiEverywhere}</h2>
              <p className="text-neutral-400 max-w-xl mx-auto">{t.deployDesc}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
              {channels.map((channel, index) => (
                <ChannelCard key={index} channel={channel} />
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-16 md:py-24 px-4 md:px-6 bg-neutral-900/50">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <span className="text-sm font-mono text-purple-400 tracking-wider uppercase mb-4 block">
                {t.features}
              </span>
              <h2 className="text-3xl md:text-5xl font-serif font-bold">{t.everythingYouNeed}</h2>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <FeatureCard key={index} feature={feature} index={index} />
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 md:py-24 px-4 md:px-6">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <span className="text-sm font-mono text-purple-400 tracking-wider uppercase mb-4 block">
                {t.process}
              </span>
              <h2 className="text-3xl md:text-5xl font-serif font-bold">{t.howItWorks}</h2>
            </div>
            <div className="grid md:grid-cols-4 gap-8">
              {steps.map((step, index) => (
                <StepCard key={index} step={step} index={index} />
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 md:py-24 px-4 md:px-6 bg-neutral-900/50">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl md:text-5xl font-serif font-bold mb-6">{t.readyToAutomate}</h2>
            <p className="text-lg text-neutral-400 mb-8">{t.ctaDesc}</p>
            <Button 
              size="lg" 
              className="bg-purple-500 hover:bg-purple-600 text-white px-12 py-6 text-lg rounded-full"
              onClick={() => setIsModalOpen(true)}
            >
              {t.startProject}
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
                  <Button type="submit" disabled={isSubmitting} className="w-full bg-purple-500 hover:bg-purple-600">
                    {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t.submitting}</> : t.submit}
                  </Button>
                  <div className="text-center text-sm text-neutral-500">
                    {t.needMoreOptions}{' '}
                    <Link to="/services/ai-agents/apply" className="text-purple-400 hover:underline">{t.detailedForm}</Link>
                  </div>
                </form>
              </>
            ) : (
              <div className="text-center py-8">
                <CheckCircle2 className="w-16 h-16 text-purple-400 mx-auto mb-4" />
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

export default AIAgents;
