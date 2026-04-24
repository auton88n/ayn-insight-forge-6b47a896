import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserSettings } from '@/hooks/useUserSettings';
import { supabase } from '@/integrations/supabase/client';
import { supabaseApi } from '@/lib/supabaseApi';

import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { Session } from '@supabase/supabase-js';
import { MemoryManagement } from './MemoryManagement';

interface PrivacySettingsProps {
  userId: string;
  session: Session;
}

export const PrivacySettings = ({ userId, session }: PrivacySettingsProps) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { settings, loading, updating, updateSettings } = useUserSettings(userId, session.access_token);

  const token = session.access_token;

  const handleDeleteChatHistory = async () => {
    if (!userId) return;

    try {
      await supabaseApi.delete(`messages?user_id=eq.${userId}`, token);

      toast({
        title: t('common.success'),
        description: t('settings.chatHistoryDeleted'),
      });
    } catch (error) {
      console.error('Error deleting chat history:', error);
      toast({
        title: t('common.error'),
        description: 'Failed to delete chat history',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (!userId) return;

    try {
      // Call edge function to fully delete account including auth.users
      const response = await fetch(
        'https://dfkoxuokfkttjhfjcecx.supabase.co/functions/v1/delete-account',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete account');
      }

      // Sign out locally and redirect
      await supabase.auth.signOut();
      
      toast({
        title: t('common.success'),
        description: t('settings.accountDeleted'),
      });
      
      navigate('/');
    } catch (error) {
      console.error('Error deleting account:', error);
      toast({
        title: t('common.error'),
        description: 'Failed to delete account',
        variant: 'destructive',
      });
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AYN Memory Management */}
      <MemoryManagement userId={userId} />

      <Card className="p-6 bg-card/50 backdrop-blur-xl border-border/50">
        <h2 className="text-xl font-semibold mb-6">{t('settings.dataManagement')}</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('settings.deleteChatHistory')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('settings.deleteChatHistoryDesc')}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  {t('settings.delete')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('settings.confirmDeleteHistory')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('settings.confirmDeleteHistoryDesc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteChatHistory}>
                    {t('settings.delete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="space-y-0.5">
              <Label className="text-destructive">{t('settings.deleteAccount')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('settings.deleteAccountDesc')}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {t('settings.deleteAccount')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('settings.confirmDeleteAccount')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('settings.confirmDeleteAccountDesc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    className="bg-destructive text-destructive-foreground"
                  >
                    {t('settings.deleteAccount')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </Card>
    </div>
  );
};
