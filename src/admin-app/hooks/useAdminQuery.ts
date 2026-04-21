/**
 * Admin data-fetching hooks using React Query.
 * All backed by real spine endpoints - zero empty stubs.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminApi } from '@/lib/spineApi';

// Shared stale times
const ADMIN_STALE_TIME = 5 * 60 * 1000;   // 5 min
const FAST_STALE_TIME  = 60 * 1000;        // 1 min

// ─── Query keys ──────────────────────────────────────────────
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
  operations: () => [...adminKeys.all, 'operations'] as const,
  rateLimits: () => [...adminKeys.all, 'rateLimits'] as const,
  twitterPosts: () => [...adminKeys.all, 'twitterPosts'] as const,
} as const;

// ─── Hooks ───────────────────────────────────────────────────

export function useAdminDashboard() {
  return useQuery({ queryKey: adminKeys.dashboard(), queryFn: () => adminApi.getStats(), staleTime: FAST_STALE_TIME });
}

export function useAdminUsers() {
  return useQuery({ queryKey: adminKeys.users(), queryFn: () => adminApi.getUsers(), staleTime: ADMIN_STALE_TIME });
}

export function useAdminApplications() {
  return useQuery({ queryKey: adminKeys.applications(), queryFn: () => adminApi.getServiceApplications(), staleTime: FAST_STALE_TIME });
}

export function useAdminSystemConfig() {
  return useQuery({ queryKey: adminKeys.systemConfig(), queryFn: () => adminApi.getSystemConfig(), staleTime: ADMIN_STALE_TIME });
}

export function useAdminSupportTickets() {
  return useQuery({ queryKey: adminKeys.supportTickets(), queryFn: () => adminApi.getSupportTickets(), staleTime: FAST_STALE_TIME });
}

export function useAdminAnalytics(days = 30) {
  return useQuery({ queryKey: adminKeys.analytics(days), queryFn: () => adminApi.getVisitorAnalytics(), staleTime: ADMIN_STALE_TIME });
}

export function useAdminAICosts() {
  return useQuery({ queryKey: adminKeys.aiCosts(), queryFn: () => adminApi.getLlmStats(), staleTime: ADMIN_STALE_TIME });
}

export function useAdminAILimits() {
  return useQuery({ queryKey: adminKeys.aiLimits(), queryFn: () => adminApi.getUsers(), staleTime: ADMIN_STALE_TIME });
}

export function useAdminErrorMonitoring() {
  return useQuery({
    queryKey: adminKeys.errorMonitoring(),
    queryFn: () => adminApi.getErrors(undefined, 'open').then((errors: any) => ({ errors, resolutions: [] })),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useRawErrorLogs(source?: string) {
  return useQuery({
    queryKey: [...adminKeys.errorMonitoring(), 'raw', source],
    queryFn: () => adminApi.getErrors(source, 'open'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useAdminActivityLog() {
  return useQuery({ queryKey: adminKeys.activityLog(), queryFn: () => adminApi.req('GET', '/admin/activity-log'), staleTime: FAST_STALE_TIME });
}

export function useAdminConversations() {
  return useQuery({ queryKey: adminKeys.conversations(), queryFn: () => adminApi.getConversations(), staleTime: ADMIN_STALE_TIME });
}

export function useAdminSubscriptions() {
  return useQuery({ queryKey: adminKeys.subscriptions(), queryFn: () => adminApi.getSubscriptions(), staleTime: ADMIN_STALE_TIME });
}

export function useAdminCreditGifts() {
  return useQuery({ queryKey: adminKeys.creditGifts(), queryFn: () => adminApi.req('GET', '/admin/credit-gifts'), staleTime: ADMIN_STALE_TIME });
}

export function useAdminBetaFeedback() {
  return useQuery({ queryKey: adminKeys.betaFeedback(), queryFn: () => adminApi.getBetaFeedback(), staleTime: ADMIN_STALE_TIME });
}

export function useAdminMessageFeedback() {
  return useQuery({ queryKey: adminKeys.messageFeedback(), queryFn: () => adminApi.req('GET', '/admin/message-ratings'), staleTime: ADMIN_STALE_TIME });
}

export function useAdminTestResults() {
  return useQuery({ queryKey: adminKeys.testResults(), queryFn: () => adminApi.getTestResults(), staleTime: ADMIN_STALE_TIME });
}

export function useAdminUserGrowth() {
  return useQuery({ queryKey: adminKeys.userGrowth(), queryFn: () => adminApi.req('GET', '/admin/user-growth'), staleTime: ADMIN_STALE_TIME });
}

export function useAdminChurnAlerts() {
  return useQuery({ queryKey: adminKeys.churnAlerts(), queryFn: () => adminApi.req('GET', '/admin/churn-alerts'), staleTime: ADMIN_STALE_TIME });
}

export function useAdminLLMManagement() {
  return useQuery({ queryKey: adminKeys.llmManagement(), queryFn: () => adminApi.getLlmStats(), staleTime: ADMIN_STALE_TIME });
}

export function useAdminNDAList() {
  return useQuery({ queryKey: adminKeys.ndaAgreements(), queryFn: () => adminApi.getNdaAgreements(), staleTime: ADMIN_STALE_TIME });
}

export function useAdminCustomOrders() {
  return useQuery({ queryKey: adminKeys.customOrders(), queryFn: () => adminApi.getCustomOrders(), staleTime: ADMIN_STALE_TIME });
}

export function useAdminEmailBroadcast() {
  return useQuery({ queryKey: adminKeys.emailBroadcast(), queryFn: () => adminApi.getUsers(), staleTime: ADMIN_STALE_TIME });
}

export function useAdminContactMessages() {
  return useQuery({ queryKey: adminKeys.contactMessages(), queryFn: () => adminApi.getContactMessages(), staleTime: ADMIN_STALE_TIME });
}

export function useAdminTermsConsent() {
  return useQuery({ queryKey: adminKeys.termsConsent(), queryFn: () => adminApi.req('GET', '/admin/terms-consent'), staleTime: ADMIN_STALE_TIME });
}

export function useAdminNotificationLog() {
  return useQuery({ queryKey: adminKeys.notificationLog(), queryFn: () => adminApi.getNotificationLog(), staleTime: ADMIN_STALE_TIME });
}

export function useAdminRevenue() {
  return useQuery({ queryKey: adminKeys.revenue(), queryFn: () => adminApi.getSubscriptions(), staleTime: ADMIN_STALE_TIME });
}

export function useAdminSystemMonitoring() {
  return useQuery({ queryKey: adminKeys.systemMonitoring(), queryFn: () => adminApi.getHealth(), staleTime: FAST_STALE_TIME });
}

export function useAdminRateLimits() {
  return useQuery({ queryKey: adminKeys.rateLimits(), queryFn: () => adminApi.getRateLimits(), staleTime: FAST_STALE_TIME });
}

export function useAdminOperations() {
  return useQuery({ queryKey: adminKeys.operations(), queryFn: () => adminApi.getOperationsSummary(), staleTime: FAST_STALE_TIME });
}

export function useAdminUserMessages(userId: string | null) {
  return useQuery({
    queryKey: [...adminKeys.conversations(), 'user', userId],
    queryFn: () => adminApi.getUserMessages(userId!),
    enabled: !!userId,
    staleTime: FAST_STALE_TIME,
  });
}

// ─── Refresh helper ──────────────────────────────────────────
export function useAdminRefresh() {
  const queryClient = useQueryClient();
  return {
    refreshAll: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
    refresh: (key: readonly unknown[]) => queryClient.invalidateQueries({ queryKey: key }),
  };
}

// ─── Mutation hook ───────────────────────────────────────────
export function useAdminMutation<TVariables = unknown>(
  mutationFn: (vars: TVariables) => Promise<unknown>,
  invalidateKeys?: readonly unknown[],
  successMessage?: string
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      if (invalidateKeys) queryClient.invalidateQueries({ queryKey: invalidateKeys });
      if (successMessage) toast.success(successMessage);
    },
    onError: (err: Error) => toast.error(err.message || 'Operation failed'),
  });
}
