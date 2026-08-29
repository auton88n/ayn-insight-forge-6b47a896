/**
 * AYN Auto-Apply — background service worker.
 *
 * Deliberately minimal: no default_popup, so clicking the toolbar icon
 * always fires chrome.action.onClicked (MV3 gives a page a popup OR an
 * onClicked handler, never both — a default_popup would silently swallow
 * every click). All real UI lives in content.js's own in-page overlay,
 * injected on demand, only into the one tab the person is actually
 * looking at — this extension never runs anywhere until you click it.
 */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || !/^https?:\/\//.test(tab.url)) return;
  try {
    // v3.294.0 -- frame_agent.js (the extraction/candidate-scan/fill
    // core, factored out of content.js) is injected into EVERY frame on
    // the page, not just the top one — the real fix for an application
    // form embedded in an <iframe>, which was completely invisible
    // before this. A sub-frame self-reports its own fields the moment
    // it loads (see that file's own header and the onMessage relay
    // below); the top frame alone gets vendor/jspdf.umd.min.js,
    // resumeDocs.js, and content.js, the same as before — those build
    // the actual UI and talk to the backend, and must only ever exist
    // once per page, not once per frame. Both calls land in the same
    // per-frame ISOLATED-world execution context, so content.js can
    // call straight into what frame_agent.js already exposed on window
    // in the top frame without loading it a second time.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["frame_agent.js"],
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["vendor/jspdf.umd.min.js", "resumeDocs.js", "content.js"],
    });
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
