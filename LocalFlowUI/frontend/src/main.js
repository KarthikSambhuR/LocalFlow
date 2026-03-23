// ── Build the DOM ────────────────────────────────────────────────────────────
const BAR_COUNT = 10;
const root = document.getElementById('root');

// Neo-brutalist / Wispr Flow module container
const moduleNode = document.createElement('div');
moduleNode.className = 'module';
moduleNode.id = 'module';

const ring = document.createElement('div');
ring.className = 'processing-ring';
moduleNode.appendChild(ring);

const visualizer = document.createElement('div');
visualizer.className = 'visualizer';

const bars = [];
for (let i = 0; i < BAR_COUNT; i++) {
  const bar = document.createElement('div');
  bar.className = 'bar idle';
  visualizer.appendChild(bar);
  bars.push(bar);
}
moduleNode.appendChild(visualizer);

// ── Settings UI DOM ────────────────────────────────────────────────────────
const settingsOverlay = document.createElement('div');
settingsOverlay.className = 'settings-overlay';
settingsOverlay.id = 'settingsOverlay';

const settingsModal = document.createElement('div');
settingsModal.className = 'settings-modal';

settingsModal.innerHTML = `
  <div class="settings-sidebar">
    <div class="sidebar-header">LocalFlow</div>
    <div class="nav-item" data-section="home">
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      Home
    </div>
    <div class="nav-item" data-section="general">
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
      General
    </div>
    <div class="nav-item" data-section="models">
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
      Models
    </div>
  </div>
  <div class="settings-content">
    <div class="content-header">
      <span class="section-title">Home</span>
    </div>
    <div class="section" id="sec-home">
      <div class="history-list" id="historyList"></div>
    </div>
    <div class="section" id="sec-general">
      <div class="setting-group">
        <label>Audio Playback</label>
        <div class="setting-item">
          <span>Playback Amplifier</span>
          <div style="display: flex; align-items: center; gap: 12px;">
            <input type="range" id="ampSlider" min="1" max="10" step="0.5" value="1" class="brutal-slider">
            <span id="ampValue" class="badge">1.0x</span>
          </div>
        </div>
        <div class="setting-item" style="margin-top: 12px; flex-direction: column; align-items: flex-start; gap: 10px;">
          <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
            <span>Boost Whisper Input</span>
            <label class="toggle-switch">
              <input type="checkbox" id="boostToggle">
              <span class="toggle-track"></span>
            </label>
          </div>
          <p style="font-size: 12px; color: var(--text-muted); line-height: 1.5;">
            When enabled, the amplifier gain above is applied to the recording before Whisper processes it — useful if your mic is quiet.
            The saved audio file is <strong>not</strong> affected.
          </p>
        </div>
      </div>
      <div class="setting-group">
        <label>Appearance</label>
        <div class="setting-item">
          <span>Theme</span>
          <select id="themeSelect" class="brutal-select">
            <option value="light">Light Mode</option>
            <option value="dark">Dark Mode</option>
          </select>
        </div>
      </div>
      <div class="setting-group">
        <label>Trigger Keybind</label>
        <div class="setting-item">
          <span>Active Combination</span>
          <div class="kbd-combo"><kbd>Ctrl</kbd> + <kbd>Win</kbd></div>
        </div>
      </div>
      <div class="setting-group">
        <label>Storage & Cache</label>
        <div class="setting-item">
          <span>Audio History</span>
          <span>7 Days (Auto-cleanup)</span>
        </div>
      </div>
    </div>
    <div class="section" id="sec-models">
      <div class="setting-group">
        <label>Whisper Configuration</label>
        <div class="setting-item">
          <span>Current Model</span>
          <span class="badge">ggml-tiny.en.bin</span>
        </div>
      </div>
    </div>
  </div>
`;

settingsOverlay.appendChild(settingsModal);
root.appendChild(settingsOverlay);
root.appendChild(moduleNode);

// ── State & Animation ────────────────────────────────────────────────────────
let isActive = false;
let isProcessing = false;
const targets = new Float32Array(BAR_COUNT).fill(3);
const currents = new Float32Array(BAR_COUNT).fill(3);
const LERP = 0.4;
let rafId = null;

function resetBars() {
  targets.fill(3);
  currents.fill(3);
}

function animateBars() {
  for (let i = 0; i < BAR_COUNT; i++) {
    currents[i] += (targets[i] - currents[i]) * LERP;
    bars[i].style.height = `${currents[i]}px`;
  }
  rafId = requestAnimationFrame(animateBars);
}

function showModule() {
  isActive = true;
  isProcessing = false;
  moduleNode.classList.remove('processing');
  moduleNode.classList.add('active');
  if (!rafId) animateBars();
}

function hideModule() {
  isActive = false;
  isProcessing = false;
  moduleNode.classList.remove('active', 'processing');
  resetBars();
  setTimeout(() => { if (!isActive && rafId) { cancelAnimationFrame(rafId); rafId = null; } }, 600);
}

function showProcessing() {
  isProcessing = true;
  resetBars();
  moduleNode.classList.remove('active');
  moduleNode.classList.add('processing');
}

function setVolume(vol) {
  const scaled = Math.min(vol * 16, 100);
  const mid = (BAR_COUNT - 1) / 2;
  for (let i = 0; i < BAR_COUNT; i++) {
    const dist = Math.abs(i - mid) / mid;
    const weight = Math.exp(-2.5 * dist * dist);
    targets[i] = Math.max(3, scaled * 1.2 * weight + (Math.random() - 0.5) * 4);
  }
}

// ── Settings Navigation ──────────────────────────────────────────────────────
const navItems = settingsModal.querySelectorAll('.nav-item');
const sections = settingsModal.querySelectorAll('.section');
const sectionTitle = settingsModal.querySelector('.section-title');

function switchSection(target) {
  navItems.forEach(i => {
    const isTarget = i.getAttribute('data-section') === target;
    i.classList.toggle('active', isTarget);
    if (isTarget) sectionTitle.textContent = i.textContent.trim();
  });
  sections.forEach(s => s.classList.toggle('active', s.id === `sec-${target}`));
  if (target === 'home') loadHistory();
}

navItems.forEach(item => item.addEventListener('click', () => switchSection(item.getAttribute('data-section'))));

let audioPort = null; // kept for compat, unused

async function loadHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;

  const records = await window.go.main.SettingsApp.GetRecordings();
  if (!records || records.length === 0) {
    list.innerHTML = '<div class="empty-state">No recordings yet. Say something!</div>';
    return;
  }
  list.innerHTML = '';
  records.forEach(r => {
    const card = document.createElement('div');
    card.className = 'history-card';
    const date = new Date(r.timestamp);
    
    card.innerHTML = `
      <div class="card-top">
        <span class="card-meta">${date.toLocaleDateString()} • ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        <span class="badge" style="font-size: 10px">${(r.duration_ms / 1000).toFixed(1)}s</span>
      </div>
      <div class="card-center">
        <div class="card-transcript">${r.transcription || '<i>No speech detected</i>'}</div>
      </div>
      <div class="card-controls">
        <div class="play-btn">
          ${PLAY_SVG}
          <span>Play</span>
        </div>
        <div class="copy-btn-small">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </div>
      </div>
    `;

    const playBtn = card.querySelector('.play-btn');
    playBtn.onclick = () => {
      const url = `/audio/${r.filename}`;
      playRecord(url, playBtn);
    };
    card.querySelector('.copy-btn-small').onclick = (e) => {
      window.runtime.ClipboardSetText(r.transcription);
      const btn = e.currentTarget;
      const originalSVG = btn.innerHTML;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-secondary)" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
      btn.style.borderColor = 'var(--accent-secondary)';
      setTimeout(() => {
        btn.innerHTML = originalSVG;
        btn.style.borderColor = '';
      }, 1500);
    };
    list.appendChild(card);
  });
}

function setupWails() {
  window.runtime.EventsOn('recording-state', (state) => {
    settingsOverlay.classList.remove('active');
    if (state === 'listening' || state === true) showModule();
    else showProcessing();
  });
  window.runtime.EventsOn('recording-done', hideModule);
  window.runtime.EventsOn('volume-data', (vol) => { if (isActive && !isProcessing) setVolume(vol); });
}

function setupTheme() {
  const select = document.getElementById('themeSelect');
  if (!select) return;

  // Load saved theme
  const savedTheme = localStorage.getItem('localflow_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  select.value = savedTheme;

  // Handle changes
  select.addEventListener('change', (e) => {
    const val = e.target.value;
    localStorage.setItem('localflow_theme', val);
    document.documentElement.setAttribute('data-theme', val);
  });
}

// ── Audio Context for Amplification ──────────────────────────────────────────
let audioCtx = null;
let gainNode = null;
let currentAmp = 1.0;

// Track the currently playing source so we can stop it when another starts
let currentSource = null;
let currentPlayBtn = null;

const PLAY_SVG  = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);
  }
  gainNode.gain.value = currentAmp;
}

function stopCurrentTrack() {
  if (currentSource) {
    try { currentSource.stop(); } catch(e) {}
    currentSource.disconnect();
    currentSource = null;
  }
  if (currentPlayBtn) {
    currentPlayBtn.innerHTML = PLAY_SVG;
    currentPlayBtn = null;
  }
}

// Manual WAV decoder — works with both PCM16 (format 1) and float32 (format 3)
// Bypasses decodeAudioData which rejects non-standard WAV types in WebView2.
function decodeWavBuffer(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const audioFormat  = view.getUint16(20, true); // 1=PCM, 3=float32
  const numChannels  = view.getUint16(22, true);
  const sampleRate   = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);

  // Scan for the 'data' chunk (skip any non-data chunks like 'fact')
  let pos = 12;
  while (pos < arrayBuffer.byteLength - 8) {
    const tag  = String.fromCharCode(view.getUint8(pos), view.getUint8(pos+1), view.getUint8(pos+2), view.getUint8(pos+3));
    const size = view.getUint32(pos + 4, true);
    pos += 8;
    if (tag === 'data') break;
    pos += size;
  }

  const bytesPerSample = bitsPerSample / 8;
  const numFrames = Math.floor((arrayBuffer.byteLength - pos) / (bytesPerSample * numChannels));

  const audioBuf = audioCtx.createBuffer(numChannels, numFrames, sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    const out = audioBuf.getChannelData(ch);
    for (let i = 0; i < numFrames; i++) {
      const offset = pos + (i * numChannels + ch) * bytesPerSample;
      if (audioFormat === 3) {
        out[i] = view.getFloat32(offset, true);         // float32 native
      } else {
        out[i] = view.getInt16(offset, true) / 32768.0; // PCM16 → float
      }
    }
  }
  return audioBuf;
}

async function playRecord(url, playBtn) {
  ensureAudioCtx();

  // If same button pressed while playing → pause/stop
  if (currentPlayBtn === playBtn) {
    stopCurrentTrack();
    return;
  }

  // Stop any previous track
  stopCurrentTrack();

  // Set loading state
  playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="9" stroke-dasharray="56" stroke-dashoffset="14"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></circle></svg>`;

  try {
    // Fetch raw bytes — sidesteps any CORS issues with MediaElementSource
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();

    // Use our own parser — works with float32 AND PCM16 WAV files
    const audioBuffer = decodeWavBuffer(arrayBuffer);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNode);
    source.start(0);

    currentSource = source;
    currentPlayBtn = playBtn;
    playBtn.innerHTML = PAUSE_SVG;

    source.onended = () => {
      if (currentSource === source) {
        currentSource = null;
        currentPlayBtn = null;
        playBtn.innerHTML = PLAY_SVG;
      }
    };
  } catch(err) {
    console.error('Playback failed:', err);
    playBtn.innerHTML = PLAY_SVG;
  }
}

async function setupAmp() {
  const slider = document.getElementById('ampSlider');
  const disp   = document.getElementById('ampValue');
  const toggle = document.getElementById('boostToggle');
  if (!slider) return;

  // Load current values from shared config file
  const cfg = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetConfig()
    : null;

  const initGain = cfg ? cfg.input_boost_gain : 1.0;
  const initEnabled = cfg ? cfg.input_boost_enabled : false;

  slider.value = initGain;
  currentAmp   = initGain;
  disp.textContent = initGain.toFixed(1) + 'x';
  if (toggle) toggle.checked = initEnabled;

  const persist = () => {
    if (window.go?.main?.SettingsApp) {
      window.go.main.SettingsApp.SetInputBoost(
        toggle ? toggle.checked : false,
        currentAmp
      );
    }
  };

  slider.addEventListener('input', (e) => {
    currentAmp = parseFloat(e.target.value);
    disp.textContent = currentAmp.toFixed(1) + 'x';
    if (gainNode) {
      gainNode.gain.setTargetAtTime(currentAmp, audioCtx.currentTime, 0.1);
    }
    persist();
  });

  if (toggle) {
    toggle.addEventListener('change', persist);
  }
}

async function init() {
  setupTheme();

  if (window.runtime) {
    const isSettings = window.go && window.go.main && window.go.main.SettingsApp;
    if (isSettings) {
      moduleNode.style.display = 'none';
      settingsOverlay.classList.add('active');
      const route = await window.go.main.SettingsApp.GetInitialRoute();
      switchSection(route || 'home');
      setupAmp(); // load config values into the settings UI
    } else {
      settingsOverlay.style.display = 'none';
      setupWails();
    }
  }
}

window.addEventListener('DOMContentLoaded', init);