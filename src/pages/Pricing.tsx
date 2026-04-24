import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthModal } from '@/components/auth/AuthModal';
import { Check, Crown, Zap, Building2, Sparkles, Loader2, Shield, CreditCard, ChevronDown, Brain, Star } from 'lucide-react';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useSubscription, SUBSCRIPTION_TIERS, SubscriptionTier } from '@/contexts/SubscriptionContext';
import { SEO } from '@/components/shared/SEO';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const tierIcons: Record<SubscriptionTier, React.ReactNode> = {
  free: <Sparkles className="w-5 h-5" />,
  starter: <Zap className="w-5 h-5" />,
  pro: <Crown className="w-5 h-5" />,
  business: <Building2 className="w-5 h-5" />,
  enterprise: <Star className="w-5 h-5" />,
  unlimited: <Star className="w-5 h-5" />,
};

const tierColors: Record<string, { icon: string; btn: string; check: string }> = {
  free: {
    icon: 'text-muted-foreground',
    btn: 'bg-muted hover:bg-muted/80 text-foreground',
    check: 'bg-muted-foreground',
  },
  starter: {
    icon: 'text-sky-400',
    btn: 'bg-sky-500 hover:bg-sky-600 text-white',
    check: 'bg-sky-500',
  },
  pro: {
    icon: 'text-violet-400',
    btn: 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white',
    check: 'bg-violet-500',
  },
  business: {
    icon: 'text-emerald-400',
    btn: 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white',
    check: 'bg-emerald-500',
  },
  enterprise: {
    icon: 'text-amber-400',
    btn: 'bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white',
    check: 'bg-amber-500',
  },
  unlimited: {
    icon: 'text-emerald-400',
    btn: 'bg-emerald-500 hover:bg-emerald-600 text-white',
    check: 'bg-emerald-500',
  },
};

const faqItems = [
  { question: 'What are messages?', answer: 'Each AI interaction counts as one message. Free users get 5 messages per day (resets daily). Paid users receive their full monthly allowance upfront.' },
  { question: 'What is PDF & Excel generation?', answer: 'Paid users can ask AYN to generate professional documents like reports, spreadsheets, and presentations.' },
  { question: 'Can I upgrade or downgrade anytime?', answer: 'Yes! You can change your plan at any time. Upgrades take effect immediately, and downgrades take effect at the end of your billing cycle.' },
  { question: 'What happens if I run out of messages?', answer: 'Free users wait until the next day for messages to reset. Paid users can purchase a top-up of 500 extra messages for $10, or upgrade to a higher plan.' },
  { question: 'Is there a free trial?', answer: 'Our Free tier gives you 5 messages per day to try AYN — no credit card required.' },
  { question: 'Is there a refund policy?', answer: 'All payments are final and non-refundable. You can cancel anytime and keep access until the end of your billing period.' },
  { question: 'What is included in Enterprise?', answer: 'Enterprise plans include custom message limits, tailored AI solutions, and 24/7 priority support. Contact our sales team to discuss your needs.' },
];

const Pricing = () => {
  const navigate = useNavigate();
  const { isLoading } = useSubscription();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showEnterpriseModal, setShowEnterpriseModal] = useState(false);
  const [enterpriseForm, setEnterpriseForm] = useState({ companyName: '', email: '', requirements: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleAction = (tier: SubscriptionTier) => {
    if (tier === 'enterprise') { setShowEnterpriseModal(true); return; }
    setShowAuthModal(true);
  };

  const handleEnterpriseSubmit = async () => {
    if (!enterpriseForm.companyName || !enterpriseForm.email) {
      toast.error('Please fill in all required fields');
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('contact_messages').insert({
        name: enterpriseForm.companyName,
        email: enterpriseForm.email,
        message: `[ENTERPRISE INQUIRY]\n\n${enterpriseForm.requirements || 'User requested Enterprise pricing information'}`
      });
      if (error) throw error;
      toast.success('Thank you! Our team will contact you within 24 hours.');
      setShowEnterpriseModal(false);
      setEnterpriseForm({ companyName: '', email: '', requirements: '' });
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getButtonText = (tier: SubscriptionTier) => {
    if (tier === 'enterprise') return 'Contact Sales';
    return 'Get Started';
  };

  const displayTiers: SubscriptionTier[] = ['free', 'starter', 'pro', 'business', 'enterprise'];

  return (
    <>
      <SEO
        title="Pricing - AYN"
        description="Choose the perfect plan for your needs. From free to enterprise, we have options for everyone."
        canonical="/pricing"
        keywords="AYN pricing, AI assistant pricing, business AI plans, subscription plans"
        noIndex={true}
      />

      <div className="min-h-screen bg-background relative overflow-hidden">
        <Header />
        {/* Subtle background */}
        <div className="fixed inset-0 -z-10">
          <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-purple-500/8 rounded-full blur-[120px]" />
          <div className="absolute bottom-20 right-1/4 w-[400px] h-[400px] bg-blue-500/8 rounded-full blur-[120px]" />
        </div>

        <div className="container max-w-7xl mx-auto px-4 pt-24 pb-12 relative z-10">

          {/* Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-foreground mb-6">
              <Brain className="w-10 h-10 text-background" />
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 tracking-tight">
              Choose Your Plan
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Unlock the full power of AYN. Upgrade or downgrade anytime.
            </p>
          </div>

          {/* Cards */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-12">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-[440px] rounded-2xl" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-12 items-stretch">
                {displayTiers.map((tier) => {
                  const config = SUBSCRIPTION_TIERS[tier];
                  const colors = tierColors[tier];
                  const isPopular = tier === 'pro';
                  const isEnterprise = tier === 'enterprise';

                  return (
                    <div
                      key={tier}
                      className={cn(
                        'relative flex flex-col rounded-2xl transition-all duration-500',
                        'bg-card border border-border/40',
                        'shadow-[0_2px_20px_-4px_hsl(var(--foreground)/0.08)]',
                        'hover:shadow-[0_8px_40px_-8px_hsl(var(--foreground)/0.15)] hover:-translate-y-1',
                        isPopular && 'shadow-[0_8px_50px_-10px_hsl(var(--foreground)/0.12)] border-border/60',
                      )}
                    >
                      {/* Popular badge */}
                      {isPopular && (
                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                          <Badge className="bg-foreground text-background px-3 py-0.5 text-[11px] font-medium shadow-xl border-0">
                            <Sparkles className="w-2.5 h-2.5 mr-1" />
                            Most Popular
                          </Badge>
                        </div>
                      )}


                      <div className="p-6 flex flex-col h-full">
                        {/* Tier name + icon */}
                        <div className="flex items-center gap-2.5 mb-5">
                          <div className={cn('p-2 rounded-lg bg-muted/60', colors.icon)}>
                            {tierIcons[tier]}
                          </div>
                          <h3 className="text-lg font-semibold text-foreground">{config.name}</h3>
                        </div>

                        {/* Price */}
                        <div className="mb-6">
                          {isEnterprise ? (
                            <>
                              <span className="text-3xl font-display font-bold tracking-tight text-foreground">
                                Contact Us
                              </span>
                              <p className="text-xs text-muted-foreground mt-1.5">Tailored for your business</p>
                            </>
                          ) : (
                            <>
                              <div className="flex items-baseline gap-1">
                                <span className="text-4xl font-display font-bold tracking-tight text-foreground">
                                  ${config.price}
                                </span>
                                <span className="text-sm text-muted-foreground">/month</span>
                              </div>
                              {tier !== 'free' && (
                                <p className="text-xs text-muted-foreground mt-1.5">Billed monthly. Cancel anytime.</p>
                              )}
                            </>
                          )}
                        </div>

                        {/* Divider */}
                        <div className="h-px bg-border/50 mb-5" />

                        {/* Features */}
                        <ul className="space-y-3 mb-8 flex-grow">
                          {config.features.map((feature, i) => (
                            <li key={i} className="flex items-start gap-2.5">
                              <div className={cn('w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5', colors.check)}>
                                <Check className="w-2.5 h-2.5 text-white" />
                              </div>
                              <span className="text-sm text-foreground/70">{feature}</span>
                            </li>
                          ))}
                        </ul>

                        {/* CTA */}
                        <Button
                          onClick={() => handleAction(tier)}
                          className={cn(
                            'w-full h-11 rounded-xl font-medium transition-all duration-200 shadow-sm hover:shadow-md',
                            colors.btn
                          )}
                        >
                          {getButtonText(tier)}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Trust */}
              <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground mb-6">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  <span>Secure Payments</span>
                </div>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  <span>Cancel Anytime</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  <span>No Hidden Fees</span>
                </div>
              </div>

              <p className="text-center text-xs text-muted-foreground/60 mb-20">
                By subscribing, you agree to our Terms of Service and No Refund Policy.
              </p>
            </>
          )}

          {/* FAQ */}
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-semibold text-center mb-8">
              Frequently Asked Questions
            </h2>
            <div className="space-y-3">
              {faqItems.map((item, index) => (
                <Collapsible
                  key={index}
                  open={openFaq === index}
                  onOpenChange={() => setOpenFaq(openFaq === index ? null : index)}
                >
                  <div className="rounded-2xl bg-card/60 backdrop-blur-sm border border-border/50 overflow-hidden transition-all duration-200 hover:bg-card/80">
                    <CollapsibleTrigger className="w-full p-5 flex items-center justify-between text-left">
                      <span className="font-medium">{item.question}</span>
                      <ChevronDown className={cn("w-5 h-5 text-muted-foreground transition-transform duration-200", openFaq === index && "rotate-180")} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-5 pb-5">
                      <p className="text-muted-foreground text-sm leading-relaxed">{item.answer}</p>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          </div>
        </div>

        {/* Enterprise Modal */}
        <Dialog open={showEnterpriseModal} onOpenChange={setShowEnterpriseModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-400" />
                Enterprise Inquiry
              </DialogTitle>
              <DialogDescription>
                Tell us about your business needs and we'll create a custom plan for you.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name *</Label>
                <Input id="companyName" placeholder="Your company name" value={enterpriseForm.companyName} onChange={(e) => setEnterpriseForm(prev => ({ ...prev, companyName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Contact Email *</Label>
                <Input id="email" type="email" placeholder="you@company.com" value={enterpriseForm.email} onChange={(e) => setEnterpriseForm(prev => ({ ...prev, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="requirements">Requirements (optional)</Label>
                <Textarea id="requirements" placeholder="Tell us about your specific needs..." rows={4} value={enterpriseForm.requirements} onChange={(e) => setEnterpriseForm(prev => ({ ...prev, requirements: e.target.value }))} />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowEnterpriseModal(false)}>Cancel</Button>
                <Button className="flex-1 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white font-semibold" onClick={handleEnterpriseSubmit} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
        <Footer />
      </div>
    </>
  );
};

export default Pricing;
