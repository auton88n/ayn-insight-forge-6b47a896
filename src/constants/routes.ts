/**
 * Application route constants
 * Centralized route definitions for type-safe navigation
 */

export const ROUTES = {
  HOME: '/',
  SETTINGS: '/settings',
  SUPPORT: '/support',
  PRICING: '/pricing',
  SOLUTIONS: '/solutions',
  CONTACT: '/contact',
  
  CHART_ANALYZER: '/chart-analyzer',
  ADMIN: '/admin',
  RESET_PASSWORD: '/reset-password',
  WORLD_INTELLIGENCE: '/world-intelligence',
  ADMIN_CUSTOM_ORDERS: '/admin/custom-orders',
  APPROVAL_RESULT: '/approval-result',
  SUBSCRIPTION_SUCCESS: '/subscription-success',
  SUBSCRIPTION_CANCELED: '/subscription-canceled',
  TERMS: '/terms',
  PRIVACY: '/privacy',
  SOLUTION_PAGES: {
    AI_EMPLOYEE: '/solutions/ai-employee',
    AI_EMPLOYEE_APPLY: '/solutions/ai-employee/apply',
    AI_AGENTS: '/solutions/ai-agents',
    AI_AGENTS_APPLY: '/solutions/ai-agents/apply',
    AUTOMATION: '/solutions/automation',
    AUTOMATION_APPLY: '/solutions/automation/apply',
    TICKETING: '/solutions/ticketing',
    TICKETING_APPLY: '/solutions/ticketing/apply',
  },
} as const;

export type RouteKey = keyof typeof ROUTES;
export type SolutionRouteKey = keyof typeof ROUTES.SOLUTION_PAGES;
