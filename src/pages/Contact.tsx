import { useState, useMemo } from 'react';
import { CheckCircle, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { SEO } from '@/components/shared/SEO';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';

const Contact = () => {
  const { language, direction } = useLanguage();
  const { toast } = useToast();

  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    message: '',
  });
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const contactSchema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, { message: language === 'ar' ? 'الاسم مطلوب' : 'Name is required' })
          .max(100, { message: language === 'ar' ? 'الاسم يجب أن يكون أقل من 100 حرف' : 'Name must be less than 100 characters' }),
        email: z
          .string()
          .trim()
          .email({ message: language === 'ar' ? 'البريد الإلكتروني غير صالح' : 'Invalid email address' })
          .max(255, { message: language === 'ar' ? 'البريد الإلكتروني يجب أن يكون أقل من 255 حرف' : 'Email must be less than 255 characters' }),
        message: z
          .string()
          .trim()
          .min(1, { message: language === 'ar' ? 'الرسالة مطلوبة' : 'Message is required' })
          .max(1000, { message: language === 'ar' ? 'الرسالة يجب أن تكون أقل من 1000 حرف' : 'Message must be less than 1000 characters' }),
      }),
    [language]
  );

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactErrors({});

    try {
      contactSchema.parse(contactForm);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            errors[err.path[0].toString()] = err.message;
          }
        });
        setContactErrors(errors);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const { error: dbError } = await supabase.from('contact_messages').insert({
        name: contactForm.name.trim(),
        email: contactForm.email.trim(),
        message: contactForm.message.trim(),
      });
      if (dbError) {
        if (import.meta.env.DEV) console.error('Database error:', dbError);
        throw new Error('Failed to save message');
      }

      const { error: emailError } = await supabase.functions.invoke('send-contact-email', {
        body: {
          name: contactForm.name.trim(),
          email: contactForm.email.trim(),
          message: contactForm.message.trim(),
        },
      });
      if (emailError && import.meta.env.DEV) {
        console.error('Email error:', emailError);
      }

      setIsSubmitted(true);
      setContactForm({ name: '', email: '', message: '' });
      toast({
        title: language === 'ar' ? 'تم الإرسال بنجاح' : 'Message Sent',
        description: language === 'ar' ? 'سنتواصل معك قريباً' : "We'll get back to you soon",
      });
      setTimeout(() => setIsSubmitted(false), 3000);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Contact form error:', error);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'حدث خطأ. يرجى المحاولة مرة أخرى' : 'Something went wrong. Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <SEO
        title="Contact Us - AYN AI | Let's Start a Conversation"
        description="Get in touch with AYN AI. Tell us about your project and we'll help transform your vision into reality."
        canonical="/contact"
      />
      <div dir={direction} className="min-h-screen bg-background">
        <Header />

        {/* Hero + Form */}
        <section className="pt-32 pb-16 px-6">
          <div className="container max-w-3xl mx-auto">
            <div className="text-center mb-10 md:mb-16">
              <span className="text-sm font-mono text-muted-foreground tracking-wider uppercase mb-4 block">
                {language === 'ar' ? 'راسلنا' : language === 'fr' ? 'Contactez-Nous' : 'Get In Touch'}
              </span>
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold mb-4 md:mb-6">
                {language === 'ar' ? 'دعنا نتحدث' : language === 'fr' ? "Commençons une Conversation" : "Let's Start a Conversation"}
              </h1>
              <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto">
                {language === 'ar'
                  ? 'شاركنا فكرتك، ودعنا نحوّلها إلى واقع'
                  : language === 'fr'
                  ? 'Parlez-nous de votre projet et nous vous aiderons à réaliser votre vision'
                  : "Tell us about your project and we'll help transform your vision into reality"}
              </p>
            </div>

            {isSubmitted ? (
              <div className="text-center py-20 animate-scale-fade-in">
                <div className="w-16 h-16 rounded-full bg-foreground mx-auto mb-6 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-background" />
                </div>
                <h3 className="text-2xl font-bold mb-3">
                  {language === 'ar' ? 'شكراً لك!' : language === 'fr' ? 'Merci!' : 'Thank You!'}
                </h3>
                <p className="text-muted-foreground">
                  {language === 'ar' ? 'سنرد عليك خلال 24 ساعة' : language === 'fr' ? 'Nous vous contacterons dans 24 heures' : "We'll be in touch within 24 hours"}
                </p>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-6">
                <div className="space-y-2 group">
                  <label htmlFor="name" className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
                    {language === 'ar' ? 'الاسم' : language === 'fr' ? 'Nom' : 'Name'}
                  </label>
                  <Input
                    id="name"
                    type="text"
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                    placeholder={language === 'ar' ? 'الاسم الكامل' : language === 'fr' ? 'Votre nom complet' : 'Your full name'}
                    className={cn(
                      'h-14 bg-transparent border-2 border-border rounded-none text-base transition-all duration-300',
                      'focus:border-foreground focus:ring-0',
                      'group-hover:border-muted-foreground',
                      contactErrors.name && 'border-destructive'
                    )}
                    disabled={isSubmitting}
                  />
                  {contactErrors.name && <p className="text-sm text-destructive animate-slide-down-fade">{contactErrors.name}</p>}
                </div>

                <div className="space-y-2 group">
                  <label htmlFor="email" className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
                    {language === 'ar' ? 'البريد الإلكتروني' : language === 'fr' ? 'Email' : 'Email'}
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    placeholder={language === 'ar' ? 'بريدك الإلكتروني' : language === 'fr' ? 'votre@email.com' : 'your@email.com'}
                    className={cn(
                      'h-14 bg-transparent border-2 border-border rounded-none text-base transition-all duration-300',
                      'focus:border-foreground focus:ring-0',
                      'group-hover:border-muted-foreground',
                      contactErrors.email && 'border-destructive'
                    )}
                    disabled={isSubmitting}
                  />
                  {contactErrors.email && <p className="text-sm text-destructive animate-slide-down-fade">{contactErrors.email}</p>}
                </div>

                <div className="space-y-2 group">
                  <label htmlFor="message" className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
                    {language === 'ar' ? 'الرسالة' : language === 'fr' ? 'Message' : 'Message'}
                  </label>
                  <Textarea
                    id="message"
                    value={contactForm.message}
                    onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                    placeholder={language === 'ar' ? 'كيف يمكننا مساعدتك؟' : language === 'fr' ? 'Parlez-nous de votre projet...' : 'Tell us about your project...'}
                    rows={6}
                    className={cn(
                      'bg-transparent border-2 border-border rounded-none text-base transition-all duration-300 resize-none',
                      'focus:border-foreground focus:ring-0',
                      'group-hover:border-muted-foreground',
                      contactErrors.message && 'border-destructive'
                    )}
                    disabled={isSubmitting}
                  />
                  {contactErrors.message && <p className="text-sm text-destructive animate-slide-down-fade">{contactErrors.message}</p>}
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting}
                  className={cn('w-full h-14 rounded-none font-mono uppercase tracking-wider transition-all duration-300', 'hover:shadow-2xl')}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {language === 'ar' ? 'جارٍ الإرسال...' : language === 'fr' ? 'Envoi...' : 'Sending...'}
                    </>
                  ) : (
                    <>
                      {language === 'ar' ? 'أرسل' : language === 'fr' ? 'Envoyer' : 'Send Message'}
                      <Send className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
};

export default Contact;
