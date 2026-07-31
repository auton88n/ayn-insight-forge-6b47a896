/**
 * Admin data-fetching hooks using React Query.
 * Replaces manual useState + useEffect + supabase.rpc() patterns
 * with cached, stale-while-revalidate, background-refetch queries.
 * 
 * Benefits:
 * - Tab-switch is instant (data served from cache)
 * - Background refetch keeps data fresh
 * - No duplicate requests
 * - Skeleton loading states (isLoading only on first fetch)
 * - invalidateQueries replaces refreshKey unmount hack
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminSupabase as supabase } from '../adminSupabase';
import { toast } from 'sonner';

// ─── Generic RPC wrapper ────────────────────────────────────
type RpcName = string;

async function adminRpc<T = unknown>(
  fnName: RpcName,
  params?: Record<string, unknown>
): Promise<T> {
  // Explicitly get the admin session and set the auth header
  // This prevents the "Multiple GoTrueClient" issue where the main app's
  // session could override the admin session at the PostgREST level
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error('Admin session expired. Please log in again.');
  }

  // Use fetch directly with explicit Authorization header to bypass GoTrueClient conflicts
  const SUPABASE_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw';

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`,
      'Prefer': 'return=representation',
    },
    body: params ? JSON.stringify(params) : '{}',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    console.error(`[adminRpc] ${fnName} failed (${response.status}):`, errorBody);
    throw new Error(errorBody.message || `RPC ${fnName} failed with status ${response.status}`);
  }

  const data = await response.json();
  return data as T;
}

// ─── Admin query keys (centralized for easy invalidation) ───
export const adminKeys = {
  all: ['admin'] as const,
  accounts: (search: string) => [...adminKeys.all, 'accounts', search] as const,
  systemConfig: () => [...adminKeys.all, 'systemConfig'] as const,
  supportTickets: () => [...adminKeys.all, 'supportTickets'] as const,
  aiUsage: () => [...adminKeys.all, 'aiUsage'] as const,
  errorMonitoring: () => [...adminKeys.all, 'errorMonitoring'] as const,
  emailAudience: () => [...adminKeys.all, 'emailAudience'] as const,
  termsConsent: () => [...adminKeys.all, 'termsConsent'] as const,
  rateLimits: () => [...adminKeys.all, 'rateLimits'] as const,
} as const;

// Shared stale time: 5 min for admin data (it's not real-time critical)
const ADMIN_STALE_TIME = 5 * 60 * 1000;
// Faster stale time for real-time-ish data  
const FAST_STALE_TIME = 60 * 1000;

// ─── System panes ───────────────────────────────────────────

export function useAdminAccounts(search = '') {
  return useQuery({
    queryKey: adminKeys.accounts(search),
    queryFn: () => adminRpc('get_admin_accounts', { p_search: search || null }),
    staleTime: FAST_STALE_TIME,
  });
}

export function useAdminSystemConfig() {
  return useQuery({
    queryKey: adminKeys.systemConfig(),
    queryFn: () => adminRpc('get_admin_system_config'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminSupportTickets() {
  return useQuery({
    queryKey: adminKeys.supportTickets(),
    queryFn: () => adminRpc('get_admin_support_tickets', { p_limit: 200, p_offset: 0 }),
    staleTime: FAST_STALE_TIME,
  });
}

export function useAdminAIUsage() {
  return useQuery({
    queryKey: adminKeys.aiUsage(),
    queryFn: () => adminRpc('get_admin_ai_usage'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminErrorMonitoring() {
  return useQuery({
    queryKey: adminKeys.errorMonitoring(),
    queryFn: () => adminRpc('get_admin_error_monitoring', { p_limit: 500 }),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminEmailAudience() {
  return useQuery({
    queryKey: adminKeys.emailAudience(),
    queryFn: () => adminRpc('get_admin_email_audience'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminTermsConsent() {
  return useQuery({
    queryKey: adminKeys.termsConsent(),
    queryFn: () => adminRpc('get_admin_terms_consent'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminRateLimits() {
  return useQuery({
    queryKey: adminKeys.rateLimits(),
    queryFn: () => adminRpc('get_admin_rate_limit_stats'),
    staleTime: FAST_STALE_TIME,
  });
}


// ─── Refresh helper (replaces refreshKey) ───────────────────
export function useAdminRefresh() {
  const queryClient = useQueryClient();

  return {
    /** Invalidate everything — all admin data refetches in background */
    refreshAll: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.all });
    },
    /** Invalidate specific section */
    refresh: (key: readonly unknown[]) => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  };
}

// ─── Mutation hooks (for writes) ────────────────────────────
export function useAdminMutation<TVariables = unknown>(
  mutationFn: (vars: TVariables) => Promise<unknown>,
  invalidateKeys?: readonly unknown[],
  successMessage?: string
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      if (invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: invalidateKeys });
      }
      if (successMessage) {
        toast.success(successMessage);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Operation failed');
    },
  });
}

// ─── v3.20.0 new admin: six sections ────────────────────────
export const adminV2Keys = {
  overview: ['admin', 'v2', 'overview'] as const,
  employers: ['admin', 'v2', 'employers'] as const,
  candidates: ['admin', 'v2', 'candidates'] as const,
  marketplace: ['admin', 'v2', 'marketplace'] as const,
  money: ['admin', 'v2', 'money'] as const,
};

export function useAdminOverview() {
  return useQuery({ queryKey: adminV2Keys.overview, queryFn: () => adminRpc<any>('get_admin_overview'), staleTime: FAST_STALE_TIME });
}
export function useAdminEmployers() {
  return useQuery({ queryKey: adminV2Keys.employers, queryFn: () => adminRpc<any>('get_admin_employers'), staleTime: FAST_STALE_TIME });
}
export function useAdminCandidates() {
  return useQuery({ queryKey: adminV2Keys.candidates, queryFn: () => adminRpc<any>('get_admin_candidates'), staleTime: ADMIN_STALE_TIME });
}
export function useAdminMarketplace() {
  return useQuery({ queryKey: adminV2Keys.marketplace, queryFn: () => adminRpc<any>('get_admin_marketplace'), staleTime: ADMIN_STALE_TIME });
}
export function useAdminMoney() {
  return useQuery({ queryKey: adminV2Keys.money, queryFn: () => adminRpc<any>('get_admin_money'), staleTime: ADMIN_STALE_TIME });
}

export function useEmployerAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { fn: 'admin_employer_approve' | 'admin_employer_decline' | 'admin_employer_override'; params: Record<string, unknown> }) =>
      adminRpc(v.fn, v.params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminV2Keys.employers });
      qc.invalidateQueries({ queryKey: adminV2Keys.overview });
      toast.success('Done');
    },
    onError: (e: Error) => toast.error(e.message || 'Action failed'),
  });
}

export function useMarkCandidatesStale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => adminRpc('admin_mark_candidates_stale', { p_user_ids: ids }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: adminV2Keys.candidates }); toast.success('Queued for reindex'); },
    onError: (e: Error) => toast.error(e.message || 'Reindex failed'),
  });
}
