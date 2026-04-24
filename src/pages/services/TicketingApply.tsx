import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Check, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SEO } from '@/components/shared/SEO';
import { motion } from 'framer-motion';

const TicketingApply = () => {
  const { language, direction } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    eventType: '',
    expectedAttendees: '',
    eventsPerYear: '',
    message: ''
  });

  const t = {
    title: language === 'ar' ? 'تقديم طلب - نظام التذاكر' : language === 'fr' ? 'Candidature - Billetterie' : 'Apply - Ticketing System',
    back: language === 'ar' ? 'العودة' : language === 'fr' ? 'Retour' : 'Back',
    fullName: language === 'ar' ? 'الاسم الكامل' : language === 'fr' ? 'Nom complet' : 'Full Name',
    email: language === 'ar' ? 'البريد الإلكتروني' : language === 'fr' ? 'Email' : 'Email',
    phone: language === 'ar' ? 'رقم الهاتف' : language === 'fr' ? 'Téléphone' : 'Phone',
    eventType: language === 'ar' ? 'نوع الفعالية' : language === 'fr' ? 'Type d\'événement' : 'Event Type',
    expectedAttendees: language === 'ar' ? 'العدد المتوقع للحضور' : language === 'fr' ? 'Participants attendus' : 'Expected Attendees',
    eventsPerYear: language === 'ar' ? 'عدد الفعاليات سنوياً' : language === 'fr' ? 'Événements par an' : 'Events per Year',
    additionalInfo: language === 'ar' ? 'معلومات إضافية' : language === 'fr' ? 'Informations supplémentaires' : 'Additional Information',
    submit: language === 'ar' ? 'إرسال الطلب' : language === 'fr' ? 'Soumettre' : 'Submit Application',
    submitting: language === 'ar' ? 'جاري الإرسال...' : language === 'fr' ? 'Envoi en cours...' : 'Submitting...',
    successTitle: language === 'ar' ? 'تم إرسال طلبك!' : language === 'fr' ? 'Demande envoyée!' : 'Application Submitted!',
    successMessage: language === 'ar' ? 'سنتواصل معك خلال 24-48 ساعة' : language === 'fr' ? 'Nous vous contacterons sous 24-48 heures' : "We'll contact you within 24-48 hours",
    backToServices: language === 'ar' ? 'العودة للخدمات' : language === 'fr' ? 'Retour aux services' : 'Back to Services',
    selectPlaceholder: language === 'ar' ? 'اختر...' : language === 'fr' ? 'Sélectionner...' : 'Select...'
  };

  const eventTypes = [
    { value: 'concert', label: language === 'ar' ? 'حفل موسيقي' : language === 'fr' ? 'Concert' : 'Concert' },
    { value: 'conference', label: language === 'ar' ? 'مؤتمر' : language === 'fr' ? 'Conférence' : 'Conference' },
    { value: 'sports', label: language === 'ar' ? 'رياضة' : language === 'fr' ? 'Sport' : 'Sports' },
    { value: 'festival', label: language === 'ar' ? 'مهرجان' : language === 'fr' ? 'Festival' : 'Festival' },
    { value: 'exhibition', label: language === 'ar' ? 'معرض' : language === 'fr' ? 'Exposition' : 'Exhibition' },
    { value: 'other', label: language === 'ar' ? 'أخرى' : language === 'fr' ? 'Autre' : 'Other' }
  ];

  const attendeeRanges = [
    { value: '50-100', label: '50-100' },
    { value: '100-500', label: '100-500' },
    { value: '500-1000', label: '500-1,000' },
    { value: '1000-5000', label: '1,000-5,000' },
    { value: '5000+', label: '5,000+' }
  ];

  const eventsPerYearOptions = [
    { value: '1-5', label: '1-5' },
    { value: '6-12', label: '6-12' },
    { value: '12-24', label: '12-24' },
    { value: '24+', label: '24+' }
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
        message: JSON.stringify({
          eventType: formData.eventType,
          expectedAttendees: formData.expectedAttendees,
          eventsPerYear: formData.eventsPerYear,
          additionalInfo: formData.message
        })
      });

      if (dbError) throw dbError;

      await supabase.functions.invoke('send-application-email', {
        body: {
          service: 'Smart Ticketing System - Detailed Application',
          name: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          details: {
            eventType: formData.eventType,
            expectedAttendees: formData.expectedAttendees,
            eventsPerYear: formData.eventsPerYear,
            additionalInfo: formData.message
          }
        }
      });

      setIsSuccess(true);
      toast({
        title: t.successTitle,
        description: t.successMessage
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

  if (isSuccess) {
    return (
      <div dir={direction} className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Check className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-4">{t.successTitle}</h1>
          <p className="text-muted-foreground mb-8">{t.successMessage}</p>
          <Link to="/services">
            <Button variant="outline">{t.backToServices}</Button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <SEO
        title={t.title}
        description="Apply for the Smart Ticketing System - sell tickets online, validate with QR code scanning"
        canonical="/services/ticketing/apply"
      />
      
      <div dir={direction} className="min-h-screen bg-background">
        {/* Back Button */}
        <div className="fixed top-4 left-4 z-50">
          <Link to="/services/ticketing">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              {t.back}
            </Button>
          </Link>
        </div>

        <div className="container mx-auto max-w-2xl pt-20 pb-16 px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="text-center mb-10">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Ticket className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">{t.title}</h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 bg-card p-6 md:p-8 rounded-2xl border">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">{t.fullName} *</Label>
                  <Input
                    id="fullName"
                    required
                    value={formData.fullName}
                    onChange={e => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t.email} *</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t.phone}</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.eventType} *</Label>
                  <Select required value={formData.eventType} onValueChange={value => setFormData(prev => ({ ...prev, eventType: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder={t.selectPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {eventTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t.expectedAttendees} *</Label>
                  <Select required value={formData.expectedAttendees} onValueChange={value => setFormData(prev => ({ ...prev, expectedAttendees: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder={t.selectPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {attendeeRanges.map(range => (
                        <SelectItem key={range.value} value={range.value}>{range.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t.eventsPerYear}</Label>
                <Select value={formData.eventsPerYear} onValueChange={value => setFormData(prev => ({ ...prev, eventsPerYear: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.selectPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {eventsPerYearOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">{t.additionalInfo}</Label>
                <Textarea
                  id="message"
                  rows={4}
                  value={formData.message}
                  onChange={e => setFormData(prev => ({ ...prev, message: e.target.value }))}
                  placeholder={language === 'ar' ? 'أخبرنا المزيد عن احتياجاتك...' : language === 'fr' ? 'Dites-nous en plus sur vos besoins...' : 'Tell us more about your needs...'}
                />
              </div>

              <Button type="submit" size="lg" className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t.submitting}
                  </>
                ) : t.submit}
              </Button>
            </form>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default TicketingApply;
