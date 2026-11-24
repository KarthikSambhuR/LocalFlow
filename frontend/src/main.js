import './styles/dictation.css';
import { BAR_COUNT, LERP } from './constants.js';
import { state } from './state.js';
import { mountPillDom, SPECTRUM_COUNT } from './pill_dom.js';

let moduleNode = null;
let spectrumBars = [];
let wavePath = null;
let bubbleCore = null;
let bubbleRing = null;

let currentPillStyle = 'bars';
const spectrumTargets = new Array(SPECTRUM_COUNT).fill(3);
const spectrumCurrents = new Array(SPECTRUM_COUNT).fill(3);
let waveTargetAmp = 1.5;
let waveCurrentAmp = 1.5;
let wavePhase = 0;
let bubbleTargetScale = 1.0;
let bubbleCurrentScale = 1.0;

function applyPillStyle(style) {
  const valid = ['bars', 'spectrum', 'wave', 'bubble'];
  currentPillStyle = valid.includes(style) ? style : 'bars';
  if (!moduleNode) return;
  moduleNode.classList.remove('style-bars', 'style-spectrum', 'style-wave', 'style-bubble');
  moduleNode.classList.add(`style-${currentPillStyle}`);
}

// ── Pill State & Animation ───────────────────────────────────────────────────
function resetVisuals() {
  state.targets.fill(3);
  state.currents.fill(3);
  spectrumTargets.fill(3);
  spectrumCurrents.fill(3);
  waveTargetAmp = 1.5;
  waveCurrentAmp = 1.5;
  bubbleTargetScale = 1.0;
  bubbleCurrentScale = 1.0;
}

function buildWavePath(amp, phase) {
  const w = 76;
  const startX = 2;
  const midY = 14;
  const steps = 28;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = startX + t * w;
    // Hann window envelope tapers ends smoothly to zero
    const env = Math.sin(Math.PI * t);
    const y = midY + Math.sin(t * Math.PI * 4.5 + phase) * amp * env;
    d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

function animateFrame() {
  if (currentPillStyle === 'bars') {
    for (let i = 0; i < BAR_COUNT; i++) {
      state.currents[i] += (state.targets[i] - state.currents[i]) * LERP;
      state.bars[i].style.height = `${state.currents[i]}px`;
    }
  } else if (currentPillStyle === 'spectrum') {
    for (let i = 0; i < SPECTRUM_COUNT; i++) {
      spectrumCurrents[i] += (spectrumTargets[i] - spectrumCurrents[i]) * 0.38;
      spectrumBars[i].style.height = `${spectrumCurrents[i]}px`;
    }
  } else if (currentPillStyle === 'wave') {
    waveCurrentAmp += (waveTargetAmp - waveCurrentAmp) * 0.28;
    wavePhase += 0.16;
    if (wavePath) {
      wavePath.setAttribute('d', buildWavePath(waveCurrentAmp, wavePhase));
    }
  } else if (currentPillStyle === 'bubble') {
    bubbleCurrentScale += (bubbleTargetScale - bubbleCurrentScale) * 0.25;
    if (bubbleCore && bubbleRing && !state.isProcessing) {
      bubbleCore.style.transform = `scale(${bubbleCurrentScale.toFixed(3)})`;
      const ringScale = 1 + (bubbleCurrentScale - 1) * 1.45;
      bubbleRing.style.transform = `scale(${ringScale.toFixed(3)})`;
      bubbleRing.style.opacity = `${Math.min(0.65, 0.18 + (bubbleCurrentScale - 1) * 0.65).toFixed(2)}`;
    }
  }

  state.rafId = requestAnimationFrame(animateFrame);
}

function showModule() {
  state.isActive = true;
  state.isProcessing = false;
  moduleNode.classList.remove('processing', 'refining', 'loading-model');
  moduleNode.classList.add('active');
  if (!state.rafId) animateFrame();
}

function hideModule() {
  state.isActive = false;
  state.isProcessing = false;
  moduleNode.classList.remove('active', 'processing', 'refining', 'loading-model');
  resetVisuals();
  if (bubbleCore) bubbleCore.style.transform = '';
  if (bubbleRing) {
    bubbleRing.style.transform = '';
    bubbleRing.style.opacity = '';
  }
  setTimeout(() => {
    if (!state.isActive && state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
  }, 600);
}

function showProcessing() {
  state.isProcessing = true;
  resetVisuals();
  if (bubbleCore) bubbleCore.style.transform = '';
  if (bubbleRing) {
    bubbleRing.style.transform = '';
    bubbleRing.style.opacity = '';
  }
  moduleNode.classList.remove('active', 'refining', 'loading-model');
  moduleNode.classList.add('processing');
}

function showRefining() {
  state.isProcessing = true;
  resetVisuals();
  moduleNode.classList.remove('active', 'loading-model');
  moduleNode.classList.add('processing', 'refining');
}

function showLoadingModel() {
  state.isActive = true;
  state.isProcessing = false;
  moduleNode.classList.remove('processing', 'refining');
  moduleNode.classList.add('active', 'loading-model');
  if (!state.rafId) animateFrame();
}

function setVolume(vol) {
  const norm = Math.min(1, Math.max(0, vol / 2.4));

  // Classic 9-bar targets
  const scaled = Math.min(vol * 9.0, 22);
  const mid = (BAR_COUNT - 1) / 2;
  for (let i = 0; i < BAR_COUNT; i++) {
    const dist = Math.abs(i - mid) / mid;
    const weight = Math.exp(-2.5 * dist * dist);
    state.targets[i] = Math.max(4, Math.min(22, scaled * weight + (Math.random() - 0.5) * 2));
  }

  // Fine-line 23-bar spectrum targets (symmetric tapered envelope + multi-peak variation)
  const specMid = (SPECTRUM_COUNT - 1) / 2;
  for (let i = 0; i < SPECTRUM_COUNT; i++) {
    const dist = Math.abs(i - specMid) / specMid;
    const env = Math.exp(-2.8 * dist * dist);
    const harmonic = 0.55 + 0.45 * Math.abs(Math.sin(i * 0.85 + performance.now() * 0.008));
    spectrumTargets[i] = Math.max(3, Math.min(25, 3 + norm * 22 * env * harmonic + Math.random() * 2.5 * env));
  }

  // Smooth sine wave amplitude
  waveTargetAmp = Math.max(1.5, Math.min(11.5, 1.5 + norm * 10.5));

  // Audio bubble scale
  bubbleTargetScale = 0.92 + norm * 0.65;
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
  window.runtime.EventsOn('pill-style', (style) => {
    applyPillStyle(style);
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
    spectrumBars = pill.spectrumBars;
    wavePath = pill.wavePath;
    bubbleCore = pill.bubbleCore;
    bubbleRing = pill.bubbleRing;

    if (window.go?.main?.App?.GetPillStyle) {
      try {
        const saved = await window.go.main.App.GetPillStyle();
        applyPillStyle(saved);
      } catch (_) {}
    }
    setupWails();
  }
}

window.addEventListener('DOMContentLoaded', init);
