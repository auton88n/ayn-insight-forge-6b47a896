// v3.325.0 — stage 15+ of the monolith reorganization: the shared request
// context every "NEW ACTIONS"-era handler (plans_list onward, the actions
// that already share one userId/adminForNew instead of each building its
// own local admin client) needs, bundled into one object so extracted
// domain files take a single, explicit parameter instead of a long,
// easy-to-drift argument list. This is a type only -- the actual admin
// client, wrapper closures (isApprovedEmployer/assertOrgMember/
// assertOrgProfileComplete/finaliseAssessment/isPlatformAdmin) are still
// built in index.ts (they need the real request's env/service-role key),
// then packaged into one ActionCtx and passed down. No logic lives here.
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2.45.0";

export type ActionCtx = {
  req: Request;
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  action: string;
  payload: Record<string, unknown>;
  jwt: string;
  reqIp: string | null;
  /** RLS-respecting client, authenticated as the caller via their own JWT. */
  supa: SupabaseClient;
  user: User;
  userId: string;
  /** Service-role client (was `adminForNew` inline). */
  admin: SupabaseClient;
  isApprovedEmployer: () => Promise<boolean>;
  assertOrgMember: (orgId: string) => Promise<boolean>;
  assertOrgProfileComplete: (orgId: string) => Promise<Response | null>;
  finaliseAssessment: (assessmentId: string) => Promise<void>;
  isPlatformAdmin: () => Promise<boolean>;
};
