// v3.291.0 -- internal-only bridge letting job-checker (which holds only
// the service-role key, never a user session, and no direct Postgres
// access) reach the SAME shared Form Intelligence classifier and cache
// resume-hub's own auto_apply_classify_widgets action uses -- so a
// widget shape learned from either surface (the extension, or
// job-checker's server-side extraction) is instantly visible to the
// other, through the one shared table, not two separate caches. Mirrors
// ai-openai-bridge's own exact shape (a second, minimal, self-contained
// implementation rather than a shared import -- edge functions each
// deploy as their own isolated bundle) and its same trust boundary: the
// caller must present the real service-role key as a Bearer token, the
// same credential job-checker already holds and already uses to call
// ai-openai-bridge for its /check endpoint. See docs/map/extension.md
// for the full Form Intelligence design; see
// resume-hub/lib/formIntelligence.ts for the sibling implementation this
// one deliberately duplicates rather than shares, and why.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_RELAY_URL = Deno.env.get("AI_RELAY_URL");
const GATEWAY_URL = AI_RELAY_URL || "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

type WidgetSignature = {
  localId: string;
  tag: string;
  role: string | null;
  ariaAttrs: string[];
  childShape: string;
  classHint: string;
  nearbyText: string;
  optionTexts: string[];
};

// v3.294.0 -- multi_select_button_group added, mirroring the identical
// change in resume-hub/lib/formIntelligence.ts: a genuine "select all
// that apply" group is structurally identical to toggle_button_group,
// but not mutually exclusive -- misclassifying one as the other means
// the fill interpreter wrongly treats "pick any number of these" as
// "pick exactly one." Deliberately unsupported in RECIPE_BY_TYPE, same
// as unrecognized: flagged for the person's own review rather than
// silently mis-filled as a single answer.
const WIDGET_TYPES = [
  "toggle_button_group",
  "combobox_static",
  "combobox_typeahead",
  "custom_checkbox",
  "multi_select_button_group",
  "unrecognized",
] as const;
type WidgetType = (typeof WIDGET_TYPES)[number];

const RECIPE_BY_TYPE: Record<WidgetType, Record<string, unknown>> = {
  toggle_button_group: { activate: "click", verifyVia: "aria-pressed-or-aria-checked" },
  combobox_static: { open: "click", optionsVia: "listbox", matchStrategy: "exactThenSubstring" },
  combobox_typeahead: { open: "type", optionsVia: "listbox-diff", matchStrategy: "exactThenSubstring" },
  custom_checkbox: { activate: "click", verifyVia: "aria-checked-or-class-diff" },
  multi_select_button_group: { unsupported: true },
  unrecognized: { unsupported: true },
};

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonicalSignature(sig: WidgetSignature): string {
  return JSON.stringify({
    tag: sig.tag,
    role: sig.role || "",
    ariaAttrs: [...sig.ariaAttrs].sort(),
    childShape: sig.childShape,
    classHint: sig.classHint,
  });
}

const TOOL_SCHEMA = {
  type: "object",
  properties: {
    classifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          localId: { type: "string" },
          widgetType: { type: "string", enum: WIDGET_TYPES as unknown as string[] },
        },
        required: ["localId", "widgetType"],
      },
    },
  },
  required: ["classifications"],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!serviceKey || token !== serviceKey) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const widgets = Array.isArray(body.widgets) ? (body.widgets as WidgetSignature[]).slice(0, 40) : [];
    if (!widgets.length) {
      return new Response(JSON.stringify({ classifications: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const admin = createClient(supabaseUrl, serviceKey);

    const hashed = await Promise.all(widgets.map(async (w) => ({ widget: w, hash: await sha256Hex(canonicalSignature(w)) })));
    const { data: cached } = await admin
      .from("form_widget_patterns")
      .select("signature_hash, widget_type, interaction_recipe")
      .in("signature_hash", hashed.map((h) => h.hash));
    const cacheByHash = new Map((cached || []).map((r: any) => [r.signature_hash, r]));

    const results: Array<{ localId: string; widgetType: WidgetType; interactionRecipe: Record<string, unknown>; fromCache: boolean }> = [];
    const misses: typeof hashed = [];
    for (const h of hashed) {
      const hit = cacheByHash.get(h.hash);
      if (hit) {
        const widgetType: WidgetType = WIDGET_TYPES.includes(hit.widget_type) ? hit.widget_type : "unrecognized";
        results.push({ localId: h.widget.localId, widgetType, interactionRecipe: hit.interaction_recipe || RECIPE_BY_TYPE[widgetType], fromCache: true });
        admin.from("form_widget_patterns").update({ last_seen_at: new Date().toISOString() }).eq("signature_hash", h.hash).then(() => {}, () => {});
      } else {
        misses.push(h);
      }
    }

    if (misses.length) {
      const apiKey = AI_RELAY_URL ? Deno.env.get("RELAY_SECRET") : Deno.env.get("LOVABLE_API_KEY");
      if (!apiKey) throw new Error("gateway credential not configured");
      const promptWidgets = misses.map((m) => ({
        localId: m.widget.localId, tag: m.widget.tag, role: m.widget.role, ariaAttrs: m.widget.ariaAttrs,
        childShape: m.widget.childShape, nearbyQuestionText: m.widget.nearbyText, visibleOptionTexts: m.widget.optionTexts,
      }));
      const r = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "You classify HTML form widgets on real job application pages by their STRUCTURE alone, " +
                "never by guessing what a person would answer. For each widget, pick exactly one type from: " +
                WIDGET_TYPES.join(", ") +
                ". toggle_button_group is 2+ MUTUALLY EXCLUSIVE buttons with no native radio input and no " +
                "radiogroup role -- exactly one answer is ever correct (a Yes/No pair is the common case). " +
                "multi_select_button_group looks the same structurally but is NOT mutually exclusive -- more " +
                "than one option can genuinely be true at once. The nearbyQuestionText is the real signal: " +
                "phrasing like 'select all that apply', 'check all', 'which of these', or a plural framing " +
                "over a list of skills/tools/languages/certifications means multi_select_button_group, never " +
                "toggle_button_group -- picking the wrong one of these two is a real, meaningful mistake, not " +
                "a harmless guess, since it changes whether the widget gets filled as one answer or flagged as " +
                "needing the person's own review. combobox_static is a dropdown whose options already exist as " +
                "soon as it's opened. combobox_typeahead is a dropdown whose options only appear once you start " +
                "typing (location/city/school/employer search fields are the common case). custom_checkbox is " +
                "one standalone togglable control, not part of any group. If you are not genuinely confident " +
                "which of these this is, answer unrecognized -- that is the correct, honest answer far more " +
                "often than a wrong specific guess.",
            },
            { role: "user", content: JSON.stringify({ widgets: promptWidgets }) },
          ],
          tools: [{ type: "function", function: { name: "classify_form_widgets", description: "classify_form_widgets", parameters: TOOL_SCHEMA } }],
          tool_choice: { type: "function", function: { name: "classify_form_widgets" } },
        }),
      });
      let parsed: { classifications?: Array<{ localId: string; widgetType: string }> } | undefined;
      if (r.ok) {
        const data = await r.json();
        const tc = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (tc) { try { parsed = JSON.parse(tc); } catch { /* leave undefined -- degrades to unrecognized below */ } }
      }
      const byLocalId = new Map((parsed?.classifications || []).map((c) => [c.localId, c]));
      const upserts: Array<{ signature_hash: string; widget_type: string; interaction_recipe: Record<string, unknown> }> = [];
      for (const m of misses) {
        const c = byLocalId.get(m.widget.localId);
        const widgetType: WidgetType = c && WIDGET_TYPES.includes(c.widgetType as WidgetType) ? (c.widgetType as WidgetType) : "unrecognized";
        const interactionRecipe = RECIPE_BY_TYPE[widgetType];
        results.push({ localId: m.widget.localId, widgetType, interactionRecipe, fromCache: false });
        upserts.push({ signature_hash: m.hash, widget_type: widgetType, interaction_recipe: interactionRecipe });
      }
      if (upserts.length) {
        admin.from("form_widget_patterns").upsert(upserts, { onConflict: "signature_hash" }).then(() => {}, () => {});
      }
    }

    return new Response(JSON.stringify({ classifications: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
