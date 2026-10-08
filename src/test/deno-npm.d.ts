// Type-only bridge for Node/Vitest tests of edge-worker helpers. Deno resolves
// its pinned npm: import itself; the browser bundle never imports this worker.
declare module "npm:@supabase/supabase-js@2.45.0" {
  export type { SupabaseClient } from "@supabase/supabase-js";
}
