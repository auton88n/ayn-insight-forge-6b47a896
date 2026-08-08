// v2.10.0 — Waiting screen shown to employers while their account
// is under review by the AYN team. Fully gated: no dashboard, no
// candidate search, until admin flips status to 'approved'.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Building2, LogOut, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type EmpStatus = 'pending_approval' | 'approved' | 'declined' | 'suspended';

const EmployerPending = () => {
  const navigate = useNavigate();
  const [company, setCompany] = useState<string>('');
  const [status, setStatus] = useState<EmpStatus | null>(null);
  const [checking, setChecking] = useState(true);

  const check = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // v3.88.0 — same fix as ResumeHub.tsx: correct the shared cache
      // before leaving, or "/" bounces right back on stale trust.
      await supabase.auth.signOut().catch(() => { /* already signed out server-side is fine */ });
      navigate('/');
      return;
    }
    const q = supabase.from('employer_accounts' as never).select('company_name, status').eq('user_id', user.id).maybeSingle();
    const { data } = await (q as unknown as Promise<{ data: { company_name?: string; status?: EmpStatus } | null }>);
    setCompany(data?.company_name || '');
    setStatus(data?.status ?? 'pending_approval');
    setChecking(false);
    if (data?.status === 'approved') navigate('/', { replace: true });
  };

  useEffect(() => { check(); const t = setInterval(check, 15000); return () => clearInterval(t); /* eslint-disable-next-line */ }, []);

  const signOut = async () => { await supabase.auth.signOut(); navigate('/'); };

  const declined = status === 'declined';
  const suspended = status === 'suspended';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="max-w-lg w-full p-8 space-y-6 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Building2 className="w-7 h-7 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {declined ? 'We could not approve this account' : suspended ? 'This account is on hold' : 'Your account is under review'}
          </h1>
          {company && <p className="text-sm text-muted-foreground">{company}</p>}
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            {declined
              ? 'The AYN team reviewed your request and did not approve it for now. If you think this is a mistake, reply to us at support and we will take another look.'
              : suspended
                ? 'Access to the talent pool is paused on this account. Get in touch with support and we will sort it out.'
                : "Thanks for signing up. An AYN account manager will reach out shortly to walk you through pricing and get you set up. You'll be able to search the talent pool as soon as they approve your account."}
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
          <span>Status: {declined ? 'Declined' : suspended ? 'Suspended' : 'Pending approval'}</span>
        </div>

        <Button variant="outline" size="sm" onClick={signOut} className="mx-auto">
          <LogOut className="w-4 h-4 mr-2" /> Sign out
        </Button>
      </Card>
    </div>
  );
};

export default EmployerPending;
