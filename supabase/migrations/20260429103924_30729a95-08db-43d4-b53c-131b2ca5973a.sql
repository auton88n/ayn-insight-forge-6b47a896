
-- ============ World Simulation v2 schema ============

-- 1. Persona library (shared, read-only for users)
CREATE TABLE public.world_personas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- social_class | government | company | market | bank | central_bank | media
  subcategory TEXT,
  country TEXT,
  region TEXT,
  flag TEXT,
  age INTEGER,
  gender TEXT,
  ethnicity TEXT,
  religion TEXT,
  income_class TEXT,
  occupation TEXT,
  culture TEXT,
  bio TEXT,
  beliefs TEXT,
  biases TEXT,
  speaking_style TEXT,
  layer INTEGER NOT NULL DEFAULT 5, -- 1..6 (which simulation layer)
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_world_personas_category ON public.world_personas(category);
CREATE INDEX idx_world_personas_layer ON public.world_personas(layer);
CREATE INDEX idx_world_personas_active ON public.world_personas(active) WHERE active;

ALTER TABLE public.world_personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personas are readable by authenticated users"
  ON public.world_personas FOR SELECT
  TO authenticated
  USING (true);

-- 2. Simulation runs
CREATE TABLE public.agent_society_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  seed TEXT NOT NULL,
  question TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'full',
  depth TEXT NOT NULL DEFAULT 'standard',
  agent_count INTEGER NOT NULL DEFAULT 50,
  user_target JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|running|completed|failed
  current_layer INTEGER DEFAULT 0,
  report JSONB,
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_runs_user_created ON public.agent_society_runs(user_id, created_at DESC);
ALTER TABLE public.agent_society_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own runs" ON public.agent_society_runs FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "Users insert own runs" ON public.agent_society_runs FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users update own runs" ON public.agent_society_runs FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "Users delete own runs" ON public.agent_society_runs FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- 3. Per-agent messages per layer
CREATE TABLE public.agent_society_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  user_id UUID NOT NULL,
  persona_id TEXT NOT NULL,
  persona_name TEXT,
  persona_category TEXT,
  layer INTEGER NOT NULL,
  round INTEGER NOT NULL DEFAULT 1,
  public_statement TEXT,
  inner_thought TEXT,
  concrete_action TEXT,
  emotion TEXT,
  emotion_intensity INTEGER,
  belief_score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_msgs_run ON public.agent_society_messages(run_id, layer, round);
CREATE INDEX idx_msgs_user ON public.agent_society_messages(user_id, created_at DESC);
ALTER TABLE public.agent_society_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own msgs" ON public.agent_society_messages FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "Users insert own msgs" ON public.agent_society_messages FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users delete own msgs" ON public.agent_society_messages FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- 4. Per-user persona state (the "world memory")
CREATE TABLE public.agent_society_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  persona_id TEXT NOT NULL,
  emotion TEXT DEFAULT 'neutral',
  emotion_intensity INTEGER DEFAULT 50,
  belief_score NUMERIC DEFAULT 50,
  recent_summary TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, persona_id)
);

CREATE INDEX idx_state_user ON public.agent_society_state(user_id);
ALTER TABLE public.agent_society_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own state" ON public.agent_society_state FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "Users write own state" ON public.agent_society_state FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users update own state" ON public.agent_society_state FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "Users delete own state" ON public.agent_society_state FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- 5. Per-user news feed history
CREATE TABLE public.agent_society_news_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT,
  source TEXT,
  url TEXT,
  category TEXT,
  agents_affected INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_news_user ON public.agent_society_news_feed(user_id, created_at DESC);
ALTER TABLE public.agent_society_news_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own news" ON public.agent_society_news_feed FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "Users insert own news" ON public.agent_society_news_feed FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users delete own news" ON public.agent_society_news_feed FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);
