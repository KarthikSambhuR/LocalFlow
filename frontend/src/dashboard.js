import { state } from './state.js';
import { PLAY_SVG } from './constants.js';
import { playRecord } from './audio.js';

export function formatDurationUs(us) {
  if (!us || us <= 0) return '';
  if (us < 1000) {
    return `${us} µs`;
  } else if (us < 1000000) {
    return `${(us / 1000).toFixed(1)} ms`;
  } else {
    return `${(us / 1000000).toFixed(2)} s`;
  }
}

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function countWords(text = '') {
  const cleaned = text.trim();
  if (!cleaned || cleaned === '[BLANK_AUDIO]') return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

export function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

export function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatTooltipDate(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1]) - 1;
  const day = parseInt(parts[2]);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[monthIdx]} ${year}`;
}

export function computeStats(records = []) {
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

export async function loadDashboard(targetSection) {
  const records = await window.go.main.SettingsApp.GetRecordings();
  const safeRecords = records || [];
  const analytics = await window.go.main.SettingsApp.GetAnalytics();
  const safeAnalytics = analytics || [];
  const stats = computeStats(safeAnalytics);
  renderHome(safeRecords, stats);
  renderInsights(stats);
}

// Simple tokenization: words, spaces, punctuation
export function diffWords(raw, refined) {
  const tokenRegex = /[\w\u00c0-\u017f']+|[^\w\s\u00c0-\u017f']+|\s+/g;
  const A = raw.match(tokenRegex) || [];
  const B = refined.match(tokenRegex) || [];

  const N = A.length;
  const M = B.length;

  const dp = Array.from({ length: N + 1 }, () => new Int32Array(M + 1));

  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      if (A[i - 1] === B[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = N;
  let j = M;
  const result = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && A[i - 1] === B[j - 1]) {
      result.push({ type: 'equal', value: A[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'insert', value: B[j - 1] });
      j--;
    } else {
      result.push({ type: 'delete', value: A[i - 1] });
      i--;
    }
  }

  result.reverse();
  return result;
}

export function generateDiffHtml(raw, refined) {
  if (!raw && !refined) return '';
  if (!raw) return `<ins>${escapeHtml(refined)}</ins>`;
  if (!refined) return `<del>${escapeHtml(raw)}</del>`;

  const diffs = diffWords(raw, refined);
  let html = '';
  for (const chunk of diffs) {
    const esc = escapeHtml(chunk.value);
    if (chunk.type === 'equal') {
      html += esc;
    } else if (chunk.type === 'delete') {
      html += `<del>${esc}</del>`;
    } else if (chunk.type === 'insert') {
      html += `<ins>${esc}</ins>`;
    }
  }
  return html;
}

export function updateGlobalToggleUI(animate = true) {
  const toggleRaw = document.getElementById('globalToggleRaw');
  const toggleRef = document.getElementById('globalToggleRefined');
  const toggleDiff = document.getElementById('globalToggleDiff');
  const slider = document.getElementById('globalToggleSlider');
  const historyList = document.getElementById('historyList');

  if (!toggleRaw || !toggleRef || !toggleDiff || !slider || !historyList) return;

  if (!animate) {
    slider.style.transition = 'none';
  }
  
  const mode = state.globalViewMode || 'refined';
  
  // Toggle active state
  toggleRaw.classList.toggle('active', mode === 'raw');
  toggleRef.classList.toggle('active', mode === 'refined');
  toggleDiff.classList.toggle('active', mode === 'diff');
  
  // Position/size the slider pill
  let translateVal = 0;
  let activeWidth = toggleRaw.offsetWidth;

  if (mode === 'refined') {
    translateVal = toggleRaw.offsetWidth;
    activeWidth = toggleRef.offsetWidth;
  } else if (mode === 'diff') {
    translateVal = toggleRaw.offsetWidth + toggleRef.offsetWidth;
    activeWidth = toggleDiff.offsetWidth;
  }

  slider.style.transform = `translateX(${translateVal}px)`;
  slider.style.width = `${activeWidth}px`;

  if (!animate) {
    requestAnimationFrame(() => {
      slider.style.transition = '';
    });
  }

  // Toggle historyList view class
  historyList.classList.toggle('show-raw', mode === 'raw');
  historyList.classList.toggle('show-refined', mode === 'refined');
  historyList.classList.toggle('show-diff', mode === 'diff');
}

export function setupGlobalToggle() {
  const toggleRaw = document.getElementById('globalToggleRaw');
  const toggleRef = document.getElementById('globalToggleRefined');
  const toggleDiff = document.getElementById('globalToggleDiff');

  if (!toggleRaw || !toggleRef || !toggleDiff) return;

  // Handle click events
  toggleRaw.addEventListener('click', () => {
    state.globalViewMode = 'raw';
    localStorage.setItem('localflow_global_view_mode', 'raw');
    updateGlobalToggleUI();
  });

  toggleRef.addEventListener('click', () => {
    state.globalViewMode = 'refined';
    localStorage.setItem('localflow_global_view_mode', 'refined');
    updateGlobalToggleUI();
  });

  toggleDiff.addEventListener('click', () => {
    state.globalViewMode = 'diff';
    localStorage.setItem('localflow_global_view_mode', 'diff');
    updateGlobalToggleUI();
  });

  // Initial state setup (without animation)
  requestAnimationFrame(() => {
    updateGlobalToggleUI(false);
  });
  if (document.fonts) {
    document.fonts.ready.then(() => {
      updateGlobalToggleUI(false);
    });
  }
  setTimeout(() => {
    updateGlobalToggleUI(false);
  }, 100);
  setTimeout(() => {
    updateGlobalToggleUI(false);
  }, 300);
}

export function renderHome(records, stats) {
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

    const finalText = r.transcription     || '';
    const rawText   = r.raw_transcription || finalText;

    let displayFinal = escapeHtml(finalText);
    let displayRaw = escapeHtml(rawText);
    let displayDiff = generateDiffHtml(rawText, finalText);

    if (!displayFinal) {
      displayFinal = r.word_count > 0
        ? '<span style="opacity: 0.4; font-style: italic;">Transcription cleaned (expired)</span>'
        : '<span style="opacity: 0.4; font-style: italic;">No speech detected</span>';
    }
    if (!displayRaw) {
      displayRaw = r.word_count > 0
        ? '<span style="opacity: 0.4; font-style: italic;">Transcription cleaned (expired)</span>'
        : '<span style="opacity: 0.4; font-style: italic;">No speech detected</span>';
    }
    if (!displayDiff) {
      displayDiff = r.word_count > 0
        ? '<span style="opacity: 0.4; font-style: italic;">Transcription cleaned (expired)</span>'
        : '<span style="opacity: 0.4; font-style: italic;">No speech detected</span>';
    }
    row.innerHTML = `
      <div class="card-main-content">
        <div class="card-header-row">
          <span class="card-timestamp">${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          <div class="card-meta-badges">
            <span class="meta-item">${words} words</span>
            ${r.transcription && r.transcription_time_us > 0 ? `<span class="meta-item-sep">•</span><span class="meta-item">${formatDurationUs(r.transcription_time_us)}</span>` : ''}
          </div>
        </div>
        <div class="card-center">
          <div class="card-transcript">
            <span class="transcript-refined-text">${displayFinal}</span>
            <span class="transcript-raw-text" style="display: none;">${displayRaw}</span>
            <span class="transcript-diff-text" style="display: none;">${displayDiff}</span>
          </div>
        </div>
      </div>
      <div class="card-controls">
        <button class="control-btn-circle play-btn-circle" title="Play recording">${PLAY_SVG}</button>
        <button class="control-btn-circle copy-btn-circle" title="Copy transcript" style="${!r.transcription ? 'opacity: 0.3; pointer-events: none;' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
        <button class="control-btn-circle edit-btn-circle" title="Edit transcript"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
        <button class="control-btn-circle delete-btn-circle" title="Delete dictation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </div>
    `;

    const cardCenter = row.querySelector('.card-center');
    const cardControls = row.querySelector('.card-controls');
    const originalControlsHtml = cardControls.innerHTML;
    const originalTranscriptHtml = cardCenter.innerHTML;

    function wireControls() {
      const playBtn = row.querySelector('.play-btn-circle');
      if (playBtn) {
        playBtn.onclick = () => playRecord(`/audio/${r.filename}`, playBtn);
      }
      
      const copyBtn = row.querySelector('.copy-btn-circle');
      if (copyBtn && r.transcription) {
        copyBtn.onclick = (e) => {
          const textToCopy = state.globalViewMode === 'raw' ? rawText : finalText;
          window.runtime.ClipboardSetText(textToCopy);

          // Add checkmark visual feedback
          const btn = e.currentTarget;
          const originalSVG = btn.innerHTML;
          btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
          btn.style.borderColor = 'var(--accent)';
          setTimeout(() => {
            btn.innerHTML = originalSVG;
            btn.style.borderColor = '';
          }, 1500);
        };
      }

      const editBtn = row.querySelector('.edit-btn-circle');
      if (editBtn) {
        editBtn.onclick = () => {
          row.classList.add('editing');
          const textToEdit = r.transcription || r.raw_transcription || '';
          cardCenter.innerHTML = `
            <textarea class="brutal-textarea edit-transcript-textarea" style="width: 100%; min-height: 80px; resize: vertical; box-sizing: border-box; font-family: inherit; font-size: inherit; line-height: inherit; padding: 12px; border-radius: 8px;">${escapeHtml(textToEdit)}</textarea>
          `;
          const textarea = cardCenter.querySelector('.edit-transcript-textarea');
          textarea.focus();
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);

          cardControls.innerHTML = `
            <button class="kbd-btn save-btn" style="padding: 0 16px; height: 38px; border-radius: 9999px; font-weight: 700; background: var(--accent-soft); color: var(--accent); border-color: var(--accent); cursor: pointer;">Save</button>
            <button class="kbd-btn cancel-btn" style="padding: 0 16px; height: 38px; border-radius: 9999px; font-weight: 700; border-color: var(--border); cursor: pointer;">Cancel</button>
          `;

          cardControls.querySelector('.cancel-btn').onclick = () => {
            row.classList.remove('editing');
            cardCenter.innerHTML = originalTranscriptHtml;
            cardControls.innerHTML = originalControlsHtml;
            wireControls();
          };

          cardControls.querySelector('.save-btn').onclick = async () => {
            const newText = textarea.value.trim();
            try {
              await window.go.main.SettingsApp.UpdateRecording(r.id, newText);
              await loadDashboard();
            } catch (err) {
              console.error('Failed to update recording:', err);
              alert('Error saving transcript: ' + err);
            }
          };
        };
      }

      const deleteBtn = row.querySelector('.delete-btn-circle');
      if (deleteBtn) {
        deleteBtn.onclick = () => {
          showCustomConfirm({
            title: 'Delete Recording?',
            message: 'Are you sure you want to permanently delete this dictation? This will also remove the audio file.',
            confirmText: 'Delete',
            onConfirm: async () => {
              try {
                await window.go.main.SettingsApp.DeleteRecording(r.id);
                await loadDashboard();
              } catch (err) {
                console.error('Failed to delete recording:', err);
                alert('Error deleting recording: ' + err);
              }
            }
          });
        };
      }
    }

    wireControls();
    list.appendChild(row);
  });
;


  // Ensure current global toggle view classes are applied to list
  const mode = state.globalViewMode || 'refined';
  list.classList.toggle('show-raw', mode === 'raw');
  list.classList.toggle('show-refined', mode === 'refined');
  list.classList.toggle('show-diff', mode === 'diff');
}

export function renderHomeRail(stats) {
  return `
    <div class="home-stats-grid">
      <div class="home-stat-card">
        <div class="home-stat-header">
          <span class="home-stat-label">Total Words</span>
          <div class="home-stat-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </div>
        </div>
        <div class="home-stat-value">${formatNumber(stats.totalWords)}</div>
        <div class="home-stat-footer">Words dictated in total</div>
      </div>
      
      <div class="home-stat-card">
        <div class="home-stat-header">
          <span class="home-stat-label">Speaking Speed</span>
          <div class="home-stat-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
        </div>
        <div class="home-stat-value">${stats.wpm} <span style="font-size: 16px; font-weight: 700; color: var(--text-muted);">WPM</span></div>
        <div class="home-stat-footer">Average talking velocity</div>
      </div>
      
      <div class="home-stat-card">
        <div class="home-stat-header">
          <span class="home-stat-label">Day Streak</span>
          <div class="home-stat-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
          </div>
        </div>
        <div class="home-stat-value">${stats.streak} <span style="font-size: 16px; font-weight: 700; color: var(--text-muted);">${stats.streak === 1 ? 'Day' : 'Days'}</span></div>
        <div class="home-stat-footer">Consecutive active days</div>
      </div>
    </div>
  `;
}

export function renderInsights(stats) {
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
        <span>${state.selectedYear}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="dropdown-menu">
        ${sortedYears.map(yr => `<div class="dropdown-item ${yr === state.selectedYear ? 'active' : ''}" data-value="${yr}">${yr}</div>`).join('')}
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
        <div class="gauge" style="--score:${stats.wpm > 0 ? Math.min(100, Math.round((stats.wpm / 200) * 100)) : 0}">
          <div class="gauge-center">
            ${(() => {
              if (stats.wpm <= 0) return '<span>Rank</span><strong>—</strong>';
              let rank = 99;
              if (stats.wpm <= 80) {
                rank = Math.round(99 - (stats.wpm / 80) * 19);
              } else if (stats.wpm <= 140) {
                rank = Math.round(80 - ((stats.wpm - 80) / 60) * 40);
              } else if (stats.wpm <= 200) {
                rank = Math.round(40 - ((stats.wpm - 140) / 60) * 39);
              } else {
                rank = 1;
              }
              return `<span>Top</span><strong>${rank}%</strong>`;
            })()}
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
        ${renderStreakGrid(stats.byDay, state.selectedYear)}
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
        state.selectedYear = parseInt(item.getAttribute('data-value'));
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
    let tooltip = document.querySelector('.custom-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'custom-tooltip';
      document.body.appendChild(tooltip);
    }

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
        tooltip.style.left = `${e.clientX}px`;
        tooltip.style.top = `${e.clientY - 30}px`;
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

export function renderStreakGrid(byDay, year) {
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

export function showCustomConfirm({ title, message, confirmText, cancelText, onConfirm }) {
  const modal = document.getElementById('confirmModal');
  if (!modal) return;
  
  const h3 = modal.querySelector('h3');
  const p = modal.querySelector('p');
  const confirmBtn = modal.querySelector('#confirmModalConfirm');
  const cancelBtn = modal.querySelector('#confirmModalCancel');
  
  if (h3) h3.textContent = title;
  if (p) p.textContent = message;
  if (confirmBtn) {
    confirmBtn.textContent = confirmText || 'Confirm';
    confirmBtn.onclick = (e) => {
      e.stopPropagation();
      modal.classList.remove('active');
      if (onConfirm) onConfirm();
    };
  }
  if (cancelBtn) {
    cancelBtn.textContent = cancelText || 'Cancel';
    cancelBtn.onclick = (e) => {
      e.stopPropagation();
      modal.classList.remove('active');
    };
  }
  
  modal.classList.add('active');
}

