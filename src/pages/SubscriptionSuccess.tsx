import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { billingApi, priceLabel, type Plan } from '@/lib/billing';
import { SEO } from '@/components/shared/SEO';

const planBenefits = (plan: Plan): string[] => {
  if (plan.audience === 'seeker') {
    return plan.credits != null ? [`${plan.credits} credits per ${plan.interval}`] : ['Unlimited credits'];
  }
  const parts: string[] = [];
  parts.push(plan.proposals_limit != null ? `${plan.proposals_limit} proposals per month` : 'Unlimited proposals');
  parts.push(plan.assessments_limit != null ? `${plan.assessments_limit} assessments per month` : 'Unlimited assessments');
  return parts;
};

const SubscriptionSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planKey = searchParams.get('plan');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshed, setRefreshed] = useState(false);

  useEffect(() => {
    const loadPlan = async () => {
      try {
        const plans = await billingApi.plans();
        setPlan(plans.find(p => p.key === planKey) || null);
      } catch {
        setPlan(null);
      } finally {
        setIsLoading(false);
        setRefreshed(true);
      }
    };
    loadPlan();
  }, [planKey]);

  useEffect(() => {
    // Auto-redirect after 5 seconds
    if (refreshed) {
      const timer = setTimeout(() => {
        navigate('/');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [refreshed, navigate]);

  return (
    <>
      <SEO 
        title="Subscription Successful - AYN"
        description="Your subscription has been activated successfully."
        noIndex={true}
      />
      
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="max-w-md w-full p-8 text-center">
            {isLoading || !refreshed ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
                <p className="text-muted-foreground">Confirming your subscription…</p>
              </div>
            ) : (
              <>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  className="mb-6"
                >
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
                </motion.div>

                <h1 className="text-2xl font-bold mb-2">
                  {plan ? `Welcome to ${plan.name}!` : 'Your plan is active'}
                </h1>

                <p className="text-muted-foreground mb-6">
                  {plan
                    ? `Your subscription has been activated successfully, at ${priceLabel(plan.price_cents, plan.interval)}.`
                    : 'Your payment went through and your plan is now active.'}
                </p>

                {plan && (
                  <div className="bg-muted/50 rounded-lg p-4 mb-6">
                    <h3 className="font-medium mb-2">Your new benefits:</h3>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {planBenefits(plan).map((feature) => (
                        <li key={feature}>✓ {feature}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <Button onClick={() => navigate('/')} className="w-full">
                    Continue to AYN
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Redirecting automatically in 5 seconds.
                  </p>
                </div>
              </>
            )}
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default SubscriptionSuccess;
