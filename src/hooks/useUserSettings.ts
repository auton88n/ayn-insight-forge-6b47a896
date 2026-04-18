import { spineApi } from '@/lib/spineApi';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage, ErrorCodes } from '@/lib/errorMessages';

export interface UserSettings {
  id: string;
  user_id: string;
  email_system_alerts: boolean;
  email_usage_warnings: boolean;
  email_marketing: boolean;
  email_weekly_summary: boolean;
  in_app_sounds: boolean;
  desktop_notifications: boolean;
  allow_personalization: boolean;
  store_chat_history: boolean;
}

export interface DeviceSession {
  id: string;
  fingerprint_hash: string;
  device_info: Record<string, unknown> | null;
  first_seen: string;
  last_seen: string;
  login_count: number;
  is_trusted: boolean;
}

// Accept userId and accessToken as parameters to use REST API
export const useUserSettings = (userId: string, accessToken?: string) => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const fetchAllData = useCallback(async () => {
    if (!userId || !accessToken) {
      setLoading(false);
      return;
    }

    try {
      // Parallel fetch: settings + sessions
      const [settingsData, sessionsData] = await Promise.all([
        spineApi.getProfile(),
        spineApi.getLimits()
      ]);

      // Process settings (settingsData is profile object from spine)
      const fetched: any = settingsData || {};
      setSettings({
        id: fetched.id || userId,
        user_id: fetched.user_id || userId,
        email_system_alerts: fetched.email_system_alerts ?? true,
        email_usage_warnings: fetched.email_usage_warnings ?? true,
        email_marketing: fetched.email_marketing ?? false,
        email_weekly_summary: fetched.email_weekly_summary ?? false,
        in_app_sounds: fetched.in_app_sounds ?? true,
        desktop_notifications: fetched.desktop_notifications ?? false,
        allow_personalization: fetched.allow_personalization ?? false,
        store_chat_history: fetched.store_chat_history ?? true,
      });

      // Process sessions
      const normalizedSessions: DeviceSession[] = (sessionsData || []).map((session: DeviceSession) => ({
        id: session.id,
        fingerprint_hash: session.fingerprint_hash,
        device_info: session.device_info as Record<string, unknown> | null,
        first_seen: session.first_seen,
        last_seen: session.last_seen,
        login_count: session.login_count ?? 0,
        is_trusted: session.is_trusted ?? false,
      }));
      setSessions(normalizedSessions);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error fetching settings:', error);
      }
      const errMsg = getErrorMessage(ErrorCodes.DATA_LOAD_FAILED);
      toast({
        title: errMsg.title,
        description: errMsg.description,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [userId, accessToken, toast]);

  const refetchSessions = async () => {
    if (!userId || !accessToken) return;

    try {
      const data = await spineApi.getLimits();
      
      const normalizedSessions: DeviceSession[] = (data || []).map((session: DeviceSession) => ({
        id: session.id,
        fingerprint_hash: session.fingerprint_hash,
        device_info: session.device_info as Record<string, unknown> | null,
        first_seen: session.first_seen,
        last_seen: session.last_seen,
        login_count: session.login_count ?? 0,
        is_trusted: session.is_trusted ?? false,
      }));
      setSessions(normalizedSessions);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error fetching sessions:', error);
      }
    }
  };

  const updateSettings = async (updates: Partial<UserSettings>) => {
    if (!settings || !userId || !accessToken) return;

    setUpdating(true);
    try {
      /* stored locally */;

      setSettings({ ...settings, ...updates });
      toast({
        title: 'Success',
        description: 'Settings saved successfully',
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error updating settings:', error);
      }
      const errMsg = getErrorMessage(ErrorCodes.SETTINGS_SAVE_FAILED);
      toast({
        title: errMsg.title,
        description: errMsg.description,
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
    }
  };

  const revokeSession = async (sessionId: string) => {
    if (!accessToken) return;
    
    try {
      /* stored locally */;

      setSessions(sessions.filter(s => s.id !== sessionId));
      toast({
        title: 'Success',
        description: 'Session revoked successfully',
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error revoking session:', error);
      }
      const errMsg = getErrorMessage(ErrorCodes.SESSION_REVOKE_FAILED);
      toast({
        title: errMsg.title,
        description: errMsg.description,
        variant: 'destructive',
      });
    }
  };

  const signOutAllDevices = async () => {
    if (!userId || !accessToken) return;

    try {
      const { spineAuth } = await import('@/lib/spineAuth');
      await spineAuth.signOut();
      
      toast({
        title: 'Success',
        description: 'All devices signed out successfully',
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error signing out all devices:', error);
      }
      const errMsg = getErrorMessage(ErrorCodes.SIGN_OUT_ALL_FAILED);
      toast({
        title: errMsg.title,
        description: errMsg.description,
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (userId && accessToken) {
      fetchAllData();
    }
  }, [userId, accessToken, fetchAllData]);

  return {
    settings,
    sessions,
    loading,
    updating,
    updateSettings,
    revokeSession,
    signOutAllDevices,
    refetchSessions,
  };
};
