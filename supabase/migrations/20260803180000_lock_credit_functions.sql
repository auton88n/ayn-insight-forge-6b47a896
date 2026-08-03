-- v3.42.0 — billing_ensure, credit_spend and credit_grant each did a plain
-- read-balance-then-write with no row locking. All three are independently
-- callable (resume-hub calls all three directly; stripe-webhook calls
-- credit_grant directly; credit_spend also calls billing_ensure
-- internally), so two near-simultaneous calls for the same user (double
-- click, two tabs, a retry after a slow-but-successful response) could both
-- read the same starting balance before either committed, both pass the
-- sufficiency check, and both write a deduction — a real overspend, not
-- just a cosmetic ledger mismatch.
--
-- Fixed with a per-user Postgres advisory transaction lock
-- (pg_advisory_xact_lock(hashtext(user_id::text))) taken as the first
-- statement in each function. It serializes concurrent calls for the SAME
-- user only (different users never block each other), needs no schema
-- change, auto-releases at the end of the transaction even on error, and
-- works even for a brand new user with no subscription row yet (unlike
-- locking an existing row, which billing_ensure is what creates in the
-- first place). Advisory locks are reentrant per transaction, so
-- credit_spend taking the lock and then calling billing_ensure (which
-- takes the same lock again) is a safe, instant no-op re-acquire, not a
-- deadlock. Verified with two synthetic concurrent credit_spend calls
-- against a shared balance: no overspend, ledger sum matched exactly.

CREATE OR REPLACE FUNCTION public.billing_ensure(_user_id uuid, _audience text DEFAULT 'seeker')
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.subscriptions;
  p public.plans;
  bal int;
  step interval;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(_user_id::text));

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

CREATE OR REPLACE FUNCTION public.credit_spend(_user_id uuid, _amount integer, _reason text, _ref text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bal int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(_user_id::text));

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
  PERFORM pg_advisory_xact_lock(hashtext(_user_id::text));

  bal := public.credit_balance(_user_id) + _amount;
  INSERT INTO public.credit_ledger (user_id, delta, reason, ref_id, balance_after)
  VALUES (_user_id, _amount, _reason, _ref, bal);
  RETURN bal;
END;
$$;
