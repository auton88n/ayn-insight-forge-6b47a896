// v2.10.0 — Fetch the current user's role and employer status.
// job_seeker (default): full access to Resume Hub + AYN dashboard.
// employer: gated on employer_accounts.status until admin approves.
//
// Performance fix — this hook is the first of two sequential, uncached
// full-screen gates every signed-in remount of <Index> pays (the other is
// LegalConsentGate). Measured live against the real production backend:
// this one query alone averages 600-850ms round trip, and it re-ran from
// a cold `loading: true` on EVERY call site's every mount, with zero
// caching and zero sharing between the four independent call sites
// (Index.tsx, Employers.tsx, PrivacySettings.tsx, AccountPreferences.tsx)
// -- so navigating away to any other top-level route (its own lazy
// chunk) and back to "/" re-paid this cost from scratch every time,
// behind a full-screen <AYNLoader/>, reported directly as "loading when
// I go from page to another." A role can't change mid-session under any
// normal use, so it's cached module-level the same way Index.tsx's own
// auth-session cache already is, and cleared on sign-out so a different
// account signing in on the same tab never sees a stale cached role.
// `refresh` still forces a real re-fetch and updates the cache too, for
// the one legitimate case a role genuinely could change underneath a
// still-open tab (an admin approving/declining the account elsewhere).
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'job_seeker' | 'employer';
export type EmployerStatus = 'pending_approval' | 'approved' | 'declined' | 'suspended';

export interface UserRoleState {
  loading: boolean;
  role: UserRole;
  employerStatus: EmployerStatus | null;
  companyName: string | null;
  refresh: () => Promise<void>;
}

interface CachedRole {
  userId: string;
  role: UserRole;
  employerStatus: EmployerStatus | null;
  companyName: string | null;
}
let cachedRole: CachedRole | null = null;

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') cachedRole = null;
});

export function useUserRole(userId: string | undefined): UserRoleState {
  const cachedForThisUser = userId && cachedRole?.userId === userId ? cachedRole : null;
  const [loading, setLoading] = useState(!cachedForThisUser);
  const [role, setRole] = useState<UserRole>(cachedForThisUser?.role ?? 'job_seeker');
  const [employerStatus, setEmployerStatus] = useState<EmployerStatus | null>(cachedForThisUser?.employerStatus ?? null);
  const [companyName, setCompanyName] = useState<string | null>(cachedForThisUser?.companyName ?? null);

  const load = async () => {
    if (!userId) { setLoading(false); return; }
    try {
      // Cast: profiles.role and employer_accounts are absent from generated
      // types until the migration is applied and types.ts is regenerated.
      const profQ = supabase.from('profiles').select('role').eq('user_id', userId).maybeSingle();
      const { data: prof } = await (profQ as unknown as Promise<{ data: { role?: UserRole } | null }>);
      const r = (prof?.role ?? 'job_seeker') as UserRole;
      setRole(r);
      let nextEmployerStatus: EmployerStatus | null = null;
      let nextCompanyName: string | null = null;
      if (r === 'employer') {
        const empQ = supabase.from('employer_accounts' as never).select('status, company_name').eq('user_id', userId).maybeSingle();
        const { data: emp } = await (empQ as unknown as Promise<{ data: { status?: EmployerStatus; company_name?: string } | null }>);
        nextEmployerStatus = emp?.status ?? 'pending_approval';
        nextCompanyName = emp?.company_name ?? null;
      }
      setEmployerStatus(nextEmployerStatus);
      setCompanyName(nextCompanyName);
      cachedRole = { userId, role: r, employerStatus: nextEmployerStatus, companyName: nextCompanyName };
    } catch {
      /* silent */
    } finally { setLoading(false); }
  };

  useEffect(() => {
    // Already have a cached answer for this exact user -- nothing to
    // fetch, skip straight to "resolved" (the useState initializers
    // above already seeded the visible values from it).
    if (userId && cachedRole?.userId === userId) { setLoading(false); return; }
    load(); /* eslint-disable-next-line */
  }, [userId]);

  return { loading, role, employerStatus, companyName, refresh: load };
}
