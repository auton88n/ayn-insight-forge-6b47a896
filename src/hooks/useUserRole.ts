// v2.10.0 — Fetch the current user's role and employer status.
// job_seeker (default): full access to Resume Hub + AYN dashboard.
// employer: gated on employer_accounts.status until admin approves.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'job_seeker' | 'employer';
export type EmployerStatus = 'pending_approval' | 'approved' | 'suspended';

export interface UserRoleState {
  loading: boolean;
  role: UserRole;
  employerStatus: EmployerStatus | null;
  companyName: string | null;
  refresh: () => Promise<void>;
}

export function useUserRole(userId: string | undefined): UserRoleState {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>('job_seeker');
  const [employerStatus, setEmployerStatus] = useState<EmployerStatus | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const load = async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
      const r = ((prof as { role?: UserRole } | null)?.role ?? 'job_seeker') as UserRole;
      setRole(r);
      if (r === 'employer') {
        const { data: emp } = await supabase
          .from('employer_accounts')
          .select('status, company_name')
          .eq('user_id', userId)
          .maybeSingle();
        setEmployerStatus(((emp as { status?: EmployerStatus } | null)?.status ?? 'pending_approval'));
        setCompanyName(((emp as { company_name?: string } | null)?.company_name ?? null));
      } else {
        setEmployerStatus(null);
        setCompanyName(null);
      }
    } catch {
      /* silent */
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  return { loading, role, employerStatus, companyName, refresh: load };
}
