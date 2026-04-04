import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { ttfb, dcl, load, url, connection } = body;

    // Validate required numeric fields
    if (
      typeof ttfb !== "number" ||
      typeof dcl !== "number" ||
      typeof load !== "number" ||
      typeof url !== "string"
    ) {
      return new Response("Invalid payload", { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const details = { url: url.slice(0, 500), connection: connection || "unknown" };
    const now = new Date().toISOString();

    const { error } = await supabase.from("performance_metrics").insert([
      { metric_type: "web_vital_ttfb", metric_value: ttfb, details, measurement_time: now },
      { metric_type: "web_vital_dcl", metric_value: dcl, details, measurement_time: now },
      { metric_type: "web_vital_load", metric_value: load, details, measurement_time: now },
    ]);

    if (error) {
      console.error("Insert error:", error);
      return new Response("DB error", { status: 500, headers: corsHeaders });
    }

    return new Response(null, { status: 204, headers: corsHeaders });
  } catch (e) {
    console.error("report-vitals error:", e);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
});
