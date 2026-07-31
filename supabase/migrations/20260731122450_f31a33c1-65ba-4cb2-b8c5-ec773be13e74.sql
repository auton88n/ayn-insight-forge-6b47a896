-- ============ v3.14.0 pricing ============
CREATE TABLE public.plans (
  key text PRIMARY KEY,
  audience text NOT NULL CHECK (audience IN ('seeker','employer')),
  name text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  interval text NOT NULL DEFAULT 'month' CHECK (interval IN ('month','week')),
  credits integer,
  proposals_limit integer,
  assessments_limit integer,
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon;
GRANT SELECT ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans are public" ON public.plans FOR SELECT USING (active);

CREATE TABLE public.subscriptions (
  user_id uuid PRIMARY KEY,
  plan_key text NOT NULL REFERENCES public.plans(key),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('trialing','active','past_due','canceled')),
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '1 month'),
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subscription" ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'));

CREATE TABLE public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  ref_id text,
  balance_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_credit_ledger_user ON public.credit_ledger (user_id, created_at DESC);
GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ledger" ON public.credit_ledger FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'));

CREATE TABLE public.upgrade_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_key text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.upgrade_intents TO authenticated;
GRANT ALL ON public.upgrade_intents TO service_role;
ALTER TABLE public.upgrade_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own intents" ON public.upgrade_intents FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'));

CREATE TRIGGER plans_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.plans (key, audience, name, price_cents, interval, credits, proposals_limit, assessments_limit, sort) VALUES
  ('seeker_free',      'seeker',   'Free',       0,     'month', 6,   NULL, NULL, 1),
  ('seeker_week',      'seeker',   'Week pass',  499,   'week',  30,  NULL, NULL, 2),
  ('seeker_starter',   'seeker',   'Starter',    1200,  'month', 80,  NULL, NULL, 3),
  ('seeker_pro',       'seeker',   'Pro',        2400,  'month', 200, NULL, NULL, 4),
  ('employer_trial',   'employer', 'Free month', 0,     'month', NULL, 5,   3,    1),
  ('employer_starter', 'employer', 'Starter',    19900, 'month', NULL, 10,  5,    2),
  ('employer_growth',  'employer', 'Growth',     49900, 'month', NULL, 40,  25,   3),
  ('employer_scale',   'employer', 'Scale',      99900, 'month', NULL, 120, 80,   4);

-- Balance = sum of ledger deltas (auditable, never a bare counter).
CREATE OR REPLACE FUNCTION public.credit_balance(_user_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(delta), 0)::int FROM public.credit_ledger WHERE user_id = _user_id;
$$;

-- Start a subscription, and roll the period forward (credits reset, no rollover).
CREATE OR REPLACE FUNCTION public.billing_ensure(_user_id uuid, _audience text DEFAULT 'seeker')
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.subscriptions;
  p public.plans;
  bal int;
  step interval;
BEGIN
  SELECT * INTO s FROM public.subscriptions WHERE user_id = _user_id;
  IF NOT FOUND THEN
    IF _audience = 'employer' THEN
      INSERT INTO public.subscriptions (user_id, plan_key, status, current_period_start, current_period_end, trial_ends_at)
      VALUES (_user_id, 'employer_trial', 'trialing', now(), now() + interval '30 days', now() + interval '30 days')
      RETURNING * INTO s;
    ELSE
      INSERT INTO public.subscriptions (user_id, plan_key, status, current_period_start, current_period_end)
      VALUES (_user_id, 'seeker_free', 'active', now(), now() + interval '1 month')
      RETURNING * INTO s;
      SELECT * INTO p FROM public.plans WHERE key = s.plan_key;
      INSERT INTO public.credit_ledger (user_id, delta, reason, balance_after)
      VALUES (_user_id, COALESCE(p.credits, 0), 'period_grant', COALESCE(p.credits, 0));
    END IF;
    RETURN s;
  END IF;

  SELECT * INTO p FROM public.plans WHERE key = s.plan_key;
  IF s.current_period_end <= now() AND s.status IN ('active','trialing') THEN
    step := CASE WHEN p.interval = 'week' THEN interval '7 days' ELSE interval '1 month' END;
    UPDATE public.subscriptions
      SET current_period_start = now(),
          current_period_end = now() + step,
          status = CASE WHEN s.status = 'trialing' THEN 'active' ELSE s.status END,
          plan_key = CASE WHEN s.status = 'trialing' AND p.audience = 'employer' THEN s.plan_key ELSE s.plan_key END
      WHERE user_id = _user_id RETURNING * INTO s;
    IF p.audience = 'seeker' AND p.credits IS NOT NULL THEN
      bal := public.credit_balance(_user_id);
      IF bal <> p.credits THEN
        INSERT INTO public.credit_ledger (user_id, delta, reason, balance_after)
        VALUES (_user_id, p.credits - bal, 'period_reset', p.credits);
      END IF;
    END IF;
  END IF;
  RETURN s;
END;
$$;

-- Spend and refund. Both write a ledger row.
CREATE OR REPLACE FUNCTION public.credit_spend(_user_id uuid, _amount integer, _reason text, _ref text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bal int;
BEGIN
  PERFORM public.billing_ensure(_user_id, 'seeker');
  bal := public.credit_balance(_user_id);
  IF _amount <= 0 THEN RETURN jsonb_build_object('ok', true, 'balance', bal); END IF;
  IF bal < _amount THEN
    RETURN jsonb_build_object('ok', false, 'balance', bal, 'cost', _amount);
  END IF;
  INSERT INTO public.credit_ledger (user_id, delta, reason, ref_id, balance_after)
  VALUES (_user_id, -_amount, _reason, _ref, bal - _amount);
  RETURN jsonb_build_object('ok', true, 'balance', bal - _amount, 'cost', _amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_grant(_user_id uuid, _amount integer, _reason text, _ref text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bal int;
BEGIN
  bal := public.credit_balance(_user_id) + _amount;
  INSERT INTO public.credit_ledger (user_id, delta, reason, ref_id, balance_after)
  VALUES (_user_id, _amount, _reason, _ref, bal);
  RETURN bal;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.billing_ensure(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_spend(uuid, integer, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_grant(uuid, integer, text, text) FROM anon, authenticated;

-- Backfill: every existing job seeker onto Free, approved employers onto the trial.
INSERT INTO public.subscriptions (user_id, plan_key, status, current_period_start, current_period_end)
SELECT p.user_id, 'seeker_free', 'active', now(), now() + interval '1 month'
FROM public.profiles p
WHERE COALESCE(p.role::text, 'job_seeker') <> 'employer'
  AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = p.user_id)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.credit_ledger (user_id, delta, reason, balance_after)
SELECT s.user_id, 6, 'period_grant', 6
FROM public.subscriptions s
WHERE s.plan_key = 'seeker_free'
  AND NOT EXISTS (SELECT 1 FROM public.credit_ledger l WHERE l.user_id = s.user_id);

INSERT INTO public.subscriptions (user_id, plan_key, status, current_period_start, current_period_end, trial_ends_at)
SELECT e.user_id, 'employer_trial', 'trialing', now(), now() + interval '30 days', now() + interval '30 days'
FROM public.employer_accounts e
WHERE e.status = 'approved'
  AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = e.user_id)
ON CONFLICT (user_id) DO NOTHING;