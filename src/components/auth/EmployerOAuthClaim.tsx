// Finishes an employer application for someone who signed up with Google.
//
// Google cannot carry the company details an employer signup needs, so a new Google account
// starts as a job seeker. When the person chose "I am hiring" before clicking Google (see
// AuthModal), this asks for the company details once they are back and signed in, and sends them
// through employer_claim_after_oauth, which runs the same checks as the email signup and still
// leaves the account waiting for approval. Nothing here can skip approval.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

export const SIGNUP_INTENT_KEY = 'ayn_signup_intent';

const readIntent = () => { try { return localStorage.getItem(SIGNUP_INTENT_KEY); } catch { return null; } };
const clearIntent = () => { try { localStorage.removeItem(SIGNUP_INTENT_KEY); } catch { /* storage unavailable */ } };

export function EmployerOAuthClaim() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [country, setCountry] = useState<'US' | 'CA' | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [eligibilityError, setEligibilityError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    const check = async (session: { user?: { email?: string | null } } | null) => {
      if (!session?.user || readIntent() !== 'employer') return;
      try {
        const { data, error: rpcError } = await supabase.rpc('employer_claim_available' as never);
        if (!alive) return;
        if (rpcError) throw rpcError;
        if (data !== true) { clearIntent(); setOpen(false); return; }
        setEligibilityError(false);
        setEmail(session.user.email || '');
        setOpen(true);
      } catch {
        if (alive) { setEligibilityError(true); setOpen(true); }
      }
    };
    void supabase.auth.getSession().then(({ data }) => check(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') void check(session);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [retry]);

  const skip = () => { clearIntent(); setOpen(false); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const { error: rpcError } = await supabase.rpc('employer_claim_after_oauth' as never, {
      p_company_name: company, p_company_website: website, p_position_title: position,
      p_phone: phone, p_company_address: address, p_company_country: country,
    } as never);
      if (rpcError) throw rpcError;
    clearIntent();
    setOpen(false);
    toast({ title: 'Application received', description: 'Our team reviews every company by hand. We will email you once it is done.' });
    window.location.assign('/employers');
    } catch (e) {
      setError(e instanceof Error ? e.message : (e as { message?: string })?.message || 'Could not submit. Please try again.');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) skip(); }}>
      {/* Outside clicks must not close this: the cookie banner sits outside the dialog, and answering it
          would otherwise throw away a half-filled form. Closing is only the X, Escape, or the skip button. */}
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Tell us about your company</DialogTitle>
          <DialogDescription>
            {eligibilityError ? 'We could not check your account. Your employer choice has been kept.' : `You signed in with Google as ${email}. We review every company by hand, and your email must match your company website.`}
          </DialogDescription>
        </DialogHeader>
        {eligibilityError ? <Button onClick={() => setRetry(n => n + 1)}>Retry account check</Button> : <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="oc-company">Company name *</Label><Input id="oc-company" value={company} onChange={(e) => setCompany(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label htmlFor="oc-website">Company website *</Label><Input id="oc-website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yourcompany.com" required /></div>
          <div className="space-y-1.5"><Label htmlFor="oc-position">Your position *</Label><Input id="oc-position" value={position} onChange={(e) => setPosition(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label htmlFor="oc-phone">Phone number *</Label><Input id="oc-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label htmlFor="oc-address">Company address *</Label><Input id="oc-address" value={address} onChange={(e) => setAddress(e.target.value)} required /></div>
          <div className="space-y-1.5">
            <Label>Country *</Label>
            <div className="grid grid-cols-2 gap-2">
              {([['US', 'United States'], ['CA', 'Canada']] as const).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setCountry(code)}
                  className={`rounded-lg border p-2.5 text-sm font-medium transition-all ${country === code ? 'ayn-auth-role-active' : 'border-border bg-muted/40 hover:border-foreground/25'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between pt-2">
            <Button type="button" variant="ghost" onClick={skip}>Continue as a job seeker instead</Button>
            <Button type="submit" disabled={saving || !country}>{saving ? 'Sending' : 'Submit application'}</Button>
          </div>
        </form>}
      </DialogContent>
    </Dialog>
  );
}
