import { useState, useCallback, useEffect, useRef } from 'react';
import type { SpineUser as User, SpineSession as Session } from '@/lib/spineAuth';
import { useToast } from '@/hooks/use-toast';
import { trackDeviceLogin } from '@/hooks/useDeviceTracking';
import type { UserProfile, UseAuthReturn } from '@/types/dashboard.types';
import { spineApi } from '@/lib/spineApi';

export const useAuth = (user: User, session: Session): UseAuthReturn => {
  const [hasAccess, setHasAccess] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDuty] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [currentMonthUsage, setCurrentMonthUsage] = useState(0);
  const [monthlyLimit, setMonthlyLimit] = useState<number | null>(null);
  const [usageResetDate, setUsageResetDate] = useState<string | null>(null);
  const { toast } = useToast();
  const hasTrackedDevice = useRef(false);

  // ── Main auth load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || !session?.access_token) {
      setIsAuthLoading(false);
      return;
    }

    let mounted = true;

    const init = async () => {
      // Step 1: Resolve everything instantly from local state — no network needed
      setHasAccess(true);
      setIsAdmin(user.email?.endsWith('@aynn.io') === true);
      const termsAccepted = localStorage.getItem(`terms_accepted_${user.id}`) === 'true';
      setHasAcceptedTerms(termsAccepted);

      // Build profile from what we already know (user object from login response)
      setUserProfile({
        user_id: user.id,
        contact_person: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || '',
        company_name: '',
        business_type: '',
        avatar_url: undefined,
      } as UserProfile);

      // Unblock sidebar immediately
      if (mounted) setIsAuthLoading(false);

      // Step 2: Enrich from spine /auth/me in background (non-blocking)
      try {
        const me = await spineApi.getMe() as any;
        if (!mounted || !me) return;

        setUserProfile({
          user_id: user.id,
          contact_person: `${me.first_name || ''} ${me.last_name || ''}`.trim() || user.email || '',
          company_name: me.company_name || '',
          business_type: me.business_type || '',
          avatar_url: me.avatar_url || null,
        } as UserProfile);

        if (me.is_admin === true) setIsAdmin(true);

        // Load usage limits
        if (me.limits) {
          setCurrentMonthUsage(me.limits.current_daily_messages || 0);
          setMonthlyLimit(me.limits.daily_messages || 5);
        }
      } catch {
        // Silent — profile already set from login data above
      }
    };

    init();

    // Track device login
    if (!hasTrackedDevice.current) {
      hasTrackedDevice.current = true;
      setTimeout(() => trackDeviceLogin(user.id, session.access_token), 1000);
    }

    return () => { mounted = false; };
  }, [user?.id, session?.access_token]);

  // ── Accept terms ────────────────────────────────────────────────────────────
  const acceptTerms = useCallback(async (_consent: { privacy: boolean; terms: boolean; aiDisclaimer: boolean }) => {
    setHasAcceptedTerms(true);
    localStorage.setItem(`terms_accepted_${user.id}`, 'true');
    toast({ title: 'Welcome to AYN', description: 'Your AI companion is ready.' });
  }, [user.id, toast]);

  // ── Stubs for legacy callers ────────────────────────────────────────────────
  const checkAccess = useCallback(async () => { setHasAccess(true); }, []);
  const checkAdminRole = useCallback(async () => {
    setIsAdmin(user.email?.endsWith('@aynn.io') === true);
  }, [user.email]);
  const loadUserProfile = useCallback(async () => {
    try {
      const me = await spineApi.getMe() as any;
      if (me) setUserProfile({
        user_id: user.id,
        contact_person: `${me.first_name || ''} ${me.last_name || ''}`.trim() || user.email || '',
        company_name: me.company_name || '',
        business_type: '',
        avatar_url: me.avatar_url || null,
      } as UserProfile);
    } catch {}
  }, [user.id, user.email]);

  return {
    hasAccess,
    hasAcceptedTerms,
    isAdmin,
    isDuty,
    hasDutyAccess: isAdmin || isDuty,
    isAuthLoading,
    userProfile,
    currentMonthUsage,
    monthlyLimit,
    usageResetDate,
    checkAccess,
    checkAdminRole,
    loadUserProfile,
    acceptTerms,
  };
};
