import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { attachConsentIp, LEGAL } from '@/lib/legal';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AYNLoader } from '@/components/ui/page-loader';

export function LegalConsentGate({ userId, children }: { userId: string; children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [needsReacceptance, setNeedsReacceptance] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
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
        setChecking(false);
      });
    return () => { alive = false; };
  }, [userId]);

  const reaccept = async () => {
    if (!accepted || saving) return;
    setSaving(true);
    setFailed(false);
    const ok = await attachConsentIp('reaccept');
    if (ok) setNeedsReacceptance(false);
    else setFailed(true);
    setSaving(false);
  };

  if (checking) return <AYNLoader />;

  return (
    <>
      {children}
      <Dialog open={needsReacceptance} onOpenChange={() => {}}>
        <DialogContent hideCloseButton className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Privacy Policy updated</DialogTitle>
            <DialogDescription>
              AYN now describes the regions where its live job catalogue operates. Please review and accept the current documents to continue.
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
