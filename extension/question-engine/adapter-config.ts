/**
 * adapter-config.ts (v2.10.0)
 *
 * Server-driven adapter constants. Adapters used to hardcode host regexes,
 * wrapper selectors and required markers. We now keep the SAME values here as
 * BUILT_IN defaults and let a remote config (fetched by background.js from
 * Supabase table ats_config and pushed via applyAdapterConfig) overlay them
 * per-adapter key.
 *
 * HARD RULES:
 *   1. Remote values are only ever merged OVER the built-ins per adapter key.
 *   2. If validation fails for any reason, silently keep the built-ins.
 *   3. Behaviour with no network must be byte-identical to v2.9.x.
 */
export interface AdapterCfgGreenhouse {
  hostRe: string;
  detectSelectors: string[];
  idPrefix: string;
  idPrefixStripRe: string;
  wrapperSelectors: string[];
  groupingSelectors: string[];
  requiredSelectors: string[];
}
export interface AdapterCfgLever {
  hostRe: string;
  detectSelectors: string[];
  wrapperSelectors: string[];
  labelSelectors: string[];
  groupingSelectors: string[];
  requiredSelectors: string[];
}
export interface AdapterCfgWorkday {
  hostRe: string;
  detectSelectors: string[];
  automationAttr: string;
  promptAttr: string;
  requiredAttr: string;
  rowSelectors: string[];
  humanizeStripPrefix: string;
}
export interface AdapterCfgIcims {
  hostRe: string;
  detectSelectors: string[];
  wrapperSelectors: string[];
  labelSelectors: string[];
  groupingSelectors: string[];
  requiredSelectors: string[];
}
export interface AdapterCfgAshby {
  hostRe: string;
  detectSelectors: string[];
  wrapperSelectors: string[];
  labelSelectors: string[];
  groupingSelectors: string[];
  choiceButtonSelectors: string[];
}
export interface AdapterConfig {
  greenhouse: AdapterCfgGreenhouse;
  lever: AdapterCfgLever;
  workday: AdapterCfgWorkday;
  icims: AdapterCfgIcims;
  ashby: AdapterCfgAshby;
}

export const BUILT_IN: AdapterConfig = {
  greenhouse: {
    hostRe: "(?:^|\\.)greenhouse\\.io$|boards\\.greenhouse\\.io$|job-boards\\.greenhouse\\.io$",
    detectSelectors: ['form[id="application_form"]', '[id^="job_application_"]'],
    idPrefix: "job_application_",
    idPrefixStripRe: "^job_application_(answers_attributes_\\d+_)?",
    wrapperSelectors: [".field", ".application-question", "li"],
    groupingSelectors: [".application-question", ".field"],
    requiredSelectors: [".required", ".asterisk"],
  },
  lever: {
    hostRe: "(?:^|\\.)lever\\.co$|jobs\\.lever\\.co$",
    detectSelectors: [".application-question", ".lever-apply"],
    wrapperSelectors: [".application-question", ".application-field"],
    labelSelectors: [".application-label", ".question-label", "label"],
    groupingSelectors: [".application-question", ".application-field"],
    requiredSelectors: [".required"],
  },
  workday: {
    hostRe: "myworkday(?:jobs|site)?\\.com$|\\.wd\\d+\\.myworkday(?:jobs)?\\.com$",
    detectSelectors: ["[data-automation-id]"],
    automationAttr: "data-automation-id",
    promptAttr: "data-automation-id-prompt",
    requiredAttr: "data-required",
    rowSelectors: ['[data-automation-id*="row" i]', '[data-automation-id*="Row"]'],
    humanizeStripPrefix: "formField-",
  },
  icims: {
    hostRe: "icims\\.com$|jobs\\.icims\\.com$",
    detectSelectors: ['[class^="iCIMS_"]', '[id^="iCIMS_"]'],
    wrapperSelectors: [".iCIMS_TableRow", '[class*="iCIMS_InfoField"]'],
    labelSelectors: [".iCIMS_InfoField_Label", "label", ".iCIMS_Label"],
    groupingSelectors: [".iCIMS_TableRow", '[class*="iCIMS_InfoField"]'],
    requiredSelectors: [".iCIMS_Required", '[class*="Required"]'],
  },
  ashby: {
    hostRe: "ashbyhq\\.com$|jobs\\.ashbyhq\\.com$",
    detectSelectors: ['[class*="ashby-application" i]', '[data-testid^="ashby"]'],
    wrapperSelectors: ['[class*="_fieldEntry_" i]', '[class*="fieldEntry" i]'],
    labelSelectors: ['[class*="_label_" i]', "label"],
    groupingSelectors: ['[class*="_fieldEntry_" i]', '[class*="fieldEntry" i]'],
    choiceButtonSelectors: ["button", '[role="button"]', '[role="radio"]', '[role="option"]'],
  },
};

let effective: AdapterConfig = BUILT_IN;
let currentVersion = 0;

export function getAdapterConfig(): AdapterConfig {
  return effective;
}
export function getConfigVersion(): number {
  return currentVersion;
}

/**
 * Validate and apply a remote config payload. Returns true when the overlay
 * was applied, false when built-ins were kept. Never throws.
 */
export function applyAdapterConfig(remote: unknown, version: unknown): boolean {
  try {
    if (!remote || typeof remote !== "object") return false;
    const r = remote as Record<string, unknown>;
    const adapters = r.adapters as Record<string, unknown> | undefined;
    if (!adapters || typeof adapters !== "object") return false;
    const nextVersion = typeof version === "number" ? version : 0;
    if (nextVersion < currentVersion) return false;

    const merged: AdapterConfig = {
      greenhouse: { ...BUILT_IN.greenhouse },
      lever: { ...BUILT_IN.lever },
      workday: { ...BUILT_IN.workday },
      icims: { ...BUILT_IN.icims },
      ashby: { ...BUILT_IN.ashby },
    };

    for (const key of Object.keys(merged) as Array<keyof AdapterConfig>) {
      const inc = adapters[key];
      if (!inc || typeof inc !== "object") continue;
      const built = BUILT_IN[key] as Record<string, unknown>;
      const overlay: Record<string, unknown> = { ...built };
      let ok = true;
      for (const field of Object.keys(built)) {
        const val = (inc as Record<string, unknown>)[field];
        if (val === undefined) continue;
        const builtVal = built[field];
        if (typeof builtVal === "string") {
          if (typeof val !== "string" || !val) { ok = false; break; }
          if (field.toLowerCase().endsWith("re")) {
            try { new RegExp(val, "i"); } catch { ok = false; break; }
          }
          overlay[field] = val;
        } else if (Array.isArray(builtVal)) {
          if (!Array.isArray(val) || val.some((v) => typeof v !== "string" || !v)) { ok = false; break; }
          overlay[field] = val.slice();
        }
      }
      if (ok) {
        (merged as Record<string, unknown>)[key] = overlay;
      }
    }

    effective = merged;
    currentVersion = nextVersion;
    return true;
  } catch {
    return false;
  }
}

/**
 * Cached compiled host regexes so adapters don't recompile on every detect().
 * Invalidated when applyAdapterConfig replaces `effective`.
 */
const reCache = new WeakMap<object, Record<string, RegExp>>();
export function hostRe(adapterKey: keyof AdapterConfig): RegExp {
  const cfg = getAdapterConfig();
  let per = reCache.get(cfg);
  if (!per) { per = {}; reCache.set(cfg, per); }
  if (!per[adapterKey]) {
    try { per[adapterKey] = new RegExp(cfg[adapterKey].hostRe, "i"); }
    catch { per[adapterKey] = new RegExp(BUILT_IN[adapterKey].hostRe, "i"); }
  }
  return per[adapterKey];
}

export function joinSelector(list: string[]): string {
  return list.join(", ");
}
