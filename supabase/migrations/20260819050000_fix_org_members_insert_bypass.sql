-- CRITICAL FIX, found live during a deep isolation test sweep, confirmed
-- exploitable end to end before being fixed. org_members_insert_self's own
-- WITH CHECK only verified (auth.uid() = user_id) -- it never restricted
-- which org_id the row could target. Any approved employer could insert
-- {org_id: <any other org>, user_id: <themselves>, role: 'admin'} directly
-- via the real PostgREST REST endpoint and instantly become an admin
-- member of a company they have no relationship to.
--
-- Reproduced live: a real second employer account inserted itself into a
-- real first employer's org via a genuine POST /rest/v1/org_members call
-- (201 Created), then immediately called employer_reveal_status (a normal,
-- unmodified resume-hub action) and read the first employer's real sent
-- proposals, including a real accepted candidate's real email address --
-- a full cross-tenant breach through assertOrgMember, the single choke
-- point ~14 other org-scoped actions all trust.
--
-- Fixed by removing the policy entirely rather than trying to scope it
-- correctly: grepped every frontend and edge-function write site first --
-- zero client code anywhere inserts into org_members directly. The only
-- real writer is resume-hub's employer_org_create, which uses the
-- service-role client (bypasses RLS) and already gates org creation on
-- isApprovedEmployer() before ever inserting the creator as the org's
-- first member. This policy had no legitimate caller to begin with.
--
-- Also found and tightened while here: org_members had a blanket
-- GRANT ALL (insert/update/delete/truncate/references/trigger) to both
-- anon and authenticated, far broader than any RLS policy on this table
-- actually uses. UPDATE/DELETE were already safe in practice (zero
-- policies, RLS on means deny-by-default -- the same pattern
-- blueprint.md documents and has verified before), but a grant this
-- wide is a landmine for the next policy added to this table. Narrowed
-- to exactly what's used: SELECT only for authenticated, nothing for
-- anon (anon has no legitimate reason to see anyone's org membership).

drop policy if exists "org_members_insert_self" on public.org_members;

revoke insert, update, delete, truncate, references, trigger on public.org_members from authenticated;
revoke all on public.org_members from anon;
grant select on public.org_members to authenticated;
