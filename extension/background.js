// AYN Autofill — background service worker
// Routes messages from popup/content to the AYN edge function.

const ENDPOINT = "https://dfkoxuokfkttjhfjcecx.functions.supabase.co/resume-hub";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw";

async function getToken() {
  const { ayn_token } = await chrome.storage.local.get("ayn_token");
  return ayn_token;
}

async function callApi(action, payload) {
  const token = await getToken();
  if (!token) throw new Error("Not connected. Open AYN options and paste your device token.");
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ayn-ext-token": token,
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 400) }; }
  if (!r.ok) {
    const msg = data?.error || data?.detail || `Request failed (${r.status})`;
    if (r.status === 401) throw new Error("Not connected. Open AYN extension Options and paste a fresh device token.");
    throw new Error(msg);
  }
  return data;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "ayn_call") {
        const data = await callApi(msg.action, msg.payload || {});
        sendResponse({ ok: true, data });
      } else if (msg.type === "ayn_get_token") {
        sendResponse({ ok: true, token: await getToken() });
      } else if (msg.type === "ayn_set_token") {
        await chrome.storage.local.set({ ayn_token: msg.token });
        const data = await callApi("ext_bootstrap", {});
        await chrome.storage.local.set({ ayn_bootstrap: data, ayn_bootstrap_at: Date.now() });
        sendResponse({ ok: true, data });
      } else if (msg.type === "ayn_clear_token") {
        await chrome.storage.local.remove(["ayn_token", "ayn_bootstrap"]);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "Unknown message" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ayn_save_job",
    title: "AYN: Save this job",
    contexts: ["page", "selection"],
  });
  chrome.contextMenus.create({
    id: "ayn_autofill",
    title: "AYN: Autofill this form",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "ayn_save_job") {
    chrome.tabs.sendMessage(tab.id, { type: "ayn_save_job_from_page" });
  } else if (info.menuItemId === "ayn_autofill") {
    chrome.tabs.sendMessage(tab.id, { type: "ayn_autofill_now" });
  }
});
