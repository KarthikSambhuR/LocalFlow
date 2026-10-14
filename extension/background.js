// LocalFlow Meeting Companion - Background Service Worker

const DEFAULT_SETTINGS = {
  captureEnabled: true,
  wsPort: 28282,
  noiseGate: 6,
  autoReconnect: true
};

let settings = { ...DEFAULT_SETTINGS };
let socket = null;
let reconnectTimer = null;
let pingTimer = null;
let isConnected = false;
let popupPorts = new Set();
const injectedTabs = new Set(); // track tabs that already have injected.js

let meetingState = {
  platform: null,
  tabId: null,
  participants: [], // Array of { name, muted, isSelf }
  activeSpeakers: [], // Array of { name, volume }
  lastUpdated: 0
};

chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
  settings = { ...DEFAULT_SETTINGS, ...stored };
  if (settings.captureEnabled) {
    connectWebSocket();
  }
});

chrome.storage.onChanged.addListener((changes) => {
  let portChanged = false;
  for (const [key, { newValue }] of Object.entries(changes)) {
    settings[key] = newValue;
    if (key === 'wsPort') portChanged = true;
  }

  broadcastToTabs({ type: 'SETTINGS_UPDATED', settings });

  if (!settings.captureEnabled) {
    disconnectWebSocket();
  } else if (portChanged || !isConnected) {
    disconnectWebSocket();
    connectWebSocket();
  }
});

// Clean up injected tab tracking on navigation/close
chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    injectedTabs.delete(tabId);
  }
  if (changeInfo.status === 'complete' && tab?.url) {
    const isMeetingUrl = /meet\.google\.com|zoom\.us|teams\.(microsoft|live)\.com|webex\.com|discord\.com|app\.slack\.com/.test(tab.url);
    if (isMeetingUrl && !injectedTabs.has(tabId)) {
      chrome.scripting.executeScript({
        target: { tabId, allFrames: false },
        files: ['injected.js'],
        world: 'MAIN'
      }).then(() => {
        injectedTabs.add(tabId);
        console.log('[LF-bg] (tabs.onUpdated) injected into tab', tabId);
      }).catch(err => {
        console.warn('[LF-bg] (tabs.onUpdated) injection failed:', err?.message);
      });
    }
  }
});

function connectWebSocket() {
  if (!settings.captureEnabled) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    socket = new WebSocket(`ws://127.0.0.1:${settings.wsPort}/extension`);

    socket.onopen = () => {
      isConnected = true;
      broadcastStatus();
      startPingInterval();
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        broadcastToPopups({ type: 'APP_MESSAGE', data: msg });
      } catch (_) {}
    };

    socket.onclose = () => {
      isConnected = false;
      socket = null;
      stopPingInterval();
      broadcastStatus();
      if (settings.autoReconnect && settings.captureEnabled) {
        scheduleReconnect();
      }
    };

    socket.onerror = () => {
      isConnected = false;
      stopPingInterval();
      if (socket) socket.close();
    };
  } catch (_) {
    if (settings.autoReconnect && settings.captureEnabled) {
      scheduleReconnect();
    }
  }
}

function disconnectWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopPingInterval();
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  isConnected = false;
  broadcastStatus();
}

function startPingInterval() {
  stopPingInterval();
  pingTimer = setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'PING' }));
    }
  }, 10000);
}

function stopPingInterval() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectWebSocket();
  }, 3000);
}

function sendToApp(payload) {
  if (!settings.captureEnabled) return;
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcastStatus() {
  broadcastToPopups({
    type: 'STATUS_UPDATE',
    connected: isConnected,
    settings,
    meetingState
  });
}

function broadcastToPopups(msg) {
  for (const port of popupPorts) {
    try {
      port.postMessage(msg);
    } catch (_) {
      popupPorts.delete(port);
    }
  }
}

function broadcastToTabs(msg) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    }
  });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    popupPorts.add(port);

    if (Date.now() - meetingState.lastUpdated > 2500) {
      meetingState.activeSpeakers = [];
    }

    // Request an immediate state sync from any open meeting tab
    broadcastToTabs({ type: 'SETTINGS_UPDATED', settings });

    port.postMessage({
      type: 'INIT_STATE',
      connected: isConnected,
      settings,
      meetingState
    });

    port.onMessage.addListener((msg) => {
      if (msg.type === 'RECONNECT_WS') {
        disconnectWebSocket();
        connectWebSocket();
      }
    });

    port.onDisconnect.addListener(() => {
      popupPorts.delete(port);
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_INIT_CONFIG') {
    sendResponse({ settings, connected: isConnected });
    return true;
  }

  if (msg.type === 'INJECT_PAGE_SCRIPT') {
    const tabId = sender.tab?.id;
    if (!tabId) return false;
    if (injectedTabs.has(tabId)) {
      // Already injected — just resend settings
      chrome.tabs.sendMessage(tabId, { type: 'SETTINGS_UPDATED', settings }).catch(() => {});
      return false;
    }
    chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ['injected.js'],
      world: 'MAIN'
    }).then(() => {
      injectedTabs.add(tabId);
      console.log('[LF-bg] injected injected.js into tab', tabId);
      // Push initial settings into the page script
      chrome.tabs.sendMessage(tabId, { type: 'SETTINGS_UPDATED', settings }).catch(() => {});
    }).catch((e) => {
      console.warn('[LF-bg] scripting injection failed:', e?.message);
    });
    return false;
  }

  if (!settings.captureEnabled) return false;

  if (msg.type === 'MEETING_TELEMETRY') {
    meetingState.platform = msg.platform;
    meetingState.tabId = sender.tab ? sender.tab.id : null;
    meetingState.participants = msg.participants || [];
    meetingState.activeSpeakers = msg.speakers || [];
    meetingState.lastUpdated = Date.now();

    broadcastToPopups({
      type: 'LIVE_TELEMETRY',
      platform: msg.platform,
      participants: meetingState.participants,
      speakers: meetingState.activeSpeakers
    });

    if (msg.participantsChanged) {
      sendToApp({
        type: 'PARTICIPANTS_UPDATE',
        platform: msg.platform,
        participants: meetingState.participants.map(p => p.name),
        timestamp: msg.timestamp
      });
    }

    if (meetingState.activeSpeakers.length > 0) {
      sendToApp({
        type: 'SPEAKER_ACTIVE',
        platform: msg.platform,
        speakerName: meetingState.activeSpeakers[0].name,
        speakers: meetingState.activeSpeakers,
        timestamp: msg.timestamp
      });
    }
  } else if (msg.type === 'AUDIO_CHUNK') {
    sendToApp(msg);
  }

  return false;
});