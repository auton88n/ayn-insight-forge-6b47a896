-- Fix: Enable RLS on tables that were missing it (security audit 2026-05-01)

ALTER TABLE public.ayn_agent_memory_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ayn_crowd_panel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ayn_kg_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ayn_kg_edges ENABLE ROW LEVEL SECURITY;

-- ayn_agent_memory_log: authenticated users read/write their own, admins read all
CREATE POLICY "Users read own agent memory log"
  ON public.ayn_agent_memory_log FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users insert own agent memory log"
  ON public.ayn_agent_memory_log FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- ayn_crowd_panel: authenticated users read only
CREATE POLICY "Authenticated users can read crowd panel"
  ON public.ayn_crowd_panel FOR SELECT
  TO authenticated
  USING (true);

-- ayn_kg_nodes: authenticated users read only (knowledge graph is shared data)
CREATE POLICY "Authenticated users can read KG nodes"
  ON public.ayn_kg_nodes FOR SELECT
  TO authenticated
  USING (true);

-- ayn_kg_edges: authenticated users read only
CREATE POLICY "Authenticated users can read KG edges"
  ON public.ayn_kg_edges FOR SELECT
  TO authenticated
  USING (true);
