-- v3.361.0 -- CRITICAL, the third and worst finding of this same security
-- pass, same root cause pattern as the two before it. employer_searches
-- had a plain org-membership SELECT policy with no column restriction --
-- and this table's own ref_map column is the literal mapping from an
-- anonymized candidate ref ("c1") back to the real user_id behind it.
-- blueprint.md's own architecture notes state this plainly: "The ref_map
-- that binds refs to real users never leaves the edge function." This
-- policy meant it always could, for any org member, for any of their
-- own past searches, via a single raw PostgREST GET request.
--
-- Reproduced live before this migration: a real throwaway employer
-- account, a synthetic employer_searches row (a fabricated ref_map value,
-- not a real candidate's id, to avoid touching any real person's data --
-- production currently has exactly one real opted-in candidate), read
-- back in full -- ref_map and all -- via a direct SELECT with that
-- employer's own session token. This directly breaks the core anonymity
-- guarantee this product states plainly in its own privacy policy:
-- "Employers never see your name, email address, or telephone number
-- until you accept their proposal." A raw user_id is not itself a name
-- or email, but it is exactly the one piece of information the entire
-- anonymization design exists to keep away from an employer before that
-- point, and this policy handed it over on request.
--
-- Checked before dropping, not assumed safe: grepped every frontend call
-- site -- zero real query code anywhere (only auto-generated TypeScript
-- type definitions reference the table name). Every real read and write
-- (employer_match, employer_card_answer, employer_draft_proposal,
-- employer_reveal_request, and others) already goes through resume-hub's
-- service-role client (adminForNew), which bypasses RLS entirely and is
-- completely unaffected by removing client-facing access. Nothing
-- legitimate used any of these four policies.

drop policy if exists "Org members can view their searches" on public.employer_searches;
drop policy if exists "Org members can update their searches" on public.employer_searches;
drop policy if exists "Org members can delete their searches" on public.employer_searches;
drop policy if exists "Org members can create searches" on public.employer_searches;
