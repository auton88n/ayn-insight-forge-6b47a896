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
    // v3.287.0 -- vendor/jspdf.umd.min.js and resumeDocs.js are injected
    // first, in the same isolated world content.js runs in, so the real
    // jsPDF builder (window.__aynBuildResumePdfBlob) exists before
    // content.js ever needs to call it for a real resume file attachment.
    // Both are vendored locally (no CDN, no remote code) -- see
    // resumeDocs.js's own header comment.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["vendor/jspdf.umd.min.js", "resumeDocs.js", "content.js"],
    });
  } catch (e) {
    console.error("AYN Auto-Apply: could not run on this page", e);
  }
});
