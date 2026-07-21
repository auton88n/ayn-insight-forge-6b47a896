// src/lib/extension.ts — dashboard → AYN Chrome extension bridge (v1.9.55)
// Uses the extension's stable ID (pinned via manifest `key`) so the web app
// can trigger autofill without opening the side panel.

export const AYN_EXTENSION_ID = "bjbifnpjbcbdojhgjpedkakkfjpcjmdl";

export type ExtResponse = {
  ok: boolean;
  error?: string;
  version?: string;
  tabId?: number;
};

function hasChromeRuntime(): boolean {
  try {
    // @ts-expect-error — chrome is injected by the extension bridge on allowed origins
    return typeof chrome !== "undefined" && !!chrome?.runtime?.sendMessage;
  } catch {
    return false;
  }
}

function send(payload: Record<string, unknown>): Promise<ExtResponse> {
  return new Promise((resolve) => {
    if (!hasChromeRuntime()) {
      resolve({ ok: false, error: "not_installed" });
      return;
    }
    try {
      // @ts-expect-error — chrome global
      chrome.runtime.sendMessage(AYN_EXTENSION_ID, payload, (response: ExtResponse | undefined) => {
        // @ts-expect-error — chrome global
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: "not_installed" });
          return;
        }
        resolve(response || { ok: false, error: "no_response" });
      });
    } catch {
      resolve({ ok: false, error: "send_failed" });
    }
  });
}

export async function isExtensionInstalled(): Promise<boolean> {
  const r = await send({ type: "AYN_PING" });
  return !!r.ok;
}

/** v2.7.0 — installed extension version, or null if not installed. */
export async function getInstalledVersion(): Promise<string | null> {
  const r = await send({ type: "AYN_PING" });
  return r.ok && r.version ? r.version : null;
}

export async function triggerAutofill(
  jobUrl: string,
  resumeId?: string,
  resumeVersionId?: string,
): Promise<ExtResponse> {
  return send({ type: "AYN_TRIGGER_AUTOFILL", jobUrl, resumeId, resumeVersionId });
}

/**
 * v2.7.0 — tell the installed extension that the user's profile just changed
 * so it drops its cached profile vector on the next autofill.
 * No-op when the extension is not installed.
 */
export async function notifyProfileUpdated(): Promise<void> {
  await send({ type: "AYN_PROFILE_UPDATED" });
}

/**
 * Builds a handoff URL. Opening it in a new tab lets `deep-link.js` capture
 * the target and pending resume, then redirect the tab to the job page where
 * `handoff-hydrate.js` shows a "context restored" toast.
 */
export function handoffUrl(jobUrl: string, resumeId?: string): string {
  const base = `${window.location.origin}/handoff`;
  const p = new URLSearchParams({ job: jobUrl });
  if (resumeId) p.set("resume", resumeId);
  return `${base}?${p.toString()}`;
}
