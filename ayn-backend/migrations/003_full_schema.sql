-- ============================================================
-- AYN Full Schema Migration — all missing tables from Supabase
-- ============================================================

-- User extensions
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_name TEXT,
    contact_person TEXT,
    business_type TEXT,
    avatar_url TEXT,
    last_login TIMESTAMPTZ,
    total_sessions INTEGER DEFAULT 0,
    account_status TEXT DEFAULT 'active',
    business_context TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preferred_language TEXT DEFAULT 'en',
    currency TEXT DEFAULT 'SAR',
    region TEXT DEFAULT 'SA',
    building_code TEXT DEFAULT 'SBC',
    personalization_enabled BOOLEAN DEFAULT true,
    communication_style TEXT DEFAULT 'casual',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_usage_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    message_count INTEGER NOT NULL DEFAULT 0,
    engineering_count INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost_usd NUMERIC NOT NULL DEFAULT 0,
    intent_breakdown JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT false,
    granted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    notes TEXT,
    monthly_limit INTEGER,
    current_month_usage INTEGER DEFAULT 0,
    usage_reset_date DATE,
    requires_approval BOOLEAN DEFAULT false,
    auth_method TEXT DEFAULT 'email',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS terms_consent_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    terms_version TEXT NOT NULL DEFAULT '2026-02-07',
    privacy_accepted BOOLEAN NOT NULL DEFAULT false,
    terms_accepted BOOLEAN NOT NULL DEFAULT false,
    ai_disclaimer_accepted BOOLEAN NOT NULL DEFAULT false,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent TEXT
);

CREATE TABLE IF NOT EXISTS device_fingerprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fingerprint_hash TEXT NOT NULL,
    device_info JSONB NOT NULL DEFAULT '{}',
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_trusted BOOLEAN DEFAULT false,
    login_count INTEGER DEFAULT 1,
    location_info JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chat extensions
CREATE TABLE IF NOT EXISTS favorite_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    chat_title TEXT NOT NULL,
    chat_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, session_id)
);

CREATE TABLE IF NOT EXISTS message_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id TEXT,
    message_preview TEXT NOT NULL,
    rating TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    mode TEXT,
    emotion TEXT,
    session_id TEXT,
    title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    insight_text TEXT NOT NULL,
    category TEXT,
    tags TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Support
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    guest_email TEXT,
    guest_name TEXT,
    subject TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    priority TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'open',
    assigned_to UUID,
    has_unread_reply BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_ticket_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    sent_by TEXT NOT NULL DEFAULT 'admin',
    is_ai_generated BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL,
    sender_id UUID,
    message TEXT NOT NULL,
    attachments JSONB DEFAULT '[]',
    is_internal_note BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Business/CRM
CREATE TABLE IF NOT EXISTS custom_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    company_email TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    company_phone TEXT,
    company_address TEXT,
    order_title TEXT NOT NULL,
    order_description TEXT,
    services JSONB NOT NULL DEFAULT '[]',
    subtotal NUMERIC NOT NULL DEFAULT 0,
    discount_percent NUMERIC DEFAULT 0,
    tax_percent NUMERIC DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'SAR',
    terms_and_conditions TEXT,
    delivery_timeline TEXT,
    admin_signature_url TEXT,
    client_signature_url TEXT,
    admin_signed_at TIMESTAMPTZ,
    client_signed_at TIMESTAMPTZ,
    stripe_payment_link TEXT,
    stripe_payment_id TEXT,
    contract_pdf_url TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    email_sent_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    signing_token UUID DEFAULT gen_random_uuid(),
    client_viewed_at TIMESTAMPTZ,
    payment_terms TEXT,
    scope_of_work TEXT,
    phase_breakdown JSONB DEFAULT '[]',
    paid_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nda_agreements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    company_email TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    company_phone TEXT,
    company_address TEXT,
    nda_purpose TEXT,
    confidential_info TEXT,
    obligations TEXT,
    exclusions TEXT,
    duration TEXT,
    governing_law TEXT,
    additional_clauses TEXT,
    notes TEXT,
    signing_token UUID DEFAULT gen_random_uuid(),
    admin_signature_url TEXT,
    client_signature_url TEXT,
    admin_signed_at TIMESTAMPTZ,
    client_signed_at TIMESTAMPTZ,
    client_viewed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'draft',
    email_sent_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_type TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    message TEXT,
    custom_fields JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'new',
    assigned_to UUID,
    email_sent BOOLEAN DEFAULT false,
    email_error TEXT,
    last_contacted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_gifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    gift_type TEXT DEFAULT 'manual',
    given_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Engineering
CREATE TABLE IF NOT EXISTS engineering_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_name TEXT NOT NULL,
    project_type TEXT NOT NULL,
    inputs JSONB NOT NULL DEFAULT '{}',
    results JSONB DEFAULT '{}',
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calculation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID,
    calculation_type TEXT NOT NULL,
    inputs JSONB NOT NULL DEFAULT '{}',
    outputs JSONB NOT NULL DEFAULT '{}',
    ai_analysis JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chart_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT,
    image_url TEXT,
    ticker TEXT,
    asset_type TEXT,
    timeframe TEXT,
    technical_analysis JSONB DEFAULT '{}',
    news_data JSONB DEFAULT '[]',
    sentiment_score NUMERIC,
    prediction_signal TEXT,
    confidence INTEGER,
    prediction_details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- System / admin
CREATE TABLE IF NOT EXISTS system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL,
    updated_by UUID,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS llm_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    intent_type TEXT NOT NULL,
    priority INTEGER DEFAULT 1,
    cost_per_1k_input NUMERIC DEFAULT 0,
    cost_per_1k_output NUMERIC DEFAULT 0,
    is_enabled BOOLEAN DEFAULT true,
    max_tokens INTEGER DEFAULT 4096,
    supports_streaming BOOLEAN DEFAULT true,
    api_endpoint TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS llm_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    model_name TEXT,
    intent_type TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_sar NUMERIC DEFAULT 0,
    response_time_ms INTEGER,
    was_fallback BOOLEAN DEFAULT false,
    fallback_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    severity TEXT DEFAULT 'info',
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address INET NOT NULL,
    block_reason TEXT NOT NULL,
    blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    blocked_until TIMESTAMPTZ,
    block_type TEXT NOT NULL DEFAULT 'automatic',
    threat_level TEXT NOT NULL DEFAULT 'medium',
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    attempt_count INTEGER DEFAULT 1,
    last_attempt TIMESTAMPTZ DEFAULT NOW(),
    blocked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email_type TEXT NOT NULL,
    recipient_email TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'sent',
    metadata JSONB DEFAULT '{}',
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS faq_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    order_index INTEGER NOT NULL DEFAULT 0,
    is_published BOOLEAN NOT NULL DEFAULT false,
    view_count INTEGER NOT NULL DEFAULT 0,
    helpful_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS twitter_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    psychological_strategy TEXT,
    target_audience TEXT,
    content_type TEXT,
    quality_score JSONB,
    tweet_id TEXT,
    error_message TEXT,
    posted_at TIMESTAMPTZ,
    image_url TEXT,
    scheduled_at TIMESTAMPTZ,
    thread_id UUID,
    thread_order INTEGER,
    created_by TEXT DEFAULT 'ai',
    created_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS visitor_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id TEXT NOT NULL,
    page_path TEXT NOT NULL,
    referrer TEXT,
    country TEXT,
    country_code TEXT,
    city TEXT,
    region TEXT,
    device_type TEXT,
    browser TEXT,
    os TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    session_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    usage_count INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_cache (
    ticker TEXT PRIMARY KEY,
    news_data JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_name TEXT,
    total_tests INTEGER DEFAULT 0,
    passed_tests INTEGER DEFAULT 0,
    failed_tests INTEGER DEFAULT 0,
    skipped_tests INTEGER DEFAULT 0,
    duration_ms INTEGER,
    triggered_by TEXT DEFAULT 'manual',
    environment TEXT DEFAULT 'production',
    git_commit TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    test_suite TEXT NOT NULL,
    test_name TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_ms INTEGER,
    error_message TEXT,
    screenshot_url TEXT,
    browser TEXT,
    viewport TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- World Intelligence missing tables
CREATE TABLE IF NOT EXISTS ayn_world_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    event_type TEXT NOT NULL,
    category TEXT NOT NULL,
    signal_type TEXT,
    time_layer TEXT NOT NULL DEFAULT 'present',
    event_date DATE,
    predicted_date DATE,
    probability INTEGER,
    region TEXT,
    countries_involved TEXT[],
    actor_reactions JSONB DEFAULT '[]',
    market_impact JSONB DEFAULT '{}',
    historical_parallel TEXT,
    cascade_depth INTEGER DEFAULT 0,
    confidence INTEGER DEFAULT 70,
    status TEXT DEFAULT 'active',
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_geopolitical (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    active_conflicts JSONB DEFAULT '[]',
    sanctions JSONB DEFAULT '[]',
    elections_upcoming JSONB DEFAULT '[]',
    trade_tensions JSONB DEFAULT '[]',
    risk_by_region JSONB DEFAULT '{}',
    intelligence_brief JSONB DEFAULT '[]',
    singleton_key INTEGER DEFAULT 1,
    UNIQUE(singleton_key)
);

CREATE TABLE IF NOT EXISTS ayn_market_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    energy JSONB DEFAULT '{}',
    metals JSONB DEFAULT '{}',
    agriculture JSONB DEFAULT '{}',
    indices JSONB DEFAULT '{}',
    currencies JSONB DEFAULT '{}',
    crypto JSONB DEFAULT '{}',
    correlations JSONB DEFAULT '{}',
    narrative JSONB DEFAULT '[]',
    singleton_key INTEGER DEFAULT 1,
    UNIQUE(singleton_key)
);

CREATE TABLE IF NOT EXISTS ayn_business_news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    country_code TEXT,
    sector TEXT,
    headlines JSONB DEFAULT '[]',
    summary TEXT,
    sentiment TEXT,
    singleton_key INTEGER
);

CREATE TABLE IF NOT EXISTS ayn_early_warnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    signal_date DATE NOT NULL DEFAULT CURRENT_DATE,
    signal_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    mainstream_awareness TEXT DEFAULT 'none',
    days_ahead_estimate INTEGER,
    data_point TEXT,
    data_value TEXT,
    short_term_implication TEXT,
    medium_term_implication TEXT,
    long_term_implication TEXT,
    affected_assets TEXT[],
    affected_regions TEXT[],
    status TEXT DEFAULT 'active',
    confirmed_mainstream_at DATE,
    days_ahead_actual INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_opportunity_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    prediction_date DATE NOT NULL DEFAULT CURRENT_DATE,
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

CREATE TABLE IF NOT EXISTS ayn_country_risk_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scored_at TIMESTAMPTZ DEFAULT NOW(),
    score_date DATE DEFAULT CURRENT_DATE,
    country TEXT NOT NULL,
    country_code TEXT,
    political_risk INTEGER DEFAULT 50,
    economic_risk INTEGER DEFAULT 50,
    currency_risk INTEGER DEFAULT 50,
    conflict_risk INTEGER DEFAULT 50,
    supply_chain_risk INTEGER DEFAULT 50,
    energy_dependency_risk INTEGER DEFAULT 50,
    debt_risk INTEGER DEFAULT 50,
    social_instability_risk INTEGER DEFAULT 50,
    overall_risk INTEGER,
    risk_trend TEXT,
    key_risks TEXT[],
    key_opportunities TEXT[],
    verdict TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_sector_intel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sector TEXT NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    growth_rate TEXT,
    hot_markets JSONB DEFAULT '[]',
    dying_trends JSONB DEFAULT '[]',
    new_entrants JSONB DEFAULT '[]',
    opportunities JSONB DEFAULT '[]',
    intelligence_brief JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS ayn_global_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    predicted_date DATE NOT NULL DEFAULT CURRENT_DATE,
    domain TEXT NOT NULL,
    subdomain TEXT,
    region TEXT NOT NULL DEFAULT 'Global',
    countries TEXT[] DEFAULT '{}',
    title TEXT NOT NULL,
    headline TEXT NOT NULL,
    what_happens TEXT NOT NULL,
    why_it_happens TEXT NOT NULL,
    consequence_chain JSONB DEFAULT '[]',
    horizon TEXT NOT NULL,
    target_date DATE,
    expires_at DATE,
    confidence INTEGER NOT NULL,
    conviction TEXT NOT NULL,
    impact_oil TEXT,
    impact_gold TEXT,
    impact_btc TEXT,
    impact_usd TEXT,
    impact_equities TEXT,
    impact_bonds TEXT,
    who_benefits TEXT[],
    who_suffers TEXT[],
    leading_indicators TEXT[],
    what_would_invalidate TEXT,
    historical_parallel TEXT,
    data_sources JSONB DEFAULT '{}',
    news_signals TEXT[],
    status TEXT NOT NULL DEFAULT 'active',
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    resolution_correct BOOLEAN,
    accuracy_score INTEGER,
    generated_by TEXT DEFAULT 'ayn_intelligence_v2',
    signal_strength INTEGER DEFAULT 50,
    uniqueness_score INTEGER DEFAULT 50,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    name TEXT NOT NULL,
    trigger TEXT NOT NULL,
    probability INTEGER NOT NULL,
    could_happen_by DATE,
    market_outcomes JSONB DEFAULT '{}',
    geopolitical_outcomes JSONB DEFAULT '[]',
    economic_outcomes JSONB DEFAULT '[]',
    confirmation_signals TEXT[],
    status TEXT DEFAULT 'monitoring',
    parent_prediction_id UUID
);

CREATE TABLE IF NOT EXISTS ayn_truth_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    prediction_id UUID,
    prediction_title TEXT NOT NULL,
    prediction_domain TEXT,
    prediction_region TEXT,
    horizon TEXT,
    what_was_predicted TEXT,
    probability_predicted INTEGER,
    target_date DATE,
    checked_at TIMESTAMPTZ,
    is_happening BOOLEAN,
    is_correct BOOLEAN,
    accuracy_score INTEGER,
    what_actually_happened TEXT,
    evidence_url TEXT,
    correction_notes TEXT,
    lesson_extracted TEXT,
    fed_back_to_model BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS ayn_historical_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    prediction_date DATE NOT NULL DEFAULT CURRENT_DATE,
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

CREATE TABLE IF NOT EXISTS ayn_world_actors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_name TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    region TEXT,
    behavior_profile JSONB DEFAULT '{}',
    current_stance JSONB DEFAULT '{}',
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Agent Society missing tables
CREATE TABLE IF NOT EXISTS ayn_agent_opinion_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    conversation_id UUID,
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    belief_score INTEGER,
    emotion TEXT,
    emotion_intensity INTEGER,
    stance TEXT,
    shifted_from TEXT,
    shift_trigger TEXT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ayn_social_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    conversation_id UUID,
    platform TEXT NOT NULL,
    interaction_type TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    target_agent_id TEXT,
    target_agent_name TEXT,
    content TEXT NOT NULL,
    sentiment TEXT,
    round_number INTEGER,
    thread_id TEXT,
    parent_id UUID,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ayn_crowd_panel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    gender TEXT NOT NULL,
    race TEXT NOT NULL,
    ethnicity TEXT,
    social_class TEXT NOT NULL,
    income_usd_annual INTEGER,
    has_savings BOOLEAN,
    has_property BOOLEAN,
    has_debt BOOLEAN,
    country TEXT NOT NULL,
    region TEXT,
    city_type TEXT,
    education TEXT,
    profession TEXT,
    employment TEXT,
    family_status TEXT,
    children INTEGER DEFAULT 0,
    political_lean TEXT,
    religion TEXT,
    media_diet TEXT,
    voice_sample TEXT[],
    inner_thoughts TEXT[],
    fears TEXT,
    behavioral_bias TEXT,
    exposed_to TEXT[],
    is_active BOOLEAN DEFAULT true,
    times_used INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ayn_mind (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    context JSONB DEFAULT '{}',
    shared_with_admin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ayn_platform_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    conversation_id UUID,
    platform TEXT NOT NULL,
    round_number INTEGER,
    trending_topics TEXT[],
    dominant_sentiment TEXT,
    viral_post_agent TEXT,
    viral_post_content TEXT,
    thread_count INTEGER,
    engagement_score DOUBLE PRECISION,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_custom_orders_status ON custom_orders(status);
CREATE INDEX IF NOT EXISTS idx_nda_token ON nda_agreements(signing_token);
CREATE INDEX IF NOT EXISTS idx_custom_orders_token ON custom_orders(signing_token);
CREATE INDEX IF NOT EXISTS idx_llm_usage_user ON llm_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_visitor_analytics_visitor ON visitor_analytics(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_analytics_created ON visitor_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_ayn_world_events_status ON ayn_world_events(status);
CREATE INDEX IF NOT EXISTS idx_ayn_early_warnings_status ON ayn_early_warnings(status);
CREATE INDEX IF NOT EXISTS idx_ayn_global_preds_status ON ayn_global_predictions(status);
CREATE INDEX IF NOT EXISTS idx_ayn_global_preds_domain ON ayn_global_predictions(domain);
CREATE INDEX IF NOT EXISTS idx_security_logs_user ON security_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_created ON security_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_service_apps_status ON service_applications(status);
CREATE INDEX IF NOT EXISTS idx_engineering_projects_user ON engineering_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_chart_analyses_user ON chart_analyses(user_id);
