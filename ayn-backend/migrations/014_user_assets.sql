-- 014_user_assets.sql
-- Enables durable asset storage (avatars, signatures, etc.) in Railway Postgres using BYTEA

CREATE TABLE IF NOT EXISTS user_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_key TEXT NOT NULL, -- e.g., 'avatar'
    mime_type TEXT NOT NULL,
    file_data BYTEA NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, asset_key)
);

CREATE INDEX IF NOT EXISTS idx_user_assets_user_id ON user_assets(user_id);
