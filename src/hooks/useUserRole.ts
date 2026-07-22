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
      // Cast: profiles.role and employer_accounts are absent from generated
      // types until the migration is applied and types.ts is regenerated.
      const profQ = supabase.from('profiles').select('role').eq('user_id', userId).maybeSingle();
      const { data: prof } = await (profQ as unknown as Promise<{ data: { role?: UserRole } | null }>);
      const r = (prof?.role ?? 'job_seeker') as UserRole;
      setRole(r);
      if (r === 'employer') {
        const empQ = supabase.from('employer_accounts' as never).select('status, company_name').eq('user_id', userId).maybeSingle();
        const { data: emp } = await (empQ as unknown as Promise<{ data: { status?: EmployerStatus; company_name?: string } | null }>);
        setEmployerStatus(emp?.status ?? 'pending_approval');
        setCompanyName(emp?.company_name ?? null);
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
