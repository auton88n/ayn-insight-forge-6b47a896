import { useState } from 'react';
import { Card } from '@/components/ui/card';
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



  const getDeviceIcon = (deviceInfo: Record<string, unknown> | null) => {
    const type = String(deviceInfo?.type || '').toLowerCase();
    if (type.includes('mobile') || type.includes('phone')) return <Smartphone className="h-5 w-5" />;
    if (type.includes('tablet')) return <Tablet className="h-5 w-5" />;
    return <Monitor className="h-5 w-5" />;
  };

  const parseUserAgentForDisplay = (ua: string): string => {
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

  const getDeviceName = (deviceInfo: Record<string, unknown> | null) => {
    if (!deviceInfo) return t('settings.unknownDevice');

    const browser = String(deviceInfo.browser || '');
    const os = String(deviceInfo.os || '');

    // If we have parsed values (not raw user agent), show "Browser on OS"
    if (browser && os && !browser.includes('Mozilla')) {
      return `${browser} on ${os}`;
    }

    // Fallback: parse raw user agent if old format
    if (browser.includes('Mozilla')) {
      return parseUserAgentForDisplay(browser);
    }

    return browser || os || t('settings.unknownDevice');
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
      <Card className="p-6 bg-card/50 backdrop-blur-xl border-border/50">
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
                className="flex items-start justify-between p-4 rounded-lg border border-border bg-background/50 hover:bg-background/80 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1 text-muted-foreground">
                    {getDeviceIcon(session.device_info)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{getDeviceName(session.device_info)}</p>
                      {session.is_trusted && (
                        <Badge variant="secondary" className="text-xs">
                          {t('settings.trusted')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.lastActive')}: {formatDistanceToNow(new Date(session.last_seen), { addSuffix: true })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.loginCount')}: {session.login_count}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeSession(session.id)}
                  className="text-destructive hover:text-destructive"
                >
                  {t('settings.revoke')}
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};
