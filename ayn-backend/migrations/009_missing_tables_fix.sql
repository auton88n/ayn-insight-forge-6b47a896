-- Migration 009: Create tables that are still missing after 008

CREATE TABLE IF NOT EXISTS ayn_agent_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_run_id UUID,
    world_event_id UUID,
    topic TEXT NOT NULL,
    topic_summary TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    signal_id UUID,
    signal_headline TEXT,
    signal_type TEXT,
    signal_severity TEXT,
    signal_region TEXT,
    triggered_by TEXT DEFAULT 'manual',
    metadata JSONB,
    user_id UUID,
    is_private BOOLEAN DEFAULT true,
    simulation_type TEXT DEFAULT 'world_event',
    originality_check JSONB,
    visibility TEXT DEFAULT 'private'
);

CREATE TABLE IF NOT EXISTS ayn_sales_pipeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    company_url TEXT,
    contact_email TEXT NOT NULL,
    contact_name TEXT,
    industry TEXT,
    pain_points TEXT[] DEFAULT '{}',
    recommended_services TEXT[] DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'lead',
    emails_sent INTEGER NOT NULL DEFAULT 0,
    last_email_at TIMESTAMPTZ,
    next_follow_up_at TIMESTAMPTZ,
    notes TEXT,
    context JSONB DEFAULT '{}',
    admin_approved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
