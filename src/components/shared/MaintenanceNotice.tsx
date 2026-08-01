// v3.24.0 — one visual language for "this is switched off right now".
// Rendered wherever a feature is gated, and full screen when the whole
// platform is in maintenance.
import { Wrench } from 'lucide-react';
import { useFeature, type FeatureKey } from '@/hooks/useFeatureFlags';

const DEFAULTS: Record<FeatureKey, string> = {
  platform: 'AYN is under maintenance right now. We are back shortly.',
  candidate_search: 'Candidate search is paused for maintenance. Your saved searches are safe.',
  proposals: 'Sending proposals is paused for maintenance. Nothing you sent has been lost.',
  assessments: 'Assessments are paused for maintenance. Anything in progress is saved.',
  tailoring: 'Tailored resumes and cover letters are paused for maintenance. No credits are being spent.',
  signups: 'New accounts are paused for maintenance. Existing accounts still work.',
};

export function MaintenanceNotice({ feature, className = '' }: { feature: FeatureKey; className?: string }) {
  const { enabled, message } = useFeature(feature);
  if (enabled) return null;
  return (
    <div className={`flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 ${className}`}>
      <Wrench className="h-4 w-4 mt-0.5 text-primary shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">Under maintenance</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{message || DEFAULTS[feature]}</p>
      </div>
    </div>
  );
}

/** Full screen version, used when the whole platform is switched off. */
export function PlatformMaintenanceScreen() {
  const { message } = useFeature('platform');
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Wrench className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">AYN is under maintenance</h1>
        <p className="text-muted-foreground leading-relaxed">{message || DEFAULTS.platform}</p>
        <p className="text-xs text-muted-foreground">This page checks again on its own every minute.</p>
      </div>
    </div>
  );
}

/** Wrap a feature area: renders the notice instead of children when off. */
export function FeatureGate({
  feature, children, className,
}: { feature: FeatureKey; children: React.ReactNode; className?: string }) {
  const { enabled } = useFeature(feature);
  if (!enabled) return <MaintenanceNotice feature={feature} className={className} />;
  return <>{children}</>;
}
