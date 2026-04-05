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
  // Ensure we have a valid session — refresh if needed
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    throw new Error('Admin session expired. Please log in again.');
  }

  const { data, error } = params
    ? await supabase.rpc(fnName, params)
    : await supabase.rpc(fnName);

  if (error) {
    // Log the actual PostgREST error for debugging
    console.error(`[adminRpc] ${fnName} failed:`, error.code, error.message, error.details);
    throw new Error(error.message);
  }
  return data as T;
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
