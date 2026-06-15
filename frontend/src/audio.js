import { state } from './state.js';
import { PLAY_SVG, PAUSE_SVG } from './constants.js';

export function ensureAudioCtx() {
  if (!state.audioCtx) {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    state.gainNode = state.audioCtx.createGain();
    state.gainNode.connect(state.audioCtx.destination);
  }
  state.gainNode.gain.value = state.currentAmp;
}

export function stopCurrentTrack() {
  if (state.currentSource) {
    try { state.currentSource.stop(); } catch(e) {}
    state.currentSource.disconnect();
    state.currentSource = null;
  }
  if (state.currentPlayBtn) {
    state.currentPlayBtn.innerHTML = PLAY_SVG;
    state.currentPlayBtn = null;
  }
}

// Manual WAV decoder — works with both PCM16 (format 1) and float32 (format 3)
// Bypasses decodeAudioData which rejects non-standard WAV types in WebView2.
export function decodeWavBuffer(arrayBuffer) {
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

  const audioBuf = state.audioCtx.createBuffer(numChannels, numFrames, sampleRate);
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

export async function playRecord(url, playBtn) {
  ensureAudioCtx();

  // If same button pressed while playing → pause/stop
  if (state.currentPlayBtn === playBtn) {
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

    const source = state.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(state.gainNode);
    source.start(0);

    state.currentSource = source;
    state.currentPlayBtn = playBtn;
    playBtn.innerHTML = PAUSE_SVG + '<span>Pause</span>';

    source.onended = () => {
      if (state.currentSource === source) {
        state.currentSource = null;
        state.currentPlayBtn = null;
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
