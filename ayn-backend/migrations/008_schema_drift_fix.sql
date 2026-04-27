-- Migration 008: Fix schema drift — add all columns missing from Railway vs Supabase
-- Generated from exact Supabase column definitions

-- ayn_world_predictions (already has most, add remaining)
ALTER TABLE ayn_world_predictions ADD COLUMN IF NOT EXISTS outcome_notes TEXT;
ALTER TABLE ayn_world_predictions ADD COLUMN IF NOT EXISTS conflict_signals JSONB DEFAULT '[]';
ALTER TABLE ayn_world_predictions ADD COLUMN IF NOT EXISTS escalation_risk TEXT;
ALTER TABLE ayn_world_predictions ADD COLUMN IF NOT EXISTS financial_trigger TEXT;
ALTER TABLE ayn_world_predictions ADD COLUMN IF NOT EXISTS resolution_notes TEXT;
ALTER TABLE ayn_world_predictions ADD COLUMN IF NOT EXISTS resolution_source TEXT;
ALTER TABLE ayn_world_predictions ADD COLUMN IF NOT EXISTS verified_by TEXT;
ALTER TABLE ayn_world_predictions ADD COLUMN IF NOT EXISTS winner_analysis TEXT;
ALTER TABLE ayn_world_predictions ADD COLUMN IF NOT EXISTS loser_analysis TEXT;
ALTER TABLE ayn_world_predictions ADD COLUMN IF NOT EXISTS evidence_sources JSONB DEFAULT '[]';
ALTER TABLE ayn_world_predictions ADD COLUMN IF NOT EXISTS agent_reports JSONB DEFAULT '{}';
ALTER TABLE ayn_world_predictions ADD COLUMN IF NOT EXISTS generated_method TEXT DEFAULT 'bulk';
ALTER TABLE ayn_world_predictions ADD COLUMN IF NOT EXISTS verification_notes TEXT;
ALTER TABLE ayn_world_predictions ADD COLUMN IF NOT EXISTS verification_source TEXT;

-- ayn_world_signals missing columns
ALTER TABLE ayn_world_signals ADD COLUMN IF NOT EXISTS signal_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE ayn_world_signals ADD COLUMN IF NOT EXISTS countries_involved TEXT[];
ALTER TABLE ayn_world_signals ADD COLUMN IF NOT EXISTS overrides_regime BOOLEAN DEFAULT false;
ALTER TABLE ayn_world_signals ADD COLUMN IF NOT EXISTS confidence_impact INTEGER DEFAULT 0;
ALTER TABLE ayn_world_signals ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
ALTER TABLE ayn_world_signals ADD COLUMN IF NOT EXISTS ancient_parallel TEXT;
ALTER TABLE ayn_world_signals ADD COLUMN IF NOT EXISTS biblical_parallel TEXT;

-- ayn_predictions missing columns
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS asset TEXT;
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS asset_category TEXT;
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS metric TEXT DEFAULT 'price';
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS target_date DATE;
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS predicted_value NUMERIC;
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS predicted_low NUMERIC;
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS predicted_high NUMERIC;
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS predicted_direction TEXT;
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS predicted_pct_change NUMERIC;
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS baseline_value NUMERIC;
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS baseline_date DATE;
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS market_context JSONB DEFAULT '{}';
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS reasoning TEXT;
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS risks JSONB DEFAULT '[]';
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS generated_by TEXT DEFAULT 'ayn_prediction_engine';
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS market_regime TEXT;
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS fear_greed_at_prediction INTEGER;
ALTER TABLE ayn_predictions ADD COLUMN IF NOT EXISTS signal_used JSONB DEFAULT '{}';

-- ayn_mind (create if not exists with correct schema)
CREATE TABLE IF NOT EXISTS ayn_mind (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    context JSONB DEFAULT '{}',
    shared_with_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ayn_opportunity_alerts (create if not exists with correct schema)
CREATE TABLE IF NOT EXISTS ayn_opportunity_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    prediction_date DATE DEFAULT CURRENT_DATE,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    region TEXT DEFAULT 'global',
    urgency TEXT NOT NULL,
    description TEXT NOT NULL,
    why_now TEXT NOT NULL,
    who_benefits TEXT NOT NULL,
    how_to_act TEXT NOT NULL,
    evidence JSONB DEFAULT '[]',
    tags JSONB DEFAULT '[]',
    expires_at DATE
);

-- ayn_historical_patterns (create if not exists)
CREATE TABLE IF NOT EXISTS ayn_historical_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    prediction_date DATE DEFAULT CURRENT_DATE,
    pattern_name TEXT NOT NULL,
    period_reference TEXT NOT NULL,
    what_happened TEXT NOT NULL,
    current_parallel TEXT NOT NULL,
    what_came_next TEXT NOT NULL,
    likely_outcome TEXT NOT NULL,
    confidence INTEGER,
    domain TEXT,
    tags JSONB DEFAULT '[]'
);

-- ayn_agent_conversations missing columns
ALTER TABLE ayn_agent_conversations ADD COLUMN IF NOT EXISTS signal_id UUID;
ALTER TABLE ayn_agent_conversations ADD COLUMN IF NOT EXISTS signal_headline TEXT;
ALTER TABLE ayn_agent_conversations ADD COLUMN IF NOT EXISTS signal_type TEXT;
ALTER TABLE ayn_agent_conversations ADD COLUMN IF NOT EXISTS signal_severity TEXT;
ALTER TABLE ayn_agent_conversations ADD COLUMN IF NOT EXISTS signal_region TEXT;
ALTER TABLE ayn_agent_conversations ADD COLUMN IF NOT EXISTS triggered_by TEXT DEFAULT 'manual';
ALTER TABLE ayn_agent_conversations ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE ayn_agent_conversations ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE ayn_agent_conversations ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT true;
ALTER TABLE ayn_agent_conversations ADD COLUMN IF NOT EXISTS simulation_type TEXT DEFAULT 'world_event';
ALTER TABLE ayn_agent_conversations ADD COLUMN IF NOT EXISTS originality_check JSONB;
ALTER TABLE ayn_agent_conversations ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private';

-- ayn_agent_messages missing columns  
ALTER TABLE ayn_agent_messages ADD COLUMN IF NOT EXISTS emotion_intensity INTEGER DEFAULT 50;
ALTER TABLE ayn_agent_messages ADD COLUMN IF NOT EXISTS confidence_level INTEGER DEFAULT 70;
ALTER TABLE ayn_agent_messages ADD COLUMN IF NOT EXISTS sequence_order INTEGER;
ALTER TABLE ayn_agent_messages ADD COLUMN IF NOT EXISTS cascade_round INTEGER;

-- ayn_sales_pipeline missing columns
ALTER TABLE ayn_sales_pipeline ADD COLUMN IF NOT EXISTS pain_points TEXT[] DEFAULT '{}';
ALTER TABLE ayn_sales_pipeline ADD COLUMN IF NOT EXISTS recommended_services TEXT[] DEFAULT '{}';
ALTER TABLE ayn_sales_pipeline ADD COLUMN IF NOT EXISTS emails_sent INTEGER DEFAULT 0;
ALTER TABLE ayn_sales_pipeline ADD COLUMN IF NOT EXISTS last_email_at TIMESTAMPTZ;
ALTER TABLE ayn_sales_pipeline ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ;
ALTER TABLE ayn_sales_pipeline ADD COLUMN IF NOT EXISTS context JSONB DEFAULT '{}';
ALTER TABLE ayn_sales_pipeline ADD COLUMN IF NOT EXISTS admin_approved BOOLEAN DEFAULT false;
ALTER TABLE ayn_sales_pipeline ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ayn_activity_log missing columns
ALTER TABLE ayn_activity_log ADD COLUMN IF NOT EXISTS target_id TEXT;
ALTER TABLE ayn_activity_log ADD COLUMN IF NOT EXISTS target_type TEXT;
ALTER TABLE ayn_activity_log ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';
ALTER TABLE ayn_activity_log ADD COLUMN IF NOT EXISTS triggered_by TEXT DEFAULT 'system';

-- ayn_prediction_outcomes — table already exists, add any missing
ALTER TABLE ayn_prediction_outcomes ADD COLUMN IF NOT EXISTS actual_pct_change NUMERIC;
ALTER TABLE ayn_prediction_outcomes ADD COLUMN IF NOT EXISTS value_error_pct NUMERIC;
ALTER TABLE ayn_prediction_outcomes ADD COLUMN IF NOT EXISTS range_hit BOOLEAN;
ALTER TABLE ayn_prediction_outcomes ADD COLUMN IF NOT EXISTS accuracy_score NUMERIC;
