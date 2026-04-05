import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Zap, ArrowRight, Gift, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { differenceInDays, differenceInHours } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface CreditUpgradeCardProps {
  // All props are now optional — component fetches its own data
  remaining?: number;
  totalLimit?: number;
  allowed?: boolean;
  resetsAt?: string | null;
  tier?: string;
  isFree?: boolean;
  isUnlimited?: boolean;
  userId?: string;
  onOpenFeedback?: () => void;
  rewardAmount?: number;
}

interface CreditState {
  remaining: number;
  totalLimit: number;
  allowed: boolean;
  resetsAt: string | null;
  tier: string;
  isFree: boolean;
  isUnlimited: boolean;
  loaded: boolean;
}

export const CreditUpgradeCard = ({
  userId,
  onOpenFeedback,
  rewardAmount = 5,
  // These are fallback props — component will override with live data
  remaining: propRemaining,
  totalLimit: propTotalLimit,
  allowed: propAllowed,
  resetsAt: propResetsAt,
  tier: propTier,
  isFree: propIsFree,
  isUnlimited: propIsUnlimited,
}: CreditUpgradeCardProps) => {
  const navigate = useNavigate();
  const [hasSubmittedFeedback, setHasSubmittedFeedback] = useState<boolean | null>(null);

  // Live credit state fetched directly from Supabase
  const [credits, setCredits] = useState<CreditState>({
    remaining: propRemaining ?? 0,
    totalLimit: propTotalLimit ?? 5,
    allowed: propAllowed ?? true,
    resetsAt: propResetsAt ?? null,
    tier: propTier ?? 'free',
    isFree: propIsFree ?? true,
    isUnlimited: propIsUnlimited ?? false,
    loaded: false,
  });

  // Fetch live credit data directly — never trust props alone
  useEffect(() => {
    if (!userId) return;

    const fetchCredits = async () => {
      try {
        const { data: limitsData, error } = await supabase
          .from('user_ai_limits')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        const { data: subData } = await supabase
          .from('user_subscriptions')
          .select('subscription_tier')
          .eq('user_id', userId)
          .maybeSingle();

        if (error || !limitsData) return;

        const tier = subData?.subscription_tier || 'free';
        const isFree = tier === 'free';
        const isUnlimited = limitsData.is_unlimited === true;

        if (isUnlimited) {
          setCredits(prev => ({ ...prev, isUnlimited: true, loaded: true }));
          return;
        }

        let remaining: number;
        let totalLimit: number;
        let resetsAt: string | null;
        let allowed: boolean;

        if (isFree) {
          // Free users: daily limit, check if daily reset has expired
          const dailyResetAt = limitsData.daily_reset_at ? new Date(limitsData.daily_reset_at) : null;
          const isExpired = !dailyResetAt || dailyResetAt <= new Date();

          const used = isExpired ? 0 : (limitsData.current_daily_messages || 0);
          const limit = limitsData.daily_messages || 5;
          remaining = Math.max(0, limit - used);
          totalLimit = limit;
          resetsAt = isExpired
            ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            : limitsData.daily_reset_at;
          allowed = remaining > 0;
        } else {
          // Paid users: monthly limit
          const monthlyResetAt = limitsData.monthly_reset_at ? new Date(limitsData.monthly_reset_at) : null;
          const isExpired = !monthlyResetAt || monthlyResetAt <= new Date();

          const used = isExpired ? 0 : (limitsData.current_monthly_messages || 0);
          const limit = (limitsData.monthly_messages || 1000) + (limitsData.bonus_credits || 0);
          remaining = Math.max(0, limit - used);
          totalLimit = limit;
          resetsAt = limitsData.monthly_reset_at;
          allowed = remaining > 0;
        }

        setCredits({
          remaining,
          totalLimit,
          allowed,
          resetsAt,
          tier,
          isFree,
          isUnlimited: false,
          loaded: true,
        });
      } catch {
        // Silent failure — keep defaults
        setCredits(prev => ({ ...prev, loaded: true }));
      }
    };

    fetchCredits();

    // Re-fetch every 60 seconds to stay current
    const interval = setInterval(fetchCredits, 60000);
    return () => clearInterval(interval);
  }, [userId]);

  // Check if user has already submitted feedback
  useEffect(() => {
    if (!userId) return;
    const check = async () => {
      try {
        const { data } = await supabase
          .from('beta_feedback')
          .select('id')
          .eq('user_id', userId)
          .limit(1);
        setHasSubmittedFeedback(data ? data.length > 0 : false);
      } catch (error) { console.error("Error checking beta feedback:", error); }
    };
    check();
  }, [userId]);

  // displayCount and its animation effect have been removed to prevent rendering flashes

  // Format reset time
  const formattedResetTime = useMemo(() => {
    if (!credits.resetsAt) return null;
    const reset = new Date(credits.resetsAt);
    const days = differenceInDays(reset, new Date());
    if (days > 0) return `${days}d`;
    const hours = differenceInHours(reset, new Date());
    return hours > 0 ? `${hours}h` : 'Soon';
  }, [credits.resetsAt]);

  const { remaining, totalLimit, allowed, isFree, isUnlimited, tier } = credits;
  const percentage = totalLimit > 0 ? Math.min(((totalLimit - remaining) / totalLimit) * 100, 100) : 0;
  const isLow = remaining < totalLimit * 0.2 && remaining > 0;
  const showEarnButton = userId && onOpenFeedback && hasSubmittedFeedback === false;

  // Unlimited users — show a clean status card
  if (isUnlimited) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "relative rounded-xl overflow-hidden",
          "bg-card/60 backdrop-blur-md",
          "border border-border/50",
          "p-3"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <span className="font-medium text-sm text-foreground">Unlimited Plan</span>
          </div>
          <span className="text-xs font-semibold text-primary">∞</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">No message limits</p>
      </motion.div>
    );
  }

  // Don't render while loading to avoid flash of wrong default data
  if (!credits.loaded) return null;

  // Limit reached
  if (!allowed) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "relative rounded-xl overflow-hidden",
          "bg-destructive/10 backdrop-blur-md",
          "border border-destructive/30",
          "p-3"
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-destructive/20">
            <Zap className="w-4 h-4 text-destructive" />
          </div>
          <span className="font-medium text-sm text-foreground">Limit Reached</span>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed mb-2">
          {isFree
            ? "You've used all 5 messages for today. Come back tomorrow."
            : "You've reached your monthly limit. Top up or wait for renewal."}
        </p>

        {formattedResetTime && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <Clock className="w-3 h-3" />
            <span>Resets in {formattedResetTime}</span>
          </div>
        )}

        {isFree ? (
          <motion.button
            onClick={() => navigate('/dashboard/pricing')}
            className={cn(
              "w-full flex items-center justify-center gap-1.5",
              "text-xs font-medium text-primary",
              "hover:text-primary/80 transition-colors group"
            )}
          >
            <span>Upgrade for more messages</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </motion.button>
        ) : (
          <Button
            onClick={() => navigate('/dashboard/pricing')}
            size="sm"
            variant="outline"
            className="w-full h-8 text-xs"
          >
            Top Up or Upgrade
          </Button>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "relative rounded-xl overflow-hidden",
        "bg-card/60 backdrop-blur-md",
        "border border-border/50",
        "p-3"
      )}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={cn(
            "p-1.5 rounded-lg",
            isLow ? "bg-destructive/20" : "bg-muted/50"
          )}>
            {isLow
              ? <Zap className="w-4 h-4 text-destructive" />
              : <Sparkles className="w-4 h-4 text-foreground/70" />}
          </div>
          <span className="font-medium text-sm text-foreground">
            {isFree ? 'Daily Messages' : 'Monthly Messages'}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold tabular-nums text-foreground">
            {String(remaining)}
          </span>
          <span className="text-xs text-muted-foreground">left</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Progress
            value={100 - percentage}
            className={cn(
              "h-1.5",
              isLow && "[&>div]:bg-destructive"
            )}
          />
        </div>
        {formattedResetTime && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Resets {formattedResetTime}
          </span>
        )}
      </div>

      {/* Context line */}
      <p className="text-[10px] text-muted-foreground mt-1.5">
        {remaining} of {totalLimit} {isFree ? 'messages remaining today' : 'messages remaining this month'}
      </p>

      {/* Earn Credits Button */}
      <AnimatePresence>
        {showEarnButton && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Button
              onClick={onOpenFeedback}
              size="sm"
              className={cn(
                "w-full mt-2.5 h-9 rounded-lg gap-2",
                "bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500",
                "hover:from-purple-600 hover:via-fuchsia-600 hover:to-pink-600",
                "text-white font-medium",
                "shadow-sm hover:shadow-md shadow-purple-500/20",
                "transition-all duration-150"
              )}
            >
              <Gift className="w-4 h-4" />
              <span>Earn +{rewardAmount} Credits</span>
              <Sparkles className="w-3.5 h-3.5 text-yellow-200" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upgrade Link for Free Tier */}
      {isFree && !showEarnButton && (
        <motion.button
          onClick={() => navigate('/dashboard/pricing')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className={cn(
            "mt-2 w-full flex items-center justify-center gap-1.5",
            "text-xs font-medium text-primary",
            "hover:text-primary/80 transition-colors",
            "group"
          )}
        >
          <span>Upgrade for more messages</span>
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </motion.button>
      )}
    </motion.div>
  );
};
