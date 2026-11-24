import './style.css';
import { settingsOverlay, settingsModal } from './dom.js';
import { showToast } from './ui_utils.js';
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
  setupMicrophoneSettings,
  setupOnboarding,
  setupDictionary,
  setupManglishPersonalization,
  setupBilingualRouting,
  setupModelsSettings,
  setupPillStylePicker
} from './settings_handlers.js';
import { setupMeetingsTab } from './meetings_handler.js';

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
      let nextDelayMs = 15000;
      try {
        const state = await window.go.main.SettingsApp.GetUpdateStatus();
        if (state.status === 'available' || state.status === 'downloading') {
          notification.style.display = 'block';
          if (progressContainer) progressContainer.style.display = 'flex';
          btn.style.display = 'none';
          const pct = state.percent || 0;
          if (progressBar) progressBar.style.width = `${pct}%`;
          if (progressText) progressText.textContent = `Downloading... ${pct}%`;
          nextDelayMs = 1000;
        } else if (state.status === 'downloaded') {
          notification.style.display = 'block';
          if (progressContainer) progressContainer.style.display = 'none';
          btn.style.display = 'flex';
          return; // Terminal state until restart
        } else {
          notification.style.display = 'none';
        }
      } catch (err) {
        console.error('Failed to get update status:', err);
      }
      setTimeout(checkStatus, nextDelayMs);
    };

    checkStatus();
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
        showToast('Failed to launch update: ' + err, 'error');
      }
    }
  });
}

function setupTheme() {
  const dropdown = document.getElementById('themeDropdown');
  const label = document.getElementById('themeLabel');
  const items = dropdown?.querySelectorAll('.dropdown-item');
  if (!dropdown || !label || !items) return;

  const trigger = dropdown.querySelector('.dropdown-trigger');

  const savedTheme = localStorage.getItem('localflow_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  label.textContent = savedTheme === 'light' ? 'Light Mode' : 'Dark Mode';
  items.forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-value') === savedTheme);
  });

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
    document.querySelectorAll('.custom-dropdown').forEach(d => {
      if (d !== dropdown) d.classList.remove('open');
    });
  });

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

  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
  });
}

function setupKeyboardShortcuts(switchSection) {
  const sectionOrder = ['home', 'meetings', 'insights', 'dictionary', 'manglish', 'models', 'settings'];
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const meetingsActive = document.getElementById('sec-meetings')?.classList.contains('active');
      const targetInput = meetingsActive
        ? document.getElementById('meetingSearchInput')
        : document.getElementById('homeSearchInput');
      if (targetInput) {
        if (!meetingsActive && !document.getElementById('sec-home')?.classList.contains('active')) {
          switchSection('home');
        }
        setTimeout(() => targetInput.focus(), 30);
      }
      return;
    }

    if (e.key === '/' && !isTyping) {
      e.preventDefault();
      const meetingsActive = document.getElementById('sec-meetings')?.classList.contains('active');
      const targetInput = meetingsActive
        ? document.getElementById('meetingSearchInput')
        : document.getElementById('homeSearchInput');
      targetInput?.focus();
      return;
    }

    if (e.key === 'Escape') {
      document.querySelectorAll('.custom-dropdown.open').forEach(d => d.classList.remove('open'));
      document.querySelectorAll('.meeting-modal-overlay.active, .custom-modal-overlay.active').forEach(m => {
        m.classList.remove('active');
      });
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '7') {
      e.preventDefault();
      const idx = parseInt(e.key, 10) - 1;
      if (sectionOrder[idx]) switchSection(sectionOrder[idx]);
    }
  });
}

async function updateHeaderStatusPill() {
  const txt = document.getElementById('headerStatusText');
  if (!txt || !window.go?.main?.SettingsApp) return;
  try {
    const cfg = await window.go.main.SettingsApp.GetConfig();
    const model = (cfg.active_model || 'tiny.en').replace(/^ggml-/, '').replace(/\.(bin|gguf|onnx|cact)$/i, '');
    const engine = cfg.processing_engine === 'vulkan' ? 'Vulkan GPU' : 'CPU';
    txt.textContent = `${model} • ${engine}`;
  } catch (_) {}
}

export async function initSettingsApp() {
  setupTheme();
  setupWindowTitlebar();
  setupGlobalToggle();
  setupUpdater();

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
    } else if (target === 'meetings') {
      setupMeetingsTab();
    } else if (target === 'dictionary') {
      setupDictionary();
    } else if (target === 'manglish') {
      setupManglishPersonalization();
    } else if (target === 'models') {
      setupModelsSettings();
    }
  }

  navItems.forEach(item => item.addEventListener('click', () => switchSection(item.getAttribute('data-section'))));
  setupKeyboardShortcuts(switchSection);
  updateHeaderStatusPill();

  settingsOverlay.classList.add('active');
  const route = await window.go.main.SettingsApp.GetInitialRoute();
  switchSection(route || 'home');
  setupAmp();
  setupLLM();
  setupProcessingEngine();
  setupGPUSelector();
  setupKeybinds();
  setupStartupSettings();
  setupStorageSettings();
  setupDataFolderSettings();
  setupMicrophoneSettings();
  setupBilingualRouting();
  setupPillStylePicker();
  setupOnboarding();
}
