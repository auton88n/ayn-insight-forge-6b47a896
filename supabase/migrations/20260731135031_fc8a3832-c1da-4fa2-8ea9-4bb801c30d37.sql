
REVOKE ALL ON FUNCTION public.get_admin_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_employers() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_candidates() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_marketplace() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_money() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_employer_approve(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_employer_decline(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_employer_override(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_candidates_stale(uuid[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_admin_overview() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_employers() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_candidates() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_marketplace() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_money() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_employer_approve(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_employer_decline(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_employer_override(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_candidates_stale(uuid[]) TO authenticated, service_role;
