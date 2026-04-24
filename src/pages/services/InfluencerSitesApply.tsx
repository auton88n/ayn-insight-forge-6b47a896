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
import { useFormValidation, contentCreatorSchema } from '@/hooks/useFormValidation';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

const InfluencerSitesApply = () => {
  const navigate = useNavigate();
  const { t, direction } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    instagram: '',
    tiktok: '',
    youtube: '',
    followerCount: '',
    contentNiche: '',
    desiredFeatures: '',
    budget: '',
    timeline: '',
    message: ''
  });

  const { validateForm, handleBlur, getFieldError } = useFormValidation(contentCreatorSchema, t);

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
          service_type: 'content_creator',
          full_name: formData.fullName,
          email: formData.email,
          phone: formData.phone || null,
          message: formData.message || null,
          custom_fields: {
            instagram: formData.instagram,
            tiktok: formData.tiktok,
            youtube: formData.youtube,
            followerCount: formData.followerCount,
            contentNiche: formData.contentNiche,
            desiredFeatures: formData.desiredFeatures,
            budget: formData.budget,
            timeline: formData.timeline
          }
        });

      if (dbError) throw dbError;

      const { error: emailError } = await supabase.functions.invoke('send-application-email', {
        body: {
          serviceType: 'Premium Content Creator Sites',
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
            Thank you for your interest in our Premium Content Creator Sites service.
            We'll review your application and get back to you within 24-48 hours.
          </p>
          <Button onClick={() => navigate('/services/content-creator-sites')}>
            Back to Service Page
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div dir={direction} className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/services/content-creator-sites">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="font-serif text-xl font-bold">Apply for Premium Content Creator Sites</h1>
            <p className="text-sm text-muted-foreground">Tell us about your project</p>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="container mx-auto px-4 py-12 max-w-2xl">
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="space-y-8"
        >
          {/* Personal Info */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold border-b border-border pb-2">Personal Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="influencer-fullName">Full Name *</Label>
                <Input
                  id="influencer-fullName"
                  name="influencer-fullName"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  onBlur={() => handleBlur('fullName')}
                  placeholder="Your full name"
                  className={cn(getFieldError('fullName') && 'border-destructive focus-visible:ring-destructive')}
                />
                <FormError message={getFieldError('fullName')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="influencer-email">Email *</Label>
                <Input
                  id="influencer-email"
                  name="influencer-email"
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

            <div className="space-y-2">
              <Label htmlFor="influencer-phone">Phone (Optional)</Label>
              <Input
                id="influencer-phone"
                name="influencer-phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1 (555) 000-0000"
              />
            </div>
          </section>

          {/* Social Media */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold border-b border-border pb-2">Social Media Presence</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="influencer-instagram">Instagram Handle</Label>
                <Input
                  id="influencer-instagram"
                  name="influencer-instagram"
                  value={formData.instagram}
                  onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                  placeholder="@username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="influencer-tiktok">TikTok Handle</Label>
                <Input
                  id="influencer-tiktok"
                  name="influencer-tiktok"
                  value={formData.tiktok}
                  onChange={(e) => setFormData({ ...formData, tiktok: e.target.value })}
                  placeholder="@username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="influencer-youtube">YouTube Channel</Label>
                <Input
                  id="influencer-youtube"
                  name="influencer-youtube"
                  value={formData.youtube}
                  onChange={(e) => setFormData({ ...formData, youtube: e.target.value })}
                  placeholder="Channel name or URL"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="followerCount">Total Follower Count *</Label>
                <Select
                  value={formData.followerCount}
                  onValueChange={(value) => setFormData({ ...formData, followerCount: value })}
                >
                  <SelectTrigger 
                    onBlur={() => handleBlur('followerCount')}
                    className={cn(getFieldError('followerCount') && 'border-destructive focus:ring-destructive')}
                  >
                    <SelectValue placeholder="Select range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="under-10k">Under 10K</SelectItem>
                    <SelectItem value="10k-50k">10K - 50K</SelectItem>
                    <SelectItem value="50k-100k">50K - 100K</SelectItem>
                    <SelectItem value="100k-500k">100K - 500K</SelectItem>
                    <SelectItem value="500k-1m">500K - 1M</SelectItem>
                    <SelectItem value="over-1m">Over 1M</SelectItem>
                  </SelectContent>
                </Select>
                <FormError message={getFieldError('followerCount')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contentNiche">Primary Content Niche *</Label>
                <Select
                  value={formData.contentNiche}
                  onValueChange={(value) => setFormData({ ...formData, contentNiche: value })}
                >
                  <SelectTrigger 
                    onBlur={() => handleBlur('contentNiche')}
                    className={cn(getFieldError('contentNiche') && 'border-destructive focus:ring-destructive')}
                  >
                    <SelectValue placeholder="Select niche" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fashion">Fashion & Style</SelectItem>
                    <SelectItem value="beauty">Beauty & Makeup</SelectItem>
                    <SelectItem value="fitness">Fitness & Health</SelectItem>
                    <SelectItem value="travel">Travel & Lifestyle</SelectItem>
                    <SelectItem value="food">Food & Cooking</SelectItem>
                    <SelectItem value="tech">Tech & Gaming</SelectItem>
                    <SelectItem value="business">Business & Finance</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormError message={getFieldError('contentNiche')} />
              </div>
            </div>
          </section>

          {/* Project Details */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold border-b border-border pb-2">Project Details</h2>
            
            <div className="space-y-2">
              <Label htmlFor="influencer-desiredFeatures">Desired Website Features</Label>
              <Textarea
                id="influencer-desiredFeatures"
                name="influencer-desiredFeatures"
                value={formData.desiredFeatures}
                onChange={(e) => setFormData({ ...formData, desiredFeatures: e.target.value })}
                placeholder="E.g., portfolio gallery, booking system, newsletter signup, merch store..."
                rows={3}
              />
            </div>

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
                    <SelectItem value="under-2k">Under $2,000</SelectItem>
                    <SelectItem value="2k-5k">$2,000 - $5,000</SelectItem>
                    <SelectItem value="5k-10k">$5,000 - $10,000</SelectItem>
                    <SelectItem value="10k-20k">$10,000 - $20,000</SelectItem>
                    <SelectItem value="over-20k">Over $20,000</SelectItem>
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
                    <SelectItem value="1-2-weeks">1-2 Weeks</SelectItem>
                    <SelectItem value="1-month">1 Month</SelectItem>
                    <SelectItem value="2-3-months">2-3 Months</SelectItem>
                    <SelectItem value="flexible">Flexible</SelectItem>
                  </SelectContent>
                </Select>
                <FormError message={getFieldError('timeline')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="influencer-message">Additional Information</Label>
              <Textarea
                id="influencer-message"
                name="influencer-message"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Tell us more about your vision, inspiration, or any specific requirements..."
                rows={4}
              />
            </div>
          </section>

          {/* Submit */}
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

export default InfluencerSitesApply;
