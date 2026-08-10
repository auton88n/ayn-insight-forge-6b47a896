// v3.34.0 — account self service.
//
// Deleting an account used to POST to an edge function that was removed in the
// v3.21.0 cleanup, so the button in Settings simply 404'd while the Privacy
// Policy promised the opposite. The work now happens in the database, in the
// same routine the admin erase path uses, and it only ever touches the account
// of the person calling it.
import { supabase } from '@/integrations/supabase/client';

type Rpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = ((...a: unknown[]) => (supabase.rpc as unknown as Rpc)(...(a as [string, Record<string, unknown>]))) as Rpc;

async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * What deletion removes. Shown before anyone confirms.
 *
 * v3.107.0 — this used to be one hardcoded, seeker-only list shown verbatim
 * to employers too (found live: an employer's own Settings > Privacy >
 * Delete Account dialog read "Your resume", "Saved jobs", "Your discovery
 * listing, so employers can no longer find you" -- none of which applies to
 * an employer account). erase_account_core() is role-agnostic under the
 * hood (it deletes employer_accounts/org_members, and the org itself only
 * if no teammates remain), but the copy never branched on role. Split into
 * two lists matching what erase_account_core() actually does for each role.
 */
export const DELETION_REMOVED_SEEKER = [
  'Your resume and every tailored version of it',
  'Your career profile, skills, work history and education',
  'Your cover letters and generated documents',
  'Saved jobs, match scores and Ask AYN history',
  'Your discovery listing, so employers can no longer find you',
  'Your settings, preferences and support tickets',
  'Every file you uploaded',
];

export const DELETION_REMOVED_EMPLOYER = [
  'Your own login and access to AYN',
  "Your company's profile, if you are the last person on the account",
  'Your settings, preferences and support tickets',
  'Any browser extension access tied to your account',
];

export type SelfDeleteResult = { ok: boolean; erased: boolean; candidate_ref: string; files_removed: number };

/** Deletes the signed in account. The typed email must match exactly. */
export const selfDeleteAccount = (confirmEmail: string) =>
  call<SelfDeleteResult>('self_delete_account', { p_confirm_email: confirmEmail });

/** The lighter alternative: stop being discoverable and stop every email. */
export const selfPauseAccount = () => call<{ ok: boolean; paused: boolean }>('self_pause_account');

/** Everything held about the account, as one machine readable object. */
export const selfExportAccount = () => call<Record<string, unknown>>('self_export_account');

/** Local keys the product writes. Cleared on deletion and on pause. */
export const LOCAL_KEYS = [
  'ayn_tutorial_completed',
  'ayn_visitor_id',
  'ayn_session_id',
  'password_reset_email',
];

export function clearLocalTraces() {
  for (const k of LOCAL_KEYS) {
    try { localStorage.removeItem(k); } catch { /* private mode */ }
    try { sessionStorage.removeItem(k); } catch { /* private mode */ }
  }
}

export function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
