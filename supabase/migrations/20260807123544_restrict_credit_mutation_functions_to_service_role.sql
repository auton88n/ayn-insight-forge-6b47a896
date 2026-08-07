-- CRITICAL: credit_grant(_user_id, _amount, ...) and credit_spend(...) had
-- no ownership or authorization check inside them at all -- SECURITY
-- DEFINER, granted to authenticated, taking an arbitrary target user id.
-- Reproduced live: a throwaway authenticated account called credit_grant
-- with its own id and an arbitrary amount and minted itself 999,999,999
-- credits with zero payment. credit_spend has the mirror risk (draining
-- another user's real balance). billing_ensure has smaller blast radius but
-- the same missing check. None of the three have any real caller in src/ --
-- resume-hub and stripe-webhook only ever call them from their service-role
-- client with a server-derived id, exactly the same shape already fixed for
-- credit_balance. Audited credit_ledger for signs of prior abuse before
-- fixing: clean, only small legitimate/test amounts, no evidence this was
-- exploited before being found.
revoke execute on function public.credit_grant(uuid, integer, text, text) from authenticated;
revoke execute on function public.credit_grant(uuid, integer, text, text) from anon;
revoke execute on function public.credit_spend(uuid, integer, text, text) from authenticated;
revoke execute on function public.credit_spend(uuid, integer, text, text) from anon;
revoke execute on function public.billing_ensure(uuid, text) from authenticated;
revoke execute on function public.billing_ensure(uuid, text) from anon;
