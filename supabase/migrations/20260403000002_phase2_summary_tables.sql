-- AYN v2 Phase 2 — Summary Tables + Credit Status Function
-- Additive only. Zero changes to existing tables or functions.

-- ── 1. USER DAILY USAGE SUMMARY ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_usage_daily (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date              DATE NOT NULL DEFAULT CURRENT_DATE,
  message_count     INTEGER NOT NULL DEFAULT 0,
  engineering_count INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  total_cost_usd    NUMERIC(10,6) NOT NULL DEFAULT 0,
  intent_breakdown  JSONB DEFAULT '{}',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_user_usage_daily_user_date ON public.user_usage_daily(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_user_usage_daily_date      ON public.user_usage_daily(date DESC);
ALTER TABLE public.user_usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_uud" ON public.user_usage_daily FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "users_read_own_uud"    ON public.user_usage_daily FOR SELECT USING (auth.uid() = user_id);

-- ── 2. SYSTEM LLM COST DAILY ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.llm_cost_daily (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date             DATE NOT NULL UNIQUE DEFAULT CURRENT_DATE,
  total_requests   INTEGER NOT NULL DEFAULT 0,
  total_tokens     INTEGER NOT NULL DEFAULT 0,
  total_cost_usd   NUMERIC(12,6) NOT NULL DEFAULT 0,
  model_breakdown  JSONB DEFAULT '{}',
  intent_breakdown JSONB DEFAULT '{}',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_llm_cost_daily_date ON public.llm_cost_daily(date DESC);
ALTER TABLE public.llm_cost_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_lcd" ON public.llm_cost_daily FOR ALL USING (auth.role() = 'service_role');

-- ── 3. CANONICAL CREDIT STATUS FUNCTION ──────────────────────────────────────
-- READ ONLY — no increments, no side effects.
CREATE OR REPLACE FUNCTION public.get_credit_status(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  limits    RECORD;
  tier      TEXT;
  remaining INTEGER;
  total_lim INTEGER;
  reset_at  TIMESTAMPTZ;
  pct_used  NUMERIC;
BEGIN
  SELECT * INTO limits FROM public.user_ai_limits WHERE user_id = _user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('tier','free','remaining',5,'total_limit',5,
      'reset_at', now()+INTERVAL '1 day','is_unlimited',false,'pct_used',0,'bonus_credits',0);
  END IF;
  SELECT COALESCE(us.subscription_tier,'free') INTO tier
    FROM public.user_subscriptions us WHERE us.user_id = _user_id;
  IF tier IS NULL THEN tier := 'free'; END IF;
  IF limits.is_unlimited = true OR tier IN ('unlimited','enterprise') THEN
    RETURN jsonb_build_object('tier',tier,'remaining',-1,'total_limit',-1,
      'reset_at',null,'is_unlimited',true,'pct_used',0,'bonus_credits',0);
  END IF;
  IF tier = 'free' THEN
    IF limits.daily_reset_at IS NULL OR limits.daily_reset_at <= now() THEN
      remaining := limits.daily_messages; reset_at := now()+INTERVAL '1 day';
    ELSE
      remaining := GREATEST(0, limits.daily_messages - COALESCE(limits.current_daily_messages,0));
      reset_at  := limits.daily_reset_at;
    END IF;
    total_lim := COALESCE(limits.daily_messages, 5);
  ELSE
    total_lim := COALESCE(limits.monthly_messages,200) + COALESCE(limits.bonus_credits,0);
    IF limits.monthly_reset_at IS NULL OR limits.monthly_reset_at <= now() THEN
      remaining := total_lim; reset_at := now()+INTERVAL '1 month';
    ELSE
      remaining := GREATEST(0, total_lim - COALESCE(limits.current_monthly_messages,0));
      reset_at  := limits.monthly_reset_at;
    END IF;
  END IF;
  pct_used := CASE WHEN total_lim > 0
    THEN ROUND(((total_lim-remaining)::NUMERIC/total_lim)*100,1) ELSE 0 END;
  RETURN jsonb_build_object('tier',tier,'remaining',remaining,'total_limit',total_lim,
    'reset_at',reset_at,'is_unlimited',false,'pct_used',pct_used,
    'bonus_credits',COALESCE(limits.bonus_credits,0));
END;
$$;

-- ── 4. AUTO-SYNC TRIGGER on llm_usage_logs ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_usage_summaries()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_date   DATE    := CURRENT_DATE;
  v_tokens INTEGER := COALESCE(NEW.input_tokens,0)+COALESCE(NEW.output_tokens,0);
  v_cost   NUMERIC := ROUND((v_tokens::NUMERIC/1000)*0.0005,6);
  v_intent TEXT    := COALESCE(NEW.intent_type,'chat');
  v_model  TEXT    := COALESCE(NEW.model_name,'unknown');
  v_is_eng BOOLEAN := v_intent='engineering';
BEGIN
  INSERT INTO public.user_usage_daily
    (user_id,date,message_count,engineering_count,total_tokens,total_cost_usd,intent_breakdown,updated_at)
  VALUES(NEW.user_id,v_date,
    CASE WHEN v_is_eng THEN 0 ELSE 1 END,
    CASE WHEN v_is_eng THEN 1 ELSE 0 END,
    v_tokens,v_cost,jsonb_build_object(v_intent,1),now())
  ON CONFLICT(user_id,date) DO UPDATE SET
    message_count     = user_usage_daily.message_count     + CASE WHEN v_is_eng THEN 0 ELSE 1 END,
    engineering_count = user_usage_daily.engineering_count + CASE WHEN v_is_eng THEN 1 ELSE 0 END,
    total_tokens      = user_usage_daily.total_tokens      + v_tokens,
    total_cost_usd    = user_usage_daily.total_cost_usd    + v_cost,
    intent_breakdown  = jsonb_set(COALESCE(user_usage_daily.intent_breakdown,'{}'),
      ARRAY[v_intent],to_jsonb(COALESCE((user_usage_daily.intent_breakdown->>v_intent)::INTEGER,0)+1)),
    updated_at        = now();
  INSERT INTO public.llm_cost_daily
    (date,total_requests,total_tokens,total_cost_usd,model_breakdown,intent_breakdown,updated_at)
  VALUES(v_date,1,v_tokens,v_cost,jsonb_build_object(v_model,1),jsonb_build_object(v_intent,1),now())
  ON CONFLICT(date) DO UPDATE SET
    total_requests  = llm_cost_daily.total_requests+1,
    total_tokens    = llm_cost_daily.total_tokens+v_tokens,
    total_cost_usd  = llm_cost_daily.total_cost_usd+v_cost,
    model_breakdown = jsonb_set(COALESCE(llm_cost_daily.model_breakdown,'{}'),
      ARRAY[v_model],to_jsonb(COALESCE((llm_cost_daily.model_breakdown->>v_model)::INTEGER,0)+1)),
    intent_breakdown= jsonb_set(COALESCE(llm_cost_daily.intent_breakdown,'{}'),
      ARRAY[v_intent],to_jsonb(COALESCE((llm_cost_daily.intent_breakdown->>v_intent)::INTEGER,0)+1)),
    updated_at      = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_usage_summaries ON public.llm_usage_logs;
CREATE TRIGGER trg_sync_usage_summaries
  AFTER INSERT ON public.llm_usage_logs
  FOR EACH ROW EXECUTE FUNCTION public.sync_usage_summaries();
