import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormError } from '@/components/ui/form-error';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormValidation, aiEmployeeSchema } from '@/hooks/useFormValidation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const AIEmployeeApply = () => {
  const { language, direction } = useLanguage();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    companyName: '',
    industry: '',
    teamSize: '',
    roles: '',
    workload: '',
    budget: '',
    message: ''
  });

  const { validateForm, handleBlur, getFieldError } = useFormValidation(aiEmployeeSchema);

  const t = {
    back: language === 'ar' ? 'عودة' : language === 'fr' ? 'Retour' : 'Back',
    title: language === 'ar' ? 'طلب موظف ذكاء اصطناعي' : language === 'fr' ? 'Demande d\'Employé IA' : 'AI Employee Application',
    subtitle: language === 'ar' ? 'أخبرنا المزيد عن احتياجاتك لنوفر لك الحل الأمثل' : language === 'fr' ? 'Parlez-nous de vos besoins pour que nous puissions vous proposer la meilleure solution' : 'Tell us more about your needs so we can provide the best solution',
    fullName: language === 'ar' ? 'الاسم الكامل' : language === 'fr' ? 'Nom Complet' : 'Full Name',
    email: language === 'ar' ? 'البريد الإلكتروني' : language === 'fr' ? 'Email' : 'Email',
    phone: language === 'ar' ? 'رقم الجوال' : language === 'fr' ? 'Téléphone' : 'Phone',
    companyName: language === 'ar' ? 'اسم الشركة' : language === 'fr' ? 'Nom de l\'Entreprise' : 'Company Name',
    industry: language === 'ar' ? 'المجال' : language === 'fr' ? 'Secteur' : 'Industry',
    teamSize: language === 'ar' ? 'حجم الفريق' : language === 'fr' ? 'Taille de l\'Équipe' : 'Team Size',
    roles: language === 'ar' ? 'الوظائف المطلوبة' : language === 'fr' ? 'Rôles Requis' : 'Required Roles',
    workload: language === 'ar' ? 'حجم العمل المتوقع' : language === 'fr' ? 'Charge de Travail Estimée' : 'Estimated Workload',
    budget: language === 'ar' ? 'الميزانية' : language === 'fr' ? 'Budget' : 'Budget',
    message: language === 'ar' ? 'تفاصيل إضافية' : language === 'fr' ? 'Détails Supplémentaires' : 'Additional Details',
    optional: language === 'ar' ? 'اختياري' : language === 'fr' ? 'Optionnel' : 'Optional',
    submit: language === 'ar' ? 'إرسال الطلب' : language === 'fr' ? 'Soumettre' : 'Submit Application',
    submitting: language === 'ar' ? 'جاري الإرسال...' : language === 'fr' ? 'Envoi...' : 'Submitting...',
    successTitle: language === 'ar' ? 'تم إرسال طلبك!' : language === 'fr' ? 'Demande Soumise!' : 'Application Submitted!',
    successDesc: language === 'ar' ? 'شكراً لاهتمامك! سنتواصل معك خلال ٢٤-٤٨ ساعة لمناقشة احتياجاتك.' : language === 'fr' ? 'Merci pour votre intérêt! Nous vous contacterons dans 24-48 heures pour discuter de vos besoins.' : 'Thank you for your interest! We\'ll be in touch within 24-48 hours to discuss your needs.',
    backToService: language === 'ar' ? 'العودة للخدمة' : language === 'fr' ? 'Retour au Service' : 'Back to Service',
    fixErrors: language === 'ar' ? 'يرجى إصلاح الأخطاء في النموذج' : language === 'fr' ? 'Veuillez corriger les erreurs dans le formulaire' : 'Please fix the errors in the form',
    somethingWrong: language === 'ar' ? 'حدث خطأ. يرجى المحاولة مرة أخرى.' : language === 'fr' ? 'Une erreur s\'est produite. Veuillez réessayer.' : 'Something went wrong. Please try again.'
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm(formData)) {
      toast({
        title: t.fixErrors,
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: dbError } = await supabase
        .from('service_applications')
        .insert({
          full_name: formData.fullName,
          email: formData.email,
          phone: formData.phone || null,
          message: formData.message || null,
          service_type: 'ai_employee',
          status: 'new',
          custom_fields: {
            company_name: formData.companyName,
            industry: formData.industry,
            team_size: formData.teamSize,
            roles: formData.roles,
            workload: formData.workload,
            budget: formData.budget
          }
        });

      if (dbError) throw dbError;

      await supabase.functions.invoke('send-application-email', {
        body: {
          applicantName: formData.fullName,
          applicantEmail: formData.email,
          applicantPhone: formData.phone,
          message: formData.message,
          serviceType: 'AI Employee (Detailed)',
          customFields: {
            'Company': formData.companyName,
            'Industry': formData.industry,
            'Team Size': formData.teamSize,
            'Roles Needed': formData.roles,
            'Workload': formData.workload,
            'Budget': formData.budget
          }
        }
      });

      setIsSuccess(true);
    } catch (error) {
      console.error('Submission error:', error);
      toast({
        title: t.somethingWrong,
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div dir={direction} className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 rounded-full bg-cyan-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-cyan-400" />
          </div>
          <h1 className="text-3xl font-bold mb-4">{t.successTitle}</h1>
          <p className="text-neutral-400 mb-8">{t.successDesc}</p>
          <Link to="/services/ai-employee">
            <Button className="bg-cyan-500 text-neutral-950 hover:bg-cyan-400">
              {t.backToService}
            </Button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div dir={direction} className="min-h-screen bg-neutral-950 text-white">
      {/* Navigation */}
      <nav className="fixed top-4 md:top-6 left-4 md:left-6 z-50">
        <Link to="/services/ai-employee">
          <Button variant="ghost" className="gap-2 bg-neutral-900/80 backdrop-blur-xl border border-neutral-800 rounded-full px-4 py-2 hover:bg-neutral-800 text-white">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{t.back}</span>
          </Button>
        </Link>
      </nav>

      <div className="pt-24 pb-16 px-4 md:px-6">
        <div className="container mx-auto max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10"
          >
            <h1 className="text-3xl md:text-4xl font-serif font-bold mb-4">{t.title}</h1>
            <p className="text-neutral-400">{t.subtitle}</p>
          </motion.div>

          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onSubmit={handleSubmit}
            className="space-y-6 bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 md:p-8"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="ai-employee-fullName">{t.fullName} *</Label>
                <Input
                  id="ai-employee-fullName"
                  name="ai-employee-fullName"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  onBlur={() => handleBlur('fullName')}
                  className={cn(
                    "bg-neutral-800 border-neutral-700",
                    getFieldError('fullName') && 'border-red-500 focus-visible:ring-red-500'
                  )}
                />
                <FormError message={getFieldError('fullName')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-employee-email">{t.email} *</Label>
                <Input
                  id="ai-employee-email"
                  name="ai-employee-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  onBlur={() => handleBlur('email')}
                  className={cn(
                    "bg-neutral-800 border-neutral-700",
                    getFieldError('email') && 'border-red-500 focus-visible:ring-red-500'
                  )}
                />
                <FormError message={getFieldError('email')} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="ai-employee-phone">{t.phone} <span className="text-neutral-500">({t.optional})</span></Label>
                <Input
                  id="ai-employee-phone"
                  name="ai-employee-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="bg-neutral-800 border-neutral-700"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-employee-companyName">{t.companyName}</Label>
                <Input
                  id="ai-employee-companyName"
                  name="ai-employee-companyName"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="bg-neutral-800 border-neutral-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="industry">{t.industry}</Label>
                <Select value={formData.industry} onValueChange={(value) => setFormData({ ...formData, industry: value })}>
                  <SelectTrigger className="bg-neutral-800 border-neutral-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="technology">Technology</SelectItem>
                    <SelectItem value="ecommerce">E-commerce</SelectItem>
                    <SelectItem value="healthcare">Healthcare</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="real-estate">Real Estate</SelectItem>
                    <SelectItem value="education">Education</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="teamSize">{t.teamSize}</Label>
                <Select value={formData.teamSize} onValueChange={(value) => setFormData({ ...formData, teamSize: value })}>
                  <SelectTrigger className="bg-neutral-800 border-neutral-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-5">1-5 employees</SelectItem>
                    <SelectItem value="6-20">6-20 employees</SelectItem>
                    <SelectItem value="21-50">21-50 employees</SelectItem>
                    <SelectItem value="51-100">51-100 employees</SelectItem>
                    <SelectItem value="100+">100+ employees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-employee-roles">{t.roles}</Label>
              <Input
                id="ai-employee-roles"
                name="ai-employee-roles"
                value={formData.roles}
                onChange={(e) => setFormData({ ...formData, roles: e.target.value })}
                className="bg-neutral-800 border-neutral-700"
                placeholder="E.g., HR Assistant, Customer Support, Sales Rep"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="workload">{t.workload}</Label>
                <Select value={formData.workload} onValueChange={(value) => setFormData({ ...formData, workload: value })}>
                  <SelectTrigger className="bg-neutral-800 border-neutral-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light (under 50 tasks/day)</SelectItem>
                    <SelectItem value="moderate">Moderate (50-200 tasks/day)</SelectItem>
                    <SelectItem value="heavy">Heavy (200+ tasks/day)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget">{t.budget}</Label>
                <Select value={formData.budget} onValueChange={(value) => setFormData({ ...formData, budget: value })}>
                  <SelectTrigger className="bg-neutral-800 border-neutral-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="under-500">Under $500/month</SelectItem>
                    <SelectItem value="500-1000">$500 - $1,000/month</SelectItem>
                    <SelectItem value="1000-2500">$1,000 - $2,500/month</SelectItem>
                    <SelectItem value="2500+">$2,500+/month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-employee-message">{t.message} <span className="text-neutral-500">({t.optional})</span></Label>
              <Textarea
                id="ai-employee-message"
                name="ai-employee-message"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="bg-neutral-800 border-neutral-700 min-h-[120px]"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-cyan-500 text-neutral-950 hover:bg-cyan-400 h-12"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.submitting}
                </>
              ) : (
                t.submit
              )}
            </Button>
          </motion.form>
        </div>
      </div>
    </div>
  );
};

export default AIEmployeeApply;
