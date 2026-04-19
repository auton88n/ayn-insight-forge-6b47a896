import { useState, useEffect, useCallback, useRef } from 'react';
import { spineApi } from '@/lib/spineApi';
import { spineAuth } from '@/lib/spineAuth';
import { AYN_BACKEND_URL } from '@/config';

const SPINE = AYN_BACKEND_URL || 'https://spine.aynn.io';

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
  bonusCredits: 0,
  allowed: true,
  resetsAt: null,
  tier: 'free',
  isFree: true,
  isUnlimited: false,
  isLoading: true,
};

/**
 * useUsageTracking — realtime usage via spine SSE (/sse/user).
 * Falls back to a 60s safety poll only when SSE is disconnected.
 */
export const useUsageTracking = (userId: string | null): UsageData & { refreshUsage: () => void } => {
  const [usageData, setUsageData] = useState<UsageData>(DEFAULT_STATE);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const safetyPollRef = useRef<number | null>(null);
  const backoffRef = useRef(1000);
  const lastEventAtRef = useRef<number>(Date.now());

  const fetchUsage = useCallback(async () => {
    if (!userId) {
      setUsageData(prev => ({ ...prev, isLoading: false }));
      return;
    }
    try {
      const limits: any = await spineApi.getLimits();
      if (!limits) {
        setUsageData(prev => ({ ...prev, isLoading: false }));
        return;
      }
      const tier = limits?.subscription_tier || 'free';
      const isFree = tier === 'free';
      const isUnlimited = limits.is_unlimited === true;

      if (isUnlimited) {
        setUsageData({
          remaining: -1, totalLimit: -1, bonusCredits: 0, allowed: true,
          resetsAt: null, tier, isFree: false, isUnlimited: true, isLoading: false,
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
        remaining, totalLimit,
        bonusCredits: Math.max(0, limits.bonus_credits || 0),
        allowed: remaining > 0,
        resetsAt, tier, isFree, isUnlimited: false, isLoading: false,
      });
    } catch (err) {
      if (import.meta.env.DEV) console.error('[useUsageTracking] Error:', err);
      setUsageData(prev => ({ ...prev, isLoading: false }));
    }
  }, [userId]);

  // Apply a partial limits payload pushed from /sse/user
  const applyLimitsEvent = useCallback((payload: any) => {
    setUsageData(prev => {
      if (prev.isUnlimited) return prev;
      const dailyLimit = payload.daily_messages ?? prev.totalLimit;
      const used = payload.current_daily_messages ?? 0;
      const bonus = Math.max(0, payload.bonus_credits ?? prev.bonusCredits);
      const remaining = Math.max(0, dailyLimit - used) + (prev.isFree ? bonus : 0);
      const totalLimit = prev.isFree ? dailyLimit + bonus : (payload.monthly_messages ?? prev.totalLimit);
      return {
        ...prev,
        remaining,
        totalLimit,
        bonusCredits: bonus,
        allowed: remaining > 0,
        isLoading: false,
      };
    });
  }, []);

  // Open SSE connection
  const openSSE = useCallback(async () => {
    if (!userId) return;
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    let token: string | null = null;
    try {
      const { data: { session } } = await spineAuth.getSession();
      token = session?.access_token || null;
    } catch { /* ignore */ }
    if (!token) return;

    const url = `${SPINE}/sse/user?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('connected', () => {
      backoffRef.current = 1000;
      lastEventAtRef.current = Date.now();
    });

    es.addEventListener('limits', (e) => {
      lastEventAtRef.current = Date.now();
      try {
        const payload = JSON.parse((e as MessageEvent).data);
        applyLimitsEvent(payload);
      } catch { /* ignore parse */ }
    });

    es.addEventListener('ping', () => {
      lastEventAtRef.current = Date.now();
    });

    es.addEventListener('reconnect', () => {
      es.close();
      esRef.current = null;
      reconnectTimerRef.current = window.setTimeout(() => openSSE(), 250);
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      const delay = Math.min(backoffRef.current, 10000);
      backoffRef.current = Math.min(backoffRef.current * 2, 10000);
      reconnectTimerRef.current = window.setTimeout(() => openSSE(), delay);
    };
  }, [userId, applyLimitsEvent]);

  // Initial fetch + open SSE
  useEffect(() => {
    fetchUsage();
    openSSE();
    return () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    };
  }, [fetchUsage, openSSE]);

  // Reopen SSE on token refresh
  useEffect(() => {
    if (!userId) return;
    const { data: { subscription } } = spineAuth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') openSSE();
    });
    return () => subscription.unsubscribe();
  }, [userId, openSSE]);

  // Safety poll: refetch every 60s only if SSE has been silent for >30s
  useEffect(() => {
    if (!userId) return;
    safetyPollRef.current = window.setInterval(() => {
      if (Date.now() - lastEventAtRef.current > 30000) fetchUsage();
    }, 60000);
    return () => { if (safetyPollRef.current) window.clearInterval(safetyPollRef.current); };
  }, [userId, fetchUsage]);

  return { ...usageData, refreshUsage: fetchUsage };
};
