// LocalFlow Meeting Companion - Content Script
(function () {
  'use strict';
  console.log('[LF-content] ✅ content script running on', location.hostname);

  // Only run injection in the top-level frame (not iframes on Meet/Teams etc.)
  if (window !== window.top) return;

  // Forward messages from injected page script to service worker
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'LOCALFLOW_INJECTED') {
      return;
    }
    if (event.data.type === 'MEETING_TELEMETRY') {
      console.log('[LF-content] forwarding telemetry, participants:', event.data.participants?.length, event.data.participants?.map(p => p.name));
    }
    chrome.runtime.sendMessage(event.data).catch((e) => {
      console.warn('[LF-content] sendMessage failed:', e?.message);
    });
  });

  // Forward background setting updates back to page script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SETTINGS_UPDATED') {
      window.postMessage({
        source: 'LOCALFLOW_CONTENT',
        type: 'SETTINGS_UPDATED',
        settings: msg.settings
      }, '*');
    }
  });

  // Notify background to inject the page script via chrome.scripting (bypasses CSP)
  chrome.runtime.sendMessage({ type: 'INJECT_PAGE_SCRIPT' }).catch(() => {});
})();