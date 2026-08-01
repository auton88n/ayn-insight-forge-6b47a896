CREATE OR REPLACE FUNCTION public.get_admin_ai_usage()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_today timestamptz := date_trunc('day', now());
  v_month timestamptz := date_trunc('month', now());
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  RETURN jsonb_build_object(
    'calls_today', (SELECT count(*) FROM llm_usage_logs WHERE created_at >= v_today),
    'calls_month', (SELECT count(*) FROM llm_usage_logs WHERE created_at >= v_month),
    'spend_today', (SELECT coalesce(round(sum(cost_sar)::numeric,4),0) FROM llm_usage_logs WHERE created_at >= v_today),
    'spend_month', (SELECT coalesce(round(sum(cost_sar)::numeric,4),0) FROM llm_usage_logs WHERE created_at >= v_month),
    'tokens_month', (SELECT coalesce(sum(coalesce(input_tokens,0)+coalesce(output_tokens,0)),0) FROM llm_usage_logs WHERE created_at >= v_month),
    'failures_month', (SELECT count(*) FROM llm_failures WHERE created_at >= v_month),
    'by_model', coalesce((SELECT jsonb_agg(m) FROM (
        SELECT coalesce(model_name,'unknown') AS model, count(*) AS calls,
               coalesce(round(sum(cost_sar)::numeric,4),0) AS spend
        FROM llm_usage_logs WHERE created_at >= v_month
        GROUP BY 1 ORDER BY 2 DESC LIMIT 20) m), '[]'::jsonb),
    'by_feature', coalesce((SELECT jsonb_agg(m) FROM (
        SELECT coalesce(intent_type,'unknown') AS feature, count(*) AS calls,
               coalesce(round(sum(cost_sar)::numeric,4),0) AS spend
        FROM llm_usage_logs WHERE created_at >= v_month
        GROUP BY 1 ORDER BY 2 DESC LIMIT 20) m), '[]'::jsonb),
    'by_day', coalesce((SELECT jsonb_agg(d ORDER BY (d->>'day')) FROM (
        SELECT jsonb_build_object(
          'day', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
          'calls', count(*),
          'spend', coalesce(round(sum(cost_sar)::numeric,4),0)) AS d
        FROM llm_usage_logs WHERE created_at >= now() - interval '30 days'
        GROUP BY date_trunc('day', created_at)) x), '[]'::jsonb),
    'recent_failures', coalesce((SELECT jsonb_agg(row_to_json(f) ORDER BY f.created_at DESC) FROM (
        SELECT * FROM llm_failures ORDER BY created_at DESC LIMIT 25) f), '[]'::jsonb)
  );
END; $function$;

CREATE OR REPLACE FUNCTION public.get_admin_ai_cost_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_today timestamptz := date_trunc('day', now());
  v_week  timestamptz := now() - interval '7 days';
  v_month timestamptz := date_trunc('month', now());
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  RETURN jsonb_build_object(
    'today_count',    (SELECT count(*) FROM llm_usage_logs WHERE created_at >= v_today),
    'week_count',     (SELECT count(*) FROM llm_usage_logs WHERE created_at >= v_week),
    'month_count',    (SELECT count(*) FROM llm_usage_logs WHERE created_at >= v_month),
    'total_count',    (SELECT count(*) FROM llm_usage_logs),
    'today_failures', (SELECT count(*) FROM llm_failures WHERE created_at >= v_today),
    'week_failures',  (SELECT count(*) FROM llm_failures WHERE created_at >= v_week),
    'month_failures', (SELECT count(*) FROM llm_failures WHERE created_at >= v_month),
    'fallback_today', (SELECT count(*) FROM llm_usage_logs WHERE created_at >= v_today AND was_fallback = true),
    'fallback_week',  (SELECT count(*) FROM llm_usage_logs WHERE created_at >= v_week AND was_fallback = true),
    'by_model', coalesce((
      SELECT jsonb_agg(jsonb_build_object('model', model, 'count', cnt))
      FROM (SELECT coalesce(model_name,'unknown') AS model, count(*) as cnt FROM llm_usage_logs WHERE created_at >= v_month GROUP BY 1 ORDER BY 2 DESC) m
    ), '[]'::jsonb),
    'recent_failures', coalesce((
      SELECT jsonb_agg(row_to_json(f) ORDER BY f.created_at DESC)
      FROM (SELECT * FROM llm_failures ORDER BY created_at DESC LIMIT 50) f
    ), '[]'::jsonb)
  );
END; $function$;