import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Zap, ArrowRight, Gift, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { differenceInDays, differenceInHours } from 'date-fns';
import { spineApi } from '@/lib/spineApi';

interface CreditUpgradeCardProps {
  remaining?: number;
  totalLimit?: number;
  bonusCredits?: number;
  allowed?: boolean;
  resetsAt?: string | null;
  tier?: string;
  isFree?: boolean;
  isUnlimited?: boolean;
  userId?: string;
  onOpenFeedback?: () => void;
  rewardAmount?: number;
  isUsageLoading?: boolean;
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
  isUsageLoading,
  // These are fallback props — component will override with live data
  remaining: propRemaining,
  totalLimit: propTotalLimit,
  bonusCredits: propBonusCredits = 0,
  allowed: propAllowed,
  resetsAt: propResetsAt,
  tier: propTier,
  isFree: propIsFree,
  isUnlimited: propIsUnlimited,
}: CreditUpgradeCardProps) => {
  const navigate = useNavigate();
  const [hasSubmittedFeedback, setHasSubmittedFeedback] = useState<boolean | null>(null);

  // Conflicts resolved: Internal state sync removed in favor of direct prop rendering for speed.
  // Check if user has already submitted feedback
  useEffect(() => {
    if (!userId) return;
    const check = async () => {
      try {
        // TODO(spine): /user/beta-feedback/exists — returns { exists: boolean }
        const data: any = await spineApi.req('GET', '/user/beta-feedback/exists');
        setHasSubmittedFeedback(!!data?.exists);
      } catch (error) {
        // Silent fallback — assume not submitted
        setHasSubmittedFeedback(false);
      }
    };
    check();
  }, [userId]);

  const remaining = propRemaining ?? 0;
  const totalLimit = propTotalLimit ?? 5;
  const allowed = propAllowed ?? true;
  const resetsAt = propResetsAt ?? null;
  const tier = propTier ?? 'free';
  const isFree = propIsFree ?? true;
  const isUnlimited = propIsUnlimited ?? false;

  // displayCount and its animation effect have been removed to prevent rendering flashes

  // Format reset time
  const formattedResetTime = useMemo(() => {
    if (!resetsAt) return null;
    const reset = new Date(resetsAt);
    const days = differenceInDays(reset, new Date());
    if (days > 0) return `${days}d`;
    const hours = differenceInHours(reset, new Date());
    return hours > 0 ? `${hours}h` : 'Soon';
  }, [resetsAt]);

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
  if (isUsageLoading) return null;

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

        {/* Earn credits button in limit-reached state */}
        {showEarnButton && (
          <Button
            onClick={onOpenFeedback}
            size="sm"
            className={cn(
              "w-full mb-2 h-9 rounded-lg gap-2",
              "bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500",
              "hover:from-purple-600 hover:via-fuchsia-600 hover:to-pink-600",
              "text-white font-medium shadow-sm"
            )}
          >
            <Gift className="w-4 h-4" />
            <span>Earn +{rewardAmount} Credits</span>
            <Sparkles className="w-3.5 h-3.5 text-yellow-200" />
          </Button>
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

      {/* Progress Bar — white for base credits, blue for bonus */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          {propBonusCredits > 0 ? (() => {
            const baseLimit = totalLimit - propBonusCredits;
            const baseRemaining = Math.min(remaining, baseLimit);
            const bonusRemaining = Math.max(0, remaining - baseLimit);
            const basePct = baseLimit > 0 ? Math.min((baseRemaining / totalLimit) * 100, 100) : 0;
            const bonusPct = Math.min((bonusRemaining / totalLimit) * 100, 100);
            return (
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden flex">
                {/* Blue segment = bonus credits remaining */}
                {bonusPct > 0 && (
                  <div
                    className="h-full bg-blue-400 rounded-l-full transition-all duration-300"
                    style={{ width: `${bonusPct}%` }}
                  />
                )}
                {/* White segment = base daily credits remaining */}
                {basePct > 0 && (
                  <div
                    className={cn(
                      "h-full transition-all duration-300",
                      bonusPct > 0 ? "" : "rounded-l-full",
                      "rounded-r-full",
                      isLow ? "bg-destructive" : "bg-white/80"
                    )}
                    style={{ width: `${basePct}%` }}
                  />
                )}
              </div>
            );
          })() : (
            <Progress
              value={100 - percentage}
              className={cn("h-1.5", isLow && "[&>div]:bg-destructive")}
            />
          )}
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
