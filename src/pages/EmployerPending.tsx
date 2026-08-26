// v2.10.0 — Waiting screen shown to employers while their account
// is under review by the AYN team. Fully gated: no dashboard, no
// candidate search, until admin flips status to 'approved'.
//
// v3.249.0 -- reported directly, following the same "same sidebar as the
// job seeker" instruction: this screen used to stand alone on a bare
// bg-background/bg-primary card with no branding scope at all (unlike
// EmployerHub.tsx and Billing.tsx, which already switched to the real
// .resume-hub-theme system), and had no sidebar of any kind -- a signed-in,
// not-yet-approved employer had no way back to the marketing content or
// the "looking for a job instead" door. Now wrapped in the same
// EmployerSidebar shell /employers itself uses, so "signed in but pending"
// reads as one continuous experience with the marketing page, not a
// dead end -- and the card itself picks up real AYN ember via .lp.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Building2, LogOut, Loader2, Clock } from 'lucide-react';
import { EmployerSidebar } from '@/components/landing/EmployerSidebar';

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
  // 'approved' is a real, if brief, state here -- check() navigates away
  // the instant it sees it, but that navigate lands one render after the
  // setStatus() just above it, so this render still has to produce
  // something valid for the sidebar's own, narrower status prop.
  const sidebarStatus = declined ? 'declined' : suspended ? 'suspended' : 'pending_approval';

  return (
    <div className="lp lp-shell-with-sidebar">
      <EmployerSidebar status={sidebarStatus} />
      <main className="lp-sidebar-main">
        <div className="lp-gate">
          <div className="lp-panel" style={{ maxWidth: 520, width: '100%', textAlign: 'center', marginInline: 'auto' }}>
            <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'hsl(var(--lp-ember) / 0.12)' }}>
              <Building2 className="w-7 h-7" style={{ color: 'hsl(var(--lp-ember))' }} />
            </div>
            <div className="space-y-2" style={{ marginTop: 18 }}>
              <h1 className="lp-display lp-h2" style={{ fontSize: 'clamp(1.3rem, 2.2vw, 1.6rem)' }}>
                {declined ? 'We could not approve this account' : suspended ? 'This account is on hold' : 'Your account is under review'}
              </h1>
              {company && <p className="lp-note" style={{ margin: 0 }}>{company}</p>}
              <p className="lp-note" style={{ maxWidth: 420, marginInline: 'auto', lineHeight: 1.6 }}>
                {declined
                  ? 'The AYN team reviewed your request and did not approve it for now. If you think this is a mistake, reply to us at support and we will take another look.'
                  : suspended
                    ? 'Access to the talent pool is paused on this account. Get in touch with support and we will sort it out.'
                    : "Thanks for signing up. An AYN account manager will reach out shortly to walk you through pricing and get you set up. You'll be able to search the talent pool as soon as they approve your account."}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 lp-note" style={{ marginTop: 18 }}>
              {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
              <span>Status: {declined ? 'Declined' : suspended ? 'Suspended' : 'Pending approval'}</span>
            </div>

            <div className="lp-cta-row" style={{ justifyContent: 'center', marginTop: 22 }}>
              <button type="button" className="lp-btn lp-btn-ghost" onClick={signOut}>
                <LogOut className="w-4 h-4" style={{ marginRight: 8 }} /> Sign out
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default EmployerPending;
