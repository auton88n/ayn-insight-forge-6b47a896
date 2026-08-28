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
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  } catch (e) {
    console.error("AYN Auto-Apply: could not run on this page", e);
  }
});
