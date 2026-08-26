import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Monitor, Smartphone, Tablet, LogOut } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SessionManagementProps {
  userId: string;
  userEmail: string;
  accessToken: string;
}

export const SessionManagement = ({ userId, userEmail, accessToken }: SessionManagementProps) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { sessions, loading, revokeSession, signOutAllDevices } = useUserSettings(userId, accessToken);



  // v3.35.0 — real auth.sessions rows carry a user_agent string, not the
  // structured device_info the old device_fingerprints table never got.
  const getDeviceIcon = (ua: string | null) => {
    const s = (ua || '').toLowerCase();
    if (/mobile|iphone|android(?!.*tablet)/.test(s)) return <Smartphone className="h-5 w-5" />;
    if (/ipad|tablet/.test(s)) return <Tablet className="h-5 w-5" />;
    return <Monitor className="h-5 w-5" />;
  };

  const getDeviceName = (ua: string | null): string => {
    if (!ua) return t('settings.unknownDevice');
    let browser = 'Browser';
    let os = '';

    if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Edg')) browser = 'Edge';

    if (ua.includes('Mac OS X')) os = 'macOS';
    else if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Linux') && !ua.includes('Android')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone')) os = 'iOS';
    else if (ua.includes('iPad')) os = 'iPadOS';

    return os ? `${browser} on ${os}` : browser;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="lp-panel">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">{t('settings.activeSessions')}</h2>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-2">
                <LogOut className="h-4 w-4" />
                {t('settings.signOutAll')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('settings.confirmSignOutAll')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('settings.confirmSignOutAllDesc')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={signOutAllDevices}>
                  {t('settings.signOutAll')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="space-y-4">
          {sessions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {t('settings.noActiveSessions')}
            </p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-start justify-between p-4 rounded-lg border transition-colors"
                style={{ borderColor: "hsl(var(--lp-border-soft))", background: "hsl(var(--lp-surface))" }}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1 text-muted-foreground">
                    {getDeviceIcon(session.user_agent)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{getDeviceName(session.user_agent)}</p>
                      {session.is_current && (
                        <Badge variant="secondary" className="text-xs">
                          {t('settings.thisDevice')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.lastActive')}: {formatDistanceToNow(
                        new Date(session.refreshed_at || session.created_at), { addSuffix: true }
                      )}
                    </p>
                    {session.ip && (
                      <p className="text-xs text-muted-foreground">{session.ip.replace(/\/\d+$/, '')}</p>
                    )}
                  </div>
                </div>
                {!session.is_current && (
                  <button
                    type="button"
                    onClick={() => revokeSession(session.id)}
                    className="text-sm text-destructive hover:underline"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    {t('settings.revoke')}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
