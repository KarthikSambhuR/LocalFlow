import { BAR_COUNT } from './constants.js';

export const SPECTRUM_COUNT = 23;

export function mountPillDom() {
  const root = document.getElementById('root');

  const moduleNode = document.createElement('div');
  moduleNode.className = 'module style-bars';
  moduleNode.id = 'module';

  const ring = document.createElement('div');
  ring.className = 'processing-ring';
  moduleNode.appendChild(ring);

  // 1. Classic 9-bar visualizer
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

  // 2. Dense fine-line spectrum visualizer (23 thin bars)
  const spectrumViz = document.createElement('div');
  spectrumViz.className = 'spectrum-visualizer';
  const spectrumBars = [];
  for (let i = 0; i < SPECTRUM_COUNT; i++) {
    const bar = document.createElement('div');
    bar.className = 'spectrum-bar';
    spectrumViz.appendChild(bar);
    spectrumBars.push(bar);
  }
  moduleNode.appendChild(spectrumViz);

  // 3. Smooth sine-wave SVG visualizer
  const waveWrap = document.createElement('div');
  waveWrap.className = 'wave-visualizer';
  waveWrap.innerHTML = `
    <svg viewBox="0 0 80 28" width="80" height="28" fill="none">
      <path class="wave-path" d="M 2 14 Q 40 14 78 14" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  const wavePath = waveWrap.querySelector('.wave-path');
  moduleNode.appendChild(waveWrap);

  // 4. Circular audio bubble visualizer (with breathing processing state)
  const bubbleViz = document.createElement('div');
  bubbleViz.className = 'bubble-visualizer';
  bubbleViz.innerHTML = `
    <div class="bubble-ring"></div>
    <div class="bubble-core"></div>
  `;
  const bubbleCore = bubbleViz.querySelector('.bubble-core');
  const bubbleRing = bubbleViz.querySelector('.bubble-ring');
  moduleNode.appendChild(bubbleViz);

  root.appendChild(moduleNode);

  return { moduleNode, bars, spectrumBars, wavePath, bubbleCore, bubbleRing };
}
