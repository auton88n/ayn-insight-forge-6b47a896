// v3.290.0 -- the "Form Intelligence" classification layer. See
// docs/map/extension.md for the full blueprint this is one piece of.
//
// Both real form-reading paths this app has (extension/content.js,
// client-side in a real browser, and job-checker/server.py, server-side
// Playwright) hand-code their own list of "here's how you recognize and
// operate this kind of widget" heuristics -- one native <select>, one
// ARIA radiogroup, one aria-pressed toggle-button pair, one role=combobox
// dropdown, one listbox-diff-driven typeahead, and so on. Every one of
// those was added by hand, one real user report at a time, and the two
// implementations had already drifted: content.js had grown real support
// for several of these; job-checker's own extraction had none of them.
//
// This module is the shared fallback for whatever neither implementation's
// own deterministic scan recognizes. It is deliberately narrow in what it
// is trusted to do: given a small, sanitized STRUCTURAL description of an
// unrecognized interactive element (tag, role, aria attribute NAMES,
// immediate-child tag counts, a short class hint, plus the page's own
// already-visible question/option text -- never anything about the person
// filling the form), it classifies the widget into one of a small, fixed
// vocabulary and returns a small, fixed-shape interaction recipe. It never
// returns code to execute, and the caller (content.js or job-checker) is
// the only thing that ever actually touches the DOM -- this module only
// ever answers "what is this, and how do I operate it," the exact same
// division of labor _shared/tailoring.ts already uses everywhere else in
// this app: code decides facts and executes, the model only classifies or
// phrases.
//
// Classifications are cached in public.form_widget_patterns, keyed by a
// hash of the STRUCTURAL shape alone (never the question text) -- since
// every company on the same ATS platform (Greenhouse, Lever, Ashby,
// Workday, ...) reuses that platform's own fixed component library, one
// real classification of "Ashby's own toggle-button widget" covers every
// Ashby-hosted application from then on, for every AYN user, not just
// whoever's page first triggered it. This is what turns "a user reports a
// new form shape, an engineer patches it" into "the first person to hit a
// genuinely new shape anywhere pays one classification call, and nobody
// else ever has to."
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { callAI, DEFAULT_MODEL } from "./ai.ts";
import { sha256Hex } from "./utils.ts";

export type WidgetSignature = {
  localId: string;
  tag: string;
  role: string | null;
  ariaAttrs: string[]; // attribute NAMES only, e.g. ["aria-pressed", "aria-controls"] -- never values
  childShape: string; // e.g. "button:2,svg:1" -- immediate children's tag names+counts, sorted
  classHint: string; // first CSS class token only, lowercased, truncated to 40 chars
  nearbyText: string; // the already-visible question/label text near this widget, truncated to 200 chars
  optionTexts: string[]; // visible text of candidate sibling controls, e.g. ["Yes", "No"], truncated
};

// The ONLY widget types this layer is allowed to name. Anything the model
// returns outside this list is treated as "unrecognized" -- never trusted
// as a free-form string. Each maps to an interaction recipe the caller
// already has a real, read-back-verified function for (fillRadio-style
// click+aria-state verify, fillCombobox-style open+search+click+verify,
// or content.js's own listbox-diff typeahead helper) -- this layer never
// introduces a NEW way of touching the DOM, only recognizes which of the
// already-audited ways applies here.
export const WIDGET_TYPES = [
  "toggle_button_group", // a Yes/No (or similar) pair/group of buttons, mutually exclusive, no radiogroup role
  "combobox_static", // a custom dropdown whose options already exist once opened (Radix Select / react-select style)
  "combobox_typeahead", // a custom dropdown whose options only appear after typing (location/city/school/employer style)
  "custom_checkbox", // a single togglable control (not part of a mutually-exclusive group)
  "unrecognized", // the honest default -- nothing here is guessed at or force-fit
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export type WidgetClassification = {
  localId: string;
  widgetType: WidgetType;
  interactionRecipe: Record<string, unknown>;
  fromCache: boolean;
};

function canonicalSignature(sig: WidgetSignature) {
  // Deliberately excludes nearbyText/optionTexts and localId -- the cache
  // key is the widget's own STRUCTURAL shape, never the specific question
  // it happens to be asking or which field this was in one particular
  // extraction call. Two different questions built from the same
  // component library hash identically on purpose.
  return JSON.stringify({
    tag: sig.tag,
    role: sig.role || "",
    ariaAttrs: [...sig.ariaAttrs].sort(),
    childShape: sig.childShape,
    classHint: sig.classHint,
  });
}

async function signatureHash(sig: WidgetSignature): Promise<string> {
  return sha256Hex(canonicalSignature(sig));
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
          reason: { type: "string" },
        },
        required: ["localId", "widgetType"],
      },
    },
  },
  required: ["classifications"],
};

// A fixed recipe per widget type -- the model only ever picks the TYPE;
// the recipe describing how to operate it is looked up here, never
// generated. This is the concrete guarantee that nothing AI-authored is
// ever executed as code.
const RECIPE_BY_TYPE: Record<WidgetType, Record<string, unknown>> = {
  toggle_button_group: { activate: "click", verifyVia: "aria-pressed-or-aria-checked" },
  combobox_static: { open: "click", optionsVia: "listbox", matchStrategy: "exactThenSubstring" },
  combobox_typeahead: { open: "type", optionsVia: "listbox-diff", matchStrategy: "exactThenSubstring" },
  custom_checkbox: { activate: "click", verifyVia: "aria-checked-or-class-diff" },
  unrecognized: { unsupported: true },
};

/**
 * Classifies a batch of unrecognized widgets. Cache hits are free and
 * instant; misses are batched into ONE callAI request (never one call
 * per widget) and upserted into form_widget_patterns for every future
 * caller, on this page or any other. Never throws -- a classification
 * failure degrades every uncached widget in the batch to "unrecognized"
 * rather than blocking the rest of a real autofill pass.
 */
export async function classifyWidgets(
  admin: SupabaseClient<any, any, any>,
  widgets: WidgetSignature[],
): Promise<WidgetClassification[]> {
  if (!widgets.length) return [];
  const hashed = await Promise.all(
    widgets.map(async (w) => ({ widget: w, hash: await signatureHash(w) })),
  );

  const { data: cached } = await admin
    .from("form_widget_patterns")
    .select("signature_hash, widget_type, interaction_recipe")
    .in("signature_hash", hashed.map((h) => h.hash));
  const cacheByHash = new Map((cached || []).map((r: any) => [r.signature_hash, r]));

  const results: WidgetClassification[] = [];
  const misses: { widget: WidgetSignature; hash: string }[] = [];
  for (const h of hashed) {
    const hit = cacheByHash.get(h.hash);
    if (hit) {
      const widgetType = WIDGET_TYPES.includes(hit.widget_type) ? hit.widget_type : "unrecognized";
      results.push({
        localId: h.widget.localId,
        widgetType,
        interactionRecipe: hit.interaction_recipe || RECIPE_BY_TYPE[widgetType],
        fromCache: true,
      });
      // Best effort freshness bump -- never blocks the response.
      admin.from("form_widget_patterns").update({ last_seen_at: new Date().toISOString() })
        .eq("signature_hash", h.hash).then(() => {}, () => {});
    } else {
      misses.push(h);
    }
  }

  if (!misses.length) return results;

  const promptWidgets = misses.map((m) => ({
    localId: m.widget.localId,
    tag: m.widget.tag,
    role: m.widget.role,
    ariaAttrs: m.widget.ariaAttrs,
    childShape: m.widget.childShape,
    nearbyQuestionText: m.widget.nearbyText,
    visibleOptionTexts: m.widget.optionTexts,
  }));

  try {
    const { structured } = await callAI({
      model: DEFAULT_MODEL,
      temperature: 0,
      system:
        "You classify HTML form widgets on real job application pages by their STRUCTURE alone, " +
        "never by guessing what a person would answer. For each widget, pick exactly one type from: " +
        WIDGET_TYPES.join(", ") +
        ". toggle_button_group is 2+ mutually exclusive buttons with no native radio input and no " +
        "radiogroup role (a Yes/No pair is the common case). combobox_static is a dropdown whose " +
        "options already exist as soon as it's opened. combobox_typeahead is a dropdown whose options " +
        "only appear once you start typing (location/city/school/employer search fields are the common " +
        "case). custom_checkbox is one standalone togglable control, not part of a mutually exclusive " +
        "group. If you are not genuinely confident which of the first four this is, answer " +
        "unrecognized -- that is the correct, honest answer far more often than a wrong specific guess.",
      user: JSON.stringify({ widgets: promptWidgets }),
      toolName: "classify_form_widgets",
      toolSchema: TOOL_SCHEMA,
    });

    const parsed = structured as { classifications?: Array<{ localId: string; widgetType: string }> } | undefined;
    const byLocalId = new Map((parsed?.classifications || []).map((c) => [c.localId, c]));

    const upserts: Array<{ signature_hash: string; widget_type: string; interaction_recipe: Record<string, unknown> }> = [];
    for (const m of misses) {
      const c = byLocalId.get(m.widget.localId);
      const widgetType: WidgetType = c && WIDGET_TYPES.includes(c.widgetType as WidgetType)
        ? (c.widgetType as WidgetType)
        : "unrecognized";
      const interactionRecipe = RECIPE_BY_TYPE[widgetType];
      results.push({ localId: m.widget.localId, widgetType, interactionRecipe, fromCache: false });
      upserts.push({ signature_hash: m.hash, widget_type: widgetType, interaction_recipe: interactionRecipe });
    }
    if (upserts.length) {
      // Best effort -- a caching failure must never lose the real
      // classifications already computed for THIS request.
      admin.from("form_widget_patterns").upsert(upserts, { onConflict: "signature_hash" })
        .then(({ error }: { error: unknown }) => { if (error) console.error("form_widget_patterns upsert failed", error); },
          (e: unknown) => console.error("form_widget_patterns upsert threw", e));
    }
  } catch (e) {
    // A classification failure degrades every uncached widget to
    // "unrecognized" -- the same honest outcome as today, never a guess.
    console.error("classifyWidgets AI call failed", e);
    for (const m of misses) {
      results.push({ localId: m.widget.localId, widgetType: "unrecognized", interactionRecipe: RECIPE_BY_TYPE.unrecognized, fromCache: false });
    }
  }

  return results;
}
