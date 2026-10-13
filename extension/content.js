// LocalFlow Meeting Companion - Content Script
// Bridges messages from injected.js to background service worker

(function () {
  'use strict';

  // Inject the page context script to access WebAudio & DOM objects directly
  function injectPageScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injected.js');
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.warn('[LocalFlow Content Script] Failed to inject page script:', e);
    }
  }

  // Listen for messages from injected.js in page context
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'LOCALFLOW_INJECTED') {
      return;
    }

    // Forward to extension service worker
    chrome.runtime.sendMessage(event.data).catch(() => {});
  });

  // Inject on document start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPageScript);
  } else {
    injectPageScript();
  }
})();
