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
  setupOnboarding
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
  moduleNode.classList.remove('processing');
  moduleNode.classList.add('active');
  if (!state.rafId) animateBars();
}

function hideModule() {
  state.isActive = false;
  state.isProcessing = false;
  moduleNode.classList.remove('active', 'processing', 'refining');
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
  moduleNode.classList.remove('active', 'refining');
  moduleNode.classList.add('processing');
}

function showRefining() {
  state.isProcessing = true;
  resetBars();
  moduleNode.classList.remove('active');
  moduleNode.classList.add('processing', 'refining');
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
  }
}

navItems.forEach(item => item.addEventListener('click', () => switchSection(item.getAttribute('data-section'))));

function setupWails() {
  window.runtime.EventsOn('recording-state', (status) => {
    settingsOverlay.classList.remove('active');
    if (status === 'listening' || status === true) showModule();
    else if (status === 'refining') showRefining();
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

async function init() {
  setupTheme();

  if (window.runtime) {
    const isSettings = window.go && window.go.main && window.go.main.SettingsApp;
    if (isSettings) {
      setupWindowTitlebar();
      setupGlobalToggle();
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
      setupOnboarding();
    } else {
      settingsOverlay.style.display = 'none';
      setupWails();
    }
  }
}

window.addEventListener('DOMContentLoaded', init);
