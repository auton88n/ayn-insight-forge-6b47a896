import { useState, useCallback, useEffect, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import { trackDeviceLogin } from '@/hooks/useDeviceTracking';
import type { UserProfile, UseAuthReturn } from '@/types/dashboard.types';

import { supabaseApi } from '@/lib/supabaseApi';

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
      // Primary: check user_subscriptions — all registered users have a row here
      const subData = await supabaseApi.get<any[]>(
        `user_subscriptions?user_id=eq.${user.id}&select=subscription_tier,status`,
        session.access_token
      );

      if (subData && subData.length > 0) {
        // Any user with a subscription row has access — free, paid, or unlimited
        setHasAccess(true);
        return;
      }

      // Fallback: legacy access_grants table
      const data = await supabaseApi.get<any[]>(
        `access_grants?user_id=eq.${user.id}&select=is_active,expires_at,current_month_usage,monthly_limit,usage_reset_date`,
        session.access_token
      );

      if (!data || data.length === 0) {
        // No row in either table but user is authenticated — still give access
        setHasAccess(true);
        return;
      }

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

  // Check if user is admin or duty - uses direct fetch
  const checkAdminRole = useCallback(async () => {
    try {
      const data = await supabaseApi.get<any[]>(
        `user_roles?user_id=eq.${user.id}&select=role`,
        session.access_token
      );

      const role = data?.[0]?.role;
      setIsAdmin(role === 'admin');
      setIsDuty(role === 'duty');
    } catch {
      // Silent failure - non-admin by default
    }
  }, [user.id, session.access_token]);

  // Load user profile - uses direct fetch
  const loadUserProfile = useCallback(async () => {
    try {
      const data = await supabaseApi.get<any[]>(
        `profiles?user_id=eq.${user.id}&select=user_id,contact_person,company_name,business_type,avatar_url`,
        session.access_token
      );

      if (data && data.length > 0) {
        setUserProfile(data[0] as UserProfile);
      }
    } catch {
      // Silent failure - no profile
    }
  }, [user.id, session.access_token]);

  // Accept terms and conditions
  const acceptTerms = useCallback(async (consent: { privacy: boolean; terms: boolean; aiDisclaimer: boolean }) => {
    try {
      const now = new Date().toISOString();

      const updated = await supabaseApi.fetch<any[]>(
        `user_settings?user_id=eq.${user.id}`,
        session.access_token,
        {
          method: 'PATCH',
          body: { has_accepted_terms: true, updated_at: now },
          headers: { 'Prefer': 'return=representation' }
        }
      );

      if (!updated || updated.length === 0) {
        await supabaseApi.post(
          'user_settings',
          session.access_token,
          { user_id: user.id, has_accepted_terms: true, updated_at: now }
        );
      }

      await supabaseApi.post(
        'terms_consent_log',
        session.access_token,
        {
          user_id: user.id,
          terms_version: '2026-03-14',
          privacy_accepted: consent.privacy,
          terms_accepted: consent.terms,
          ai_disclaimer_accepted: consent.aiDisclaimer,
          user_agent: navigator.userAgent
        }
      );

      setHasAcceptedTerms(true);
      localStorage.setItem(`terms_accepted_${user.id}`, 'true');
      
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

      try {
        const results = await Promise.all([
          // Primary access check: user_subscriptions
          supabaseApi.getWithRetry<any[]>(`user_subscriptions?user_id=eq.${user.id}&select=subscription_tier,status`, session.access_token),
          supabaseApi.getWithRetry<any[]>(`user_roles?user_id=eq.${user.id}&select=role`, session.access_token),
          supabaseApi.getWithRetry<any[]>(`profiles?user_id=eq.${user.id}&select=user_id,contact_person,company_name,business_type,avatar_url`, session.access_token),
          supabaseApi.getWithRetry<any[]>(`user_settings?user_id=eq.${user.id}&select=has_accepted_terms`, session.access_token)
        ]);

        if (!isMounted) return;

        const [subData, roleData, profileData, settingsData] = results;

        // Access: any authenticated user with a subscription row has access
        if (subData && subData.length > 0) {
          setHasAccess(true);
        } else {
          // Fallback to access_grants for legacy users
          try {
            const accessData = await supabaseApi.get<any[]>(
              `access_grants?user_id=eq.${user.id}&select=is_active,expires_at,current_month_usage,monthly_limit,usage_reset_date`,
              session.access_token
            );
            if (accessData && accessData.length > 0) {
              const record = accessData[0];
              const isActive = record.is_active &&
                (!record.expires_at || new Date(record.expires_at) > new Date());
              setHasAccess(isActive);
              setCurrentMonthUsage(record.current_month_usage ?? 0);
              setMonthlyLimit(record.monthly_limit ?? null);
              setUsageResetDate(record.usage_reset_date ?? null);
            } else {
              // Authenticated but no rows anywhere — give access
              setHasAccess(true);
            }
          } catch {
            setHasAccess(true);
          }
        }

        // Admin/duty role
        if (roleData) {
          const role = roleData?.[0]?.role;
          setIsAdmin(role === 'admin');
          setIsDuty(role === 'duty');
        }

        // Profile
        if (profileData && profileData.length > 0) {
          setUserProfile(profileData[0] as UserProfile);
        }

        // Terms
        if (settingsData) {
          const dbTermsAccepted = settingsData?.[0]?.has_accepted_terms ?? false;
          setHasAcceptedTerms(dbTermsAccepted);
          if (dbTermsAccepted) {
            localStorage.setItem(`terms_accepted_${user.id}`, 'true');
          } else {
            localStorage.removeItem(`terms_accepted_${user.id}`);
          }
        } else {
          const localTermsAccepted = localStorage.getItem(`terms_accepted_${user.id}`) === 'true';
          setHasAcceptedTerms(localTermsAccepted);
        }

      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Auth queries batch failed:', error);
        }
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
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
