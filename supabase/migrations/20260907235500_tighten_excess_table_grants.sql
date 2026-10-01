-- v3.361.0 -- defense in depth, found in the same security pass as the
-- reveal_requests fix. These three tables had far broader table-level
-- GRANTs to anon/authenticated (INSERT/UPDATE/DELETE/TRUNCATE/etc.) than
-- their actual RLS policies ever used -- not currently exploitable, since
-- RLS with no matching policy for a command denies it outright regardless
-- of the raw grant, but a needlessly wide grant is exactly the kind of
-- thing that turns a future careless policy addition into a real hole
-- instead of a safe no-op. Tightened to match what each table's real
-- policies actually authorize, same principle already applied elsewhere
-- in this schema's own history.

-- company_hiring_stats: read-only for everyone (a public "is this company
-- hiring" signal, no PII), written only by the AFTER INSERT/DELETE
-- triggers on job_postings, which run as the table owner, not as
-- anon/authenticated.
revoke insert, update, delete, truncate, references, trigger
  on public.company_hiring_stats from anon, authenticated;

-- job_postings_seen: a signed-in seeker's own "have I looked at this job"
-- marker. Only ever needs SELECT/INSERT, only ever by an authenticated
-- user -- anon has no legitimate reason to touch this table at all.
revoke all on public.job_postings_seen from anon;
revoke update, delete, truncate, references, trigger
  on public.job_postings_seen from authenticated;

-- reveal_requests: every real write (reveal_decide, inbox_set_two_way,
-- inbox_block_candidate, the initial employer_reveal_request insert) goes
-- through resume-hub's own service-role client, never direct table
-- access. Only the candidate's own SELECT policy remains after this same
-- migration set drops the exploitable UPDATE policy.
revoke insert, update, delete, truncate, references, trigger
  on public.reveal_requests from anon, authenticated;
