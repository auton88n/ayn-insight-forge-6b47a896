// v3.25.0 — maintenance switches, client side.
// When the admin turns a switch off, resume-hub answers 503 with
// { code: "feature_disabled", feature, message }. The api wrappers turn that
// into this error so a surface can show the real message in place of the
// feature instead of a raw "Request failed" toast.
import { refreshFeatureFlags, type FeatureKey } from '@/hooks/useFeatureFlags';

export class FeatureDisabledError extends Error {
  readonly feature: FeatureKey;
  constructor(feature: FeatureKey, message: string) {
    super(message || 'This part of AYN is under maintenance.');
    this.name = 'FeatureDisabledError';
    this.feature = feature;
  }
}

export function isFeatureDisabled(e: unknown): e is FeatureDisabledError {
  return e instanceof FeatureDisabledError;
}

/**
 * Reads a failed response body and, when it is a maintenance answer, refreshes
 * the cached flags (so the surface repaints as switched off) and returns the
 * error to throw. Returns null for every other failure.
 */
export function maintenanceErrorFrom(payload: unknown): FeatureDisabledError | null {
  const p = (payload || {}) as { code?: string; feature?: string; message?: string };
  if (p.code !== 'feature_disabled') return null;
  void refreshFeatureFlags();
  return new FeatureDisabledError((p.feature || 'platform') as FeatureKey, String(p.message || ''));
}
