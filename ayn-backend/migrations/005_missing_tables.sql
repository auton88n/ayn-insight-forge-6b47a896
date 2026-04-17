-- ============================================================
-- Migration 005: All tables missing from Railway
-- Source: Supabase public schema (195 tables total)
-- ============================================================

-- World Intelligence / Market Data
CREATE TABLE IF NOT EXISTS ayn_market_snapshot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot JSONB NOT NULL DEFAULT '{}',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sources_used TEXT[] DEFAULT '{}',
    fetch_errors TEXT[] DEFAULT '{}',
    singleton_key INTEGER DEFAULT 1,
    intelligence_brief JSONB DEFAULT '[]',
    UNIQUE(singleton_key)
);

CREATE TABLE IF NOT EXISTS ayn_snapshot_history (
    id BIGSERIAL PRIMARY KEY,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fear_greed INTEGER, sp500 NUMERIC, nasdaq NUMERIC, gold NUMERIC,
    oil_wti NUMERIC, fed_rate NUMERIC, inflation_cpi NUMERIC, unemployment NUMERIC,
    yield_spread_2_10 NUMERIC, yield_spread_3m_10 NUMERIC, yield_curve_signal TEXT,
    btc_dominance NUMERIC, environment_score INTEGER, environment_label TEXT,
    snapshot JSONB, sources_used TEXT[], fetch_errors TEXT[], brief_items INTEGER
);

CREATE TABLE IF NOT EXISTS ayn_country_intelligence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code TEXT NOT NULL, country_name TEXT NOT NULL, region TEXT NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    economy JSONB DEFAULT '{}', government JSONB DEFAULT '{}',
    hot_sectors JSONB DEFAULT '[]', opportunities JSONB DEFAULT '[]',
    job_market JSONB DEFAULT '{}', business_climate JSONB DEFAULT '{}',
    health_sector JSONB DEFAULT '{}', consumer JSONB DEFAULT '{}',
    emerging JSONB DEFAULT '[]', intelligence_brief JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS ayn_trade_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code TEXT NOT NULL, country_name TEXT NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    top_exports JSONB DEFAULT '[]', top_imports JSONB DEFAULT '[]',
    trade_balance JSONB DEFAULT '{}', opportunities JSONB DEFAULT '[]',
    dependencies JSONB DEFAULT '[]', intelligence_brief JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS ayn_gov_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code TEXT NOT NULL, country_name TEXT NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    central_bank JSONB DEFAULT '{}', tax_policy JSONB DEFAULT '{}',
    trade_policy JSONB DEFAULT '{}', regulations JSONB DEFAULT '[]',
    elections JSONB DEFAULT '{}', intelligence_brief JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS ayn_startup_intel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    hot_sectors JSONB DEFAULT '[]', big_rounds JSONB DEFAULT '[]',
    exits JSONB DEFAULT '[]', emerging_themes JSONB DEFAULT '[]',
    dead_trends JSONB DEFAULT '[]', intelligence_brief JSONB DEFAULT '[]',
    singleton_key INTEGER DEFAULT 1, UNIQUE(singleton_key)
);

CREATE TABLE IF NOT EXISTS ayn_job_market (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code TEXT NOT NULL, country_name TEXT NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    top_roles JSONB DEFAULT '[]', top_skills JSONB DEFAULT '[]',
    salary_trends JSONB DEFAULT '{}', hiring_sectors JSONB DEFAULT '[]',
    layoff_sectors JSONB DEFAULT '[]', remote_trends JSONB DEFAULT '{}',
    intelligence_brief JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS ayn_supply_chain (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    shipping_rates JSONB DEFAULT '{}', port_congestion JSONB DEFAULT '[]',
    bottlenecks JSONB DEFAULT '[]', inventory_signals JSONB DEFAULT '{}',
    risk_alerts JSONB DEFAULT '[]', intelligence_brief JSONB DEFAULT '[]',
    singleton_key INTEGER DEFAULT 1, UNIQUE(singleton_key)
);

CREATE TABLE IF NOT EXISTS ayn_real_estate (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code TEXT NOT NULL, country_name TEXT NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    residential JSONB DEFAULT '{}', commercial JSONB DEFAULT '{}',
    rental_yields JSONB DEFAULT '{}', hot_cities JSONB DEFAULT '[]',
    cooling_markets JSONB DEFAULT '[]', intelligence_brief JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS ayn_consumer_sentiment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code TEXT NOT NULL, country_name TEXT NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    confidence_index JSONB DEFAULT '{}', spending_trends JSONB DEFAULT '[]',
    saving_rate JSONB DEFAULT '{}', debt_levels JSONB DEFAULT '{}',
    top_purchases JSONB DEFAULT '[]', cutting_spending JSONB DEFAULT '[]',
    intelligence_brief JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS ayn_health_intel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code TEXT NOT NULL, country_name TEXT NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    market_size JSONB DEFAULT '{}', growth_areas JSONB DEFAULT '[]',
    gaps JSONB DEFAULT '[]', drug_pipeline JSONB DEFAULT '[]',
    digital_health JSONB DEFAULT '[]', mental_health JSONB DEFAULT '{}',
    intelligence_brief JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS ayn_tech_disruption (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    ai_developments JSONB DEFAULT '[]', patents_filed JSONB DEFAULT '[]',
    rd_leaders JSONB DEFAULT '[]', disrupted_industries JSONB DEFAULT '[]',
    emerging_tech JSONB DEFAULT '[]', intelligence_brief JSONB DEFAULT '[]',
    singleton_key INTEGER DEFAULT 1, UNIQUE(singleton_key)
);

-- Predictions system
CREATE TABLE IF NOT EXISTS ayn_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    asset TEXT NOT NULL, asset_category TEXT NOT NULL,
    metric TEXT NOT NULL DEFAULT 'price', horizon TEXT NOT NULL,
    target_date DATE NOT NULL, predicted_value NUMERIC,
    predicted_low NUMERIC, predicted_high NUMERIC,
    predicted_direction TEXT, predicted_pct_change NUMERIC,
    confidence INTEGER, baseline_value NUMERIC, baseline_date DATE,
    market_context JSONB DEFAULT '{}', reasoning TEXT NOT NULL,
    key_drivers JSONB DEFAULT '[]', risks JSONB DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active',
    generated_by TEXT DEFAULT 'ayn_prediction_engine',
    market_regime TEXT, fear_greed_at_prediction INTEGER,
    signal_used JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS ayn_world_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    prediction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    domain TEXT NOT NULL, region TEXT NOT NULL DEFAULT 'global',
    horizon TEXT NOT NULL, target_period TEXT,
    title TEXT NOT NULL, confidence INTEGER,
    probability TEXT, what_is_happening TEXT NOT NULL,
    what_it_means TEXT NOT NULL, historical_parallel TEXT NOT NULL,
    who_wins TEXT NOT NULL, who_gets_hurt TEXT NOT NULL,
    what_to_do_now TEXT NOT NULL,
    key_drivers JSONB DEFAULT '[]', main_risks JSONB DEFAULT '[]',
    tags JSONB DEFAULT '[]', status TEXT DEFAULT 'active',
    actionable_move TEXT, probability_pct INTEGER,
    signal_quality INTEGER DEFAULT 50,
    data_sources JSONB DEFAULT '[]', expires_at DATE,
    verified_at TIMESTAMPTZ, verified_correct BOOLEAN,
    resolution_correct BOOLEAN, resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ayn_master_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    run_id TEXT NOT NULL, title TEXT NOT NULL, thesis TEXT NOT NULL,
    horizon TEXT NOT NULL, target_date DATE,
    probability_pct INTEGER NOT NULL, confidence INTEGER NOT NULL,
    who_wins TEXT NOT NULL, who_loses TEXT NOT NULL,
    actionable_move TEXT NOT NULL, what_to_watch TEXT,
    driving_signals JSONB DEFAULT '[]', domain TEXT, region TEXT,
    tags JSONB DEFAULT '[]', signal_quality INTEGER DEFAULT 70,
    expires_at DATE, verified_correct BOOLEAN,
    check_status TEXT DEFAULT 'pending', is_happening_now BOOLEAN
);

CREATE TABLE IF NOT EXISTS ayn_prediction_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id UUID NOT NULL,
    resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actual_value NUMERIC, actual_date DATE,
    actual_direction TEXT, actual_pct_change NUMERIC,
    was_direction_correct BOOLEAN, value_error_pct NUMERIC,
    range_hit BOOLEAN, accuracy_score NUMERIC,
    error_magnitude TEXT, what_happened TEXT, data_source TEXT
);

CREATE TABLE IF NOT EXISTS ayn_prediction_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    outcome_id UUID, prediction_id UUID,
    lesson_type TEXT NOT NULL, lesson_title TEXT NOT NULL,
    lesson_detail TEXT NOT NULL, rule_update TEXT,
    asset_affected TEXT, horizon_affected TEXT,
    lesson_confidence INTEGER DEFAULT 70, applied_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ayn_prediction_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    asset TEXT NOT NULL, horizon TEXT NOT NULL,
    total_predictions INTEGER DEFAULT 0, resolved_count INTEGER DEFAULT 0,
    direction_accuracy NUMERIC DEFAULT 0, avg_value_error NUMERIC DEFAULT 0,
    avg_accuracy_score NUMERIC DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ayn_prediction_accuracy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    period_start DATE NOT NULL, period_end DATE NOT NULL,
    total_price_predictions INTEGER DEFAULT 0,
    direction_correct INTEGER DEFAULT 0, direction_wrong INTEGER DEFAULT 0,
    direction_accuracy_pct NUMERIC, avg_accuracy_score NUMERIC,
    total_world_predictions INTEGER DEFAULT 0,
    world_accuracy_pct NUMERIC, overall_grade TEXT,
    meets_80_threshold BOOLEAN
);

CREATE TABLE IF NOT EXISTS ayn_prediction_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rule_name TEXT NOT NULL, asset TEXT, horizon TEXT,
    condition TEXT NOT NULL, adjustment TEXT NOT NULL,
    times_correct INTEGER DEFAULT 0, times_wrong INTEGER DEFAULT 0,
    accuracy_pct NUMERIC DEFAULT 50, is_active BOOLEAN DEFAULT true,
    confidence INTEGER DEFAULT 50, source TEXT DEFAULT 'learned'
);

CREATE TABLE IF NOT EXISTS ayn_world_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    signal_date DATE NOT NULL DEFAULT CURRENT_DATE,
    signal_type TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'medium',
    headline TEXT NOT NULL, summary TEXT, region TEXT,
    countries_involved TEXT[],
    impact_on_oil TEXT, impact_on_gold TEXT, impact_on_btc TEXT,
    impact_on_usd TEXT, impact_on_equities TEXT,
    historical_parallel TEXT, status TEXT DEFAULT 'active',
    verified BOOLEAN DEFAULT false, confidence_impact INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ayn_world_simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_event_id UUID, trigger_title TEXT,
    total_events_generated INTEGER DEFAULT 0,
    cascade_depth_reached INTEGER DEFAULT 0,
    actors_activated TEXT[], market_scenarios JSONB DEFAULT '{}',
    simulation_summary TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_consensus_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset TEXT NOT NULL, asset_category TEXT, horizon TEXT NOT NULL,
    target_date DATE, baseline_value NUMERIC,
    consensus_direction TEXT, consensus_confidence INTEGER,
    ayn_direction TEXT, ayn_confidence INTEGER, ayn_reasoning TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent Society
CREATE TABLE IF NOT EXISTS ayn_agent_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_run_id UUID, world_event_id UUID,
    topic TEXT NOT NULL, topic_summary TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
    signal_id UUID, signal_headline TEXT, signal_type TEXT,
    triggered_by TEXT DEFAULT 'manual',
    metadata JSONB, user_id UUID,
    is_private BOOLEAN DEFAULT true,
    simulation_type TEXT DEFAULT 'world_event',
    visibility TEXT DEFAULT 'private'
);

CREATE TABLE IF NOT EXISTS ayn_agent_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID,
    agent_id TEXT NOT NULL, agent_name TEXT NOT NULL,
    agent_role TEXT NOT NULL, agent_flag TEXT,
    message TEXT NOT NULL,
    message_type TEXT DEFAULT 'statement',
    emotion TEXT NOT NULL DEFAULT 'neutral',
    emotion_intensity INTEGER DEFAULT 50,
    internal_thought TEXT, confidence_level INTEGER DEFAULT 70,
    responding_to_agent TEXT, market_action JSONB,
    sequence_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(), cascade_round INTEGER
);

CREATE TABLE IF NOT EXISTS ayn_agent_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL, agent_name TEXT NOT NULL,
    current_emotion TEXT DEFAULT 'neutral',
    emotion_intensity INTEGER DEFAULT 50,
    stress_level INTEGER DEFAULT 30, confidence INTEGER DEFAULT 70,
    key_concern TEXT, stance_summary TEXT, last_action TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    agent_category TEXT DEFAULT 'government',
    agent_flag TEXT, agent_role TEXT DEFAULT 'government',
    country TEXT, region TEXT, full_persona TEXT,
    memory_summary TEXT, initialized BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS ayn_agent_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL, memory_type TEXT NOT NULL,
    subject TEXT NOT NULL, content TEXT NOT NULL,
    strength INTEGER DEFAULT 50, valence TEXT DEFAULT 'neutral',
    formed_at TIMESTAMPTZ DEFAULT NOW(),
    last_reinforced TIMESTAMPTZ DEFAULT NOW(),
    decay_rate DOUBLE PRECISION DEFAULT 0.05,
    source_conversation_id UUID
);

CREATE TABLE IF NOT EXISTS ayn_agent_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL, target_agent_id TEXT NOT NULL,
    trust_level INTEGER DEFAULT 50, alignment TEXT DEFAULT 'neutral',
    last_interaction TIMESTAMPTZ DEFAULT NOW(),
    interaction_count INTEGER DEFAULT 0, notes TEXT
);

CREATE TABLE IF NOT EXISTS ayn_agent_run_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    current_node TEXT NOT NULL DEFAULT 'init',
    node_data JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ, error_node TEXT, error_message TEXT,
    retry_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ayn_agent_coalitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_key TEXT NOT NULL, coalition_name TEXT NOT NULL,
    member_agents TEXT[] NOT NULL, shared_position TEXT,
    formed_at TIMESTAMPTZ DEFAULT NOW(), conversation_id UUID
);

CREATE TABLE IF NOT EXISTS ayn_simulation_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    conversation_id UUID, event TEXT NOT NULL,
    consensus_agents TEXT[], consensus_view TEXT,
    conflict_agents TEXT[], conflict_summary TEXT,
    coalitions JSONB, narrative TEXT, signal_type TEXT, user_id UUID
);

-- Knowledge Graph
CREATE TABLE IF NOT EXISTS ayn_kg_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    entity_id TEXT NOT NULL, entity_name TEXT NOT NULL,
    entity_type TEXT NOT NULL, description TEXT,
    properties JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS ayn_kg_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    source_id TEXT NOT NULL, target_id TEXT NOT NULL,
    relationship TEXT NOT NULL, strength DOUBLE PRECISION DEFAULT 0.5,
    direction TEXT DEFAULT 'positive', context TEXT, event_trigger TEXT
);

CREATE TABLE IF NOT EXISTS ayn_kg_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    conversation_id UUID, event TEXT NOT NULL, signal_type TEXT,
    nodes JSONB NOT NULL, edges JSONB NOT NULL,
    ontology_summary TEXT, user_id UUID
);

-- Dev Agent
CREATE TABLE IF NOT EXISTS ayn_dev_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL DEFAULT 'New conversation',
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_dev_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    role TEXT NOT NULL, content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_dev_agent_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL, key TEXT NOT NULL,
    value TEXT NOT NULL, source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_dev_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general',
    description TEXT NOT NULL, content TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AYN operational
CREATE TABLE IF NOT EXISTS ayn_decision_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
    decision TEXT NOT NULL, context TEXT,
    world_conditions JSONB DEFAULT '{}', outcome TEXT,
    outcome_date TIMESTAMPTZ, lesson TEXT, status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS ayn_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type TEXT NOT NULL, target_id TEXT, target_type TEXT,
    summary TEXT NOT NULL, details JSONB DEFAULT '{}',
    triggered_by TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_accuracy_calibration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset TEXT NOT NULL, real_accuracy_pct NUMERIC NOT NULL,
    total_resolved INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0,
    avg_claimed_confidence NUMERIC, overconfidence_gap NUMERIC,
    calibration_factor NUMERIC, reliability_tier TEXT,
    should_show_uncertainty BOOLEAN DEFAULT false,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_wisdom_frameworks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    source TEXT NOT NULL, source_full TEXT, category TEXT NOT NULL,
    principle TEXT NOT NULL, quote TEXT, reference TEXT,
    trigger_conditions TEXT[], applies_to_assets TEXT[],
    prediction_bias TEXT, confidence_weight INTEGER DEFAULT 50,
    active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS ayn_business_timing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
    sector TEXT NOT NULL, sub_sector TEXT, region TEXT DEFAULT 'global',
    timing_signal TEXT NOT NULL, timing_score INTEGER,
    confidence INTEGER DEFAULT 60, reason TEXT NOT NULL,
    status TEXT DEFAULT 'active', prediction_date DATE DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS ayn_lean_context (
    id INTEGER NOT NULL DEFAULT 1 PRIMARY KEY,
    brief TEXT NOT NULL DEFAULT '',
    regime TEXT NOT NULL DEFAULT 'NEUTRAL',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_error_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_type TEXT NOT NULL, component TEXT NOT NULL,
    operation TEXT, error_message TEXT,
    context JSONB DEFAULT '{}', severity TEXT DEFAULT 'ERROR',
    resolved BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_prediction_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id UUID NOT NULL, user_id UUID NOT NULL,
    vote TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_backtests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_title TEXT NOT NULL, event_date DATE NOT NULL,
    event_description TEXT NOT NULL, actual_outcome TEXT NOT NULL,
    ayn_prediction JSONB, accuracy_score NUMERIC,
    is_published BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_prediction_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id UUID, snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    prediction_title TEXT NOT NULL, prediction_domain TEXT NOT NULL,
    prediction_region TEXT NOT NULL, confidence_at_prediction INTEGER NOT NULL,
    horizon TEXT NOT NULL, was_correct BOOLEAN, accuracy_score INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_prediction_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
    label TEXT NOT NULL, canonical_domain TEXT,
    prediction_count INTEGER DEFAULT 0, cohesion_score NUMERIC, run_id TEXT
);

CREATE TABLE IF NOT EXISTS ayn_prediction_cluster_members (
    prediction_id UUID NOT NULL, cluster_id UUID NOT NULL,
    confidence_label TEXT NOT NULL, centrality_score NUMERIC DEFAULT 0,
    is_bridge BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_prediction_domains (
    id TEXT PRIMARY KEY, label TEXT NOT NULL, color TEXT, description TEXT
);

CREATE TABLE IF NOT EXISTS ayn_prediction_graph_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    source_id UUID NOT NULL, target_id UUID NOT NULL,
    relation TEXT NOT NULL, confidence_label TEXT NOT NULL,
    surprise_score NUMERIC DEFAULT 0, why TEXT,
    shared_signals JSONB DEFAULT '[]', run_id TEXT
);

CREATE TABLE IF NOT EXISTS ayn_graph_runs (
    id TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT NOW(),
    predictions_in INTEGER DEFAULT 0, clusters_out INTEGER DEFAULT 0,
    edges_out INTEGER DEFAULT 0, bridge_nodes INTEGER DEFAULT 0,
    duration_ms INTEGER, status TEXT DEFAULT 'running', notes TEXT
);

CREATE TABLE IF NOT EXISTS ayn_graph_engine_runs (
    id TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'running', duration_ms INTEGER,
    signals_ingested INTEGER DEFAULT 0, connections_found INTEGER DEFAULT 0,
    predictions_written INTEGER DEFAULT 0, model_used TEXT, notes TEXT
);

CREATE TABLE IF NOT EXISTS ayn_intelligence_accuracy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    prediction_type TEXT NOT NULL, domain TEXT,
    period_start DATE NOT NULL, period_end DATE NOT NULL,
    total INTEGER DEFAULT 0, correct INTEGER DEFAULT 0,
    accuracy_pct NUMERIC, grade TEXT, meets_threshold BOOLEAN
);

CREATE TABLE IF NOT EXISTS ayn_intelligence_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    lesson_type TEXT NOT NULL, domain TEXT, region TEXT,
    lesson_title TEXT NOT NULL, lesson_detail TEXT NOT NULL,
    rule_adjustment TEXT, confidence INTEGER DEFAULT 70,
    times_validated INTEGER DEFAULT 1, is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS ayn_consequence_chains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id UUID, trigger_event TEXT NOT NULL,
    trigger_threshold TEXT, consequences JSONB NOT NULL DEFAULT '[]',
    chain_status TEXT DEFAULT 'monitoring', created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_daily_run_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date DATE NOT NULL, run_type TEXT NOT NULL,
    predictions_written INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_resolution_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    prediction_id UUID, resolution_status TEXT DEFAULT 'pending',
    resolved_by TEXT DEFAULT 'admin', priority TEXT DEFAULT 'normal'
);

CREATE TABLE IF NOT EXISTS ayn_private_simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, title TEXT NOT NULL,
    idea_description TEXT NOT NULL, simulation_type TEXT NOT NULL DEFAULT 'idea',
    target_market TEXT, simulation_result JSONB,
    consensus_score NUMERIC, recommendation TEXT,
    confidence_pct NUMERIC, status TEXT DEFAULT 'pending',
    is_private BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_agent_memory_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL, event_type TEXT NOT NULL,
    event_title TEXT, event_summary TEXT NOT NULL,
    emotional_impact TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), cascade_id UUID
);

-- Company / AI Employees
CREATE TABLE IF NOT EXISTS ayn_sales_pipeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL, company_url TEXT,
    contact_email TEXT NOT NULL, contact_name TEXT,
    industry TEXT, pain_points TEXT[] DEFAULT '{}',
    recommended_services TEXT[] DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'lead',
    emails_sent INTEGER NOT NULL DEFAULT 0,
    admin_approved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_employee TEXT NOT NULL, to_employee TEXT NOT NULL,
    task_type TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'pending',
    input_data JSONB DEFAULT '{}', output_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS employee_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id TEXT NOT NULL,
    beliefs JSONB NOT NULL DEFAULT '{}',
    emotional_stance TEXT NOT NULL DEFAULT 'calm',
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    core_motivation TEXT, active_objectives TEXT[] DEFAULT '{}',
    recent_decisions JSONB DEFAULT '[]',
    chime_in_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    initiative_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_reflections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id TEXT NOT NULL, action_ref TEXT,
    reasoning TEXT, expected_outcome TEXT,
    confidence DOUBLE PRECISION DEFAULT 0.5,
    actual_outcome TEXT, outcome_evaluated BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_discussions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discussion_id UUID NOT NULL DEFAULT gen_random_uuid(),
    topic TEXT NOT NULL, employee_id TEXT NOT NULL,
    position TEXT, reasoning TEXT, confidence DOUBLE PRECISION DEFAULT 0.5,
    impact_level TEXT NOT NULL DEFAULT 'medium',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_objectives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL, metric TEXT, target_value DOUBLE PRECISION,
    current_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    deadline TIMESTAMPTZ, priority INTEGER NOT NULL DEFAULT 3,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    momentum TEXT NOT NULL DEFAULT 'stable',
    stress_level DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    growth_velocity TEXT NOT NULL DEFAULT 'growing',
    risk_exposure TEXT NOT NULL DEFAULT 'low',
    morale TEXT NOT NULL DEFAULT 'high',
    context JSONB DEFAULT '{}', updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period TEXT NOT NULL, summary TEXT,
    key_wins JSONB DEFAULT '[]', key_losses JSONB DEFAULT '[]',
    strategic_shift TEXT,
    created_by TEXT NOT NULL DEFAULT 'chief_of_staff',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS founder_directives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    directive TEXT NOT NULL, category TEXT DEFAULT 'general',
    priority INTEGER DEFAULT 1, is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(), expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS founder_context (
    id INTEGER NOT NULL DEFAULT 1 PRIMARY KEY,
    current_projects JSONB DEFAULT '[]',
    open_decisions JSONB DEFAULT '[]',
    people_context JSONB DEFAULT '{}',
    current_priorities TEXT[] DEFAULT '{}',
    mood_signal TEXT DEFAULT 'focused',
    last_topics JSONB DEFAULT '[]', preferences JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_telegram_bots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id TEXT NOT NULL, bot_token TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_event_debounce (
    agent_name TEXT PRIMARY KEY,
    last_triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_economics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id TEXT NOT NULL, service_name TEXT NOT NULL,
    acquisition_difficulty INTEGER NOT NULL DEFAULT 5,
    scalability_score INTEGER NOT NULL DEFAULT 5,
    average_margin DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    category TEXT NOT NULL DEFAULT 'service',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin / System
CREATE TABLE IF NOT EXISTS admin_ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL, message TEXT NOT NULL,
    role TEXT NOT NULL, context JSONB, actions_taken JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_notification_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_type TEXT NOT NULL, recipient_email TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true, settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_type TEXT NOT NULL, recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL, content TEXT,
    status TEXT NOT NULL DEFAULT 'sent', error_message TEXT,
    metadata JSONB DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_mode_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mode_name TEXT NOT NULL, webhook_url TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type TEXT NOT NULL, subject TEXT NOT NULL, content TEXT NOT NULL,
    user_id UUID, metadata JSONB DEFAULT '{}',
    sent_at TIMESTAMPTZ DEFAULT NOW(), status TEXT DEFAULT 'sent',
    error_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, endpoint TEXT NOT NULL,
    request_count INTEGER DEFAULT 0, window_start TIMESTAMPTZ DEFAULT NOW(),
    max_requests INTEGER DEFAULT 100, blocked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL, generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    system_status TEXT NOT NULL, total_issues INTEGER NOT NULL DEFAULT 0,
    issues_fixed INTEGER NOT NULL DEFAULT 0,
    performance_metrics JSONB, issues JSONB, recommendations TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_emergency_shutdown BOOLEAN NOT NULL DEFAULT false,
    shutdown_reason TEXT, last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    function_name TEXT NOT NULL, response_time_ms INTEGER,
    status_code INTEGER, is_healthy BOOLEAN DEFAULT true,
    error_message TEXT, checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id TEXT NOT NULL, user_id UUID, endpoint TEXT NOT NULL,
    intent TEXT, status TEXT NOT NULL DEFAULT 'pending',
    latency_ms INTEGER, error TEXT, metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_type TEXT NOT NULL, metric_value NUMERIC NOT NULL,
    measurement_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_message TEXT NOT NULL, error_stack TEXT,
    url TEXT, user_id UUID, user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), status TEXT DEFAULT 'open',
    resolved_at TIMESTAMPTZ, source TEXT DEFAULT 'frontend',
    severity TEXT DEFAULT 'error', context JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS error_group_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_pattern TEXT NOT NULL, status TEXT DEFAULT 'open',
    resolution_note TEXT, resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, action TEXT NOT NULL, details JSONB DEFAULT '{}',
    ip_address INET, user_agent TEXT, severity TEXT DEFAULT 'info',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, incident_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    strike_count INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'detected',
    details JSONB DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS threat_detection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_ip INET NOT NULL, threat_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB NOT NULL DEFAULT '{}', user_id UUID,
    is_blocked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emergency_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_level TEXT NOT NULL, alert_type TEXT NOT NULL,
    triggered_by UUID, trigger_reason TEXT NOT NULL,
    auto_triggered BOOLEAN DEFAULT false, is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Engineering
CREATE TABLE IF NOT EXISTS grading_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, project_name TEXT NOT NULL, description TEXT,
    survey_points JSONB NOT NULL DEFAULT '[]', terrain_analysis JSONB,
    requirements TEXT, design_result JSONB,
    cut_volume NUMERIC, fill_volume NUMERIC, net_volume NUMERIC, total_cost NUMERIC,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engineering_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, activity_type TEXT NOT NULL,
    summary TEXT NOT NULL, details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engineering_portfolio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, calculation_id UUID,
    title TEXT NOT NULL, description TEXT, project_type TEXT NOT NULL,
    key_specs JSONB DEFAULT '{}', is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS building_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code_system TEXT NOT NULL, category TEXT NOT NULL,
    requirement_id TEXT NOT NULL, requirement_name TEXT NOT NULL,
    check_type TEXT NOT NULL, value_min NUMERIC, value_max NUMERIC,
    unit TEXT, applies_to TEXT, fix_suggestion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS climate_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country TEXT NOT NULL, region TEXT NOT NULL, zone_code TEXT,
    frost_depth_mm INTEGER, ground_snow_load_kpa NUMERIC,
    wind_speed_kmh NUMERIC, seismic_category TEXT
);

CREATE TABLE IF NOT EXISTS compliance_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, project_name TEXT NOT NULL,
    location_country TEXT, code_system TEXT, building_type TEXT,
    total_checks INTEGER DEFAULT 0, passed_checks INTEGER DEFAULT 0,
    failed_checks INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_inputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL, input_type TEXT NOT NULL,
    room_name TEXT, room_area NUMERIC, ceiling_height NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL, input_id UUID,
    requirement_name TEXT, status TEXT NOT NULL,
    fix_suggestion TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drawing_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, project_name TEXT,
    layout_json JSONB, style_preset TEXT,
    conversation_history JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS material_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_name TEXT NOT NULL, material_category TEXT NOT NULL,
    unit TEXT NOT NULL, price_sar NUMERIC NOT NULL,
    supplier TEXT, region TEXT DEFAULT 'Riyadh',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Other
CREATE TABLE IF NOT EXISTS contact_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS application_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL, subject TEXT NOT NULL,
    message TEXT NOT NULL, sent_by UUID, email_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creator_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, display_name TEXT NOT NULL, bio TEXT,
    instagram_handle TEXT, tiktok_handle TEXT,
    is_published BOOLEAN DEFAULT false, is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS beta_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, overall_rating INTEGER,
    favorite_features TEXT[], improvement_suggestions TEXT,
    bugs_encountered TEXT, would_recommend BOOLEAN,
    credits_awarded INTEGER DEFAULT 0, submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brain_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brain_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, message TEXT, response TEXT,
    model_used TEXT, tools_used TEXT[], iterations INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS llm_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID, user_id UUID, error_type TEXT NOT NULL,
    error_message TEXT, request_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS llm_cost_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE UNIQUE,
    total_requests INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost_usd NUMERIC NOT NULL DEFAULT 0,
    model_breakdown JSONB DEFAULT '{}', intent_breakdown JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_pin_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, new_pin_hash TEXT NOT NULL,
    approval_token TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inbound_email_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_email TEXT NOT NULL, from_name TEXT, to_email TEXT NOT NULL,
    subject TEXT, body_text TEXT, in_reply_to TEXT, message_id TEXT,
    pipeline_lead_id UUID, is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_competitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    handle TEXT NOT NULL, name TEXT, notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_scraped_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competitor_tweets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id UUID NOT NULL, tweet_id TEXT, content TEXT,
    likes INTEGER DEFAULT 0, retweets INTEGER DEFAULT 0,
    posted_at TIMESTAMPTZ, scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stress_test_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_name TEXT NOT NULL, concurrent_users INTEGER,
    avg_response_time_ms DOUBLE PRECISION,
    error_rate DOUBLE PRECISION, success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0, run_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for the most queried tables
CREATE INDEX IF NOT EXISTS idx_ayn_world_signals_status ON ayn_world_signals(status);
CREATE INDEX IF NOT EXISTS idx_ayn_world_signals_created ON ayn_world_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ayn_world_predictions_status ON ayn_world_predictions(status);
CREATE INDEX IF NOT EXISTS idx_ayn_world_predictions_domain ON ayn_world_predictions(domain);
CREATE INDEX IF NOT EXISTS idx_ayn_master_predictions_status ON ayn_master_predictions(check_status);
CREATE INDEX IF NOT EXISTS idx_ayn_agent_messages_conv ON ayn_agent_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ayn_agent_messages_created ON ayn_agent_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_ayn_predictions_status ON ayn_predictions(status);
CREATE INDEX IF NOT EXISTS idx_ayn_predictions_asset ON ayn_predictions(asset);
CREATE INDEX IF NOT EXISTS idx_ayn_country_intel_code ON ayn_country_intelligence(country_code);
CREATE INDEX IF NOT EXISTS idx_ayn_trade_flows_code ON ayn_trade_flows(country_code);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at DESC);
