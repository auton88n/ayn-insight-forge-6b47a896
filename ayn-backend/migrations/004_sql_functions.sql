-- ============================================================
-- AYN SQL Functions — ported from Supabase
-- ============================================================

-- check_user_ai_limit: core function that controls all AI usage
CREATE OR REPLACE FUNCTION check_user_ai_limit(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  limits    RECORD;
  tier      TEXT;
  msg_limit INTEGER;
  is_daily  BOOLEAN;
  used      INTEGER;
  new_count INTEGER;
  reset_at  TIMESTAMPTZ;
BEGIN
  -- Ensure rows exist
  INSERT INTO user_subscriptions (user_id, subscription_tier, status)
  VALUES (_user_id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO user_ai_limits (user_id, daily_messages, monthly_messages, bonus_credits)
  VALUES (_user_id, 5, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Load data
  SELECT * INTO limits FROM user_ai_limits WHERE user_id = _user_id FOR UPDATE;
  SELECT COALESCE(subscription_tier, 'free') INTO tier
    FROM user_subscriptions WHERE user_id = _user_id;
  IF tier IS NULL THEN tier := 'free'; END IF;

  -- Unlimited tiers bypass everything
  IF limits.is_unlimited = true OR tier IN ('enterprise', 'unlimited') THEN
    UPDATE user_ai_limits SET
      current_daily_messages   = COALESCE(current_daily_messages, 0) + 1,
      current_monthly_messages = COALESCE(current_monthly_messages, 0) + 1,
      updated_at = now()
    WHERE user_id = _user_id;
    RETURN jsonb_build_object('allowed', true, 'tier', tier, 'remaining', -1, 'is_unlimited', true);
  END IF;

  -- Determine limit type
  CASE tier
    WHEN 'starter'  THEN msg_limit := 200;   is_daily := false;
    WHEN 'pro'      THEN msg_limit := 1000;  is_daily := false;
    WHEN 'business' THEN msg_limit := 5000;  is_daily := false;
    ELSE                  msg_limit := 5;    is_daily := true;
  END CASE;

  -- FREE: daily reset + bonus credits
  IF is_daily THEN
    IF limits.daily_reset_at IS NULL OR limits.daily_reset_at <= now() THEN
      UPDATE user_ai_limits SET
        current_daily_messages = 0,
        daily_reset_at = now() + INTERVAL '1 day',
        updated_at = now()
      WHERE user_id = _user_id;
      SELECT * INTO limits FROM user_ai_limits WHERE user_id = _user_id FOR UPDATE;
    END IF;

    -- Use bonus credits first
    IF COALESCE(limits.bonus_credits, 0) > 0 THEN
      UPDATE user_ai_limits SET
        bonus_credits            = bonus_credits - 1,
        current_monthly_messages = COALESCE(current_monthly_messages, 0) + 1,
        updated_at = now()
      WHERE user_id = _user_id
      RETURNING bonus_credits INTO new_count;
      RETURN jsonb_build_object(
        'allowed', true, 'tier', tier, 'source', 'bonus_credit',
        'bonus_remaining', new_count,
        'daily_remaining', GREATEST(0, msg_limit - COALESCE(limits.current_daily_messages, 0)),
        'resets_at', limits.daily_reset_at
      );
    END IF;

    used := COALESCE(limits.current_daily_messages, 0);
    IF used >= msg_limit THEN
      RETURN jsonb_build_object(
        'allowed', false, 'tier', tier, 'current', used,
        'total_limit', msg_limit, 'remaining', 0,
        'resets_at', limits.daily_reset_at,
        'error', 'Daily limit reached. Resets tomorrow.'
      );
    END IF;

    UPDATE user_ai_limits SET
      current_daily_messages   = COALESCE(current_daily_messages, 0) + 1,
      current_monthly_messages = COALESCE(current_monthly_messages, 0) + 1,
      updated_at = now()
    WHERE user_id = _user_id
    RETURNING current_daily_messages INTO new_count;

    RETURN jsonb_build_object(
      'allowed', true, 'tier', tier, 'source', 'daily',
      'current', new_count, 'total_limit', msg_limit,
      'remaining', GREATEST(0, msg_limit - new_count),
      'resets_at', limits.daily_reset_at
    );
  END IF;

  -- PAID: monthly limit
  IF limits.monthly_reset_at IS NULL OR limits.monthly_reset_at <= now() THEN
    UPDATE user_ai_limits SET
      current_monthly_messages = 0,
      monthly_reset_at = now() + INTERVAL '1 month',
      updated_at = now()
    WHERE user_id = _user_id;
    SELECT * INTO limits FROM user_ai_limits WHERE user_id = _user_id FOR UPDATE;
  END IF;

  used     := COALESCE(limits.current_monthly_messages, 0);
  reset_at := limits.monthly_reset_at;
  msg_limit := msg_limit + COALESCE(limits.bonus_credits, 0);

  IF used >= msg_limit THEN
    RETURN jsonb_build_object(
      'allowed', false, 'tier', tier, 'current', used,
      'total_limit', msg_limit, 'remaining', 0,
      'resets_at', reset_at, 'error', 'Monthly limit reached.'
    );
  END IF;

  UPDATE user_ai_limits SET
    current_monthly_messages = COALESCE(current_monthly_messages, 0) + 1,
    current_daily_messages   = COALESCE(current_daily_messages, 0) + 1,
    updated_at = now()
  WHERE user_id = _user_id
  RETURNING current_monthly_messages INTO new_count;

  RETURN jsonb_build_object(
    'allowed', true, 'tier', tier, 'source', 'monthly',
    'current', new_count, 'total_limit', msg_limit,
    'remaining', GREATEST(0, msg_limit - new_count),
    'resets_at', reset_at
  );
END;
$$;


-- add_bonus_credits
CREATE OR REPLACE FUNCTION add_bonus_credits(p_user_id UUID, p_amount INTEGER, p_reason TEXT, p_gift_type TEXT DEFAULT 'manual', p_given_by UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO user_ai_limits (user_id, bonus_credits)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET bonus_credits = COALESCE(user_ai_limits.bonus_credits, 0) + p_amount,
      updated_at = now();

  INSERT INTO credit_gifts (user_id, amount, reason, gift_type, given_by)
  VALUES (p_user_id, p_amount, p_reason, p_gift_type, p_given_by);
END;
$$;


-- apply_credit_topup (called by Stripe webhook)
CREATE OR REPLACE FUNCTION apply_credit_topup(_user_id UUID, _credits INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE new_bonus INTEGER;
BEGIN
  UPDATE user_ai_limits
  SET bonus_credits = COALESCE(bonus_credits, 0) + _credits, updated_at = now()
  WHERE user_id = _user_id RETURNING bonus_credits INTO new_bonus;
  
  INSERT INTO credit_gifts (user_id, amount, reason, gift_type)
  VALUES (_user_id, _credits, 'Top-up purchase', 'topup');
  
  RETURN jsonb_build_object('success', true, 'credits_added', _credits, 'total_bonus', new_bonus);
END;
$$;


-- upsert_user_memory
CREATE OR REPLACE FUNCTION upsert_user_memory(_user_id UUID, _memory_type TEXT, _memory_key TEXT, _memory_data JSONB, _priority INTEGER DEFAULT 5)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  memory_id UUID;
  expiry TIMESTAMPTZ;
BEGIN
  expiry := CASE _memory_type
    WHEN 'project'      THEN now() + INTERVAL '90 days'
    WHEN 'conversation' THEN now() + INTERVAL '48 hours'
    WHEN 'temporary'    THEN now() + INTERVAL '24 hours'
    ELSE NULL
  END;

  INSERT INTO user_memory (user_id, memory_type, memory_key, memory_data, priority, expires_at)
  VALUES (_user_id, _memory_type, _memory_key, _memory_data, _priority, expiry)
  ON CONFLICT (user_id, memory_type, memory_key)
  DO UPDATE SET
    memory_data = _memory_data,
    priority = _priority,
    expires_at = expiry,
    updated_at = now()
  RETURNING id INTO memory_id;

  RETURN memory_id;
END;
$$;


-- handle_new_user: auto-init user rows on registration
CREATE OR REPLACE FUNCTION handle_new_user(_user_id UUID, _email TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO user_subscriptions (user_id, subscription_tier, status)
  VALUES (_user_id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO user_ai_limits (user_id, daily_messages, monthly_messages, is_unlimited, bonus_credits)
  VALUES (_user_id, 5, 0, false, 0)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO user_settings (user_id, settings)
  VALUES (_user_id, '{"has_accepted_terms": false}')
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;


-- set_updated_at trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply updated_at triggers to key tables
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'users','user_subscriptions','user_ai_limits','user_settings',
    'chat_sessions','profiles','custom_orders','nda_agreements',
    'support_tickets','engineering_projects'
  ]
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_updated_at ON %I;
      CREATE TRIGGER trg_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    ', tbl, tbl);
  END LOOP;
END $$;
