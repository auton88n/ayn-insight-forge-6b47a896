
-- Add pinned_chats table
CREATE TABLE IF NOT EXISTS pinned_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    title TEXT,
    pinned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_pinned_chats_user ON pinned_chats(user_id);
