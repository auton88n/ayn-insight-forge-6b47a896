import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ProfileAvatarUpload } from '@/components/dashboard/ProfileAvatarUpload';
import { UsageCard } from '@/components/dashboard/UsageCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Key, Plus } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { Badge } from '@/components/ui/badge';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useUsageTracking } from '@/hooks/useUsageTracking';

interface AccountPreferencesProps {
  userId: string;
  userEmail: string;
  accessToken: string;
}

export const AccountPreferences = ({ userId, userEmail, accessToken }: AccountPreferencesProps) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { searchTerm, registerFormChange } = useSettingsContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAvatarUpload, setShowAvatarUpload] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [profile, setProfile] = useState({
    contact_person: '',
    company_name: '',
    business_type: '',
    business_context: '',
    avatar_url: '',
  });
  const [originalProfile, setOriginalProfile] = useState(profile);
  const usage = useUsageTracking(userId);
  const { tier: subscriptionTier } = useSubscription();
  const isPaidUser = subscriptionTier !== 'free';

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    
    const loadProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('contact_person, company_name, business_type, business_context, avatar_url')
        .eq('user_id', userId)
        .single();

      if (data) {
        const profileData = {
          contact_person: data.contact_person || '',
          company_name: data.company_name || '',
          business_type: data.business_type || '',
          business_context: (data as any).business_context || '',
          avatar_url: data.avatar_url || '',
        };
        setProfile(profileData);
        setOriginalProfile(profileData);
      }

      setLoading(false);
    };

    loadProfile();
  }, [userId]);

  // Track unsaved changes
  useEffect(() => {
    const hasChanges = JSON.stringify(profile) !== JSON.stringify(originalProfile);
    registerFormChange('account', hasChanges);
  }, [profile, originalProfile, registerFormChange]);

  // Function to refresh profile after avatar update
  const refreshProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('contact_person, company_name, business_type, avatar_url')
      .eq('user_id', userId)
      .single();
    
    if (data) {
      setProfile(prev => ({
        ...prev,
        contact_person: data.contact_person || '',
        company_name: data.company_name || '',
        business_type: data.business_type || '',
        avatar_url: data.avatar_url || '',
      }));
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          contact_person: profile.contact_person,
          company_name: profile.company_name,
          business_type: profile.business_type,
          business_context: profile.business_context,
        } as any)
        .eq('user_id', userId);

      if (error) throw error;

      setOriginalProfile(profile);
      registerFormChange('account', false);

      toast({
        title: t('common.success'),
        description: t('settings.profileUpdated'),
      });
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: "Couldn't Update Profile",
        description: error instanceof Error ? error.message : "Your changes weren't saved. Please try again.",
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Filter fields based on search
  const matchesSearch = (text: string) => {
    if (!searchTerm) return true;
    return text.toLowerCase().includes(searchTerm.toLowerCase());
  };

  const showContactPerson = matchesSearch(t('settings.contactPerson'));
  const showCompanyName = matchesSearch(t('settings.companyName'));
  const showEmail = matchesSearch(t('settings.email'));
  const showBusinessType = matchesSearch(t('settings.businessType'));
  const showBusinessContext = matchesSearch(t('settings.businessContext'));
  const showAvatar = matchesSearch(t('profile.changePhoto'));

  const showUsage = matchesSearch('Usage') || matchesSearch('Limit') || matchesSearch('Messages');

  const hasVisibleFields = showContactPerson || showCompanyName || showEmail || showBusinessType || showBusinessContext || showAvatar || showUsage;

    return (
    <div className="space-y-6">
      {/* Usage & Limits Card */}
      {showUsage && (
        <Card className="p-6 bg-card/50 backdrop-blur-xl border-border/50">
          <h2 className="text-xl font-semibold mb-4">Usage & Limits</h2>
          <UsageCard
            remaining={usage.remaining}
            totalLimit={usage.totalLimit}
            allowed={usage.allowed}
            resetsAt={usage.resetsAt}
            tier={usage.tier}
            isFree={usage.isFree}
            isUnlimited={usage.isUnlimited}
          />

          {/* Top Up — paid users only */}
          {isPaidUser && (
            <div className="mt-4 p-4 rounded-xl border border-border/50 bg-muted/30 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Need more messages?</p>
                <p className="text-xs text-muted-foreground">Get 500 extra messages for $10 — one-time purchase</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled
                className="shrink-0 gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Top Up
                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">Coming Soon</Badge>
              </Button>
            </div>
          )}
        </Card>
      )}

      {!hasVisibleFields && searchTerm && (
        <Card className="p-6 bg-card/50 backdrop-blur-xl border-border/50">
          <p className="text-center text-muted-foreground">{t('settings.noResultsFound')}</p>
        </Card>
      )}
      {hasVisibleFields && (
        <Card className="p-6 bg-card/50 backdrop-blur-xl border-border/50">
          <h2 className="text-xl font-semibold mb-6">{t('settings.profileInformation')}</h2>
          
          <div className="space-y-6">
            {showAvatar && (
              <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20 cursor-pointer" onClick={() => setShowAvatarUpload(true)}>
              <AvatarImage src={profile.avatar_url} />
              <AvatarFallback className="bg-background border border-border text-lg">
                {profile.contact_person?.[0]?.toUpperCase() || userEmail?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
                <Button variant="outline" onClick={() => setShowAvatarUpload(true)}>
                  {t('profile.changePhoto')}
                </Button>
              </div>
            )}

            {(showContactPerson || showCompanyName) && (
              <div className="grid gap-4 md:grid-cols-2">
                {showContactPerson && (
                  <div className="space-y-2">
                    <Label htmlFor="account-contact_person">{t('settings.contactPerson')}</Label>
                    <Input
                      id="account-contact_person"
                      name="account-contact_person"
                      value={profile.contact_person}
                      onChange={(e) => setProfile({ ...profile, contact_person: e.target.value })}
                      placeholder={t('settings.contactPersonPlaceholder')}
                    />
                  </div>
                )}

                {showCompanyName && (
                  <div className="space-y-2">
                    <Label htmlFor="account-company_name">{t('settings.companyName')}</Label>
                    <Input
                      id="account-company_name"
                      name="account-company_name"
                      value={profile.company_name}
                      onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                      placeholder={t('settings.companyNamePlaceholder')}
                    />
                  </div>
                )}
              </div>
            )}

            {showEmail && (
              <div className="space-y-2">
                <Label htmlFor="account-email">{t('settings.email')}</Label>
                <Input
                  id="account-email"
                  name="account-email"
                  value={userEmail}
                  disabled
                  className="bg-muted cursor-not-allowed"
                />
              </div>
            )}

            {showBusinessType && (
              <div className="space-y-2">
                <Label htmlFor="account-business_type">{t('settings.businessType')}</Label>
                <Select
                  value={profile.business_type}
                  onValueChange={(value) => setProfile({ ...profile, business_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('settings.selectBusinessType')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consulting">{t('settings.consulting')}</SelectItem>
                    <SelectItem value="ecommerce">{t('settings.ecommerce')}</SelectItem>
                    <SelectItem value="agency">{t('settings.agency')}</SelectItem>
                    <SelectItem value="saas">{t('settings.saas')}</SelectItem>
                    <SelectItem value="other">{t('settings.other')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {showBusinessContext && (
              <div className="space-y-2">
                <Label htmlFor="account-business_context">{t('settings.businessContext')}</Label>
                <Textarea
                  id="account-business_context"
                  name="account-business_context"
                  value={profile.business_context}
                  onChange={(e) => setProfile({ ...profile, business_context: e.target.value })}
                  placeholder={t('settings.businessContextPlaceholder')}
                  className="min-h-[100px]"
                />
              </div>
            )}

            {hasVisibleFields && (
              <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.saving')}
                  </>
                ) : (
                  t('common.saveChanges')
                )}
              </Button>
            )}
          </div>
        </Card>
      )}

      <ProfileAvatarUpload
        open={showAvatarUpload}
        onOpenChange={setShowAvatarUpload}
        currentAvatarUrl={profile.avatar_url}
        onAvatarUpdated={() => {
          refreshProfile();
          setShowAvatarUpload(false);
        }}
        userId={userId}
        accessToken={accessToken}
      />

      <Card className="p-6 bg-card/50 backdrop-blur-xl border-border/50">
        <h2 className="text-xl font-semibold mb-6">{t('settings.security')}</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="font-medium">{t('settings.changePassword')}</p>
              <p className="text-sm text-muted-foreground">
                {t('settings.changePasswordDesc')}
              </p>
            </div>
            <Button
              variant="outline"
              className="gap-2"
              onClick={async () => {
                try {
                  setChangingPassword(true);
                  if (!userEmail) throw new Error('No email found');
                  localStorage.setItem('password_reset_email', userEmail.trim().toLowerCase());
                  const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
                    redirectTo: `${window.location.origin}/reset-password`,
                  });
                  if (error) throw error;
                  toast({
                    title: t('common.success'),
                    description: t('settings.passwordResetSent'),
                  });
                } catch (error) {
                  console.error('Error sending password reset:', error);
                  toast({
                    title: t('common.error'),
                    description: 'Failed to send password reset email',
                    variant: 'destructive',
                  });
                } finally {
                  setChangingPassword(false);
                }
              }}
              disabled={changingPassword}
            >
              {changingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('common.sending')}
                </>
              ) : (
                <>
                  <Key className="h-4 w-4" />
                  {t('settings.changePassword')}
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
