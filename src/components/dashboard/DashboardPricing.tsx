import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check, Sparkles, Loader2, CreditCard, Zap, PlusCircle } from 'lucide-react';
import { useSubscription, SUBSCRIPTION_TIERS, TOPUP_PRICE, TOPUP_CREDITS } from '@/contexts/SubscriptionContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

import { useUsageTracking } from '@/hooks/useUsageTracking';

// Pricing configuration mimicking the landing page but structured for dashboard
const plans = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    description: 'Perfect to try out our AI capabilities.',
    features: ['5 requests / day', 'Basic support', 'Standard response time'],
  },
  {
    key: 'starter',
    name: 'Starter',
    price: '$20',
    period: '/month',
    description: 'For individuals and small teams.',
    features: ['200 requests / month', 'PDF & Excel generation', 'Email support', 'Faster response time'],
    highlight: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$49',
    period: '/month',
    description: 'For professionals requiring higher volume.',
    features: ['1,000 requests / month', 'PDF & Excel generation', 'Priority support', 'Fastest response time'],
    highlight: true,
  },
  {
    key: 'business',
    name: 'Business',
    price: '$99',
    period: '/month',
    description: 'For businesses with extensive AI needs.',
    features: ['5,000 requests / month', 'PDF & Excel generation', 'Priority support', 'Highest priority processing'],
    highlight: false,
  }
];

export const DashboardPricing = () => {
  const { tier: currentTier, startCheckout, openCustomerPortal, startTopUp, isLoading: isSubLoading } = useSubscription();
  const usageData = useUsageTracking(null);
  const { t } = useLanguage();

  const handleUpgrade = async (tierKey: string) => {
    if (tierKey === 'free' || tierKey === currentTier) return;
    await startCheckout(tierKey as any);
  };

  const handleManage = async () => {
    await openCustomerPortal();
  };

  const handleTopUp = async () => {
    await startTopUp();
  };

  if (isSubLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="max-w-6xl mx-auto py-8">
        
        {/* Header Section */}
        <div className="text-center mb-12">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-fuchsia-400 mb-4"
          >
            Manage Your Subscriptions
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            Upgrade your plan for higher limits or top up your credits.
          </motion.p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Main Pricing Cards */}
          <div className="lg:w-3/4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
            {plans.map((plan, index) => {
              const isActive = currentTier === plan.key;
              return (
                <motion.div
                  key={plan.key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className="flex"
                >
                  <Card className={cn(
                    "relative flex flex-col w-full p-6 bg-card/50 backdrop-blur-sm border-white/10 transition-all duration-300",
                    plan.highlight ? "border-purple-500/50 shadow-lg shadow-purple-500/20" : "hover:border-white/20",
                    isActive && "ring-2 ring-emerald-500 bg-emerald-500/5",
                  )}>
                    {isActive && (
                      <div className="absolute top-0 right-0 -mt-3 -mr-3 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-1 z-10">
                        <Check className="w-3 h-3" /> Current
                      </div>
                    )}
                    {plan.highlight && !isActive && (
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                        Popular
                      </div>
                    )}

                    <div className="mb-4">
                      <h3 className="text-xl font-bold text-foreground mb-1">{plan.name}</h3>
                      <p className="text-sm text-muted-foreground min-h-[40px]">{plan.description}</p>
                    </div>

                    <div className="mb-6">
                      <div className="flex items-baseline">
                        <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                        {plan.period && <span className="text-muted-foreground ml-1">{plan.period}</span>}
                      </div>
                    </div>

                    <div className="flex-grow">
                      <ul className="space-y-3 mb-6">
                        {plan.features.map((feature, i) => (
                          <li key={i} className="flex items-start text-sm text-muted-foreground">
                            <Check className="w-4 h-4 text-emerald-500 mr-2 shrink-0 mt-0.5" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <Button
                      onClick={() => handleUpgrade(plan.key)}
                      disabled={isActive || plan.key === 'free'}
                      variant={plan.highlight && !isActive ? 'default' : isActive ? 'outline' : 'secondary'}
                      className={cn(
                        "w-full mt-auto transition-all duration-200",
                        plan.highlight && !isActive && "bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600 text-white border-0 shadow-lg shadow-purple-500/25",
                        isActive && "border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10 cursor-default"
                      )}
                    >
                      {isActive ? 'Current Plan' : plan.key === 'free' ? 'Included' : 'Upgrade'}
                    </Button>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Right Sidebar: Top Up & Manage */}
          <div className="lg:w-1/4 flex flex-col gap-4">
            
            {/* Top Up Card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card className="p-6 bg-gradient-to-br from-purple-500/10 via-fuchsia-500/5 to-transparent border-purple-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <Zap className="w-5 h-5 text-purple-400" />
                  </div>
                  <h3 className="text-lg font-bold">Top Up Credits</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Run out of credits? Make a one-time purchase to keep going.
                </p>
                <div className="flex items-baseline mb-6">
                  <span className="text-2xl font-bold text-foreground">${TOPUP_PRICE}</span>
                  <span className="text-muted-foreground ml-1">/ {TOPUP_CREDITS} credits</span>
                </div>
                <Button 
                  onClick={handleTopUp}
                  className="w-full bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600 text-white shadow-lg shadow-purple-500/25"
                >
                  <PlusCircle className="w-4 h-4 mr-2" />
                  Buy Credits
                </Button>
              </Card>
            </motion.div>

            {/* Manage Subscription Card */}
            {currentTier !== 'free' && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Card className="p-6 bg-card/50 backdrop-blur-sm border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 rounded-lg bg-secondary">
                      <CreditCard className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-bold">Billing Portal</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-6">
                    Manage your subscription, payment methods, and billing history.
                  </p>
                  <Button 
                    onClick={handleManage}
                    variant="outline"
                    className="w-full"
                  >
                    Manage Subscription
                  </Button>
                </Card>
              </motion.div>
            )}

            {/* Bonus Credits Balance */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
            >
              <Card className="p-6 bg-card/50 backdrop-blur-sm border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-lg bg-emerald-500/20">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-bold">Bonus Credits</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Credits earned from feedback or top-ups. These never expire.
                </p>
                <div className="flex items-baseline">
                  <span className="text-3xl font-bold text-emerald-400">{(usageData as any)?.bonus_credits || 0}</span>
                  <span className="text-muted-foreground ml-2">available</span>
                </div>
              </Card>
            </motion.div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPricing;
