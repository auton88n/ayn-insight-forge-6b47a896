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
import { adminSupabase as supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../adminSupabase';
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

  // Use fetch directly with explicit Authorization header to bypass GoTrueClient conflicts.
  // SUPABASE_URL/SUPABASE_ANON_KEY come from adminSupabase.ts (env var first,
  // Cloud as fallback) — this used to hardcode its own second copy pinned to
  // Cloud, which a self-hosted build's CSP now blocks outright (v3.159.0).
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
  supportTickets: () => [...adminKeys.all, 'supportTickets'] as const,
  aiUsage: () => [...adminKeys.all, 'aiUsage'] as const,
  errorMonitoring: () => [...adminKeys.all, 'errorMonitoring'] as const,
  emailAudience: () => [...adminKeys.all, 'emailAudience'] as const,
  termsConsent: () => [...adminKeys.all, 'termsConsent'] as const,
  cookieConsent: () => [...adminKeys.all, 'cookieConsent'] as const,
  rateLimits: () => [...adminKeys.all, 'rateLimits'] as const,
  inbox: () => [...adminKeys.all, 'inbox'] as const,
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

export function useAdminCookieConsent() {
  return useQuery({
    queryKey: adminKeys.cookieConsent(),
    queryFn: () => adminRpc('get_admin_cookie_consent'),
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

// v3.109.0 — every real inbound email AYN has received (support@, info@,
// etc.), already captured by resend-inbound-webhook into
// inbound_email_replies, but never read by anything until now.
export function useAdminInbox() {
  return useQuery({
    queryKey: adminKeys.inbox(),
    queryFn: () => adminRpc('get_admin_inbox'),
    staleTime: FAST_STALE_TIME,
  });
}

export function useMarkInboxRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; read: boolean }) =>
      adminRpc('admin_mark_inbox_read', { p_id: v.id, p_read: v.read }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.inbox() }),
    onError: (e: Error) => toast.error(e.message || 'Could not update'),
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

// ─── v3.23.0 admin controls: moderation, kill switches, credits ────────
export const adminControlKeys = {
  moderation: ['admin', 'v2', 'moderation'] as const,
  flags: ['admin', 'v2', 'flags'] as const,
  snapshot: (id: string) => ['admin', 'v2', 'snapshot', id] as const,
  admins: ['admin', 'v2', 'admins'] as const,
  activityLog: ['admin', 'v2', 'activityLog'] as const,
  emailLog: ['admin', 'v2', 'emailLog'] as const,
  plans: ['admin', 'v2', 'plans'] as const,
  extDiagnostics: ['admin', 'v2', 'extDiagnostics'] as const,
};

export function useAdminModeration() {
  return useQuery({
    queryKey: adminControlKeys.moderation,
    queryFn: () => adminRpc<any>('get_admin_moderation', { p_limit: 60 }),
    staleTime: FAST_STALE_TIME,
  });
}

export function useModerateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { kind: 'proposal' | 'assessment'; id: string; note?: string }) =>
      v.kind === 'proposal'
        ? adminRpc('admin_moderate_proposal', { p_id: v.id, p_action: 'cancel', p_note: v.note ?? null })
        : adminRpc('admin_moderate_assessment', { p_id: v.id, p_note: v.note ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminControlKeys.moderation });
      qc.invalidateQueries({ queryKey: adminV2Keys.marketplace });
      toast.success('Cancelled');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not cancel'),
  });
}

export function useAdminFeatureFlags() {
  return useQuery({
    queryKey: adminControlKeys.flags,
    queryFn: () => adminRpc<any>('get_admin_feature_flags'),
    staleTime: FAST_STALE_TIME,
  });
}

export function useSetFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { key: string; enabled: boolean }) =>
      adminRpc('admin_set_feature_flag', { p_key: v.key, p_enabled: v.enabled }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: adminControlKeys.flags }); toast.success('Saved'); },
    onError: (e: Error) => toast.error(e.message || 'Could not save'),
  });
}

export function useSetFeatureMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { key: string; message: string }) =>
      adminRpc('admin_set_feature_message', { p_key: v.key, p_message: v.message }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: adminControlKeys.flags }); toast.success('Maintenance note saved'); },
    onError: (e: Error) => toast.error(e.message || 'Could not save'),
  });
}


export function useAdjustCredits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { userId: string; amount: number; reason: string }) =>
      adminRpc<any>('admin_adjust_credits', { p_user_id: v.userId, p_amount: v.amount, p_reason: v.reason }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: adminKeys.all });
      toast.success(`New balance: ${res?.balance ?? '—'}`);
    },
    onError: (e: Error) => toast.error(e.message || 'Adjustment failed'),
  });
}

// v3.46.0 — who has admin access, and a way to grant/revoke it without
// touching the database by hand.
export function useAdminAdmins() {
  return useQuery({
    queryKey: adminControlKeys.admins,
    queryFn: () => adminRpc<any>('get_admin_admins'),
    staleTime: FAST_STALE_TIME,
  });
}

export function useSetAdminRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { userId: string; grant: boolean; reason: string }) =>
      adminRpc('admin_set_admin_role', { p_user_id: v.userId, p_grant: v.grant, p_reason: v.reason }),
    onSuccess: (_res, v) => {
      qc.invalidateQueries({ queryKey: adminControlKeys.admins });
      toast.success(v.grant ? 'Admin access granted' : 'Admin access removed');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not change admin access'),
  });
}

// v3.47.0 — who did what, and when. security_audit_logs has been written
// to by nearly every admin action since early on; this is the first reader.
export function useAdminActivityLog() {
  return useQuery({
    queryKey: adminControlKeys.activityLog,
    queryFn: () => adminRpc<any>('get_admin_activity_log', { p_limit: 150 }),
    staleTime: FAST_STALE_TIME,
  });
}

// v3.47.0 — whether the automatic system emails (and admin broadcasts)
// actually sent, not just that the code ran.
export function useAdminEmailLog() {
  return useQuery({
    queryKey: adminControlKeys.emailLog,
    queryFn: () => adminRpc<any>('get_admin_email_log', { p_limit: 150 }),
    staleTime: FAST_STALE_TIME,
  });
}

// v3.354.0 — the extension's own "Send diagnostics to AYN" button has
// written to ext_diagnostics since v3.296.0; this is the first reader.
export function useAdminExtDiagnostics() {
  return useQuery({
    queryKey: adminControlKeys.extDiagnostics,
    queryFn: () => adminRpc<any>('get_admin_ext_diagnostics', { p_limit: 150 }),
    staleTime: FAST_STALE_TIME,
  });
}

// v3.47.0 — editable plan fields, deliberately excluding price_cents and
// the Stripe price/product ids (see admin_update_plan's own comment for why).
export function useAdminPlans() {
  return useQuery({
    queryKey: adminControlKeys.plans,
    queryFn: () => adminRpc<any>('get_admin_plans'),
    staleTime: FAST_STALE_TIME,
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      key: string; name: string; credits: number | null; proposalsLimit: number | null;
      assessmentsLimit: number | null; searchesLimit: number | null; active: boolean;
    }) => adminRpc('admin_update_plan', {
      p_key: v.key, p_name: v.name, p_credits: v.credits, p_proposals_limit: v.proposalsLimit,
      p_assessments_limit: v.assessmentsLimit, p_searches_limit: v.searchesLimit, p_active: v.active,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminControlKeys.plans });
      qc.invalidateQueries({ queryKey: adminV2Keys.money });
      qc.invalidateQueries({ queryKey: adminControlKeys.activityLog });
      toast.success('Plan updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not update plan'),
  });
}

export function useUserSnapshot(userId: string | null) {
  return useQuery({
    queryKey: adminControlKeys.snapshot(userId || 'none'),
    queryFn: () => adminRpc<any>('admin_user_snapshot', { p_user_id: userId }),
    enabled: !!userId,
    staleTime: FAST_STALE_TIME,
  });
}

// ─── v3.28.0 account moderation ────────────────────────────
export const accountKeys = {
  detail: (id: string) => ['admin', 'v2', 'accountDetail', id] as const,
  governance: (id: string) => ['admin', 'v2', 'accountGovernance', id] as const,
};


export function useAdminAccountDetail(userId: string | null) {
  return useQuery({
    queryKey: accountKeys.detail(userId || 'none'),
    queryFn: () => adminRpc<any>('get_admin_account_detail', { p_user_id: userId }),
    enabled: !!userId,
    staleTime: 15 * 1000,
  });
}

/** Suspend, restore, or switch one capability off for one account. */
export function useAccountModeration(userId: string | null) {
  const qc = useQueryClient();
  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: accountKeys.detail(userId || 'none') });
    qc.invalidateQueries({ queryKey: adminKeys.all });
    toast.success(msg);
  };
  const fail = (e: Error) => toast.error(e.message || 'Action failed');

  const suspend = useMutation({
    mutationFn: (v: { reason: string; until: string | null }) =>
      adminRpc('admin_suspend_account', { p_user_id: userId, p_reason: v.reason, p_until: v.until }),
    onSuccess: () => done('Account suspended'),
    onError: fail,
  });

  const restore = useMutation({
    mutationFn: () => adminRpc('admin_restore_account', { p_user_id: userId }),
    onSuccess: () => done('Account restored'),
    onError: fail,
  });

  const setRestriction = useMutation({
    mutationFn: (v: { capability: string; on: boolean; reason?: string }) =>
      adminRpc('admin_set_restriction', {
        p_user_id: userId, p_capability: v.capability, p_on: v.on, p_reason: v.reason ?? null,
      }),
    onSuccess: () => done('Restrictions updated'),
    onError: fail,
  });

  return { suspend, restore, setRestriction };
}

// ─── v3.29.0 limit overrides and erasure ───────────────────

/** Plan values, the override if any, what is in force, and the erasure record. */
export function useAccountGovernance(userId: string | null) {
  return useQuery({
    queryKey: accountKeys.governance(userId || 'none'),
    queryFn: () => adminRpc<any>('get_admin_account_governance', { p_user_id: userId }),
    enabled: !!userId,
    staleTime: 15 * 1000,
  });
}

export function useAccountGovernanceActions(userId: string | null) {
  const qc = useQueryClient();
  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: accountKeys.governance(userId || 'none') });
    qc.invalidateQueries({ queryKey: accountKeys.detail(userId || 'none') });
    qc.invalidateQueries({ queryKey: adminKeys.all });
    toast.success(msg);
  };
  const fail = (e: Error) => toast.error(e.message || 'Action failed');

  const setOverride = useMutation({
    mutationFn: (v: {
      proposals_limit: number | null; assessments_limit: number | null;
      searches_limit: number | null; monthly_credits: number | null; reason: string;
    }) => adminRpc('admin_set_limit_override', {
      p_user_id: userId,
      p_proposals_limit: v.proposals_limit,
      p_assessments_limit: v.assessments_limit,
      p_searches_limit: v.searches_limit,
      p_monthly_credits: v.monthly_credits,
      p_reason: v.reason,
    }),
    onSuccess: () => done('Override saved'),
    onError: fail,
  });

  const clearOverride = useMutation({
    mutationFn: () => adminRpc('admin_clear_limit_override', { p_user_id: userId }),
    onSuccess: () => done('Override cleared, the plan applies again'),
    onError: fail,
  });

  const erase = useMutation({
    mutationFn: (v: { reason: string; confirmEmail: string }) =>
      adminRpc('admin_erase_account', {
        p_user_id: userId, p_reason: v.reason, p_confirm_email: v.confirmEmail,
      }),
    onSuccess: () => done('Account erased'),
    onError: fail,
  });

  const purge = useMutation({
    mutationFn: (v: { reason: string; confirmEmail: string }) =>
      adminRpc('admin_purge_account', {
        p_user_id: userId, p_reason: v.reason, p_confirm_email: v.confirmEmail,
      }),
    onSuccess: () => done('Account purged'),
    onError: fail,
  });

  return { setOverride, clearOverride, erase, purge };
}


