-- Migration 011: Force-create ayn_agent_conversations
-- Previous migrations may have failed silently if a partial table existed

DO $$
BEGIN
    -- Check if table exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'ayn_agent_conversations'
    ) THEN
        CREATE TABLE ayn_agent_conversations (
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
    END IF;
END $$;

-- Always add columns if missing (safe to run multiple times)
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
ALTER TABLE ayn_agent_conversations ADD COLUMN IF NOT EXISTS topic_summary TEXT;
ALTER TABLE ayn_agent_conversations ADD COLUMN IF NOT EXISTS simulation_run_id UUID;
ALTER TABLE ayn_agent_conversations ADD COLUMN IF NOT EXISTS world_event_id UUID;
