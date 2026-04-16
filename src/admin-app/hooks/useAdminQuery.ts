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
import { toast } from 'sonner';

// ─── Spine admin API wrapper ─────────────────────────────────
import { adminApi } from '@/lib/spineApi';

// Map old RPC names to new spine endpoints
async function adminRpc<T = unknown>(
  fnName: string,
  params?: Record<string, unknown>
): Promise<T> {
  const map: Record<string, () => Promise<any>> = {
    'get_admin_users':              () => adminApi.getUsers(),
    'get_admin_dashboard_stats':    () => adminApi.getStats(),
    'get_admin_conversations':      () => adminApi.getConversations(),
    'get_admin_error_monitoring':   () => adminApi.getErrors(undefined, 'open').then(errors => ({ errors, resolutions: [] })),
    'get_admin_subscriptions':      () => adminApi.getSubscriptions(),
    'get_admin_contact_messages':   () => adminApi.getContactMessages(),
    'get_admin_beta_feedback':      () => adminApi.getBetaFeedback(),
    'get_admin_ai_limits':          () => adminApi.getUsers(),
    'get_admin_activity_log':       () => Promise.resolve([]),
    'get_admin_churn_alerts':       () => Promise.resolve([]),
    'get_admin_credit_gifts':       () => Promise.resolve([]),
    'get_admin_custom_orders':      () => Promise.resolve([]),
    'get_admin_applications':       () => Promise.resolve([]),
    'get_admin_nda_agreements':     () => Promise.resolve([]),
    'get_admin_support_tickets':    () => Promise.resolve([]),
    'get_admin_message_ratings':    () => Promise.resolve([]),
    'get_admin_system_config':      () => adminApi.getHealth(),
    'get_admin_system_monitoring':  () => adminApi.getHealth(),
    'get_admin_llm_management':     () => Promise.resolve([]),
    'get_admin_ai_cost_stats':      () => Promise.resolve({ total_cost: 0, by_model: [] }),
    'get_admin_user_growth':        () => Promise.resolve([]),
    'get_admin_visitor_analytics':  () => Promise.resolve([]),
    'get_admin_rate_limit_stats':   () => Promise.resolve([]),
    'get_admin_notification_log':   () => Promise.resolve([]),
    'get_admin_email_broadcast_users': () => adminApi.getUsers(),
    'get_admin_terms_consent':      () => Promise.resolve([]),
    'get_admin_test_results_data':  () => Promise.resolve({ results: [], runs: [] }),
  };

  const fn = map[fnName];
  if (!fn) {
    console.warn(`[adminRpc] Unknown function: ${fnName}`);
    return [] as any;
  }
  return fn() as Promise<T>;
}

// ─── Admin query keys (centralized for easy invalidation) ───
export const adminKeys = {
  all: ['admin'] as const,
  dashboard: () => [...adminKeys.all, 'dashboard'] as const,
  users: () => [...adminKeys.all, 'users'] as const,
  applications: () => [...adminKeys.all, 'applications'] as const,
  systemConfig: () => [...adminKeys.all, 'systemConfig'] as const,
  supportTickets: () => [...adminKeys.all, 'supportTickets'] as const,
  analytics: (days: number) => [...adminKeys.all, 'analytics', days] as const,
  aiCosts: () => [...adminKeys.all, 'aiCosts'] as const,
  aiLimits: () => [...adminKeys.all, 'aiLimits'] as const,
  errorMonitoring: () => [...adminKeys.all, 'errorMonitoring'] as const,
  activityLog: () => [...adminKeys.all, 'activityLog'] as const,
  conversations: () => [...adminKeys.all, 'conversations'] as const,
  subscriptions: () => [...adminKeys.all, 'subscriptions'] as const,
  creditGifts: () => [...adminKeys.all, 'creditGifts'] as const,
  betaFeedback: () => [...adminKeys.all, 'betaFeedback'] as const,
  messageFeedback: () => [...adminKeys.all, 'messageRatings'] as const,
  testResults: () => [...adminKeys.all, 'testResults'] as const,
  userGrowth: () => [...adminKeys.all, 'userGrowth'] as const,
  churnAlerts: () => [...adminKeys.all, 'churnAlerts'] as const,
  llmManagement: () => [...adminKeys.all, 'llmManagement'] as const,
  ndaAgreements: () => [...adminKeys.all, 'ndaAgreements'] as const,
  customOrders: () => [...adminKeys.all, 'customOrders'] as const,
  emailBroadcast: () => [...adminKeys.all, 'emailBroadcast'] as const,
  contactMessages: () => [...adminKeys.all, 'contactMessages'] as const,
  termsConsent: () => [...adminKeys.all, 'termsConsent'] as const,
  notificationLog: () => [...adminKeys.all, 'notificationLog'] as const,
  revenue: () => [...adminKeys.all, 'revenue'] as const,
  systemMonitoring: () => [...adminKeys.all, 'systemMonitoring'] as const,
  rateLimits: () => [...adminKeys.all, 'rateLimits'] as const,
  twitterPosts: () => [...adminKeys.all, 'twitterPosts'] as const,
} as const;

// Shared stale time: 5 min for admin data (it's not real-time critical)
const ADMIN_STALE_TIME = 5 * 60 * 1000;
// Faster stale time for real-time-ish data  
const FAST_STALE_TIME = 60 * 1000;

// ─── Individual query hooks ─────────────────────────────────

export function useAdminDashboard() {
  return useQuery({
    queryKey: adminKeys.dashboard(),
    queryFn: () => adminRpc('get_admin_dashboard_stats'),
    staleTime: FAST_STALE_TIME,
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: adminKeys.users(),
    queryFn: () => adminRpc('get_admin_users'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminApplications() {
  return useQuery({
    queryKey: adminKeys.applications(),
    queryFn: () => adminRpc('get_admin_applications'),
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

export function useAdminAnalytics(days = 30) {
  return useQuery({
    queryKey: adminKeys.analytics(days),
    queryFn: () => adminRpc('get_admin_visitor_analytics', { p_days: days }),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminAICosts() {
  return useQuery({
    queryKey: adminKeys.aiCosts(),
    queryFn: () => adminRpc('get_admin_ai_cost_stats'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminAILimits() {
  return useQuery({
    queryKey: adminKeys.aiLimits(),
    queryFn: () => adminRpc('get_admin_ai_limits'),
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

// Raw error logs with source filtering (spine, edge functions, frontend)
export function useRawErrorLogs(source?: string) {
  return useQuery({
    queryKey: [...adminKeys.errorMonitoring(), 'raw', source],
    queryFn: () => adminApi.getErrors(source, 'open'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useAdminActivityLog() {
  return useQuery({
    queryKey: adminKeys.activityLog(),
    queryFn: () => adminRpc('get_admin_activity_log', { p_limit: 500 }),
    staleTime: FAST_STALE_TIME,
  });
}

export function useAdminConversations() {
  return useQuery({
    queryKey: adminKeys.conversations(),
    queryFn: () => adminRpc('get_admin_conversations'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminSubscriptions() {
  return useQuery({
    queryKey: adminKeys.subscriptions(),
    queryFn: () => adminRpc('get_admin_subscriptions'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminCreditGifts() {
  return useQuery({
    queryKey: adminKeys.creditGifts(),
    queryFn: () => adminRpc('get_admin_credit_gifts'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminBetaFeedback() {
  return useQuery({
    queryKey: adminKeys.betaFeedback(),
    queryFn: () => adminRpc('get_admin_beta_feedback'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminMessageFeedback() {
  return useQuery({
    queryKey: adminKeys.messageFeedback(),
    queryFn: () => adminRpc('get_admin_message_ratings'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminTestResults() {
  return useQuery({
    queryKey: adminKeys.testResults(),
    queryFn: () => adminRpc('get_admin_test_results_data'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminUserGrowth() {
  return useQuery({
    queryKey: adminKeys.userGrowth(),
    queryFn: () => adminRpc('get_admin_user_growth'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminChurnAlerts() {
  return useQuery({
    queryKey: adminKeys.churnAlerts(),
    queryFn: () => adminRpc('get_admin_churn_alerts'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminLLMManagement() {
  return useQuery({
    queryKey: adminKeys.llmManagement(),
    queryFn: () => adminRpc('get_admin_llm_management'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminNDAList() {
  return useQuery({
    queryKey: adminKeys.ndaAgreements(),
    queryFn: () => adminRpc('get_admin_nda_agreements'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminCustomOrders() {
  return useQuery({
    queryKey: adminKeys.customOrders(),
    queryFn: () => adminRpc('get_admin_custom_orders'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminEmailBroadcast() {
  return useQuery({
    queryKey: adminKeys.emailBroadcast(),
    queryFn: () => adminRpc('get_admin_email_broadcast_users'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminContactMessages() {
  return useQuery({
    queryKey: adminKeys.contactMessages(),
    queryFn: () => adminRpc('get_admin_contact_messages', { p_limit: 200 }),
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

export function useAdminNotificationLog() {
  return useQuery({
    queryKey: adminKeys.notificationLog(),
    queryFn: () => adminRpc('get_admin_notification_log'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminRevenue() {
  return useQuery({
    queryKey: adminKeys.revenue(),
    queryFn: () => adminRpc('get_admin_subscriptions'),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminSystemMonitoring() {
  return useQuery({
    queryKey: adminKeys.systemMonitoring(),
    queryFn: () => adminRpc('get_admin_system_monitoring'),
    staleTime: FAST_STALE_TIME,
  });
}

export function useAdminRateLimits() {
  return useQuery({
    queryKey: adminKeys.rateLimits(),
    queryFn: () => adminRpc('get_admin_rate_limit_stats'),
    staleTime: FAST_STALE_TIME,
  });
}

export function useAdminUserMessages(userId: string | null) {
  return useQuery({
    queryKey: [...adminKeys.conversations(), 'user', userId],
    queryFn: () => adminRpc('get_admin_user_messages', { p_user_id: userId, p_limit: 200 }),
    enabled: !!userId,
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
