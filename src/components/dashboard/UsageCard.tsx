import { useMemo, useRef, useEffect, useState } from 'react';
import { Sparkles, Zap, Infinity as InfinityIcon, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { differenceInDays, format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface UsageCardProps {
  remaining?: number;
  totalLimit?: number;
  allowed?: boolean;
  resetsAt?: string | null;
  tier?: string;
  isFree?: boolean;
  isUnlimited?: boolean;
  userId?: string;
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

export const UsageCard = ({
  userId,
  remaining: propRemaining,
  totalLimit: propTotalLimit,
  allowed: propAllowed,
  resetsAt: propResetsAt,
  tier: propTier,
  isFree: propIsFree,
  isUnlimited: propIsUnlimited,
}: UsageCardProps) => {
  const navigate = useNavigate();
  const prevRemainingRef = useRef(0);
  const [showPulse, setShowPulse] = useState(false);
  const [displayCount, setDisplayCount] = useState(0);

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

  // Sync from props when they change (from useUsageTracking with realtime)
  useEffect(() => {
    if (propRemaining !== undefined) {
      setCredits(prev => ({
        ...prev,
        remaining: propRemaining ?? prev.remaining,
        totalLimit: propTotalLimit ?? prev.totalLimit,
        allowed: propAllowed ?? prev.allowed,
        resetsAt: propResetsAt ?? prev.resetsAt,
        tier: propTier ?? prev.tier,
        isFree: propIsFree ?? prev.isFree,
        isUnlimited: propIsUnlimited ?? prev.isUnlimited,
        loaded: true,
      }));
    }
  }, [propRemaining, propTotalLimit, propAllowed, propResetsAt, propTier, propIsFree, propIsUnlimited]);

  const fetchCredits = async () => {
    if (!userId) return;
    try {
      const [limitsRes, subRes] = await Promise.all([
        supabase.from('user_ai_limits').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('user_subscriptions').select('subscription_tier').eq('user_id', userId).maybeSingle(),
      ]);

      const limits = limitsRes.data;
      if (limitsRes.error || !limits) return;

      const tier = subRes.data?.subscription_tier || 'free';
      const isFree = tier === 'free';
      const isUnlimited = limits.is_unlimited === true;

      if (isUnlimited) {
        setCredits(prev => ({ ...prev, isUnlimited: true, loaded: true }));
        return;
      }

      let remaining: number, totalLimit: number, resetsAt: string | null, allowed: boolean;

      if (isFree) {
        const dailyResetAt = limits.daily_reset_at ? new Date(limits.daily_reset_at) : null;
        const isExpired = !dailyResetAt || dailyResetAt <= new Date();
        const used = isExpired ? 0 : (limits.current_daily_messages || 0);
        const limit = limits.daily_messages || 5;
        remaining = Math.max(0, limit - used);
        totalLimit = limit;
        resetsAt = isExpired ? new Date(Date.now() + 86400000).toISOString() : limits.daily_reset_at;
        allowed = remaining > 0;
      } else {
        const monthlyResetAt = limits.monthly_reset_at ? new Date(limits.monthly_reset_at) : null;
        const isExpired = !monthlyResetAt || monthlyResetAt <= new Date();
        const used = isExpired ? 0 : (limits.current_monthly_messages || 0);
        const limit = (limits.monthly_messages || 1000) + (limits.bonus_credits || 0);
        remaining = Math.max(0, limit - used);
        totalLimit = limit;
        resetsAt = limits.monthly_reset_at;
        allowed = remaining > 0;
      }

      setCredits({ remaining, totalLimit, allowed, resetsAt, tier, isFree, isUnlimited: false, loaded: true });
    } catch {
      setCredits(prev => ({ ...prev, loaded: true }));
    }
  };

  // Only self-fetch if no props are being passed (standalone mode)
  useEffect(() => {
    if (propRemaining !== undefined || !userId) return;
    fetchCredits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, propRemaining]);

  // Realtime subscription for instant updates
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`usage-card-${userId.slice(0, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_ai_limits', filter: `user_id=eq.${userId}` },
        () => fetchCredits()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Animate counter on change
  useEffect(() => {
    const target = credits.remaining;
    if (target !== prevRemainingRef.current) {
      setShowPulse(true);
      const timeout = setTimeout(() => setShowPulse(false), 600);
      const start = prevRemainingRef.current;
      const duration = 400;
      const startTime = Date.now();
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayCount(Math.round(start + (target - start) * eased));
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
      prevRemainingRef.current = target;
      return () => clearTimeout(timeout);
    }
  }, [credits.remaining]);

  // Sync displayCount on first load
  useEffect(() => {
    if (credits.loaded) {
      setDisplayCount(credits.remaining);
      prevRemainingRef.current = credits.remaining;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credits.loaded]);

  const { remaining, totalLimit, allowed, isFree, isUnlimited, resetsAt } = credits;
  const percentage = totalLimit > 0 ? Math.min(((totalLimit - remaining) / totalLimit) * 100, 100) : 0;
  const isLow = !isUnlimited && remaining < totalLimit * 0.2;

  const formattedResetTime = useMemo(() => {
    if (!resetsAt) return '';
    const reset = new Date(resetsAt);
    const diffDays = differenceInDays(reset, new Date());
    if (diffDays > 7) return format(reset, 'MMM d');
    if (diffDays > 0) return `${diffDays}d`;
    // Calculate hours
    const diffMs = reset.getTime() - Date.now();
    const diffHours = Math.max(0, Math.floor(diffMs / 3600000));
    return diffHours > 0 ? `${diffHours}h` : 'soon';
  }, [resetsAt]);

  // Unlimited users
  if (isUnlimited) {
    return (
      <motion.div
        className={cn(
          'p-5 rounded-2xl space-y-3 relative overflow-hidden',
          'bg-card dark:bg-neutral-900 border border-border/50 dark:border-white/10'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">Unlimited Plan</p>
            <div className="flex items-center gap-1.5">
              <InfinityIcon className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-primary font-medium">Unlimited messages</span>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  const periodLabel = isFree ? 'today' : 'this month';
  const periodType = isFree ? 'Daily' : 'Monthly';

  return (
    <motion.div
      className={cn(
        'p-5 rounded-2xl space-y-4 relative overflow-hidden',
        'bg-card dark:bg-neutral-900 border border-border/50 dark:border-white/10',
        'shadow-sm dark:shadow-none'
      )}
      animate={showPulse ? { scale: [1, 1.01, 1] } : {}}
    >
      <AnimatePresence>
        {showPulse && (
          <motion.div
            initial={{ opacity: 0.3 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 bg-primary/5"
          />
        )}
      </AnimatePresence>

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center',
              isLow ? 'bg-destructive/10' : 'bg-muted dark:bg-neutral-800'
            )}
          >
            <Zap className={cn('w-5 h-5', isLow ? 'text-destructive' : 'text-primary dark:text-white')} />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">{periodType} Messages</p>
            {resetsAt && (
              <p className="text-xs text-muted-foreground">Resets {formattedResetTime}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-foreground tabular-nums">{displayCount}</span>
          <span className="text-sm text-muted-foreground ml-1">left</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className={`h-2 rounded-full bg-muted dark:bg-neutral-800 overflow-hidden ${isLow ? 'animate-pulse' : ''}`}>
          <motion.div
            className={`h-full rounded-full ${
              isLow
                ? 'bg-gradient-to-r from-red-500 via-red-400 to-amber-500'
                : 'bg-gradient-to-r from-blue-500 via-purple-500 to-purple-600'
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${100 - percentage}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {remaining} of {totalLimit} remaining {periodLabel}
          </span>
          <div className="flex items-center gap-1.5">
            <div className={cn('w-2 h-2 rounded-full', allowed ? 'bg-emerald-500' : 'bg-destructive')} />
            <span className="text-xs text-muted-foreground">{allowed ? 'Active' : 'Paused'}</span>
          </div>
        </div>
      </div>

      {/* Limit reached banner */}
      {!allowed && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
          <p className="text-sm font-medium text-destructive mb-1">Limit Reached</p>
          <p className="text-xs text-muted-foreground">
            {isFree
              ? "You've used all messages for today. Come back tomorrow."
              : "You've reached your monthly limit. Top up or wait for renewal."}
          </p>
        </div>
      )}

      {/* Upgrade CTA for free users */}
      {isFree && (
        <button
          onClick={() => navigate('/pricing')}
          className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors pt-1"
        >
          Upgrade for more messages
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      )}
    </motion.div>
  );
};
