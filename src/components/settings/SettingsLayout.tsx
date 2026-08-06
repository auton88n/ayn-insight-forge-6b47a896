/**
 * SettingsLayout.tsx — rebuilt v3.75.0
 *
 * The old chrome carried three things from the retired chat product that
 * never worked for this one: a search bar bound to a SettingsContext that
 * nothing ever filtered against, an "unsaved changes" warning dialog gated
 * on registerFormChange, which had zero callers anywhere in the codebase
 * (every real settings control here saves immediately on toggle/click, there
 * is no draft/form state to lose), and a Memory tab for a chat feature this
 * product doesn't have. All three are gone — SettingsContext.tsx and
 * useUnsavedChangesWarning.ts deleted outright, both fully orphaned once
 * this file stopped importing them.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, User, Mail, Shield, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';

interface SettingsLayoutProps {
  children: {
    account: React.ReactNode;
    notifications: React.ReactNode;
    privacy: React.ReactNode;
    sessions: React.ReactNode;
  };
}

export const SettingsLayout = ({ children }: SettingsLayoutProps) => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();

  return (
    <div className="settings-surface min-h-screen bg-background p-4 md:p-6 pt-6 md:pt-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 md:mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="gap-2 mb-3 md:mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('common.back')}
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold">{t('settings.title')}</h1>
        </div>

        <Tabs defaultValue="account" className="w-full" dir={language === 'ar' ? 'rtl' : 'ltr'}>
          <TabsList className="w-full grid grid-cols-4 mb-8 bg-muted">
            <TabsTrigger value="account" className="gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">{t('settings.account')}</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline">{t('settings.notifications')}</span>
            </TabsTrigger>
            <TabsTrigger value="privacy" className="gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">{t('settings.privacy')}</span>
            </TabsTrigger>
            <TabsTrigger value="sessions" className="gap-2">
              <Monitor className="h-4 w-4" />
              <span className="hidden sm:inline">{t('settings.sessions')}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="account">{children.account}</TabsContent>
          <TabsContent value="notifications">{children.notifications}</TabsContent>
          <TabsContent value="privacy">{children.privacy}</TabsContent>
          <TabsContent value="sessions">{children.sessions}</TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
