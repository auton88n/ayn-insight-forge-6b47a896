import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Send, Loader2, Check } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormError } from '@/components/ui/form-error';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useFormValidation, aiAgentsSchema } from '@/hooks/useFormValidation';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

const AIAgentsApply = () => {
  const navigate = useNavigate();
  const { t, direction } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    companyName: '',
    industry: '',
    agentType: '',
    useCase: '',
    integrations: '',
    budget: '',
    timeline: '',
    message: ''
  });

  const { validateForm, handleBlur, getFieldError } = useFormValidation(aiAgentsSchema, t);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm(formData)) {
      toast.error(t('form.validationFailed'), {
        description: t('form.validationFailedDesc')
      });
      return;
    }
    
    setIsSubmitting(true);

    try {
      const { error: dbError } = await supabase
        .from('service_applications')
        .insert({
          service_type: 'ai_agents',
          full_name: formData.fullName,
          email: formData.email,
          phone: formData.phone || null,
          message: formData.message || null,
          custom_fields: {
            companyName: formData.companyName,
            industry: formData.industry,
            agentType: formData.agentType,
            useCase: formData.useCase,
            integrations: formData.integrations,
            budget: formData.budget,
            timeline: formData.timeline
          }
        });

      if (dbError) throw dbError;

      const { error: emailError } = await supabase.functions.invoke('send-application-email', {
        body: {
          serviceType: 'Custom AI Agents',
          applicantName: formData.fullName,
          applicantEmail: formData.email,
          formData: formData
        }
      });
      if (emailError) {
        console.error('Email notification failed:', emailError);
        // Don't throw — application was saved, just email failed
      }

      setIsSubmitted(true);
      toast.success(t('common.success'), { description: 'Your application has been submitted.' });
    } catch (error) {
      console.error('Error submitting application:', error);
      toast.error(t('form.submitFailed'), {
        description: t('form.submitFailedDesc')
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div dir={direction} className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-serif font-bold mb-4">Application Received!</h1>
          <p className="text-muted-foreground mb-8">
            Thank you for your interest in our Custom AI Agents service. 
            We'll review your requirements and get back to you within 24-48 hours.
          </p>
          <Button onClick={() => navigate('/services/ai-agents')}>
            Back to Service Page
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div dir={direction} className="min-h-screen bg-background">
      <header className="border-b border-border/40 bg-background/95 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/services/ai-agents">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="font-serif text-xl font-bold">Apply for Custom AI Agents</h1>
            <p className="text-sm text-muted-foreground">Tell us about your AI needs</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-2xl">
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="space-y-8"
        >
          {/* Personal Info */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold border-b border-border pb-2">Contact Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ai-agents-fullName">Full Name *</Label>
                <Input
                  id="ai-agents-fullName"
                  name="ai-agents-fullName"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  onBlur={() => handleBlur('fullName')}
                  placeholder="Your full name"
                  className={cn(getFieldError('fullName') && 'border-destructive focus-visible:ring-destructive')}
                />
                <FormError message={getFieldError('fullName')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-agents-email">Email *</Label>
                <Input
                  id="ai-agents-email"
                  name="ai-agents-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  onBlur={() => handleBlur('email')}
                  placeholder="your@email.com"
                  className={cn(getFieldError('email') && 'border-destructive focus-visible:ring-destructive')}
                />
                <FormError message={getFieldError('email')} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ai-agents-phone">Phone (Optional)</Label>
                <Input
                  id="ai-agents-phone"
                  name="ai-agents-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-agents-companyName">Company Name</Label>
                <Input
                  id="ai-agents-companyName"
                  name="ai-agents-companyName"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  placeholder="Your company"
                />
              </div>
            </div>
          </section>

          {/* AI Requirements */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold border-b border-border pb-2">AI Agent Requirements</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="industry">Industry *</Label>
                <Select
                  value={formData.industry}
                  onValueChange={(value) => setFormData({ ...formData, industry: value })}
                >
                  <SelectTrigger 
                    onBlur={() => handleBlur('industry')}
                    className={cn(getFieldError('industry') && 'border-destructive focus:ring-destructive')}
                  >
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ecommerce">E-commerce & Retail</SelectItem>
                    <SelectItem value="healthcare">Healthcare</SelectItem>
                    <SelectItem value="finance">Finance & Banking</SelectItem>
                    <SelectItem value="real-estate">Real Estate</SelectItem>
                    <SelectItem value="legal">Legal</SelectItem>
                    <SelectItem value="education">Education</SelectItem>
                    <SelectItem value="saas">SaaS & Technology</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormError message={getFieldError('industry')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agentType">Agent Type *</Label>
                <Select
                  value={formData.agentType}
                  onValueChange={(value) => setFormData({ ...formData, agentType: value })}
                >
                  <SelectTrigger 
                    onBlur={() => handleBlur('agentType')}
                    className={cn(getFieldError('agentType') && 'border-destructive focus:ring-destructive')}
                  >
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer-support">Customer Support</SelectItem>
                    <SelectItem value="sales">Sales Assistant</SelectItem>
                    <SelectItem value="knowledge-base">Knowledge Base</SelectItem>
                    <SelectItem value="data-analysis">Data Analysis</SelectItem>
                    <SelectItem value="content-creation">Content Creation</SelectItem>
                    <SelectItem value="custom">Custom Solution</SelectItem>
                  </SelectContent>
                </Select>
                <FormError message={getFieldError('agentType')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-agents-useCase">Describe Your Use Case *</Label>
              <Textarea
                id="ai-agents-useCase"
                name="ai-agents-useCase"
                value={formData.useCase}
                onChange={(e) => setFormData({ ...formData, useCase: e.target.value })}
                onBlur={() => handleBlur('useCase')}
                placeholder="What problems do you want the AI agent to solve? What tasks should it handle?"
                rows={4}
                className={cn(getFieldError('useCase') && 'border-destructive focus-visible:ring-destructive')}
              />
              <FormError message={getFieldError('useCase')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-agents-integrations">Required Integrations</Label>
              <Textarea
                id="ai-agents-integrations"
                name="ai-agents-integrations"
                value={formData.integrations}
                onChange={(e) => setFormData({ ...formData, integrations: e.target.value })}
                placeholder="E.g., Slack, Zendesk, Salesforce, custom CRM, website chat widget..."
                rows={2}
              />
            </div>
          </section>

          {/* Project Details */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold border-b border-border pb-2">Project Details</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budget">Budget Range *</Label>
                <Select
                  value={formData.budget}
                  onValueChange={(value) => setFormData({ ...formData, budget: value })}
                >
                  <SelectTrigger 
                    onBlur={() => handleBlur('budget')}
                    className={cn(getFieldError('budget') && 'border-destructive focus:ring-destructive')}
                  >
                    <SelectValue placeholder="Select budget" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="under-5k">Under $5,000</SelectItem>
                    <SelectItem value="5k-15k">$5,000 - $15,000</SelectItem>
                    <SelectItem value="15k-30k">$15,000 - $30,000</SelectItem>
                    <SelectItem value="30k-50k">$30,000 - $50,000</SelectItem>
                    <SelectItem value="over-50k">Over $50,000</SelectItem>
                  </SelectContent>
                </Select>
                <FormError message={getFieldError('budget')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeline">Desired Timeline *</Label>
                <Select
                  value={formData.timeline}
                  onValueChange={(value) => setFormData({ ...formData, timeline: value })}
                >
                  <SelectTrigger 
                    onBlur={() => handleBlur('timeline')}
                    className={cn(getFieldError('timeline') && 'border-destructive focus:ring-destructive')}
                  >
                    <SelectValue placeholder="Select timeline" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asap">ASAP</SelectItem>
                    <SelectItem value="1-month">1 Month</SelectItem>
                    <SelectItem value="2-3-months">2-3 Months</SelectItem>
                    <SelectItem value="3-6-months">3-6 Months</SelectItem>
                    <SelectItem value="flexible">Flexible</SelectItem>
                  </SelectContent>
                </Select>
                <FormError message={getFieldError('timeline')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-agents-message">Additional Information</Label>
              <Textarea
                id="ai-agents-message"
                name="ai-agents-message"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Any other details about your project..."
                rows={4}
              />
            </div>
          </section>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Submit Application
              </>
            )}
          </Button>
        </motion.form>
      </main>
    </div>
  );
};

export default AIAgentsApply;
