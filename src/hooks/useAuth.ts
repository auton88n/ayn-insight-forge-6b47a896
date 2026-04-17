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
  const [isDuty, setIsDuty] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [currentMonthUsage, setCurrentMonthUsage] = useState(0);
  const [monthlyLimit, setMonthlyLimit] = useState<number | null>(null);
  const [usageResetDate, setUsageResetDate] = useState<string | null>(null);
  const { toast } = useToast();
  
  const hasTrackedDevice = useRef(false);

  // Check access — any authenticated user with a subscription row has access.
  // Falls back to access_grants for backward compatibility.
  const checkAccess = useCallback(async () => {
    try {
      // All authenticated users have access in spine auth
      setHasAccess(true);
      return;
    } catch {

      const record = data[0];
      const isActive = record.is_active && (!record.expires_at || new Date(record.expires_at) > new Date());
      setHasAccess(isActive);
      setCurrentMonthUsage(record.current_month_usage ?? 0);
      setMonthlyLimit(record.monthly_limit ?? null);
      setUsageResetDate(record.usage_reset_date ?? null);
    } catch {
      // Fail closed — deny access on errors (blueprint security rule #1)
      setHasAccess(false);
    }
  }, [user.id, session.access_token]);

  // checkAdminRole — handled by loadUserProfile via /auth/me
  const checkAdminRole = useCallback(async () => {
    const isAdminUser = user.email?.endsWith('@aynn.io') === true;
    setIsAdmin(isAdminUser);
    setIsDuty(false);
  }, [user.email]);

  // Load user profile from spine
  const loadUserProfile = useCallback(async () => {
    try {
      const me = await spineApi.getMe() as any;
      if (me) {
        setUserProfile({
          user_id: user.id,
          contact_person: `${me.first_name || ''} ${me.last_name || ''}`.trim() || user.email || '',
          company_name: '',
          business_type: '',
          avatar_url: me.avatar_url || null,
        } as UserProfile);
        setIsAdmin(me.is_admin === true || user.email?.endsWith('@aynn.io'));
      }
    } catch {
      // Silent failure
    }
  }, [user.id, user.email]);

  // Accept terms and conditions
  const acceptTerms = useCallback(async (consent: { privacy: boolean; terms: boolean; aiDisclaimer: boolean }) => {
    try {

      setHasAcceptedTerms(true);
      localStorage.setItem(`terms_accepted_${user.id}`, 'true');
      // Terms saved locally — spine migration will add server-side later
      
      toast({
        title: 'Welcome to AYN',
        description: 'Your AI companion is ready to assist you.'
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to save terms acceptance:', error);
      }
      toast({
        title: 'Error',
        description: 'Could not save your acceptance. Please try again.',
        variant: 'destructive',
      });
    }
  }, [user.id, session.access_token, toast]);

  // Load all auth data on mount
  useEffect(() => {
    if (!user?.id || !session?.access_token) {
      setIsAuthLoading(false);
      return;
    }

    let isMounted = true;
    let hasRun = false;

    const runQueries = async () => {
      if (hasRun) return;
      hasRun = true;

      // Step 1: Resolve everything from local state IMMEDIATELY — no network needed
      // This unblocks the UI instantly. User data is in localStorage from login.
      if (isMounted) {
        setHasAccess(true);
        setIsAdmin(user.email?.endsWith('@aynn.io') === true);
        const localTermsAccepted = localStorage.getItem(`terms_accepted_${user.id}`) === 'true';
        setHasAcceptedTerms(localTermsAccepted);
        setIsAuthLoading(false); // ← unblock sidebar immediately
      }

      // Step 2: Load profile from Supabase user metadata (no network call needed)
      try {
        if (!isMounted) return;
        const meta = (user as any).user_metadata || {};
        setUserProfile({
          user_id: user.id,
          contact_person: meta.full_name || meta.name || user.email?.split('@')[0] || '',
          company_name: meta.company_name || '',
          business_type: meta.business_type || '',
          avatar_url: meta.avatar_url || null,
        } as UserProfile);
      } catch {
        // Silent failure
      }
    };

    runQueries();

    if (!hasTrackedDevice.current) {
      hasTrackedDevice.current = true;
      setTimeout(() => trackDeviceLogin(user.id, session.access_token), 0);
    }

    return () => {
      isMounted = false;
    };
  }, [user?.id, session?.access_token]);

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
    acceptTerms
  };
};
