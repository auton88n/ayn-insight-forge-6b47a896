/**
 * NotificationSettings.tsx — rebuilt v3.75.0
 *
 * The old tab toggled "in-app sounds" and "desktop notifications" — leftover
 * chat-product controls for events this product doesn't have (no live
 * in-app pings anywhere; confirmed zero other callers of the sound store or
 * the desktop-notification hook, both deleted alongside this rewrite).
 * Meanwhile user_settings already had real email_marketing/email_system_alerts
 * columns with no UI anywhere to change them. This tab now shows those.
 *
 * Not yet enforced server-side: no email sender in this codebase (auth-send-email,
 * resume-hub's notifyCandidate/notifyOrgMembers, stripe-webhook's receipt email)
 * currently checks these flags before sending. The toggle saves a real value;
 * wiring the senders to respect it is a separate follow-up.
 */
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useUserSettings } from '@/hooks/useUserSettings';
import { Loader2, Mail } from 'lucide-react';

interface NotificationSettingsProps {
  userId: string;
  accessToken: string;
}

export const NotificationSettings = ({ userId, accessToken }: NotificationSettingsProps) => {
  const { settings, loading, updating, updateSettings } = useUserSettings(userId, accessToken);

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="p-6 bg-card/50 backdrop-blur-xl border-border/50">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-xl" style={{ background: "var(--rh-tint, hsl(var(--primary) / 0.1))" }}>
          <Mail className="w-5 h-5" style={{ color: "var(--rh-accent-2, hsl(var(--primary)))" }} />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Email preferences</h2>
          <p className="text-sm text-muted-foreground">
            Account emails (receipts, proposals, assessments) always go out. They're how the product tells you something happened.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label>Product news and tips</Label>
            <p className="text-sm text-muted-foreground">
              Occasional emails about new AYN features and how to get more out of it.
            </p>
          </div>
          <Switch
            checked={settings.email_marketing}
            onCheckedChange={(checked) => updateSettings({ email_marketing: checked })}
            disabled={updating}
            style={settings.email_marketing ? { backgroundColor: "var(--rh-accent-2, hsl(var(--primary)))" } : undefined}
          />
        </div>
      </div>
    </Card>
  );
};
