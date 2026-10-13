import { showCustomConfirm } from './dashboard.js';
import { renderFullMarkdown } from './markdown_parser.js';

let meetingTimerInterval = null;
let meetingElapsedSeconds = 0;
let activeMeetingID = null;
let meetingTabInitialized = false; // Guard: prevents double event-listener registration

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export async function setupMeetingsTab() {
  const startBtn = document.getElementById('startMeetingBtn');
  const stopBtn = document.getElementById('stopMeetingBtn');
  const titleInput = document.getElementById('meetingTitleInput');
  const timerLabel = document.getElementById('meetingTimer');
  const statusBadge = document.getElementById('meetingStatusBadge');
  const levelsBar = document.getElementById('meetingLevelsBar');
  const micMeter = document.getElementById('meetingMicMeter');
  const sysMeter = document.getElementById('meetingSysMeter');
  const dialogueList = document.getElementById('meetingDialogueList');
  const emptyState = document.getElementById('meetingEmptyState');
  const speakerBadge = document.getElementById('meetingSpeakerCount');
  const summaryContent = document.getElementById('meetingSummaryContent');
  const copySummaryBtn = document.getElementById('copyMeetingSummaryBtn');
  const regenSummaryBtn = document.getElementById('regenSummaryBtn');
  const pastList = document.getElementById('pastMeetingsList');
  const pastCount = document.getElementById('pastMeetingsCount');

  // Subnav View Tabs
  const tabDialogue = document.getElementById('meetingTabDialogue');
  const tabSummary = document.getElementById('meetingTabSummary');
  const tabHistory = document.getElementById('meetingTabHistory');
  const paneDialogue = document.getElementById('meetingPaneDialogue');
  const paneSummary = document.getElementById('meetingPaneSummary');
  const paneHistory = document.getElementById('meetingPaneHistory');
  const slider = document.getElementById('meetingToggleSlider');

  if (!startBtn) return;

  const speakersSet = new Set();

  const updateSlider = (activeBtn) => {
    if (!slider || !activeBtn) return;
    slider.style.width = `${activeBtn.offsetWidth}px`;
    slider.style.left = `${activeBtn.offsetLeft}px`;
  };

  const switchMeetingView = (view) => {
    [tabDialogue, tabSummary, tabHistory].forEach(t => {
      const isTarget = t.getAttribute('data-view') === view;
      t.classList.toggle('active', isTarget);
      if (isTarget) updateSlider(t);
    });

    paneDialogue.classList.toggle('active', view === 'dialogue');
    paneSummary.classList.toggle('active', view === 'summary');
    paneHistory.classList.toggle('active', view === 'history');

    if (view === 'history') {
      loadPastMeetings();
    }
  };

  tabDialogue.onclick = () => switchMeetingView('dialogue');
  tabSummary.onclick = () => switchMeetingView('summary');
  tabHistory.onclick = () => switchMeetingView('history');

  requestAnimationFrame(() => updateSlider(tabDialogue));

  // ── Meeting-Specific Model & Bilingual Routing Controls ──
  const meetingModelSelect = document.getElementById('meetingModelSelect');
  const meetingLLMSelect = document.getElementById('meetingLLMSelect');
  const meetingBilingualToggle = document.getElementById('meetingBilingualToggle');
  const meetingBilingualLabel = document.getElementById('meetingBilingualLabel');

  if (meetingModelSelect && window.go?.main?.SettingsApp?.GetConfig) {
    try {
      const cfg = await window.go.main.SettingsApp.GetConfig();
      if (cfg.meeting_model) {
        meetingModelSelect.value = cfg.meeting_model;
      }
      
      // Populate Meeting LLM Select
      if (meetingLLMSelect && window.go.main.SettingsApp.GetModelsList) {
        const allModels = await window.go.main.SettingsApp.GetModelsList() || [];
        const llmModels = allModels.filter(m => m.type === 'llm' && m.is_downloaded);
        let optionsHtml = `<option value="">Use Global Dictation Model</option>`;
        llmModels.forEach(m => {
          const isSelected = cfg.meeting_llm_model === m.id ? 'selected' : '';
          optionsHtml += `<option value="${m.id}" ${isSelected}>${m.name}</option>`;
        });
        meetingLLMSelect.innerHTML = optionsHtml;

        meetingLLMSelect.onchange = async () => {
          try {
            await window.go.main.SettingsApp.SetMeetingLLMModel(meetingLLMSelect.value);
          } catch (err) {
            console.error('Failed to save meeting LLM model:', err);
          }
        };
      }

      const isBilingual = !!cfg.meeting_bilingual;
      if (meetingBilingualToggle) {
        meetingBilingualToggle.classList.toggle('active', isBilingual);
        if (meetingBilingualLabel) {
          meetingBilingualLabel.textContent = isBilingual ? 'Bilingual (ML/EN)' : 'English';
        }
      }
    } catch (err) {
      console.warn('Failed to fetch initial meeting config:', err);
    }

    meetingModelSelect.onchange = async () => {
      try {
        const cfg = await window.go.main.SettingsApp.GetConfig();
        cfg.meeting_model = meetingModelSelect.value;
        await window.go.main.SettingsApp.SaveConfig(cfg);
      } catch (err) {
        console.error('Failed to save meeting model:', err);
      }
    };
  }

  if (meetingBilingualToggle && window.go?.main?.SettingsApp?.GetConfig) {
    meetingBilingualToggle.onclick = async () => {
      try {
        const cfg = await window.go.main.SettingsApp.GetConfig();
        cfg.meeting_bilingual = !cfg.meeting_bilingual;
        await window.go.main.SettingsApp.SaveConfig(cfg);
        meetingBilingualToggle.classList.toggle('active', cfg.meeting_bilingual);
        if (meetingBilingualLabel) {
          meetingBilingualLabel.textContent = cfg.meeting_bilingual ? 'Bilingual (ML/EN)' : 'English';
        }
      } catch (err) {
        console.error('Failed to toggle meeting bilingual mode:', err);
      }
    };
  }

  const updateSpeakersBadge = () => {
    const count = speakersSet.size;
    speakerBadge.textContent = count === 1 ? '1 speaker detected' : `${count} speakers detected`;
  };

  const loadPastMeetings = async () => {
    if (!window.go?.main?.SettingsApp?.GetMeetingsList) return;
    try {
      const meetings = await window.go.main.SettingsApp.GetMeetingsList();
      pastList.innerHTML = '';
      if (!meetings || meetings.length === 0) {
        pastList.innerHTML = `<div style="font-size: 13px; color: var(--text-muted); padding: 40px 0; text-align: center;">No previous meetings recorded yet.</div>`;
        if (pastCount) pastCount.textContent = '0 meetings';
        return;
      }
      if (pastCount) pastCount.textContent = `${meetings.length} meeting${meetings.length === 1 ? '' : 's'}`;

      meetings.forEach(m => {
        const card = document.createElement('div');
        card.className = 'past-meeting-card';
        const formattedDate = new Date(m.created_at).toLocaleDateString([], { 
          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' 
        });

        card.innerHTML = `
          <div class="past-card-header">
            <div class="past-card-title">${escapeHtml(m.title || 'Untitled Meeting')}</div>
            <div class="past-card-badges">
              <span class="past-card-badge">${formatDuration(m.duration_seconds)}</span>
            </div>
          </div>
          <div class="past-card-date">${formattedDate}</div>
          <div class="past-card-preview">${escapeHtml((m.summary_markdown || m.full_transcript || 'No summary available.').slice(0, 180))}...</div>
          <div class="past-card-footer">
            <button class="kbd-btn view-summary-btn">
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              View Minutes
            </button>
            <button class="kbd-btn view-dialogue-btn">
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Dialogue
            </button>
            <button class="kbd-btn delete-meeting-btn danger" title="Delete meeting">&times;</button>
          </div>
        `;

        card.querySelector('.view-summary-btn').onclick = async (e) => {
          e.stopPropagation();
          await viewMeetingDetails(m.id);
          switchMeetingView('summary');
        };

        card.querySelector('.view-dialogue-btn').onclick = async (e) => {
          e.stopPropagation();
          await viewMeetingDetails(m.id);
          switchMeetingView('dialogue');
        };

        card.querySelector('.delete-meeting-btn').onclick = async (e) => {
          e.stopPropagation();
          showCustomConfirm({
            title: 'Delete Meeting',
            message: `Permanently delete "${m.title || 'Meeting'}" and all recorded transcripts?`,
            confirmText: 'Delete',
            onConfirm: async () => {
              await window.go.main.SettingsApp.DeleteMeetingRecord(m.id);
              loadPastMeetings();
              if (activeMeetingID === m.id) {
                activeMeetingID = null;
                summaryContent.innerHTML = `<div class="summary-placeholder"><p>Meeting deleted.</p></div>`;
                dialogueList.innerHTML = '';
                dialogueList.appendChild(emptyState);
              }
            }
          });
        };

        pastList.appendChild(card);
      });
    } catch (err) {
      console.error('Failed to load past meetings:', err);
    }
  };

  const viewMeetingDetails = async (meetingId) => {
    try {
      activeMeetingID = meetingId;
      const detail = await window.go.main.SettingsApp.GetMeeting(meetingId);
      if (!detail) return;
      
      // Render dialogue
      dialogueList.innerHTML = '';
      speakersSet.clear();
      if (detail.segments && detail.segments.length > 0) {
        detail.segments.forEach(seg => appendDialogueBubble(seg));
      } else {
        dialogueList.innerHTML = `<div style="font-size: 13px; color: var(--text-muted); padding: 32px; text-align: center;">No speech segments recorded in this meeting.</div>`;
      }
      updateSpeakersBadge();

      // Render summary in full page
      renderMarkdownSummary(detail.meeting.summary_markdown || 'No summary generated yet. Click "Regenerate" above to create minutes using Gemma.');
      if (regenSummaryBtn) {
        regenSummaryBtn.style.display = 'inline-flex';
      }
    } catch (err) {
      console.error('Failed to fetch meeting detail:', err);
    }
  };

  const appendDialogueBubble = (seg) => {
    if (emptyState && emptyState.parentElement === dialogueList) {
      dialogueList.removeChild(emptyState);
    }

    speakersSet.add(seg.speaker);
    updateSpeakersBadge();

    const isYou = seg.speaker === 'You';
    const bubble = document.createElement('div');
    bubble.className = `dialogue-row ${isYou ? 'you' : 'remote'}`;

    const minutes = Math.floor(seg.start_ms / 60000);
    const seconds = Math.floor((seg.start_ms % 60000) / 1000);
    const timestampStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    bubble.innerHTML = `
      <div class="speaker-tag ${isYou ? 'speaker-you' : 'speaker-other'}">
        <span class="speaker-avatar">${isYou ? 'Y' : seg.speaker.replace('Speaker ', 'S')}</span>
        <span class="speaker-name">${escapeHtml(seg.speaker)}</span>
        <span class="bubble-time">${timestampStr}</span>
        ${seg.language ? `<span class="bubble-lang">${seg.language.toUpperCase()}</span>` : ''}
      </div>
      <div class="dialogue-bubble">${escapeHtml(seg.text)}</div>
    `;

    dialogueList.appendChild(bubble);
    dialogueList.scrollTop = dialogueList.scrollHeight;
  };

  const renderMarkdownSummary = (md) => {
    if (!md) {
      summaryContent.innerHTML = `<div class="summary-placeholder">
          <div class="summary-placeholder-icon">
            <svg class="spinner-icon" viewBox="0 0 24 24" width="36" height="36" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          </div>
          <h3>Generating Summary</h3>
          <p>Processing with local model... (0 tokens generated)</p>
        </div>`;
      return;
    }

    const html = renderFullMarkdown(md);
    summaryContent.innerHTML = `
      <div class="markdown-article-card">
        ${html}
      </div>
    `;
  };

  // Start Meeting Click
  startBtn.onclick = async () => {
    if (!window.go?.main?.SettingsApp?.StartMeeting) return;
    try {
      const title = titleInput.value.trim() || `Meeting ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
      startBtn.disabled = true;
      const meetingId = await window.go.main.SettingsApp.StartMeeting(title);
      activeMeetingID = meetingId;

      startBtn.style.display = 'none';
      stopBtn.style.display = 'inline-flex';
      startBtn.disabled = false;
      titleInput.disabled = true;
      statusBadge.textContent = 'Recording';
      statusBadge.classList.add('live');
      levelsBar.style.display = 'flex';
      dialogueList.innerHTML = '';
      speakersSet.clear();
      updateSpeakersBadge();
      renderMarkdownSummary('');
      if (regenSummaryBtn) regenSummaryBtn.style.display = 'none';

      // Switch view to Live Dialogue
      switchMeetingView('dialogue');

      // Start timer
      meetingElapsedSeconds = 0;
      timerLabel.textContent = '00:00:00';
      if (meetingTimerInterval) clearInterval(meetingTimerInterval);
      meetingTimerInterval = setInterval(() => {
        meetingElapsedSeconds++;
        timerLabel.textContent = formatTime(meetingElapsedSeconds);
      }, 1000);

    } catch (err) {
      alert('Error starting meeting: ' + err);
      startBtn.disabled = false;
    }
  };

  // Stop Meeting Click
  stopBtn.onclick = async () => {
    if (!window.go?.main?.SettingsApp?.StopMeeting) return;
    try {
      stopBtn.disabled = true;
      stopBtn.textContent = 'Ending...';
      if (meetingTimerInterval) clearInterval(meetingTimerInterval);

      await window.go.main.SettingsApp.StopMeeting();

      stopBtn.style.display = 'none';
      startBtn.style.display = 'inline-flex';
      stopBtn.disabled = false;
      stopBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> End Meeting`;
      titleInput.disabled = false;
      titleInput.value = '';
      statusBadge.textContent = 'Summarizing...';
      statusBadge.classList.remove('live');
      levelsBar.style.display = 'none';

      // Switch automatically to the full-page summary view to show loading state
      switchMeetingView('summary');

      summaryContent.innerHTML = `
        <div class="summary-loading">
          <div class="meeting-spinner"></div>
          <h3>Synthesizing Meeting Minutes</h3>
          <p>Analyzing conversation, decisions, timelines, and generating structured markdown minutes with local Gemma model...</p>
        </div>
      `;

      loadPastMeetings();
    } catch (err) {
      alert('Error ending meeting: ' + err);
      stopBtn.disabled = false;
    }
  };

  // Copy Summary
  if (copySummaryBtn) {
    copySummaryBtn.onclick = () => {
      const text = summaryContent.innerText;
      if (text) {
        navigator.clipboard.writeText(text);
        const originalText = copySummaryBtn.innerHTML;
        copySummaryBtn.textContent = 'Copied!';
        setTimeout(() => {
          copySummaryBtn.innerHTML = originalText;
        }, 1500);
      }
    };
  }

  // Regenerate Summary Click
  if (regenSummaryBtn) {
    regenSummaryBtn.onclick = async () => {
      if (!activeMeetingID || !window.go?.main?.SettingsApp?.RegenerateMeetingSummary) return;
      try {
        regenSummaryBtn.disabled = true;
        summaryContent.innerHTML = `
          <div class="summary-loading">
            <div class="meeting-spinner"></div>
            <h3>Regenerating Minutes</h3>
            <p>Running Gemma meeting summarization pipeline...</p>
          </div>
        `;
        const summary = await window.go.main.SettingsApp.RegenerateMeetingSummary(activeMeetingID);
        renderMarkdownSummary(summary);
        regenSummaryBtn.disabled = false;
      } catch (err) {
        alert('Regeneration failed: ' + err);
        regenSummaryBtn.disabled = false;
      }
    };
  }

  // Wails Event Listeners — only register once; use EventsOff to clear stale listeners first
  if (window.runtime) {
    window.runtime.EventsOff('meeting-level-mic');
    window.runtime.EventsOn('meeting-level-mic', (vol) => {
      if (micMeter) {
        const pct = Math.min(vol * 5, 100);
        micMeter.style.width = `${pct}%`;
      }
    });

    window.runtime.EventsOff('meeting-level-sys');
    window.runtime.EventsOn('meeting-level-sys', (vol) => {
      if (sysMeter) {
        const pct = Math.min(vol * 5, 100);
        sysMeter.style.width = `${pct}%`;
      }
    });

    window.runtime.EventsOff('meeting-segment-transcribed');
    window.runtime.EventsOn('meeting-segment-transcribed', (seg) => {
      appendDialogueBubble(seg);
    });

    window.runtime.EventsOff('meeting-summary-token');
    window.runtime.EventsOn('meeting-summary-token', (data) => {
      if (activeMeetingID === data.meeting_id) {
        summaryContent.innerHTML = `<div class="summary-placeholder">
          <div class="summary-placeholder-icon">
            <svg class="spinner-icon" viewBox="0 0 24 24" width="36" height="36" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          </div>
          <h3>Generating Summary</h3>
          <p>Processing with local model... (${data.token_count} tokens generated)</p>
        </div>`;
      }
    });

    window.runtime.EventsOff('meeting-summary-completed');
    window.runtime.EventsOn('meeting-summary-completed', (data) => {
      statusBadge.textContent = 'Concluded';
      if (activeMeetingID === data.meeting_id) {
        renderMarkdownSummary(data.summary_markdown);
        if (regenSummaryBtn) regenSummaryBtn.style.display = 'inline-flex';
      }
      loadPastMeetings();
    });
  }

  loadPastMeetings();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds < 60) return `${totalSeconds || 0}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s}s`;
}
