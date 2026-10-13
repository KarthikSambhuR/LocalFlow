// LocalFlow Meeting Companion - Background Service Worker
// Manages WebSocket bridge to LocalFlow native app (127.0.0.1:28282)

let socket = null;
let reconnectTimer = null;
let isConnected = false;

function connectWebSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    socket = new WebSocket('ws://127.0.0.1:28282/extension');

    socket.onopen = () => {
      isConnected = true;
      console.log('[LocalFlow Extension] Connected to LocalFlow desktop app');
      notifyTabs({ type: 'LOCALFLOW_STATUS', connected: true });
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('[LocalFlow Extension] Received from app:', msg);
      } catch (e) {}
    };

    socket.onclose = () => {
      isConnected = false;
      socket = null;
      notifyTabs({ type: 'LOCALFLOW_STATUS', connected: false });
      scheduleReconnect();
    };

    socket.onerror = () => {
      isConnected = false;
      if (socket) socket.close();
    };
  } catch (err) {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectWebSocket();
  }, 3000);
}

function sendToApp(payload) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function notifyTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  });
}

// Listen to content script messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'AUDIO_CHUNK') {
    sendToApp(msg);
  } else if (msg.type === 'SPEAKER_ACTIVE') {
    sendToApp(msg);
  } else if (msg.type === 'GET_STATUS') {
    sendResponse({ connected: isConnected });
  }
  return true;
});

// Auto-connect on startup
connectWebSocket();
