CREATE OR REPLACE FUNCTION public.get_admin_employers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN jsonb_build_object(
    'pending', coalesce((SELECT jsonb_agg(row_to_json(p) ORDER BY p.requested_at) FROM (
        SELECT ea.user_id, ea.company_name, ea.company_size, ea.hiring_need, ea.phone,
               ea.created_at AS requested_at, ea.internal_note,
               u.email AS requester_email,
               o.website, o.industry, o.headquarters, o.about, o.logo_url
        FROM employer_accounts ea
        LEFT JOIN auth.users u ON u.id = ea.user_id
        LEFT JOIN orgs o ON o.created_by = ea.user_id
        WHERE ea.status = 'pending_approval'
      ) p), '[]'::jsonb),
    'active', coalesce((SELECT jsonb_agg(row_to_json(a) ORDER BY a.approved_at DESC NULLS LAST) FROM (
        SELECT ea.user_id, ea.company_name, ea.status::text AS status, ea.approved_at, ea.internal_note,
               u.email AS requester_email,
               o.website, o.industry, o.headquarters,
               coalesce(s.plan_key,'employer_trial') AS plan_key,
               pl.name AS plan_name, pl.proposals_limit, pl.assessments_limit, pl.searches_limit,
               s.trial_ends_at, s.current_period_start, s.current_period_end, s.status AS sub_status,
               (SELECT count(*) FROM reveal_requests r WHERE r.org_id = o.id
                  AND r.created_at >= coalesce(s.current_period_start, now() - interval '30 days')) AS proposals_used,
               (SELECT count(*) FROM assessments x WHERE x.org_id = o.id
                  AND x.created_at >= coalesce(s.current_period_start, now() - interval '30 days')) AS assessments_used,
               (SELECT count(*) FROM employer_searches es WHERE es.org_id = o.id
                  AND es.created_at >= coalesce(s.current_period_start, now() - interval '30 days')) AS searches_used
        FROM employer_accounts ea
        LEFT JOIN auth.users u ON u.id = ea.user_id
        LEFT JOIN orgs o ON o.created_by = ea.user_id
        LEFT JOIN subscriptions s ON s.user_id = ea.user_id
        LEFT JOIN plans pl ON pl.key = coalesce(s.plan_key,'employer_trial')
        WHERE ea.status <> 'pending_approval'
      ) a), '[]'::jsonb),
    'plans', coalesce((SELECT jsonb_agg(row_to_json(q) ORDER BY q.sort) FROM (
        SELECT key, name, price_cents, proposals_limit, assessments_limit, searches_limit, sort FROM plans WHERE audience='employer' AND active
      ) q), '[]'::jsonb)
  );
END; $function$;
