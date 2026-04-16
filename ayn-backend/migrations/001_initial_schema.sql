-- AYN Platform — Initial Schema for Railway PostgreSQL
-- Run once after adding PostgreSQL plugin to Railway

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users (replaces Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    first_name      TEXT DEFAULT '',
    last_name       TEXT DEFAULT '',
    avatar_url      TEXT,
    is_admin        BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Sessions (refresh tokens)
CREATE TABLE IF NOT EXISTS user_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token   TEXT UNIQUE NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(refresh_token);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token           TEXT UNIQUE NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
    user_id                 UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    subscription_tier       TEXT DEFAULT 'free',
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    status                  TEXT DEFAULT 'active',
    current_period_end      TIMESTAMPTZ,
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- AI Limits
CREATE TABLE IF NOT EXISTS user_ai_limits (
    user_id                     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    daily_messages              INT DEFAULT 5,
    current_daily_messages      INT DEFAULT 0,
    monthly_messages            INT DEFAULT 5,
    current_monthly_messages    INT DEFAULT 0,
    bonus_credits               INT DEFAULT 0,
    daily_reset_at              TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 day'),
    monthly_reset_at            TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- User settings
CREATE TABLE IF NOT EXISTS user_settings (
    user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings    JSONB DEFAULT '{}',
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- User memory
CREATE TABLE IF NOT EXISTS user_memory (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    memory_type     TEXT NOT NULL,
    memory_key      TEXT NOT NULL,
    memory_data     JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, memory_type, memory_key)
);
CREATE INDEX IF NOT EXISTS idx_user_memory_user ON user_memory(user_id);

-- Chat sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id  TEXT UNIQUE NOT NULL,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT DEFAULT 'New Chat',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, updated_at DESC);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id      TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content         TEXT NOT NULL,
    intent_type     TEXT,
    model_used      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, created_at DESC);

-- Error logs
CREATE TABLE IF NOT EXISTS error_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source          TEXT DEFAULT 'backend',
    severity        TEXT DEFAULT 'error',
    error_message   TEXT,
    error_stack     TEXT,
    endpoint        TEXT,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    url             TEXT,
    user_agent      TEXT,
    context         JSONB DEFAULT '{}',
    status          TEXT DEFAULT 'open',
    resolved_at     TIMESTAMPTZ,
    resolved_note   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);

-- World Intelligence
CREATE TABLE IF NOT EXISTS ayn_world_signals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category        TEXT,
    title           TEXT,
    summary         TEXT,
    impact_level    TEXT,
    affected_regions TEXT[],
    market_impact   TEXT,
    source_url      TEXT,
    status          TEXT DEFAULT 'active',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_world_signals_status ON ayn_world_signals(status, created_at DESC);

CREATE TABLE IF NOT EXISTS ayn_market_snapshot (
    singleton_key   INT PRIMARY KEY DEFAULT 1,
    snapshot        JSONB DEFAULT '{}',
    fetched_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_country_intelligence (
    country_code        TEXT PRIMARY KEY,
    country_name        TEXT,
    intelligence_brief  TEXT,
    economy             JSONB DEFAULT '{}',
    hot_sectors         JSONB DEFAULT '[]',
    opportunities       JSONB DEFAULT '[]',
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_predictions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset               TEXT NOT NULL,
    horizon             TEXT,
    target_date         DATE,
    baseline_value      NUMERIC,
    predicted_value     NUMERIC,
    predicted_low       NUMERIC,
    predicted_high      NUMERIC,
    predicted_direction TEXT,
    predicted_pct_change NUMERIC,
    confidence          NUMERIC,
    reasoning           TEXT,
    generated_by        TEXT,
    status              TEXT DEFAULT 'active',
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_consensus_predictions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset                   TEXT NOT NULL,
    horizon                 TEXT,
    target_date             DATE,
    baseline_value          NUMERIC,
    consensus_direction     TEXT,
    consensus_pct_change    NUMERIC,
    consensus_confidence    NUMERIC,
    consensus_strength      TEXT,
    ayn_reasoning           TEXT,
    agreement               NUMERIC,
    fusion_method           TEXT,
    boost_factor            NUMERIC,
    status                  TEXT DEFAULT 'active',
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_master_predictions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset       TEXT,
    direction   TEXT,
    confidence  NUMERIC,
    reasoning   TEXT,
    timeframe   TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Stripe payments
CREATE TABLE IF NOT EXISTS payment_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stripe_event_id TEXT UNIQUE NOT NULL,
    event_type      TEXT NOT NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    amount          INT,
    currency        TEXT,
    status          TEXT,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Admin tables
CREATE TABLE IF NOT EXISTS beta_feedback (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    feedback    TEXT,
    rating      INT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_messages (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT,
    email       TEXT,
    message     TEXT,
    status      TEXT DEFAULT 'unread',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- check_user_ai_limit function
CREATE OR REPLACE FUNCTION check_user_ai_limit(
    _user_id UUID,
    _intent_type TEXT DEFAULT 'chat'
) RETURNS JSONB AS $$
DECLARE
    limits RECORD;
    total_remaining INT;
BEGIN
    SELECT * INTO limits FROM user_ai_limits WHERE user_id = _user_id;
    IF NOT FOUND THEN
        INSERT INTO user_ai_limits (user_id) VALUES (_user_id);
        SELECT * INTO limits FROM user_ai_limits WHERE user_id = _user_id;
    END IF;
    IF limits.daily_reset_at < NOW() THEN
        UPDATE user_ai_limits
        SET current_daily_messages = 0, daily_reset_at = NOW() + INTERVAL '1 day', updated_at = NOW()
        WHERE user_id = _user_id;
        limits.current_daily_messages := 0;
    END IF;
    total_remaining := (limits.daily_messages - limits.current_daily_messages) + COALESCE(limits.bonus_credits, 0);
    IF total_remaining <= 0 THEN
        RETURN jsonb_build_object('allowed', false, 'error', 'Daily limit reached');
    END IF;
    IF limits.bonus_credits > 0 THEN
        UPDATE user_ai_limits SET bonus_credits = GREATEST(0, bonus_credits - 1), updated_at = NOW() WHERE user_id = _user_id;
    ELSE
        UPDATE user_ai_limits SET current_daily_messages = current_daily_messages + 1, updated_at = NOW() WHERE user_id = _user_id;
    END IF;
    RETURN jsonb_build_object('allowed', true, 'remaining', total_remaining - 1);
END;
$$ LANGUAGE plpgsql;

-- add_bonus_credits function
CREATE OR REPLACE FUNCTION add_bonus_credits(
    p_user_id UUID,
    p_amount INT,
    p_reason TEXT DEFAULT '',
    p_gift_type TEXT DEFAULT 'gift'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO user_ai_limits (user_id, bonus_credits)
    VALUES (p_user_id, p_amount)
    ON CONFLICT (user_id) DO UPDATE
    SET bonus_credits = user_ai_limits.bonus_credits + p_amount, updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

SELECT 'AYN schema created' AS result;
