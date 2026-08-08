-- QA pass performance cleanup, from the Supabase performance advisor.
--
-- user_profile_canonical had two full sets of RLS policies covering the
-- same actions: an old set (upc_insert_own/upc_select_own/upc_update_own)
-- using raw auth.uid() -- re-evaluated per row -- and a newer set already
-- using the correct (select auth.uid()) form. Both fired on every query
-- against this hot-path table (touched on nearly every resume-hub call).
-- Dropping the old, redundant set fixes both the auth_rls_initplan finding
-- and the multiple_permissive_policies finding at once, zero behavior
-- change since the surviving policies enforce the identical rule.
drop policy if exists upc_insert_own on public.user_profile_canonical;
drop policy if exists upc_select_own on public.user_profile_canonical;
drop policy if exists upc_update_own on public.user_profile_canonical;

-- support_tickets had a duplicate admin SELECT policy: "Admins can view all
-- tickets (2)" (has_role(auth.uid(),'admin'), unwrapped) was a strict
-- subset of "Admins can view all tickets" (already covers admin OR own,
-- properly wrapped) -- pure redundant work on every read of a real, live
-- guest/admin ticket table.
drop policy if exists "Admins can view all tickets (2)" on public.support_tickets;

-- Duplicate indexes: idx_extension_link_codes_code duplicated the unique
-- constraint extension_link_codes_code_key (both on code); idx_extension_
-- link_codes_expires duplicated extension_link_codes_expires (both on
-- expires_at). Keeping one of each.
drop index if exists public.idx_extension_link_codes_code;
drop index if exists public.idx_extension_link_codes_expires;

-- Missing FK indexes on real, live, frequently-joined tables.
create index if not exists idx_employer_searches_created_by on public.employer_searches (created_by);
create index if not exists idx_employer_searches_org_id on public.employer_searches (org_id);
create index if not exists idx_subscriptions_plan_key on public.subscriptions (plan_key);
