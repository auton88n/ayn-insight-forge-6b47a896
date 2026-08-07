-- credit_balance(_user_id uuid) took an arbitrary target user id with no
-- ownership check, and was granted to authenticated -- any signed-in user
-- could read any other user's credit balance via a direct RPC call.
-- The app itself only ever calls this from resume-hub's service-role client
-- with the caller's own id, so authenticated access was never needed.
revoke execute on function public.credit_balance(uuid) from authenticated;
revoke execute on function public.credit_balance(uuid) from anon;
