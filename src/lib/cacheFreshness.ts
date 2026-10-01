/**
 * Freshness-classified cache durations for TanStack Query.
 * Per blueprint: classify data by volatility, not one-size-fits-all.
 */

export const CACHE_FRESHNESS = {
  /** Auth, session, access grants — must be near-real-time */
  REALTIME: 15 * 1000,              // 15 seconds

  /** User profile, settings — changes rarely */
  USER_PROFILE: 5 * 60 * 1000,      // 5 minutes

  /** Dashboard summaries, admin stats — moderate volatility */
  DASHBOARD: 2 * 60 * 1000,         // 2 minutes

  /** Chat messages — invalidation-based, keep stale briefly */
  MESSAGES: 30 * 1000,              // 30 seconds

  /** World intelligence, market snapshots — batch-updated every 4h */
  INTELLIGENCE: 30 * 60 * 1000,     // 30 minutes

  /** Static config, system settings — rarely changes */
  CONFIG: 10 * 60 * 1000,           // 10 minutes

  /** Subscription/billing data — important but not real-time */
  BILLING: 3 * 60 * 1000,           // 3 minutes
} as const;

export const GC_TIME = {
  /** Short-lived data */
  SHORT: 5 * 60 * 1000,             // 5 minutes
  /** Long-lived reference data */
  LONG: 30 * 60 * 1000,             // 30 minutes
} as const;
