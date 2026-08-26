/**
 * AccountPreferences.tsx — rebuilt v3.73.0
 *
 * The Account tab was still the retired consulting product's version:
 * SubscriptionContext ("Unlimited Plan", "500 extra messages for $10"),
 * useUsageTracking reading dead user_ai_limits/user_subscriptions tables,
 * and a profiles form (contact_person, company_name, business_type:
 * consulting/ecommerce/agency/saas) that has nothing to do with a job
 * seeker or an employer. Real, wired to AYN's actual data now: plan and
 * credit balance from billingApi (the same client Billing.tsx uses), name
 * and email from the real profile tables, role-aware (seeker vs employer).
 * Editing itself still happens in exactly one place — Resume Hub's Profile
 * tab, or the employer's own company profile — this just shows the summary
 * and links there, instead of re-implementing a second editor.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { HOME_TAB_HANDOFF_KEY } from '@/components/landing/HomeTabs';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { billingApi, type SeekerBilling, type EmployerBilling } from '@/lib/billing';
import { employerApi } from '@/lib/employer';
import { Loader2, Key, ArrowRight, Sparkles } from 'lucide-react';

interface AccountPreferencesProps {
  userId: string;
  userEmail: string;
  accessToken: string;
}

export const AccountPreferences = ({ userId, userEmail }: AccountPreferencesProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { role, companyName, loading: roleLoading } = useUserRole(userId);
  const [loading, setLoading] = useState(true);
  const [changingPassword, setChangingPassword] = useState(false);
  const [seekerBilling, setSeekerBilling] = useState<SeekerBilling | null>(null);
  const [employerBilling, setEmployerBilling] = useState<EmployerBilling | null>(null);
  const [name, setName] = useState('');

  const isEmployer = role === 'employer';

  useEffect(() => {
    if (roleLoading) return;
    let alive = true;
    (async () => {
      try {
        if (isEmployer) {
          const { org } = await employerApi.orgGet();
          if (org?.id) {
            const b = await billingApi.employer(org.id);
            if (alive) setEmployerBilling(b);
          }
          if (alive) setName(companyName || '');
        } else {
          const [b, { data: prof }] = await Promise.all([
            billingApi.seeker(),
            supabase.from('user_profile_data').select('legal_first_name, legal_last_name')
              .eq('user_id', userId).maybeSingle(),
          ]);
          if (!alive) return;
          setSeekerBilling(b);
          setName([prof?.legal_first_name, prof?.legal_last_name].filter(Boolean).join(' '));
        }
      } catch {
        /* best effort — show whatever loaded, the page still works */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [isEmployer, roleLoading, companyName, userId]);

  const handlePasswordReset = async () => {
    setChangingPassword(true);
    try {
      localStorage.setItem('password_reset_email', userEmail.trim().toLowerCase());
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({ title: 'Check your email', description: 'We sent you a password reset link.' });
    } catch (error) {
      toast({
        title: "Couldn't send reset email",
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="lp-panel">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold mb-1">Plan</h2>
            <p className="text-sm text-muted-foreground">
              {isEmployer ? (employerBilling?.plan?.name || '—') : (seekerBilling?.plan?.name || 'Free')}
              {' · '}
              {(isEmployer ? employerBilling?.status : seekerBilling?.status) || 'active'}
            </p>
          </div>
          <button type="button" className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => navigate('/billing')}>
            Manage billing <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {!isEmployer && (
          <div className="mt-4 flex items-center gap-2 text-sm">
            <Sparkles className="w-4 h-4 shrink-0" style={{ color: "hsl(var(--lp-ember-soft))" }} />
            <span className="font-medium">{seekerBilling?.balance ?? 0} credits</span>
            <span className="text-muted-foreground">
              : {seekerBilling?.costs?.tailored_resume ?? 2} for a tailored resume, {seekerBilling?.costs?.cover_letter ?? 1} for a cover letter.
            </span>
          </div>
        )}

        {isEmployer && employerBilling && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="font-medium">{employerBilling.proposals_used}</span>
              <span className="text-muted-foreground"> / {employerBilling.plan?.proposals_limit ?? '∞'} proposals</span>
            </div>
            <div>
              <span className="font-medium">{employerBilling.assessments_used}</span>
              <span className="text-muted-foreground"> / {employerBilling.plan?.assessments_limit ?? '∞'} assessments</span>
            </div>
            <div>
              <span className="font-medium">{employerBilling.searches_used}</span>
              <span className="text-muted-foreground"> / {employerBilling.plan?.searches_limit ?? '∞'} searches</span>
            </div>
          </div>
        )}
      </div>

      <div className="lp-panel">
        <h2 className="text-xl font-semibold mb-4">Profile</h2>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">{isEmployer ? 'Company' : 'Name'}</p>
            <p className="text-sm font-medium">{name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="text-sm font-medium">{userEmail}</p>
          </div>
        </div>
        <button
          type="button"
          className="lp-btn lp-btn-ghost lp-btn-sm mt-4"
          onClick={() => {
            // v3.74.0 — land on the actual editor, not just the app root.
            // v3.228.0 — the seeker side now reads the same HOME_TAB_HANDOFF_KEY
            // handoff every other cross-page tab link uses (Profile is a real
            // tab inside the unified sidebar now, not a separate /resume-hub
            // shell); EmployerHub still reads its own 'ayn_open_tab' key, so
            // the employer branch here is untouched.
            if (isEmployer) {
              sessionStorage.setItem('ayn_open_tab', 'company');
            } else {
              sessionStorage.setItem(HOME_TAB_HANDOFF_KEY, 'profile');
            }
            navigate('/');
          }}
        >
          {isEmployer ? 'Edit company profile' : 'Edit in Profile'} <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="lp-panel">
        <h2 className="text-xl font-semibold mb-6">Security</h2>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-0.5">
            <p className="font-medium">Change password</p>
            <p className="text-sm text-muted-foreground">We'll email you a reset link.</p>
          </div>
          <button type="button" className="lp-btn lp-btn-ghost lp-btn-sm" onClick={handlePasswordReset} disabled={changingPassword}>
            {changingPassword
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
              : <><Key className="h-4 w-4" /> Change password</>}
          </button>
        </div>
      </div>
    </div>
  );
};
