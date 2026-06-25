// background.js — AYN Resume Tailor service worker

// Open side panel when toolbar icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Store job text from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'JOB_DETECTED') {
    chrome.storage.local.set({
      lastJobText: message.text,
      lastJobTitle: message.title,
      lastJobUrl: sender.tab?.url || '',
      lastJobCompany: message.company || '',
      detectedAt: Date.now(),
    }, () => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'GET_JOB') {
    chrome.storage.local.get(['lastJobText','lastJobTitle','lastJobUrl','lastJobCompany','detectedAt'], sendResponse);
    return true;
  }
});
