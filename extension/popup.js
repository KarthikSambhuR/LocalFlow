// LocalFlow Meeting Companion - Responsive Popup Controller
document.addEventListener('DOMContentLoaded', () => {
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const platformName = document.getElementById('platformName');
  const participantCount = document.getElementById('participantCount');
  const speakingCount = document.getElementById('speakingCount');
  const rosterCount = document.getElementById('rosterCount');
  const speakersContainer = document.getElementById('speakersContainer');
  const participantsContainer = document.getElementById('participantsContainer');

  const toggleCapture = document.getElementById('toggleCapture');
  const rangeNoiseGate = document.getElementById('rangeNoiseGate');
  const gateVal = document.getElementById('gateVal');
  const inputPort = document.getElementById('inputPort');
  const btnReconnect = document.getElementById('btnReconnect');

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn, .view').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  const speakerNodes = new Map();

  function formatPlatform(raw) {
    if (!raw || raw === 'generic') return 'No Active Meeting';
    return raw.replace('_', ' ');
  }

  function updateConnectionUI(connected) {
    statusBadge.className = `conn-pill ${connected ? 'connected' : 'disconnected'}`;
    statusText.textContent = connected ? 'Connected' : 'App Offline';
  }

  function renderActiveSpeakers(speakers = []) {
    speakingCount.textContent = `${speakers.length} speaking`;

    if (speakers.length === 0) {
      speakerNodes.clear();
      speakersContainer.innerHTML = `<div class="empty-state">No one is currently speaking</div>`;
      return;
    }

    const emptyEl = speakersContainer.querySelector('.empty-state');
    if (emptyEl) emptyEl.remove();

    const currentNames = new Set(speakers.map(s => s.name));

    for (const [name, nodeObj] of speakerNodes.entries()) {
      if (!currentNames.has(name)) {
        nodeObj.card.remove();
        speakerNodes.delete(name);
      }
    }

    speakers.forEach(({ name, volume }) => {
      const clampedVol = Math.max(0, Math.min(100, Math.round(volume)));
      if (speakerNodes.has(name)) {
        const nodeObj = speakerNodes.get(name);
        nodeObj.fill.style.width = `${clampedVol}%`;
        nodeObj.db.textContent = `${clampedVol}%`;
      } else {
        const card = document.createElement('div');
        card.className = 'speaker-card';

        const top = document.createElement('div');
        top.className = 'speaker-top';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'speaker-name';
        nameSpan.textContent = name;

        const dbSpan = document.createElement('span');
        dbSpan.className = 'speaker-db';
        dbSpan.textContent = `${clampedVol}%`;

        top.appendChild(nameSpan);
        top.appendChild(dbSpan);

        const track = document.createElement('div');
        track.className = 'vol-track';

        const fill = document.createElement('div');
        fill.className = 'vol-fill';
        fill.style.width = `${clampedVol}%`;

        track.appendChild(fill);
        card.appendChild(top);
        card.appendChild(track);
        speakersContainer.appendChild(card);

        speakerNodes.set(name, { card, fill, db: dbSpan });
      }
    });
  }

  function renderParticipantsList(participants = [], speakers = []) {
    const count = participants.length;
    participantCount.textContent = `${count} participant${count === 1 ? '' : 's'}`;
    rosterCount.textContent = `${count}`;

    if (count === 0) {
      participantsContainer.innerHTML = `<div class="empty-state">Waiting for meeting participants...</div>`;
      return;
    }

    const speakingSet = new Set(speakers.map(s => s.name));
    participantsContainer.innerHTML = '';

    participants.forEach((p) => {
      const name = typeof p === 'string' ? p : p.name;
      const muted = typeof p === 'object' ? Boolean(p.muted) : false;
      const isSpeaking = speakingSet.has(name);

      const row = document.createElement('div');
      row.className = 'participant-row';

      const left = document.createElement('div');
      left.className = 'participant-left';

      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.textContent = (name[0] || '?').toUpperCase();

      const nameEl = document.createElement('span');
      nameEl.className = 'participant-name';
      nameEl.textContent = name;

      left.appendChild(avatar);
      left.appendChild(nameEl);

      const badge = document.createElement('span');
      if (isSpeaking) {
        badge.className = 'mic-badge speaking';
        badge.textContent = 'Speaking';
      } else if (muted) {
        badge.className = 'mic-badge muted';
        badge.textContent = 'Muted';
      } else {
        badge.className = 'mic-badge unmuted';
        badge.textContent = 'Mic On';
      }

      row.appendChild(left);
      row.appendChild(badge);
      participantsContainer.appendChild(row);
    });
  }

  const port = chrome.runtime.connect({ name: 'popup' });

  port.onMessage.addListener((msg) => {
    if (msg.type === 'INIT_STATE' || msg.type === 'STATUS_UPDATE') {
      updateConnectionUI(msg.connected);

      if (msg.settings) {
        toggleCapture.checked = msg.settings.captureEnabled;
        rangeNoiseGate.value = msg.settings.noiseGate;
        gateVal.textContent = `${msg.settings.noiseGate}%`;
        inputPort.value = msg.settings.wsPort;
      }

      if (msg.meetingState) {
        platformName.textContent = formatPlatform(msg.meetingState.platform);
        const parts = msg.meetingState.participants || [];
        const spks = msg.meetingState.activeSpeakers || [];
        renderActiveSpeakers(spks);
        renderParticipantsList(parts, spks);
      }
    } else if (msg.type === 'LIVE_TELEMETRY') {
      platformName.textContent = formatPlatform(msg.platform);
      renderActiveSpeakers(msg.speakers || []);
      renderParticipantsList(msg.participants || [], msg.speakers || []);
    }
  });

  toggleCapture.addEventListener('change', () => {
    chrome.storage.local.set({ captureEnabled: toggleCapture.checked });
  });

  rangeNoiseGate.addEventListener('input', () => {
    gateVal.textContent = `${rangeNoiseGate.value}%`;
    chrome.storage.local.set({ noiseGate: parseInt(rangeNoiseGate.value, 10) });
  });

  inputPort.addEventListener('change', () => {
    const portNum = parseInt(inputPort.value, 10);
    if (portNum >= 1024 && portNum <= 65535) {
      chrome.storage.local.set({ wsPort: portNum });
    }
  });

  btnReconnect.addEventListener('click', () => {
    statusText.textContent = 'Connecting...';
    port.postMessage({ type: 'RECONNECT_WS' });
  });
});