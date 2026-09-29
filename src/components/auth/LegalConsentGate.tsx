import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { attachConsentIp, LEGAL } from '@/lib/legal';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AYNLoader } from '@/components/ui/page-loader';

// Performance fix — the second of two sequential, uncached full-screen
// gates every signed-in remount of <Index> paid (see useUserRole.ts's own
// comment for the first, and the measured ~600-850ms round trip this
// carries too). Whether this account is current on terms/privacy can't
// change mid-session under any normal use — it only ever changes via a
// real acceptance this same gate itself just recorded, or a new LEGAL
// version shipping in a fresh deploy, which a full page reload (a fresh
// module load, so a fresh empty cache) already covers. Cached per user,
// cleared on sign-out.
interface CachedConsent { userId: string; needsReacceptance: boolean }
let cachedConsent: CachedConsent | null = null;

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') cachedConsent = null;
});

export function LegalConsentGate({ userId, children }: { userId: string; children: ReactNode }) {
  const cachedForThisUser = cachedConsent?.userId === userId ? cachedConsent : null;
  const [checking, setChecking] = useState(!cachedForThisUser);
  const [needsReacceptance, setNeedsReacceptance] = useState(cachedForThisUser?.needsReacceptance ?? false);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cachedConsent?.userId === userId) { setChecking(false); return; }
    let alive = true;
    supabase.from('terms_consent_log')
      .select('terms_version, privacy_version, terms_accepted, privacy_accepted')
      .eq('user_id', userId)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        const current = !error && data?.terms_accepted === true && data?.privacy_accepted === true
          && data.terms_version === LEGAL.termsVersion
          && data.privacy_version === LEGAL.privacyVersion;
        setNeedsReacceptance(!current);
        cachedConsent = { userId, needsReacceptance: !current };
        setChecking(false);
      });
    return () => { alive = false; };
  }, [userId]);

  const reaccept = async () => {
    if (!accepted || saving) return;
    setSaving(true);
    setFailed(false);
    const ok = await attachConsentIp('reaccept');
    if (ok) {
      setNeedsReacceptance(false);
      cachedConsent = { userId, needsReacceptance: false };
    } else setFailed(true);
    setSaving(false);
  };

  if (checking) return <AYNLoader />;

  return (
    <>
      {children}
      <Dialog open={needsReacceptance} onOpenChange={() => {}}>
        <DialogContent hideCloseButton className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Terms and Privacy Policy updated</DialogTitle>
            <DialogDescription>
              Please review and accept the current documents to continue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <Link className="underline text-foreground" to="/privacy" target="_blank">Privacy Policy v{LEGAL.privacyVersion}</Link>{' '}
              (effective {LEGAL.privacyEffectiveDate}) and{' '}
              <Link className="underline text-foreground" to="/terms" target="_blank">Terms of Service v{LEGAL.termsVersion}</Link>{' '}
              (effective {LEGAL.termsEffectiveDate}).
            </p>
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} className="mt-0.5" />
              <span>I have read and accept the current Terms of Service and Privacy Policy.</span>
            </label>
            {failed && <p className="text-destructive">We could not record your acceptance. Please try again.</p>}
          </div>
          <Button type="button" onClick={reaccept} disabled={!accepted || saving}>
            {saving ? 'Saving…' : 'Accept and continue'}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
