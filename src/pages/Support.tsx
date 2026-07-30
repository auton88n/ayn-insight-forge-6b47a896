import { useState, useEffect } from 'react';
import { Brain, ArrowLeft, MessageSquare, FileText, HelpCircle, Clock, Ticket, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import AISupportChat from '@/components/support/AISupportChat';
import TicketForm from '@/components/support/TicketForm';
import FAQBrowser from '@/components/support/FAQBrowser';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { SEO, createBreadcrumbSchema, createFAQSchema } from '@/components/shared/SEO';

interface SupportTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  created_at: string;
}

const Support = () => {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState('chat');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [faqs, setFaqs] = useState<Array<{ question: string; answer: string }>>([]);

  // Fetch FAQs for structured data
  useEffect(() => {
    const fetchFAQs = async () => {
      const { data } = await supabase
        .from('faq_items')
        .select('question, answer')
        .eq('is_published', true)
        .order('order_index', { ascending: true })
        .limit(10);
      
      if (data) {
        setFaqs(data);
      }
    };
    fetchFAQs();
  }, []);

  useEffect(() => {
    if (activeTab === 'tickets') {
      fetchTickets();
    }
  }, [activeTab]);

  const fetchTickets = async () => {
    setIsLoadingTickets(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-500/20 text-blue-600';
      case 'in_progress': return 'bg-yellow-500/20 text-yellow-600';
      case 'waiting_reply': return 'bg-orange-500/20 text-orange-600';
      case 'resolved': return 'bg-green-500/20 text-green-600';
      case 'closed': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      open: 'Open',
      in_progress: 'In Progress',
      waiting_reply: 'Response Received',
      resolved: 'Resolved',
      closed: 'Closed',
    };
    return labels[status] || status.replace('_', ' ');
  };

  const translations = {
    en: {
      title: 'Support Center',
      subtitle: 'Get help from our AI assistant, browse FAQs, or submit a ticket.',
      back: 'Back',
      chat: 'AI Chat',
      tickets: 'My Tickets',
      newTicket: 'New Ticket',
      faq: 'FAQ',
    },
    ar: {
      title: 'مركز الدعم',
      subtitle: 'احصل على المساعدة من مساعدنا الذكي، أو تصفح الأسئلة الشائعة، أو أرسل تذكرة.',
      back: 'عودة',
      chat: 'المحادثة الذكية',
      tickets: 'تذاكري',
      newTicket: 'تذكرة جديدة',
      faq: 'الأسئلة الشائعة',
    },
    fr: {
      title: 'Centre de Support',
      subtitle: 'Obtenez de l\'aide de notre assistant IA, parcourez les FAQ ou soumettez un ticket.',
      back: 'Retour',
      chat: 'Chat IA',
      tickets: 'Mes Tickets',
      newTicket: 'Nouveau Ticket',
      faq: 'FAQ',
    },
  };

  const t = translations[language as keyof typeof translations] || translations.en;

  // Build combined structured data
  const breadcrumbSchema = createBreadcrumbSchema([
    { name: 'Home', url: 'https://aynn.io/' },
    { name: 'Support', url: 'https://aynn.io/support' }
  ]);

  const faqSchema = faqs.length > 0 ? createFAQSchema(faqs) : null;

  const jsonLdData = faqSchema 
    ? { '@graph': [breadcrumbSchema, faqSchema] }
    : breadcrumbSchema;

  return (
    <>
      <SEO
        title="Help & Support"
        description="Get help with AYN. Chat with our AI assistant, browse FAQs, or submit a support ticket."
        canonical="/support"
        keywords="AYN support, help center, FAQ, customer support, AI assistant help"
        jsonLd={jsonLdData}
        language={language as 'en' | 'ar' | 'fr'}
      />
      <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="container mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                {t.back}
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
                <Brain className="w-5 h-5 text-background" />
              </div>
              <span className="text-xl font-bold">AYN</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto max-w-5xl px-4 py-8 md:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl md:text-4xl font-serif font-bold mb-3">{t.title}</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">{t.subtitle}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="chat" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">{t.chat}</span>
              </TabsTrigger>
              <TabsTrigger value="faq" className="gap-2">
                <HelpCircle className="h-4 w-4" />
                <span className="hidden sm:inline">{t.faq}</span>
              </TabsTrigger>
              <TabsTrigger value="tickets" className="gap-2">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">{t.tickets}</span>
              </TabsTrigger>
              <TabsTrigger value="new-ticket" className="gap-2">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">{t.newTicket}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="mt-0">
              <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-4 md:p-6 min-h-[500px]">
                <AISupportChat onNeedTicket={() => setActiveTab('new-ticket')} />
              </div>
            </TabsContent>

            <TabsContent value="faq" className="mt-0">
              <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-4 md:p-6 min-h-[500px]">
                <FAQBrowser />
              </div>
            </TabsContent>

            <TabsContent value="tickets" className="mt-0">
              <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-4 md:p-6 min-h-[500px]">
                {isLoadingTickets ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="text-center py-12">
                    <Ticket className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground mb-4">No tickets yet</p>
                    <Button onClick={() => setActiveTab('new-ticket')} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Create a ticket
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="h-[450px]">
                    <div className="space-y-3">
                      {tickets.map((ticket) => (
                        <div
                          key={ticket.id}
                          className="p-4 bg-background/50 border border-border rounded-xl hover:border-primary/30 transition-all"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium truncate">{ticket.subject}</h4>
                              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                <Clock className="h-3.5 w-3.5" />
                                {format(new Date(ticket.created_at), 'MMM d, yyyy')}
                              </div>
                            </div>
                            <Badge className={getStatusColor(ticket.status)}>
                              {getStatusLabel(ticket.status)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </TabsContent>

            <TabsContent value="new-ticket" className="mt-0">
              <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-4 md:p-6 min-h-[500px]">
                <TicketForm onSuccess={() => setActiveTab('tickets')} />
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>
    </div>
    </>
  );
};

export default Support;
