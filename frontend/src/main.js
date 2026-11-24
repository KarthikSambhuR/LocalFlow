import './styles/dictation.css';
import { BAR_COUNT, LERP } from './constants.js';
import { state } from './state.js';
import { mountPillDom } from './pill_dom.js';

let moduleNode = null;

// ── Pill State & Animation ───────────────────────────────────────────────────
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

function setupWails() {
  window.runtime.EventsOn('recording-state', (status) => {
    if (status === 'listening' || status === 'initializing' || status === true) showModule();
    else if (status === 'refining') showRefining();
    else if (status === 'loading-model') showLoadingModel();
    else showProcessing();
  });
  window.runtime.EventsOn('recording-done', hideModule);
  window.runtime.EventsOn('volume-data', (vol) => {
    if (state.isActive && !state.isProcessing) setVolume(vol);
  });
}

async function init() {
  if (!window.runtime) return;
  const isSettings = Boolean(window.go?.main?.SettingsApp);
  if (isSettings) {
    const { initSettingsApp } = await import('./settings_entry.js');
    await initSettingsApp();
  } else {
    const pill = mountPillDom();
    moduleNode = pill.moduleNode;
    state.bars = pill.bars;
    setupWails();
  }
}

window.addEventListener('DOMContentLoaded', init);
