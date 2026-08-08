-- Cookie consent log: server-side record of the Accept/Reject decision so
-- the admin panel can see aggregate stats. Before this, the choice only
-- ever lived in the visitor's own browser (localStorage) -- nothing was
-- ever sent to AYN at all.
CREATE TABLE public.cookie_consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  choice text NOT NULL CHECK (choice IN ('accepted', 'rejected')),
  gpc boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cookie_consent_log_created_at_idx ON public.cookie_consent_log (created_at);

ALTER TABLE public.cookie_consent_log ENABLE ROW LEVEL SECURITY;
-- No policies granted on purpose: every write goes through
-- record_cookie_consent() and every read goes through
-- get_admin_cookie_consent(), both SECURITY DEFINER. Same deny-by-default
-- shape as assessment_rubrics/assessment_results.

-- Called by anyone, signed in or not, the moment they click Accept or
-- Reject on the cookie banner. user_id is read server side from the
-- session, never trusted from the client, so it can't be spoofed.
CREATE OR REPLACE FUNCTION public.record_cookie_consent(p_choice text, p_gpc boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_choice NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'invalid choice';
  END IF;
  INSERT INTO public.cookie_consent_log (user_id, choice, gpc)
  VALUES ((SELECT auth.uid()), p_choice, coalesce(p_gpc, false));
END; $$;

REVOKE EXECUTE ON FUNCTION public.record_cookie_consent(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_cookie_consent(text, boolean) TO anon, authenticated;

-- Admin aggregate view: totals, a 30 day daily breakdown, and the most
-- recent decisions for a raw log.
CREATE OR REPLACE FUNCTION public.get_admin_cookie_consent()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_accepted int;
  v_total_rejected int;
  v_total_gpc int;
  v_first timestamptz;
  v_last timestamptz;
BEGIN
  IF NOT public.has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT count(*) FILTER (WHERE choice = 'accepted'),
         count(*) FILTER (WHERE choice = 'rejected'),
         count(*) FILTER (WHERE gpc),
         min(created_at), max(created_at)
    INTO v_total_accepted, v_total_rejected, v_total_gpc, v_first, v_last
    FROM public.cookie_consent_log;

  RETURN jsonb_build_object(
    'total_accepted', coalesce(v_total_accepted, 0),
    'total_rejected', coalesce(v_total_rejected, 0),
    'total_gpc', coalesce(v_total_gpc, 0),
    'first_recorded_at', v_first,
    'last_recorded_at', v_last,
    'daily', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'date', d.day::date,
        'accepted', coalesce(a.n, 0),
        'rejected', coalesce(r.n, 0)
      ) ORDER BY d.day)
      FROM generate_series(current_date - interval '29 days', current_date, interval '1 day') AS d(day)
      LEFT JOIN (
        SELECT created_at::date AS day, count(*) AS n FROM public.cookie_consent_log
        WHERE choice = 'accepted' AND created_at >= current_date - interval '29 days'
        GROUP BY 1
      ) a ON a.day = d.day::date
      LEFT JOIN (
        SELECT created_at::date AS day, count(*) AS n FROM public.cookie_consent_log
        WHERE choice = 'rejected' AND created_at >= current_date - interval '29 days'
        GROUP BY 1
      ) r ON r.day = d.day::date
    ), '[]'::jsonb),
    'recent', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'choice', c.choice, 'gpc', c.gpc, 'created_at', c.created_at,
        'email', u.email
      ) ORDER BY c.created_at DESC)
      FROM (SELECT * FROM public.cookie_consent_log ORDER BY created_at DESC LIMIT 50) c
      LEFT JOIN auth.users u ON u.id = c.user_id
    ), '[]'::jsonb)
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_admin_cookie_consent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_cookie_consent() TO authenticated;
