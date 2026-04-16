import { useState, useEffect, useCallback } from 'react';
import { spineApi } from '@/lib/spineApi';

interface UsageData {
  remaining: number;
  totalLimit: number;
  bonusCredits: number;
  allowed: boolean;
  resetsAt: string | null;
  tier: string;
  isFree: boolean;
  isUnlimited: boolean;
  isLoading: boolean;
}

const DEFAULT_STATE: UsageData = {
  remaining: 5,
  totalLimit: 5,
  allowed: true,
  resetsAt: null,
  tier: 'free',
  isFree: true,
  isUnlimited: false,
  isLoading: true,
};

export const useUsageTracking = (userId: string | null): UsageData & { refreshUsage: () => void } => {
  const [usageData, setUsageData] = useState<UsageData>(DEFAULT_STATE);

  const fetchUsage = useCallback(async () => {
    if (!userId) {
      setUsageData(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      // Read directly from tables — never call check_user_ai_limit here
      // That RPC increments usage and should only be called when sending a message
      const limitsData = await spineApi.getLimits();
      const limits = limitsData;
      const tier = limitsData?.subscription_tier || 'free';

      if (!limits) {
        setUsageData(prev => ({ ...prev, isLoading: false }));
        return;
      }

      const isFree = tier === 'free';
      const isUnlimited = limits.is_unlimited === true;

      if (isUnlimited) {
        setUsageData({
          remaining: -1,
          totalLimit: -1,
          allowed: true,
          resetsAt: null,
          tier,
          isFree: false,
          isUnlimited: true,
          isLoading: false,
        });
        return;
      }

      let remaining: number;
      let totalLimit: number;
      let resetsAt: string | null;

      if (isFree) {
        const dailyResetAt = limits.daily_reset_at ? new Date(limits.daily_reset_at) : null;
        const isExpired = !dailyResetAt || dailyResetAt <= new Date();
        const used = isExpired ? 0 : (limits.current_daily_messages || 0);
        const dailyLimit = limits.daily_messages || 5;
        const bonusRemaining = Math.max(0, limits.bonus_credits || 0);
        // Remaining = daily messages left + bonus credits (bonus used first by RPC)
        remaining = Math.max(0, dailyLimit - used) + bonusRemaining;
        totalLimit = dailyLimit + bonusRemaining;
        resetsAt = isExpired
          ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          : limits.daily_reset_at;
      } else {
        const monthlyResetAt = limits.monthly_reset_at ? new Date(limits.monthly_reset_at) : null;
        const isExpired = !monthlyResetAt || monthlyResetAt <= new Date();
        const used = isExpired ? 0 : (limits.current_monthly_messages || 0);
        const limit = (limits.monthly_messages || 200) + (limits.bonus_credits || 0);
        remaining = Math.max(0, limit - used);
        totalLimit = limit;
        resetsAt = limits.monthly_reset_at;
      }

      setUsageData({
        remaining,
        totalLimit,
        bonusCredits: Math.max(0, limits.bonus_credits || 0),
        allowed: remaining > 0,
        resetsAt,
        tier,
        isFree,
        isUnlimited: false,
        isLoading: false,
      });
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[useUsageTracking] Error:', err);
      }
      setUsageData(prev => ({ ...prev, isLoading: false }));
    }
  }, [userId]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Reset deadlock fix: if daily_reset_at has passed but counter is still non-zero,
  // the user is stuck (allowed=false blocks sending, which blocks the RPC reset).
  // Directly reset the daily counter so the UI unblocks immediately.
  useEffect(() => {
    if (!userId) return;
    const checkAndReset = async () => {
      const { data: limits } = await supabase
        .from('user_ai_limits')
        .select('daily_reset_at, current_daily_messages')
        .eq('user_id', userId)
        .maybeSingle();
      if (!limits) return;
      const resetAt = limits.daily_reset_at ? new Date(limits.daily_reset_at) : null;
      const isExpired = !resetAt || resetAt <= new Date();
      if (isExpired && (limits.current_daily_messages || 0) > 0) {
        // Daily reset handled by spine /user/limits
        // Realtime channel picks up the change and calls fetchUsage automatically
      }
    };
    checkAndReset();
  }, [userId]);

  // Real-time updates when user_ai_limits changes
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`usage-${userId.slice(0, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_ai_limits',
          filter: `user_id=eq.${userId}`,
        },
        () => fetchUsage()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchUsage]);

  return { ...usageData, refreshUsage: fetchUsage };
};
