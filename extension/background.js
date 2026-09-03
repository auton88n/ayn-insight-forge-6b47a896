/**
 * AYN Auto-Apply — background service worker.
 *
 * v3.294.0 -- no default_popup, so clicking the toolbar icon always
 * fires chrome.action.onClicked (MV3 gives a page a popup OR an
 * onClicked handler, never both — a default_popup would silently
 * swallow every click). All real UI lives in content.js's own in-page
 * overlay.
 * v3.326.0 -- the real fill flow now has two doors in, not one: a
 * manual click, and detector.js's own real, verified-ATS-host-plus-
 * real-field-count signal (see its own header) asking for the same
 * thing automatically. Both funnel through this one function so
 * neither path can drift from the other -- there is one real fill
 * flow, reached two ways, never two different ones.
 */
// A real, if narrow, race this needed guarding against: detector.js
// checks window.__aynAutoApplyHost before it ever sends this message,
// but that check and content.js actually setting that flag are on two
// sides of a real async gap (this whole scripting.executeScript call).
// A second AYN_AUTO_DETECTED message arriving from another frame in
// that same gap would otherwise start a second, redundant injection
// before the first one's own guard could stop it. Cleared once the
// injection settles either way, so a genuine later re-detection (a new
// navigation on the same tab) is never permanently blocked.
const autoInjectingTabs = new Set();

async function injectFillFlow(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["frame_agent.js"],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["vendor/jspdf.umd.min.js", "resumeDocs.js", "content.js"],
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || !/^https?:\/\//.test(tab.url)) return;
  try {
    await injectFillFlow(tab.id);
  } catch (e) {
    console.error("AYN Auto-Apply: could not run on this page", e);
  }
});

// v3.294.0 -- the only two hops a content script's own chrome.runtime
// APIs can't do directly: relaying a sub-frame's self-report up to the
// top frame, and relaying a fill instruction from the top frame back
// down to a specific sub-frame. Both need chrome.tabs.sendMessage's own
// frameId targeting, which only the background script has access to —
// a content script (any frame, including the top one) can only ever
// chrome.runtime.sendMessage to this background script, never directly
// to another frame. Purely a relay: this never reads, matches, or fills
// anything itself.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object" || !sender.tab) return false;

  if (msg.type === "AYN_AUTO_DETECTED") {
    const tabId = sender.tab.id;
    if (tabId != null && !autoInjectingTabs.has(tabId)) {
      autoInjectingTabs.add(tabId);
      injectFillFlow(tabId)
        .catch((e) => console.error("AYN Auto-Apply: auto-detect injection failed", e))
        .finally(() => autoInjectingTabs.delete(tabId));
    }
    return false;
  }

  if (msg.type === "AYN_FRAME_REPORT") {
    // From a sub-frame, up to the top frame (frameId 0) of the same tab.
    chrome.tabs
      .sendMessage(sender.tab.id, { type: "AYN_FRAME_REPORT", frameId: sender.frameId, fields: msg.fields, skipped: msg.skipped }, { frameId: 0 })
      .catch(() => {});
    return false;
  }

  if (msg.type === "AYN_RELAY_TO_FRAME") {
    // From the top frame, down to one specific sub-frame. Returns that
    // frame's own real fill response back to the top frame's caller —
    // a genuine request/response round trip, not fire-and-forget.
    chrome.tabs
      .sendMessage(sender.tab.id, msg.payload, { frameId: msg.targetFrameId })
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  return false;
});
