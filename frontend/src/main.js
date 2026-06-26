import './style.css';
import { BAR_COUNT, LERP } from './constants.js';
import { state } from './state.js';
import {
  root,
  moduleNode,
  settingsOverlay,
  settingsModal,
  bars
} from './dom.js';
import {
  loadDashboard,
  setupGlobalToggle,
  updateGlobalToggleUI
} from './dashboard.js';
import {
  setupAmp,
  setupLLM,
  setupProcessingEngine,
  setupGPUSelector,
  setupKeybinds,
  setupStartupSettings,
  setupStorageSettings,
  setupDataFolderSettings,
  setupModelsSettings,
  setupMicrophoneSettings,
  setupOnboarding,
  setupDictionary,
  setupManglishPersonalization,
  setupBilingualRouting
} from './settings_handlers.js';

// Populate state visualizer bars from DOM module
state.bars = bars;

// ── State & Animation ────────────────────────────────────────────────────────
function resetBars() {
  state.targets.fill(3);
  state.currents.fill(3);
}

function animateBars() {
  for (let i = 0; i < BAR_COUNT; i++) {
    state.currents[i] += (state.targets[i] - state.currents[i]) * LERP;
    state.bars[i].style.height = `${state.currents[i]}px`;
  }
  state.rafId = requestAnimationFrame(animateBars);
}

function showModule() {
  state.isActive = true;
  state.isProcessing = false;
  moduleNode.classList.remove('processing', 'loading-model');
  moduleNode.classList.add('active');
  if (!state.rafId) animateBars();
}

function hideModule() {
  state.isActive = false;
  state.isProcessing = false;
  moduleNode.classList.remove('active', 'processing', 'refining', 'loading-model');
  resetBars();
  setTimeout(() => {
    if (!state.isActive && state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
  }, 600);
}

function showProcessing() {
  state.isProcessing = true;
  resetBars();
  moduleNode.classList.remove('active', 'refining', 'loading-model');
  moduleNode.classList.add('processing');
}

function showRefining() {
  state.isProcessing = true;
  resetBars();
  moduleNode.classList.remove('active', 'loading-model');
  moduleNode.classList.add('processing', 'refining');
}

function showLoadingModel() {
  state.isActive = true;
  state.isProcessing = false;
  moduleNode.classList.remove('processing', 'refining');
  moduleNode.classList.add('active', 'loading-model');
  if (!state.rafId) animateBars();
}

function setVolume(vol) {
  const scaled = Math.min(vol * 9.0, 22);
  const mid = (BAR_COUNT - 1) / 2;
  for (let i = 0; i < BAR_COUNT; i++) {
    const dist = Math.abs(i - mid) / mid;
    const weight = Math.exp(-2.5 * dist * dist);
    state.targets[i] = Math.max(4, Math.min(22, scaled * weight + (Math.random() - 0.5) * 2));
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
  if (target === 'home' || target === 'insights') {
    loadDashboard(target);
    if (target === 'home') {
      requestAnimationFrame(() => updateGlobalToggleUI(false));
    }
  } else if (target === 'dictionary') {
    setupDictionary();
  } else if (target === 'manglish') {
    setupManglishPersonalization();
  }
}

navItems.forEach(item => item.addEventListener('click', () => switchSection(item.getAttribute('data-section'))));

function setupWails() {
  window.runtime.EventsOn('recording-state', (status) => {
    settingsOverlay.classList.remove('active');
    if (status === 'listening' || status === true) showModule();
    else if (status === 'refining') showRefining();
    else if (status === 'loading-model') showLoadingModel();
    else showProcessing();
  });
  window.runtime.EventsOn('recording-done', hideModule);
  window.runtime.EventsOn('volume-data', (vol) => {
    if (state.isActive && !state.isProcessing) setVolume(vol);
  });
}

function setupTheme() {
  const dropdown = document.getElementById('themeDropdown');
  const label = document.getElementById('themeLabel');
  const items = dropdown?.querySelectorAll('.dropdown-item');
  if (!dropdown || !label || !items) return;

  const trigger = dropdown.querySelector('.dropdown-trigger');

  // Load saved theme
  const savedTheme = localStorage.getItem('localflow_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  // Set initial UI state
  label.textContent = savedTheme === 'light' ? 'Light Mode' : 'Dark Mode';
  items.forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-value') === savedTheme);
  });

  // Toggle dropdown menu
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
    // Close other dropdowns
    document.querySelectorAll('.custom-dropdown').forEach(d => {
      if (d !== dropdown) d.classList.remove('open');
    });
  });

  // Handle item click
  items.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = item.getAttribute('data-value');
      localStorage.setItem('localflow_theme', val);
      document.documentElement.setAttribute('data-theme', val);
      label.textContent = val === 'light' ? 'Light Mode' : 'Dark Mode';
      items.forEach(i => i.classList.toggle('active', i === item));
      dropdown.classList.remove('open');
    });
  });

  // Close dropdown on click outside
  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
  });
}

function setupWindowTitlebar() {
  const titlebar = document.getElementById('windowTitlebar');
  const minimizeBtn = document.getElementById('windowMinimizeBtn');
  const maximizeBtn = document.getElementById('windowMaximizeBtn');
  const closeBtn = document.getElementById('windowCloseBtn');
  if (!titlebar || !window.runtime) return;

  minimizeBtn?.addEventListener('click', () => window.runtime.WindowMinimise());
  maximizeBtn?.addEventListener('click', () => window.runtime.WindowToggleMaximise());
  closeBtn?.addEventListener('click', () => window.runtime.Quit());

  titlebar.addEventListener('dblclick', (event) => {
    if (event.target.closest('.titlebar-controls')) return;
    window.runtime.WindowToggleMaximise();
  });
}

function setupUpdater() {
  const notification = document.getElementById('updateNotification');
  const btn = document.getElementById('restartUpdateBtn');
  const label = document.getElementById('appVersionLabel');
  if (!notification || !btn) return;

  if (window.go?.main?.SettingsApp) {
    window.go.main.SettingsApp.GetVersion().then(v => {
      const formattedVer = v.startsWith('v') ? v : `v${v}`;
      if (label) label.textContent = `LocalFlow ${formattedVer}`;
    }).catch(err => console.error('Failed to get version:', err));

    const progressContainer = document.getElementById('updateProgressContainer');
    const progressBar = document.getElementById('updateProgressBar');
    const progressText = document.getElementById('updateProgressText');

    const checkStatus = async () => {
      try {
        const state = await window.go.main.SettingsApp.GetUpdateStatus();
        if (state.status === 'available' || state.status === 'downloading') {
          notification.style.display = 'block';
          if (progressContainer) progressContainer.style.display = 'flex';
          btn.style.display = 'none';
          const pct = state.percent || 0;
          if (progressBar) progressBar.style.width = `${pct}%`;
          if (progressText) progressText.textContent = `Downloading... ${pct}%`;
        } else if (state.status === 'downloaded') {
          notification.style.display = 'block';
          if (progressContainer) progressContainer.style.display = 'none';
          btn.style.display = 'flex';
        } else {
          notification.style.display = 'none';
        }
      } catch (err) {
        console.error('Failed to get update status:', err);
      }
    };

    // Run check status immediately, then every 1 second
    checkStatus();
    setInterval(checkStatus, 1000);
  }

  btn.addEventListener('click', async () => {
    if (window.go?.main?.SettingsApp) {
      btn.disabled = true;
      btn.textContent = 'Updating...';
      try {
        await window.go.main.SettingsApp.InstallUpdateAndRestart();
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Restart to Update`;
        console.error('Update failed:', err);
        alert('Failed to launch update: ' + err);
      }
    }
  });
}

async function init() {
  setupTheme();

  if (window.runtime) {
    const isSettings = window.go && window.go.main && window.go.main.SettingsApp;
    if (isSettings) {
      setupWindowTitlebar();
      setupGlobalToggle();
      setupUpdater();
      moduleNode.style.display = 'none';
      settingsOverlay.classList.add('active');
      const route = await window.go.main.SettingsApp.GetInitialRoute();
      switchSection(route || 'home');
      setupAmp(); // load config values into the settings UI
      setupLLM();
      setupProcessingEngine();
      setupGPUSelector();
      setupKeybinds();
      setupStartupSettings();
      setupStorageSettings();
      setupDataFolderSettings();
      setupModelsSettings();
      setupMicrophoneSettings();
      setupBilingualRouting();
      setupOnboarding();
      setupDictionary();
      setupManglishPersonalization();
    } else {
      settingsOverlay.style.display = 'none';
      setupWails();
    }
  }
}

window.addEventListener('DOMContentLoaded', init);
