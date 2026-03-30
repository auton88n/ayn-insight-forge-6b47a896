import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { activateMaintenanceMode } from "../_shared/maintenanceGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXTRACTION_TOOL = {
  type: "function" as const,
  function: {
    name: "extract_floor_plan_data",
    description:
      "Extract all architectural measurements from a floor plan drawing for building code compliance checking.",
    parameters: {
      type: "object",
      properties: {
        inputs: {
          type: "array",
          description: "Array of extracted compliance input objects",
          items: {
            type: "object",
            properties: {
              input_type: {
                type: "string",
                enum: ["room", "window", "stair", "door", "hallway", "alarm"],
              },
              room_name: { type: "string" },
              room_area: { type: "number", description: "Area in the specified unit system (sqft or m2)" },
              room_min_dimension: { type: "number", description: "Shortest wall length" },
              room_type: {
                type: "string",
                enum: ["habitable", "bedroom", "bathroom", "kitchen", "laundry", "hallway", "basement", "living_room"],
              },
              ceiling_height: { type: "number" },
              has_sloped_ceiling: { type: "boolean" },
              sloped_area_above_min_pct: { type: "number" },
              window_opening_area: { type: "number" },
              window_opening_width: { type: "number" },
              window_opening_height: { type: "number" },
              window_sill_height: { type: "number" },
              window_glazing_area: { type: "number" },
              window_is_egress: { type: "boolean" },
              stair_width: { type: "number" },
              stair_riser_height: { type: "number" },
              stair_tread_depth: { type: "number" },
              stair_headroom: { type: "number" },
              stair_has_handrail: { type: "boolean" },
              stair_handrail_height: { type: "number" },
              stair_num_risers: { type: "integer" },
              stair_flight_height: { type: "number" },
              stair_has_landing: { type: "boolean" },
              stair_landing_length: { type: "number" },
              door_width: { type: "number" },
              door_height: { type: "number" },
              door_is_egress: { type: "boolean" },
              confidence: { type: "number", description: "0-1 confidence score for this item" },
            },
            required: ["input_type", "confidence"],
            additionalProperties: false,
          },
        },
        notes: {
          type: "string",
          description: "Notes about anything unclear, missing, or not visible in the drawing",
        },
        storeys_detected: { type: "integer" },
      },
      required: ["inputs", "notes", "storeys_detected"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file_base64, file_type, unit_system, code_system } = await req.json();

    if (!file_base64 || !file_type) {
      return new Response(JSON.stringify({ error: "file_base64 and file_type are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const units = unit_system === "metric" ? "metric (meters, m², mm)" : "imperial (feet, sq ft, inches)";
    const codeLabel = code_system === "NBC_2025" ? "NBC 2025 (Canada)" : "IRC 2024 (US)";

    const systemPrompt = `You are an expert architectural plan reader specializing in residential building code compliance.

Analyze this floor plan and extract ALL measurements you can identify. Use ${units} for all values.
This project uses ${codeLabel}.

Extract:
1. ROOMS: Every room with name, type (bedroom/bathroom/kitchen/living_room/laundry/hallway/basement/habitable), area, shortest wall dimension, ceiling height if noted
2. WINDOWS: For each room, window glazing area, openable area, opening width/height, sill height from floor, whether it could serve as egress (bedrooms need egress windows)
3. STAIRS: Width, riser height, tread depth, headroom, number of risers, total flight height, whether handrails and landings are shown
4. DOORS: Width and height of each door, whether it's an egress door (exterior or required exit)
5. HALLWAYS: Width of each hallway (input_type should be "hallway" with width in door_width field)
6. FIRE SAFETY: Note smoke alarm locations, garage separation details

For bedroom windows, set window_is_egress to true.
Set confidence 0.9+ for clearly dimensioned items, 0.5-0.8 for estimated/scaled items, below 0.5 for guesses.
If a measurement is not visible, omit that field rather than guessing.
Include notes about what you could NOT determine from the drawing.`;

    // Build the user message content based on file type
    let userContent: any[];
    const isPdf = file_type === "application/pdf" || file_type === "pdf";

    if (isPdf) {
      userContent = [
        {
          type: "file",
          filename: "floor_plan.pdf",
          file_data: `data:application/pdf;base64,${file_base64}`,
        },
        { type: "text", text: "Extract all measurements from this floor plan for building code compliance." },
      ];
    } else {
      const mimeType = file_type.startsWith("image/") ? file_type : `image/${file_type}`;
      userContent = [
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${file_base64}` },
        },
        { type: "text", text: "Extract all measurements from this floor plan for building code compliance." },
      ];
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: "function", function: { name: "extract_floor_plan_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        await activateMaintenanceMode(supabase, 'AI credits exhausted (402 from analyze-floor-plan)');
        return new Response(JSON.stringify({ error: "Service temporarily unavailable. Please try again later." }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway returned ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return structured extraction data");
    }

    const extracted = JSON.parse(toolCall.function.arguments);

    // Add unit_system to each input
    const inputs = (extracted.inputs || []).map((input: any) => ({
      ...input,
      unit_system: unit_system || "imperial",
    }));

    return new Response(
      JSON.stringify({
        inputs,
        notes: extracted.notes || "",
        storeys_detected: extracted.storeys_detected || 1,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("analyze-floor-plan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
