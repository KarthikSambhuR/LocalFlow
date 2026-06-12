import './style.css';
import logoImg from './assets/images/logo-universal.png';

// ── Build the DOM ────────────────────────────────────────────────────────────
const BAR_COUNT = 9;
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
    <div class="sidebar-brand">
      <img class="brand-logo" src="${logoImg}" alt="LocalFlow Logo" />
      <div>
        <div class="sidebar-header">LocalFlow</div>
        <div class="sidebar-subtitle">Your transcriber</div>
      </div>
    </div>
    <div class="nav-item" data-section="home">
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      Home
    </div>
    <div class="nav-item" data-section="insights">
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16V9"/><path d="M12 16V5"/><path d="M17 16v-3"/></svg>
      Insights
    </div>
    <div class="nav-item" data-section="settings">
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
      Settings
    </div>
    <div class="nav-item" data-section="models">
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
      Models
    </div>
    <div class="sidebar-footer">
      <div class="shortcut-preview">
        <span>Shortcut</span>
        <div><kbd id="sideK1">Ctrl</kbd><b>+</b><kbd id="sideK2">Win</kbd></div>
      </div>
    </div>
  </div>
  <div class="settings-content">
    <div class="content-header">
      <span class="section-title">Home</span>
    </div>
    <div class="section" id="sec-home">
      <div class="home-layout">
        <div class="home-stats-bar" id="homeRail"></div>
        <main class="home-main">
          <div class="section-kicker">Recent dictation</div>
          <div class="history-list" id="historyList"></div>
        </main>
      </div>
    </div>
    <div class="section" id="sec-insights">
      <div class="insights-wrap" id="insightsRoot"></div>
    </div>
    <div class="section" id="sec-settings">
      <div class="setting-group">
        <label>Audio Settings</label>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Playback Amplifier</span>
            <span class="setting-desc">Boost volume of history playback</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <input type="range" id="ampSlider" min="1" max="10" step="0.5" value="1" class="brutal-slider">
            <span id="ampValue" class="badge">1.0x</span>
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Boost Whisper Input</span>
            <span class="setting-desc">Apply amp gain heavily to the microphone feed prior to AI transcription</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="boostToggle">
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Input Microphone</span>
            <span class="setting-desc">Choose which audio device dictates to AI transcription</span>
          </div>
          <div class="custom-dropdown" id="micDropdown">
            <button class="dropdown-trigger">
              <span id="micLabel">Default</span>
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="dropdown-menu" id="micDropdownMenu" style="min-width: 200px; max-width: 400px; max-height: 250px; overflow-y: auto;">
              <div class="dropdown-item active" data-value="Default">Default</div>
            </div>
          </div>
        </div>
      </div>
      <div class="setting-group">
        <label>Startup</label>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Start LocalFlow on system startup</span>
            <span class="setting-desc">Automatically launch application when you log in</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="startupToggle">
            <span class="toggle-track"></span>
          </label>
        </div>
      </div>
      <div class="setting-group">
        <label>Appearance</label>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Theme</span>
            <span class="setting-desc">Toggle interface appearance</span>
          </div>
          <select id="themeSelect" class="brutal-select">
            <option value="light">Light Mode</option>
            <option value="dark">Dark Mode</option>
          </select>
        </div>
      </div>
      <div class="setting-group">
        <label>Trigger Keybind</label>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Active Combination</span>
            <span class="setting-desc">Click the button to remap your hotkeys</span>
          </div>
          <button id="remapBtn" class="kbd-btn">
            <kbd id="k1Label">Ctrl</kbd> <span class="kbd-plus">+</span> <kbd id="k2Label">Win</kbd>
          </button>
        </div>
      </div>
      <div class="setting-group">
        <label>Storage & Cache</label>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Audio Files Lifespan</span>
            <span class="setting-desc">How long audio recordings (.wav) are kept on disk</span>
          </div>
          <div class="custom-dropdown" id="audioRetentionDropdown">
            <button class="dropdown-trigger">
              <span id="audioRetentionLabel">7 Days</span>
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="dropdown-menu">
              <div class="dropdown-item" data-value="1">1 Day</div>
              <div class="dropdown-item" data-value="3">3 Days</div>
              <div class="dropdown-item" data-value="7">7 Days</div>
              <div class="dropdown-item" data-value="14">14 Days</div>
              <div class="dropdown-item" data-value="30">30 Days</div>
              <div class="dropdown-item" data-value="-1">Forever</div>
            </div>
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Transcription Lifespan</span>
            <span class="setting-desc">How long dictation text is kept (analytics are kept forever)</span>
          </div>
          <div class="custom-dropdown" id="transcriptionRetentionDropdown">
            <button class="dropdown-trigger">
              <span id="transcriptionRetentionLabel">30 Days</span>
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="dropdown-menu">
              <div class="dropdown-item" data-value="7">7 Days</div>
              <div class="dropdown-item" data-value="14">14 Days</div>
              <div class="dropdown-item" data-value="30">30 Days</div>
              <div class="dropdown-item" data-value="90">90 Days</div>
              <div class="dropdown-item" data-value="180">180 Days</div>
              <div class="dropdown-item" data-value="-1">Forever</div>
            </div>
          </div>
        </div>
        <div class="setting-item" style="flex-direction: column; align-items: stretch; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div class="setting-info">
              <span class="setting-title">Data Storage Directory</span>
              <span class="setting-desc">Folder where database, cache, and all audio files are saved</span>
            </div>
            <button id="selectFolderBtn" class="kbd-btn" style="padding: 6px 12px; font-weight: 500;">
              Change Folder
            </button>
          </div>
          <div id="dataFolderDesc" style="font-family: monospace; font-size: 11px; background: var(--bg-sidebar); border: 1px dashed var(--border); padding: 8px 12px; border-radius: 6px; color: var(--text-secondary); word-break: break-all; margin-top: 4px;">
            Default
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Manual Cleanup</span>
            <span class="setting-desc">Prune expired files and texts immediately</span>
          </div>
          <button id="purgeNowBtn" class="kbd-btn" style="padding: 6px 12px; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.4); color: #ef4444;">
            Clean Cache Now
          </button>
        </div>
      </div>
    </div>
    <div class="section" id="sec-models">
      <div class="setting-group">
        <label>Speech Recognition Models</label>
        <div class="model-list" id="modelList">
          <!-- Populated dynamically -->
        </div>
      </div>
    </div>
  </div>
`;

settingsOverlay.appendChild(settingsModal);
root.appendChild(settingsOverlay);
root.appendChild(moduleNode);

// Custom confirm modal for cleanups
const confirmModalOverlay = document.createElement('div');
confirmModalOverlay.className = 'custom-modal-overlay';
confirmModalOverlay.id = 'confirmModal';
confirmModalOverlay.innerHTML = `
  <div class="custom-modal">
    <h3>Clear All Cache?</h3>
    <p>This will permanently delete all raw audio files and transcription texts. Your historical stats will be preserved.</p>
    <div class="modal-actions">
      <button class="modal-btn cancel" id="confirmModalCancel">Cancel</button>
      <button class="modal-btn confirm" id="confirmModalConfirm">Clear Everything</button>
    </div>
  </div>
`;
root.appendChild(confirmModalOverlay);

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
  const scaled = Math.min(vol * 9.0, 22);
  const mid = (BAR_COUNT - 1) / 2;
  for (let i = 0; i < BAR_COUNT; i++) {
    const dist = Math.abs(i - mid) / mid;
    const weight = Math.exp(-2.5 * dist * dist);
    targets[i] = Math.max(4, Math.min(22, scaled * weight + (Math.random() - 0.5) * 2));
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
  if (target === 'home' || target === 'insights') loadDashboard(target);
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

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function countWords(text = '') {
  const cleaned = text.trim();
  if (!cleaned || cleaned === '[BLANK_AUDIO]') return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTooltipDate(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1]) - 1;
  const day = parseInt(parts[2]);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[monthIdx]} ${year}`;
}

function computeStats(records = []) {
  const byDay = new Map();
  let totalWords = 0;
  let totalMs = 0;
  let todayWords = 0;
  const todayKey = localDateKey(new Date());

  records.forEach(r => {
    const words = r.word_count || countWords(r.transcription);
    const date = new Date(r.timestamp);
    const key = localDateKey(date);
    totalWords += words;
    totalMs += Number(r.duration_ms || 0);
    byDay.set(key, (byDay.get(key) || 0) + words);
    if (key === todayKey) todayWords += words;
  });

  let streak = 0;
  const cursor = new Date();
  while (byDay.get(localDateKey(cursor)) > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  let longest = 0;
  let running = 0;
  Array.from(byDay.keys()).sort().forEach(key => {
    if (byDay.get(key) > 0) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  });

  const minutes = Math.max(totalMs / 60000, 0.01);
  const wpm = totalWords > 0 ? Math.round(totalWords / minutes) : 0;
  return { totalWords, totalMs, todayWords, wpm, streak, longest, byDay };
}

async function loadDashboard() {
  const records = await window.go.main.SettingsApp.GetRecordings();
  const safeRecords = records || [];
  const analytics = await window.go.main.SettingsApp.GetAnalytics();
  const safeAnalytics = analytics || [];
  const stats = computeStats(safeAnalytics);
  renderHome(safeRecords, stats);
  renderInsights(stats);
}

function renderHome(records, stats) {
  const list = document.getElementById('historyList');
  const rail = document.getElementById('homeRail');
  if (!list) return;
  if (rail) rail.innerHTML = renderHomeRail(stats);

  if (!records.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
            <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
            <line x1="12" x2="12" y1="19" y2="22"/>
          </svg>
        </div>
        <h4>Silence is Golden</h4>
        <p>Your dictation history is clear. Press <kbd>Ctrl</kbd> + <kbd>Win</kbd> and speak to capture your first transcription.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = '';
  records.slice(0, 14).forEach(r => {
    const row = document.createElement('div');
    row.className = 'history-card';
    const date = new Date(r.timestamp);
    const words = r.word_count || countWords(r.transcription);
    
    let displayText = escapeHtml(r.transcription);
    if (!displayText) {
      if (r.word_count > 0) {
        displayText = '<span style="opacity: 0.4; font-style: italic;">Transcription cleaned (expired)</span>';
      } else {
        displayText = '<span style="opacity: 0.4; font-style: italic;">No speech detected</span>';
      }
    }

    row.innerHTML = `
      <div class="card-top">
        <span class="card-meta">${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        <span class="badge ghost">${words} words</span>
      </div>
      <div class="card-center">
        <div class="card-transcript">${displayText}</div>
      </div>
      <div class="card-controls">
        <div class="play-btn">${PLAY_SVG}<span>Play</span></div>
        <div class="copy-btn-small" style="${!r.transcription ? 'opacity: 0.3; pointer-events: none;' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></div>
      </div>
    `;

    const playBtn = row.querySelector('.play-btn');
    playBtn.onclick = () => playRecord(`/audio/${r.filename}`, playBtn);
    if (r.transcription) {
      row.querySelector('.copy-btn-small').onclick = () => window.runtime.ClipboardSetText(r.transcription);
    }
    list.appendChild(row);
  });
}

function renderHomeRail(stats) {
  return `
    <div class="stat-card stat-stack">
      <div><strong>${formatNumber(stats.totalWords)}</strong><span>total words</span></div>
      <div><strong>${stats.wpm}</strong><span>wpm</span></div>
      <div><strong>${stats.streak}</strong><span>day streak</span></div>
    </div>
  `;
}

let selectedYear = new Date().getFullYear();

function renderInsights(stats) {
  const rootNode = document.getElementById('insightsRoot');
  if (!rootNode) return;

  // Extract all available years from the record dates + current year
  const availableYears = new Set();
  availableYears.add(new Date().getFullYear());
  stats.byDay.forEach((val, key) => {
    const y = parseInt(key.split('-')[0]);
    if (y) availableYears.add(y);
  });
  const sortedYears = Array.from(availableYears).sort((a, b) => b - a);

  const customDropdownHtml = `
    <div class="custom-dropdown" id="yearDropdown">
      <button class="dropdown-trigger">
        <span>${selectedYear}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="dropdown-menu">
        ${sortedYears.map(yr => `<div class="dropdown-item ${yr === selectedYear ? 'active' : ''}" data-value="${yr}">${yr}</div>`).join('')}
      </div>
    </div>
  `;

  rootNode.innerHTML = `
    <div class="insight-header">
      <h2>Usage History</h2>
      ${customDropdownHtml}
    </div>
    
    <div class="insight-grid">
      <div class="metric-card wpm-card">
        <div class="wpm-text">
          <div class="metric-number">${stats.wpm}</div>
          <div class="metric-label">Words per minute</div>
        </div>
        <div class="gauge" style="--score:${Math.min(100, stats.wpm)}">
          <div class="gauge-center">
            <span>Top</span>
            <strong>${Math.min(99, Math.max(1, Math.round(stats.wpm / 2)))}%</strong>
          </div>
        </div>
      </div>
      
      <div class="metric-card wide">
        <div class="metric-number">${formatNumber(stats.totalWords)}</div>
        <div class="metric-label">Total words dictated</div>
      </div>
      
      <div class="metric-card streak-card">
        <div class="metric-head">
          <h3>${stats.streak} day streak</h3>
          <span>Longest streak | ${stats.longest || stats.streak} day</span>
        </div>
        ${renderStreakGrid(stats.byDay, selectedYear)}
      </div>
    </div>
  `;

  // Attach event handlers to the custom dropdown
  const dropdown = rootNode.querySelector('#yearDropdown');
  if (dropdown) {
    const trigger = dropdown.querySelector('.dropdown-trigger');
    const items = dropdown.querySelectorAll('.dropdown-item');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });

    items.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedYear = parseInt(item.getAttribute('data-value'));
        dropdown.classList.remove('open');
        renderInsights(stats);
      });
    });

    // Close dropdown on click outside
    document.addEventListener('click', () => {
      dropdown.classList.remove('open');
    });
  }

  // Setup Custom Instant Tooltip for Calendar Cells
  const wrapper = rootNode.querySelector('.calendar-wrapper');
  if (wrapper) {
    const tooltip = document.createElement('div');
    tooltip.className = 'custom-tooltip';
    wrapper.appendChild(tooltip);

    const grid = wrapper.querySelector('.calendar-grid');
    
    grid.addEventListener('mouseover', (e) => {
      if (e.target.classList.contains('streak-cell')) {
        const titleText = e.target.getAttribute('data-title');
        if (titleText) {
          tooltip.textContent = titleText;
          tooltip.classList.add('visible');
        }
      }
    });

    grid.addEventListener('mousemove', (e) => {
      if (e.target.classList.contains('streak-cell')) {
        const rect = wrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top - 40; // Position above cell
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
      }
    });

    grid.addEventListener('mouseout', (e) => {
      if (e.target.classList.contains('streak-cell')) {
        tooltip.classList.remove('visible');
      }
    });
    
    grid.addEventListener('mouseleave', () => {
      tooltip.classList.remove('visible');
    });
  }
}

function renderStreakGrid(byDay, year) {
  const cells = [];
  
  // Find Sunday on or before Jan 1st of the specified year
  const start = new Date(year, 0, 1);
  const dayOfWeek = start.getDay(); // 0 = Sunday
  start.setDate(start.getDate() - dayOfWeek); // Go back to start of the week

  // Find Saturday on or after Dec 31st of the specified year
  const end = new Date(year, 11, 31);
  const endDayOfWeek = end.getDay();
  end.setDate(end.getDate() + (6 - endDayOfWeek)); // Go forward to end of the week

  // Generate all grid cells
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = localDateKey(d);
    const words = byDay.get(key) || 0;
    const level = words === 0 ? 0 : words < 25 ? 1 : words < 75 ? 2 : words < 150 ? 3 : 4;
    const isCurrentYear = d.getFullYear() === year;
    const opacityClass = isCurrentYear ? '' : 'out-of-year';
    const formattedDate = formatTooltipDate(key);
    cells.push(`<span class="streak-cell level-${level} ${opacityClass}" data-title="${formattedDate}: ${words} words"></span>`);
  }

  // Generate month headers
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let monthHeaders = '';
  const current = new Date(start);
  let lastMonth = -1;
  let colIdx = 0;
  
  while (current <= end) {
    if (current.getDay() === 0) { // Sunday (new column)
      const m = current.getMonth();
      if (m !== lastMonth && current.getFullYear() === year) {
        monthHeaders += `<span style="grid-column: ${colIdx + 1} / span 4">${months[m]}</span>`;
        lastMonth = m;
      }
      colIdx++;
    }
    current.setDate(current.getDate() + 1);
  }

  return `
    <div class="calendar-wrapper">
      <div class="calendar-months">${monthHeaders}</div>
      <div class="calendar-body">
        <div class="calendar-days">
          <span>S</span>
          <span>M</span>
          <span>T</span>
          <span>W</span>
          <span>T</span>
          <span>F</span>
          <span>S</span>
        </div>
        <div class="calendar-grid" style="grid-template-rows: repeat(7, 1fr); grid-auto-flow: column;">
          ${cells.join('')}
        </div>
      </div>
      <div class="calendar-legend">
        <span>Less</span>
        <i class="level-0"></i>
        <i class="level-1"></i>
        <i class="level-2"></i>
        <i class="level-3"></i>
        <i class="level-4"></i>
        <span>More</span>
      </div>
    </div>
  `;
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
    playBtn.innerHTML = PAUSE_SVG + '<span>Pause</span>';

    source.onended = () => {
      if (currentSource === source) {
        currentSource = null;
        currentPlayBtn = null;
        playBtn.innerHTML = PLAY_SVG + '<span>Play</span>';
      }
    };
  } catch(err) {
    console.error('Playback failed:', err);
    playBtn.style.color = '#ef4444';
    playBtn.innerHTML = PLAY_SVG + '<span>Expired</span>';
    setTimeout(() => {
      playBtn.style.color = '';
      playBtn.innerHTML = PLAY_SVG + '<span>Play</span>';
    }, 2000);
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

async function setupKeybinds() {
  const btn = document.getElementById('remapBtn');
  const k1Label = document.getElementById('k1Label');
  const k2Label = document.getElementById('k2Label');
  const sideK1 = document.getElementById('sideK1');
  const sideK2 = document.getElementById('sideK2');
  if (!btn) return;

  const cfg = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetConfig()
    : null;

  let currentKey1Raw = cfg ? cfg.keybind1_rawcode : 162;
  let currentKey2Raw = cfg ? cfg.keybind2_rawcode : 91;
  k1Label.textContent = cfg ? cfg.keybind1_name : "Ctrl";
  k2Label.textContent = cfg ? cfg.keybind2_name : "Win";
  if (sideK1) sideK1.textContent = k1Label.textContent;
  if (sideK2) sideK2.textContent = k2Label.textContent;

  let isRecording = false;
  let capturedKeys = [];

  function getRawCode(e) {
    if (e.keyCode === 17) return e.location === 2 ? 163 : 162; // Ctrl
    if (e.keyCode === 16) return e.location === 2 ? 161 : 160; // Shift
    if (e.keyCode === 18) return e.location === 2 ? 165 : 164; // Alt
    if (e.keyCode === 91) return 91; // LWin
    if (e.keyCode === 92) return 92; // RWin
    return e.keyCode;
  }

  function getFriendlyName(e) {
    let name = e.code.replace('Left', '').replace('Right', '').replace('Key', '').replace('Digit', '');
    if (name === 'Meta') return 'Win';
    if (name === 'Control') return 'Ctrl';
    return name || String.fromCharCode(e.keyCode);
  }

  const handleKeydown = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const raw = getRawCode(e);
    const name = getFriendlyName(e);

    // Prevent identical keys (must be a combination)
    if (capturedKeys.length === 1 && capturedKeys[0].raw === raw) return;

    capturedKeys.push({ raw, name });

    if (capturedKeys.length === 1) {
      k1Label.textContent = name;
      k2Label.textContent = "...";
    }

    if (capturedKeys.length === 2) {
      k2Label.textContent = name;
      if (sideK1) sideK1.textContent = capturedKeys[0].name;
      if (sideK2) sideK2.textContent = name;
      window.removeEventListener('keydown', handleKeydown, true);
      btn.classList.remove('recording');
      isRecording = false;

      // Save to backend
      if (window.go?.main?.SettingsApp) {
        await window.go.main.SettingsApp.SetKeybinds(
          capturedKeys[0].raw, capturedKeys[0].name,
          capturedKeys[1].raw, capturedKeys[1].name
        );
      }
    }
  };

  btn.addEventListener('click', async () => {
    if (isRecording) return;
    isRecording = true;
    capturedKeys = [];
    if (window.go?.main?.SettingsApp) {
      await window.go.main.SettingsApp.SetKeybindCaptureActive(true);
    }
    btn.classList.add('recording');
    k1Label.textContent = "...";
    k2Label.textContent = "...";
    window.addEventListener('keydown', handleKeydown, true);
  });
}

async function setupStartupSettings() {
  const toggle = document.getElementById('startupToggle');
  if (!toggle) return;

  const cfg = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetConfig()
    : null;

  const initEnabled = cfg ? cfg.start_on_startup : false;
  toggle.checked = initEnabled;

  toggle.addEventListener('change', () => {
    if (window.go?.main?.SettingsApp) {
      window.go.main.SettingsApp.SetStartOnStartup(toggle.checked);
    }
  });
}

async function setupStorageSettings() {
  const audioDropdown = document.getElementById('audioRetentionDropdown');
  const transDropdown = document.getElementById('transcriptionRetentionDropdown');
  const purgeBtn = document.getElementById('purgeNowBtn');
  if (!audioDropdown || !transDropdown || !purgeBtn) return;

  const audioTrigger = audioDropdown.querySelector('.dropdown-trigger');
  const audioLabel = document.getElementById('audioRetentionLabel');
  const audioItems = audioDropdown.querySelectorAll('.dropdown-item');

  const transTrigger = transDropdown.querySelector('.dropdown-trigger');
  const transLabel = document.getElementById('transcriptionRetentionLabel');
  const transItems = transDropdown.querySelectorAll('.dropdown-item');

  let currentAudioVal = 7;
  let currentTransVal = 30;

  const getLabelText = (val) => {
    val = parseInt(val, 10);
    if (val === -1 || val === 99999 || val <= 0) return 'Forever';
    return val === 1 ? '1 Day' : `${val} Days`;
  };

  const cfg = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetConfig()
    : null;

  if (cfg) {
    currentAudioVal = cfg.audio_retention_days;
    currentTransVal = cfg.transcription_retention_days;
    
    audioLabel.textContent = getLabelText(currentAudioVal);
    audioItems.forEach(item => {
      const active = parseInt(item.getAttribute('data-value'), 10) === currentAudioVal;
      item.classList.toggle('active', active);
    });

    transLabel.textContent = getLabelText(currentTransVal);
    transItems.forEach(item => {
      const active = parseInt(item.getAttribute('data-value'), 10) === currentTransVal;
      item.classList.toggle('active', active);
    });
  }

  const persist = () => {
    if (window.go?.main?.SettingsApp) {
      window.go.main.SettingsApp.SetRetention(
        currentAudioVal,
        currentTransVal
      );
    }
  };

  // Audio dropdown trigger
  audioTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    audioDropdown.classList.toggle('open');
    transDropdown.classList.remove('open');
  });

  audioItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      currentAudioVal = parseInt(item.getAttribute('data-value'), 10);
      audioLabel.textContent = getLabelText(currentAudioVal);
      audioItems.forEach(i => i.classList.toggle('active', i === item));
      audioDropdown.classList.remove('open');
      persist();
    });
  });

  // Transcription dropdown trigger
  transTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    transDropdown.classList.toggle('open');
    audioDropdown.classList.remove('open');
  });

  transItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      currentTransVal = parseInt(item.getAttribute('data-value'), 10);
      transLabel.textContent = getLabelText(currentTransVal);
      transItems.forEach(i => i.classList.toggle('active', i === item));
      transDropdown.classList.remove('open');
      persist();
    });
  });

  // Close dropdowns on click outside
  document.addEventListener('click', () => {
    audioDropdown.classList.remove('open');
    transDropdown.classList.remove('open');
  });

  const modal = document.getElementById('confirmModal');
  const modalConfirm = document.getElementById('confirmModalConfirm');
  const modalCancel = document.getElementById('confirmModalCancel');

  let onConfirmCallback = null;

  const showConfirmModal = (onConfirm) => {
    onConfirmCallback = onConfirm;
    modal.classList.add('active');
  };

  const hideConfirmModal = () => {
    modal.classList.remove('active');
    onConfirmCallback = null;
  };

  modalCancel.onclick = (e) => {
    e.stopPropagation();
    hideConfirmModal();
  };

  modalConfirm.onclick = (e) => {
    e.stopPropagation();
    if (onConfirmCallback) onConfirmCallback();
    hideConfirmModal();
  };

  purgeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showConfirmModal(async () => {
      if (window.go?.main?.SettingsApp) {
        purgeBtn.disabled = true;
        const originalText = purgeBtn.textContent;
        purgeBtn.textContent = 'Cleaning...';
        try {
          await window.go.main.SettingsApp.PurgeNow();
          await loadDashboard();
          purgeBtn.textContent = 'Done!';
          setTimeout(() => {
            purgeBtn.textContent = 'Clean Cache Now';
            purgeBtn.disabled = false;
          }, 1500);
        } catch (err) {
          console.error(err);
          purgeBtn.textContent = 'Error';
          setTimeout(() => {
            purgeBtn.textContent = 'Clean Cache Now';
            purgeBtn.disabled = false;
          }, 1500);
        }
      }
    });
  });
}

async function setupDataFolderSettings() {
  const selectBtn = document.getElementById('selectFolderBtn');
  const folderDesc = document.getElementById('dataFolderDesc');
  if (!selectBtn || !folderDesc) return;

  const updatePathDisplay = async () => {
    const cfg = window.go?.main?.SettingsApp
      ? await window.go.main.SettingsApp.GetConfig()
      : null;
    if (cfg && cfg.data_folder) {
      folderDesc.textContent = cfg.data_folder;
    } else {
      folderDesc.textContent = 'Default';
    }
  };

  // Initial load
  await updatePathDisplay();

  selectBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!window.go?.main?.SettingsApp) return;

    try {
      const selectedPath = await window.go.main.SettingsApp.SelectDataFolder();
      if (!selectedPath) {
        // User cancelled dialog
        return;
      }

      // Show migrating loader state
      selectBtn.disabled = true;
      const originalText = selectBtn.textContent;
      selectBtn.textContent = 'Migrating...';
      folderDesc.textContent = `Migrating files to: ${selectedPath}...`;

      await window.go.main.SettingsApp.SetDataFolder(selectedPath);

      selectBtn.textContent = 'Done!';
      await updatePathDisplay();
      
      // Reload dashboard stats and history from the new database path
      await loadDashboard();

      setTimeout(() => {
        selectBtn.textContent = 'Change Folder';
        selectBtn.disabled = false;
      }, 1500);
    } catch (err) {
      console.error('Migration failed:', err);
      selectBtn.textContent = 'Error';
      await updatePathDisplay();
      setTimeout(() => {
        selectBtn.textContent = 'Change Folder';
        selectBtn.disabled = false;
      }, 1500);
    }
  });
}

async function setupModelsSettings() {
  const modelList = document.getElementById('modelList');
  if (!modelList) return;
  let modelsExpanded = true;

  const renderModels = async () => {
    if (!window.go?.main?.SettingsApp) return;
    try {
      const models = await window.go.main.SettingsApp.GetModelsList();
      modelList.innerHTML = '';
      modelList.className = 'model-list model-list-expanded';

      const activeModel = models.find(m => m.is_active) || models[0];
      const downloadedCount = models.filter(m => m.is_downloaded).length;
      const panel = document.createElement('div');
      panel.className = `models-panel ${modelsExpanded ? 'open' : ''}`;
      panel.innerHTML = `
        <button class="models-panel-header" type="button" aria-expanded="${modelsExpanded}">
          <span class="models-panel-chevron">${modelsExpanded ? 'v' : '>'}</span>
          <span class="models-panel-title">Speech Recognition Models</span>
          <span class="models-panel-meta">${activeModel ? activeModel.name : 'No model selected'} / ${downloadedCount}/${models.length} downloaded</span>
        </button>
        <div class="models-panel-body">
          ${models.map(m => {
            const statusText = m.is_active ? 'Active' : m.is_downloaded ? 'Downloaded' : 'Available';
            const statusClass = m.is_active ? 'active' : m.is_downloaded ? 'downloaded' : 'available';
            let actionHtml = '';
            if (m.is_downloading) {
              actionHtml = `
                <div class="model-progress-container">
                  <div class="model-progress-bar-bg">
                    <div class="model-progress-bar-fill" id="bar-${m.id}" style="width: ${m.download_progress}%"></div>
                  </div>
                  <div class="model-progress-text" id="text-${m.id}">Downloading... ${m.download_progress}%</div>
                </div>
              `;
            } else if (m.is_downloaded) {
              actionHtml = `
                ${m.is_active ? '' : `<button class="kbd-btn activate-btn model-action-btn" data-filename="${m.filename}">Activate</button>`}
                ${downloadedCount > 1 ? `<button class="kbd-btn delete-btn model-action-btn danger" data-filename="${m.filename}">Delete</button>` : ''}
              `;
            } else {
              actionHtml = `<button class="kbd-btn download-btn model-action-btn" data-id="${m.id}">Download</button>`;
            }

            return `
              <div class="model-row">
                <div class="model-row-main">
                  <div class="model-name-line">
                    <span class="model-name">${m.name}</span>
                    <span class="model-status-pill ${statusClass}">${statusText}</span>
                  </div>
                  <div class="model-desc">${m.description}</div>
                  <div class="model-filename">${m.filename}</div>
                </div>
                <div class="model-row-specs">
                  <span>${m.size_mb} MB</span>
                  <span>${m.speed_label}</span>
                  <span>${m.speed_description}</span>
                </div>
                <div class="model-row-actions">
                  ${actionHtml}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      const header = panel.querySelector('.models-panel-header');
      header.onclick = () => {
        modelsExpanded = !modelsExpanded;
        renderModels();
      };

      panel.querySelectorAll('.download-btn').forEach((downloadBtn) => {
        downloadBtn.onclick = async (event) => {
          event.stopPropagation();
          downloadBtn.disabled = true;
          downloadBtn.textContent = 'Starting...';
          await window.go.main.SettingsApp.DownloadModel(downloadBtn.dataset.id);
          renderModels();
        };
      });

      panel.querySelectorAll('.activate-btn').forEach((activateBtn) => {
        activateBtn.onclick = async (event) => {
          event.stopPropagation();
          activateBtn.disabled = true;
          activateBtn.textContent = 'Activating...';
          try {
            await window.go.main.SettingsApp.SetActiveModel(activateBtn.dataset.filename);
          } catch (err) {
            alert(err);
          }
          renderModels();
        };
      });

      panel.querySelectorAll('.delete-btn').forEach((deleteBtn) => {
        deleteBtn.onclick = async (event) => {
          event.stopPropagation();
          const model = models.find(m => m.filename === deleteBtn.dataset.filename);
          if (confirm(`Are you sure you want to delete ${model?.name || 'this model'}?`)) {
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting...';
            try {
              await window.go.main.SettingsApp.DeleteModel(deleteBtn.dataset.filename);
            } catch (err) {
              alert(err);
            }
            renderModels();
          }
        };
      });

      modelList.appendChild(panel);
    } catch (err) {
      console.error(err);
    }
  };

  window.runtime.EventsOn('model-download-progress', (id, percent) => {
    const fill = document.getElementById(`bar-${id}`);
    const txt = document.getElementById(`text-${id}`);
    if (fill && txt) {
      fill.style.width = `${percent}%`;
      txt.textContent = `Downloading... ${percent}%`;
    }
  });

  window.runtime.EventsOn('model-download-done', (id) => {
    renderModels();
  });

  window.runtime.EventsOn('model-download-error', (id, errMsg) => {
    alert(`Download failed for model ${id}: ${errMsg}`);
    renderModels();
  });

  await renderModels();
}

async function setupMicrophoneSettings() {
  const micDropdown = document.getElementById('micDropdown');
  const micLabel = document.getElementById('micLabel');
  const micMenu = document.getElementById('micDropdownMenu');
  if (!micDropdown || !micLabel || !micMenu) return;

  const trigger = micDropdown.querySelector('.dropdown-trigger');

  const mics = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetMicrophones()
    : ["Default"];

  const cfg = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetConfig()
    : null;

  let currentMic = cfg ? cfg.active_microphone : "Default";

  const renderMics = () => {
    micMenu.innerHTML = mics.map(m => `
      <div class="dropdown-item ${m === currentMic ? 'active' : ''}" data-value="${m}">${m}</div>
    `).join('');

    const items = micMenu.querySelectorAll('.dropdown-item');
    items.forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        currentMic = item.getAttribute('data-value');
        micLabel.textContent = currentMic;
        micDropdown.classList.remove('open');
        renderMics();

        if (window.go?.main?.SettingsApp) {
          await window.go.main.SettingsApp.SetMicrophone(currentMic);
        }
      });
    });
  };

  micLabel.textContent = currentMic;
  renderMics();

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    micDropdown.classList.toggle('open');
    const audioDropdown = document.getElementById('audioRetentionDropdown');
    const transDropdown = document.getElementById('transcriptionRetentionDropdown');
    if (audioDropdown) audioDropdown.classList.remove('open');
    if (transDropdown) transDropdown.classList.remove('open');
  });

  document.addEventListener('click', () => {
    micDropdown.classList.remove('open');
  });
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
      setupKeybinds();
      setupStartupSettings();
      setupStorageSettings();
      setupDataFolderSettings();
      setupModelsSettings();
      setupMicrophoneSettings();
    } else {
      settingsOverlay.style.display = 'none';
      setupWails();
    }
  }
}

window.addEventListener('DOMContentLoaded', init);
