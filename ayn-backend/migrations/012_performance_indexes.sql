-- Migration 012: Performance indexes for common queries

-- Chat: messages loaded by session constantly
CREATE INDEX IF NOT EXISTS idx_messages_session_created 
  ON messages(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_user_created 
  ON messages(user_id, created_at DESC);

-- Chat sessions by user
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_created 
  ON chat_sessions(user_id, created_at DESC);

-- Intelligence: most common query pattern
CREATE INDEX IF NOT EXISTS idx_world_predictions_status_created 
  ON ayn_world_predictions(status, created_at DESC) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_world_signals_status_created 
  ON ayn_world_signals(status, created_at DESC) WHERE status = 'active';

-- User memory: loaded on every chat
CREATE INDEX IF NOT EXISTS idx_user_memory_user_updated 
  ON user_memory(user_id, updated_at DESC);

-- User limits: checked on every chat message
CREATE INDEX IF NOT EXISTS idx_user_ai_limits_user 
  ON user_ai_limits(user_id);

-- Support tickets
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status 
  ON support_tickets(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket 
  ON ticket_messages(ticket_id, created_at);

-- Admin: common admin queries
CREATE INDEX IF NOT EXISTS idx_users_created 
  ON users(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_usage_created 
  ON llm_usage_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_failures_created 
  ON llm_failures(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_messages_created 
  ON contact_messages(created_at DESC);

-- Agent messages: society simulation
CREATE INDEX IF NOT EXISTS idx_agent_messages_conv_seq 
  ON ayn_agent_messages(conversation_id, sequence_order);
