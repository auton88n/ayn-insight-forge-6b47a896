CREATE OR REPLACE FUNCTION public.get_admin_candidates()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN (
    WITH pool AS (
      SELECT tp.user_id, tp.consented_at,
             ci.indexed_at, ci.embedding_model, ci.headline, ci.seniority, ci.years_experience,
             length(coalesce(ci.profile_text,'')) AS profile_len,
             (SELECT max(updated_at) FROM user_profile_canonical c WHERE c.user_id = tp.user_id) AS profile_updated_at,
             (SELECT max(updated_at) FROM resumes r WHERE r.user_id = tp.user_id) AS resume_updated_at,
             (SELECT count(*) FROM candidate_skills s WHERE s.user_id = tp.user_id) AS skills_count,
             u.email
      FROM talent_pool_consent tp
      LEFT JOIN candidate_index ci ON ci.user_id = tp.user_id
      LEFT JOIN auth.users u ON u.id = tp.user_id
      WHERE tp.opted_in = true
    ), flagged AS (
      SELECT *,
        (indexed_at IS NULL
          OR indexed_at < coalesce(profile_updated_at, '-infinity'::timestamptz)
          OR indexed_at < coalesce(resume_updated_at, '-infinity'::timestamptz)) AS is_stale,
        (skills_count < 5 OR profile_len < 400) AS is_thin
      FROM pool
    )
    SELECT jsonb_build_object(
      'total_opted_in', (SELECT count(*) FROM flagged),
      'stale_count', (SELECT count(*) FROM flagged WHERE is_stale),
      'thin_count', (SELECT count(*) FROM flagged WHERE is_thin),
      'models', coalesce((SELECT jsonb_agg(x) FROM (
          SELECT coalesce(embedding_model,'none') AS model, count(*) AS n
          FROM flagged GROUP BY 1 ORDER BY 2 DESC) x), '[]'::jsonb),
      'rows', coalesce((SELECT jsonb_agg(row_to_json(f) ORDER BY f.is_stale DESC, f.consented_at DESC) FROM (
          SELECT user_id, email, headline, seniority, years_experience, skills_count, profile_len,
                 indexed_at, embedding_model, profile_updated_at, resume_updated_at, is_stale, is_thin,
                 consented_at
          FROM flagged LIMIT 200) f), '[]'::jsonb)
    )
  );
END; $function$;