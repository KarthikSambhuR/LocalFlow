import { BAR_COUNT } from './constants.js';

export const state = {
  isActive: false,
  isProcessing: false,
  targets: new Float32Array(BAR_COUNT).fill(3),
  currents: new Float32Array(BAR_COUNT).fill(3),
  rafId: null,
  bars: [], // Holds the visualizer bar DOM elements
  selectedYear: new Date().getFullYear(),
  globalViewMode: localStorage.getItem('localflow_global_view_mode') || (localStorage.getItem('localflow_global_refined') === 'false' ? 'raw' : 'refined'),
  get globalShowingRefined() {
    return this.globalViewMode === 'refined';
  },
  set globalShowingRefined(val) {
    this.globalViewMode = val ? 'refined' : 'raw';
  },
  audioCtx: null,
  gainNode: null,
  currentAmp: 1.0,
  currentSource: null,
  currentPlayBtn: null
};
