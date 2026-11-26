import './styles/dictation.css';
import { MODE_FRAMES, finalizeFrame, paintFrame, resolvePreset } from 'thinking-orbs/engine';
import { BAR_COUNT, LERP } from './constants.js';
import { state } from './state.js';
import { mountPillDom, SPECTRUM_COUNT } from './pill_dom.js';

const ORB_DRAW_SIZE = 48;
const PROCESSING_ORB_SIZE = 28;
const ORB_MORPH_DURATION = 0.8;
const ORB_PRESETS = {
  composing: resolvePreset('composing', 32),
  solving: resolvePreset('solving', 32),
  breathing: resolvePreset('breathing', 20),
};
const ORB_TINTS = {
  orange: { r: 249, g: 115, b: 22 },
  loading: { r: 245, g: 166, b: 35 },
};

let moduleNode = null;
let spectrumBars = [];
let wavePath = null;
let bubbleCanvas = null;
let processingOrbCanvas = null;
let previewPill = null;
let previewText = null;

let currentPillStyle = 'bars';
const spectrumTargets = new Array(SPECTRUM_COUNT).fill(3);
const spectrumCurrents = new Array(SPECTRUM_COUNT).fill(3);
let waveTargetAmp = 1.5;
let waveCurrentAmp = 1.5;
let wavePhase = 0;
let bubbleTargetAmp = 0.8;
let bubbleCurrentAmp = 0.8;
let orbTime = 0;
let lastOrbTs = 0;
let orbMorph = 0;
let pendingHide = false;
let hideDoneTimer = null;

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
  bubbleTargetAmp = 0.8;
  bubbleCurrentAmp = 0.8;
  orbTime = 0;
  lastOrbTs = 0;
  orbMorph = 0;
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

function isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

function syncPillTheme() {
  const theme = localStorage.getItem('localflow_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}

function lerpVal(a, b, t) {
  return a + (b - a) * t;
}

function easeInOutQuart(t) {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}

function lerpTint(a, b, t) {
  return {
    r: Math.round(lerpVal(a.r, b.r, t)),
    g: Math.round(lerpVal(a.g, b.g, t)),
    b: Math.round(lerpVal(a.b, b.b, t)),
  };
}

function sortDotsByAngle(dots, cx, cy) {
  return [...dots].sort((a, b) => {
    const angA = Math.atan2(a.y - cy, a.x - cx);
    const angB = Math.atan2(b.y - cy, b.x - cx);
    if (angA !== angB) return angA - angB;
    return Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy);
  });
}

function morphOrbFrames(frameA, frameB, t, drawSize) {
  const cx = drawSize / 2;
  const cy = drawSize / 2;
  const dotsA = sortDotsByAngle(frameA.dots, cx, cy);
  const dotsB = sortDotsByAngle(frameB.dots, cx, cy);
  const lenA = dotsA.length;
  const lenB = dotsB.length;
  if (!lenA) return frameB;
  if (!lenB) return frameA;

  const bell = Math.sin(Math.PI * t);
  const swirl = bell * 0.42;
  const cosS = Math.cos(swirl);
  const sinS = Math.sin(swirl);
  const scale = 1 + bell * 0.08;

  const morphed = [];
  if (lenA >= lenB) {
    for (let i = 0; i < lenA; i++) {
      const j = Math.min(lenB - 1, Math.floor((i * lenB) / lenA));
      const isPrimary = i === 0 || Math.floor(((i - 1) * lenB) / lenA) !== j;
      const dA = dotsA[i];
      const dB = dotsB[j];
      const alphaA = dA.a ?? 1;
      const alphaB = isPrimary ? (dB.a ?? 1) : 0;
      const rTarget = isPrimary ? dB.r : dB.r * 0.4;
      const dx = lerpVal(dA.x, dB.x, t) - cx;
      const dy = lerpVal(dA.y, dB.y, t) - cy;
      morphed.push({
        x: cx + (dx * cosS - dy * sinS) * scale,
        y: cy + (dx * sinS + dy * cosS) * scale,
        z: lerpVal(dA.z, dB.z, t),
        r: lerpVal(dA.r, rTarget, t),
        white: lerpVal(dA.white, dB.white, t),
        a: lerpVal(alphaA, alphaB, t),
      });
    }
  } else {
    for (let j = 0; j < lenB; j++) {
      const i = Math.min(lenA - 1, Math.floor((j * lenA) / lenB));
      const isPrimary = j === 0 || Math.floor(((j - 1) * lenA) / lenB) !== i;
      const dA = dotsA[i];
      const dB = dotsB[j];
      const alphaA = isPrimary ? (dA.a ?? 1) : 0;
      const alphaB = dB.a ?? 1;
      const rStart = isPrimary ? dA.r : dA.r * 0.4;
      const dx = lerpVal(dA.x, dB.x, t) - cx;
      const dy = lerpVal(dA.y, dB.y, t) - cy;
      morphed.push({
        x: cx + (dx * cosS - dy * sinS) * scale,
        y: cy + (dx * sinS + dy * cosS) * scale,
        z: lerpVal(dA.z, dB.z, t),
        r: lerpVal(rStart, dB.r, t),
        white: lerpVal(dA.white, dB.white, t),
        a: lerpVal(alphaA, alphaB, t),
      });
    }
  }
  return finalizeFrame(morphed, []);
}

function paintOrbCanvas(canvas, drawSize, frame, tint) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const targetPx = Math.round(drawSize * dpr);
  if (canvas.width !== targetPx || canvas.height !== targetPx) {
    canvas.width = targetPx;
    canvas.height = targetPx;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, drawSize, drawSize);
  paintFrame(ctx, frame, !isLightTheme(), tint);
}

function renderOrbFrame(canvas, drawSize, mode, opts, tSec, tint) {
  const frame = MODE_FRAMES[mode](drawSize, tSec, opts);
  paintOrbCanvas(canvas, drawSize, frame, tint);
}

function animateFrame() {
  if (currentPillStyle !== 'bubble' && state.isProcessing && processingOrbCanvas) {
    const preset = ORB_PRESETS.breathing;
    const tSec = (performance.now() / 1000) * preset.speed;
    renderOrbFrame(processingOrbCanvas, PROCESSING_ORB_SIZE, preset.mode, preset.opts, tSec, ORB_TINTS.orange);
  } else if (currentPillStyle === 'bars') {
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
  } else if (currentPillStyle === 'bubble' && bubbleCanvas) {
    const now = performance.now();
    const dt = lastOrbTs ? Math.min(0.05, (now - lastOrbTs) / 1000) : 0.016;
    lastOrbTs = now;

    const morphTarget = state.isProcessing ? 1 : 0;
    const morphStep = dt / ORB_MORPH_DURATION;
    if (orbMorph < morphTarget) {
      orbMorph = Math.min(morphTarget, orbMorph + morphStep);
    } else if (orbMorph > morphTarget) {
      orbMorph = Math.max(morphTarget, orbMorph - morphStep);
    }
    const t = easeInOutQuart(orbMorph);

    const targetAmp = state.isProcessing ? 0.8 : bubbleTargetAmp;
    bubbleCurrentAmp += (targetAmp - bubbleCurrentAmp) * 0.36;
    const rawNorm = Math.min(1, Math.max(0, (bubbleCurrentAmp - 0.8) / 4.2));
    const voiceNorm = Math.min(1, Math.pow(rawNorm * 1.4, 0.72));
    const speedMul = 1.0 + voiceNorm * 1.5 * (1 - t);
    orbTime += dt * speedMul;

    const composingPreset = ORB_PRESETS.composing;
    const solvingPreset = ORB_PRESETS.solving;
    const composingOpts = {
      ...composingPreset.opts,
      wobMul: (composingPreset.opts.wobMul ?? 0.4751) * (0.9 + voiceNorm * 8.5),
    };

    const isLoading = moduleNode.classList.contains('loading-model');
    const baseTint = isLoading
      ? ORB_TINTS.loading
      : isLightTheme()
        ? { r: 0, g: 0, b: 0 }
        : { r: 255, g: 255, b: 255 };

    let tint;
    if (t <= 0) {
      tint = isLoading ? ORB_TINTS.loading : undefined;
    } else if (t >= 1) {
      tint = ORB_TINTS.orange;
    } else {
      tint = lerpTint(baseTint, ORB_TINTS.orange, t);
    }

    if (t <= 0) {
      renderOrbFrame(
        bubbleCanvas,
        ORB_DRAW_SIZE,
        composingPreset.mode,
        composingOpts,
        orbTime * composingPreset.speed,
        tint
      );
    } else if (t >= 1) {
      renderOrbFrame(
        bubbleCanvas,
        ORB_DRAW_SIZE,
        solvingPreset.mode,
        solvingPreset.opts,
        orbTime * solvingPreset.speed,
        tint
      );
    } else {
      const frameA = MODE_FRAMES[composingPreset.mode](
        ORB_DRAW_SIZE,
        orbTime * composingPreset.speed,
        composingOpts
      );
      const frameB = MODE_FRAMES[solvingPreset.mode](
        ORB_DRAW_SIZE,
        orbTime * solvingPreset.speed,
        solvingPreset.opts
      );
      const morphed = morphOrbFrames(frameA, frameB, t, ORB_DRAW_SIZE);
      paintOrbCanvas(bubbleCanvas, ORB_DRAW_SIZE, morphed, tint);
    }
    bubbleCanvas.setAttribute('aria-label', state.isProcessing ? 'Solving…' : 'Composing…');

    if (pendingHide && orbMorph >= 1) {
      pendingHide = false;
      hideDoneTimer = setTimeout(performHide, 120);
    }
  }

  state.rafId = requestAnimationFrame(animateFrame);
}

function clearHideTimers() {
  pendingHide = false;
  if (hideDoneTimer) {
    clearTimeout(hideDoneTimer);
    hideDoneTimer = null;
  }
}

function clearLivePreview() {
  if (previewPill) previewPill.classList.remove('visible');
  if (previewText) previewText.textContent = '';
}

function showModule() {
  clearHideTimers();
  clearLivePreview();
  state.isActive = true;
  state.isProcessing = false;
  moduleNode.classList.remove('processing', 'refining', 'loading-model');
  // Force a layout commit from the resting off-screen position so the slide-up
  // entrance always animates smoothly even right after the window is shown.
  void moduleNode.offsetWidth;
  requestAnimationFrame(() => {
    if (state.isActive || state.isProcessing) {
      moduleNode.classList.add('active');
    }
  });
  if (!state.rafId) animateFrame();
}

function performHide() {
  clearHideTimers();
  clearLivePreview();
  state.isActive = false;
  state.isProcessing = false;
  moduleNode.classList.remove('active', 'processing', 'refining', 'loading-model');
  resetVisuals();
  setTimeout(() => {
    if (!state.isActive && !pendingHide) {
      if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }
      if (window.runtime?.EventsEmit) {
        window.runtime.EventsEmit('pill-hidden');
      }
    }
  }, 500);
}

function hideModule() {
  if (currentPillStyle === 'bubble' && state.isProcessing && orbMorph < 1) {
    pendingHide = true;
    return;
  }
  performHide();
}

function resetTargets() {
  state.targets.fill(3);
  spectrumTargets.fill(3);
  waveTargetAmp = 1.5;
  bubbleTargetAmp = 0.8;
}

function showProcessing() {
  clearHideTimers();
  state.isProcessing = true;
  resetTargets();
  moduleNode.classList.remove('active', 'refining', 'loading-model');
  moduleNode.classList.add('processing');
}

function showRefining() {
  clearHideTimers();
  state.isProcessing = true;
  resetTargets();
  moduleNode.classList.remove('active', 'loading-model');
  moduleNode.classList.add('processing', 'refining');
}

function showLoadingModel() {
  clearHideTimers();
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

  // Organic bubble wobble amplitude
  bubbleTargetAmp = 0.8 + norm * 4.2;
}

function setupWails() {
  window.runtime.EventsOn('recording-state', (status) => {
    syncPillTheme();
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
  window.runtime.EventsOn('live-preview', (text) => {
    if (!previewPill || !previewText) return;
    const clean = (text || '').trim();
    if (!clean) {
      clearLivePreview();
      return;
    }
    previewText.textContent = clean;
    previewPill.classList.add('visible');
    previewText.scrollLeft = previewText.scrollWidth;
  });
}

async function init() {
  if (!window.runtime) return;
  const isSettings = Boolean(window.go?.main?.SettingsApp);
  if (isSettings) {
    const { initSettingsApp } = await import('./settings_entry.js');
    await initSettingsApp();
  } else {
    syncPillTheme();
    window.addEventListener('storage', (e) => {
      if (e.key === 'localflow_theme') syncPillTheme();
    });
    const pill = mountPillDom();
    moduleNode = pill.moduleNode;
    state.bars = pill.bars;
    spectrumBars = pill.spectrumBars;
    wavePath = pill.wavePath;
    bubbleCanvas = pill.bubbleCanvas;
    processingOrbCanvas = pill.processingOrb;
    previewPill = pill.previewPill;
    previewText = pill.previewText;

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
