import { showCustomConfirm } from './dashboard.js';
import { renderFullMarkdown } from './markdown_parser.js';

let meetingTimerInterval = null;
let meetingElapsedSeconds = 0;
let activeRecordingMeetingID = null;
let activeDetailMeetingID = null;
const generatingMeetingIDs = new Set();
let meetingTabInitialized = false;

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds < 60) return `${totalSeconds || 0}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s}s`;
}

function formatMeetingDateRange(createdAtStr, durationSeconds) {
  if (!createdAtStr) return { date: 'Recent', timeRange: '', duration: '' };
  const startDate = new Date(createdAtStr);
  if (isNaN(startDate.getTime())) return { date: createdAtStr, timeRange: '', duration: '' };

  const dateStr = startDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const startTime = startDate.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  let timeRange = startTime;
  if (durationSeconds && durationSeconds > 0) {
    const endDate = new Date(startDate.getTime() + durationSeconds * 1000);
    const endTime = endDate.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    timeRange = `${startTime} → ${endTime}`;
  }

  return {
    date: dateStr,
    timeRange: timeRange,
    duration: formatDuration(durationSeconds)
  };
}

export async function setupMeetingsTab() {
  // Subviews
  const hubView = document.getElementById('meetingHubView');
  const recordingView = document.getElementById('meetingRecordingView');
  const detailView = document.getElementById('meetingDetailView');

  // Modal elements
  const newMeetingModal = document.getElementById('newMeetingModal');
  const openNewMeetingModalBtn = document.getElementById('openNewMeetingModalBtn');
  const emptyNewMeetingBtn = document.getElementById('emptyNewMeetingBtn');
  const closeNewMeetingModalBtn = document.getElementById('closeNewMeetingModalBtn');
  const cancelNewMeetingBtn = document.getElementById('cancelNewMeetingBtn');
  const startMeetingBtn = document.getElementById('startMeetingBtn');
  const meetingTitleInput = document.getElementById('meetingTitleInput');

  // Hub elements
  const pastList = document.getElementById('pastMeetingsList');
  const pastCount = document.getElementById('pastMeetingsCount');
  const emptyState = document.getElementById('meetingHubEmptyState');

  // Recording Studio elements
  const stopMeetingBtn = document.getElementById('stopMeetingBtn');
  const timerLabel = document.getElementById('meetingTimer');
  const studioTitleDisplay = document.getElementById('studioMeetingTitleDisplay');
  const levelsBar = document.getElementById('meetingLevelsBar');
  const micMeter = document.getElementById('meetingMicMeter');
  const sysMeter = document.getElementById('meetingSysMeter');
  const liveDialogueList = document.getElementById('meetingDialogueList');
  const liveEmptyState = document.getElementById('meetingEmptyState');
  const liveSpeakerBadge = document.getElementById('meetingSpeakerCount');

  // Detail View elements
  const detailBackBtn = document.getElementById('meetingDetailBackBtn');
  const detailTitle = document.getElementById('detailMeetingTitle');
  const detailTimeRange = document.getElementById('detailMeetingTimeRange');
  const detailTabMinutes = document.getElementById('detailTabMinutes');
  const detailTabDialogue = document.getElementById('detailTabDialogue');
  const detailPaneMinutes = document.getElementById('detailPaneMinutes');
  const detailPaneDialogue = document.getElementById('detailPaneDialogue');
  const summaryContent = document.getElementById('meetingSummaryContent');
  const detailDialogueList = document.getElementById('detailDialogueList');
  const copySummaryBtn = document.getElementById('copyMeetingSummaryBtn');
  const regenSummaryBtn = document.getElementById('regenSummaryBtn');
  const deleteMeetingDetailBtn = document.getElementById('deleteMeetingDetailBtn');

  // Model & Routing Selectors
  const meetingModelDropdown = document.getElementById('meetingModelDropdown');
  const meetingModelLabel = document.getElementById('meetingModelLabel');
  const meetingModelMenu = document.getElementById('meetingModelMenu');

  const meetingLLMDropdown = document.getElementById('meetingLLMDropdown');
  const meetingLLMLabel = document.getElementById('meetingLLMLabel');
  const meetingLLMMenu = document.getElementById('meetingLLMMenu');

  const meetingBilingualToggle = document.getElementById('meetingBilingualToggle');
  const meetingBilingualLabel = document.getElementById('meetingBilingualLabel');

  if (!hubView) return;

  const liveSpeakersSet = new Set();

  // ── Subview Switcher ────────────────────────────────────────────────────────
  const showHubView = () => {
    hubView.style.display = 'flex';
    if (recordingView) recordingView.style.display = 'none';
    if (detailView) detailView.style.display = 'none';
    activeDetailMeetingID = null;
    loadPastMeetings();
  };

  const showRecordingView = (title) => {
    if (hubView) hubView.style.display = 'none';
    if (recordingView) recordingView.style.display = 'flex';
    if (detailView) detailView.style.display = 'none';
    if (studioTitleDisplay) studioTitleDisplay.textContent = title;
  };

  const showDetailView = (meetingId, defaultTab = 'minutes') => {
    if (hubView) hubView.style.display = 'none';
    if (recordingView) recordingView.style.display = 'none';
    if (detailView) detailView.style.display = 'flex';
    activeDetailMeetingID = meetingId;
    switchDetailTab(defaultTab);
    viewMeetingDetails(meetingId);
  };

  const switchDetailTab = (tab) => {
    if (detailTabMinutes) detailTabMinutes.classList.toggle('active', tab === 'minutes');
    if (detailTabDialogue) detailTabDialogue.classList.toggle('active', tab === 'dialogue');
    if (detailPaneMinutes) detailPaneMinutes.style.display = tab === 'minutes' ? 'block' : 'none';
    if (detailPaneDialogue) detailPaneDialogue.style.display = tab === 'dialogue' ? 'block' : 'none';
  };

  if (detailTabMinutes) detailTabMinutes.onclick = () => switchDetailTab('minutes');
  if (detailTabDialogue) detailTabDialogue.onclick = () => switchDetailTab('dialogue');
  if (detailBackBtn) detailBackBtn.onclick = () => showHubView();

  // ── New Meeting Modal ───────────────────────────────────────────────────────
  const openModal = () => {
    if (!newMeetingModal) return;
    newMeetingModal.style.display = 'flex';
    if (meetingTitleInput) {
      meetingTitleInput.value = '';
      setTimeout(() => meetingTitleInput.focus(), 50);
    }
  };

  const closeModal = () => {
    if (newMeetingModal) newMeetingModal.style.display = 'none';
  };

  if (openNewMeetingModalBtn) openNewMeetingModalBtn.onclick = openModal;
  if (emptyNewMeetingBtn) emptyNewMeetingBtn.onclick = openModal;
  if (closeNewMeetingModalBtn) closeNewMeetingModalBtn.onclick = closeModal;
  if (cancelNewMeetingBtn) cancelNewMeetingBtn.onclick = closeModal;

  if (newMeetingModal) {
    newMeetingModal.onclick = (e) => {
      if (e.target === newMeetingModal) closeModal();
    };
  }

  if (meetingTitleInput) {
    meetingTitleInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        startMeetingBtn.click();
      } else if (e.key === 'Escape') {
        closeModal();
      }
    };
  }

  // ── Helper to setup custom dropdown click & toggle ─────────────────────────
  const setupDropdownTrigger = (dropdownEl) => {
    if (!dropdownEl) return;
    const trigger = dropdownEl.querySelector('.dropdown-trigger');
    if (!trigger) return;
    trigger.onclick = (e) => {
      e.stopPropagation();
      const wasOpen = dropdownEl.classList.contains('open');
      document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('open'));
      if (!wasOpen) dropdownEl.classList.add('open');
    };
  };

  // Close dropdowns on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('open'));
  });

  setupDropdownTrigger(meetingModelDropdown);
  setupDropdownTrigger(meetingLLMDropdown);

  // ── Meeting Config & Model Selectors ────────────────────────────────────────
  if (window.go?.main?.SettingsApp?.GetConfig) {
    try {
      const cfg = await window.go.main.SettingsApp.GetConfig();
      const allModels = (window.go.main.SettingsApp.GetModelsList ? await window.go.main.SettingsApp.GetModelsList() : []) || [];

      // 1. STT Models Menu
      if (meetingModelMenu && meetingModelLabel) {
        const sttModels = allModels.filter(m => (m.type === 'whisper' || m.model_type === 'whisper') && m.is_downloaded);
        let modelList = [{ val: '', name: 'Use Dictation Model', badge: 'Default' }];

        if (sttModels.length > 0) {
          sttModels.forEach(m => {
            const isEn = m.filename.includes('.en.');
            const isIndic = m.filename.includes('indicconformer');
            const isWhistle = m.filename.includes('whistle');
            let badge = 'Multilingual';
            if (isEn) badge = 'English';
            else if (isIndic) badge = 'Malayalam';
            else if (isWhistle) badge = 'Whistle';
            modelList.push({ val: m.filename, name: m.name, badge: badge });
          });
        } else {
          modelList.push(
            { val: 'ggml-tiny.en.bin', name: 'Tiny English', badge: 'English' },
            { val: 'ggml-tiny.bin', name: 'Tiny Multilingual', badge: 'Multilingual' },
            { val: 'ggml-base.en.bin', name: 'Base English', badge: 'English' },
            { val: 'ggml-base.bin', name: 'Base Multilingual', badge: 'Multilingual' },
            { val: 'ggml-small.en.bin', name: 'Small English', badge: 'English' },
            { val: 'indicconformer.int8.onnx', name: 'Indic Conformer INT8', badge: 'Malayalam' },
            { val: 'indicconformer.fp32.onnx', name: 'Indic Conformer FP32', badge: 'Malayalam' },
            { val: 'whistle.cact', name: 'Cactus Whistle', badge: 'Whistle' }
          );
        }

        const currentSTTVal = cfg.meeting_model || '';
        const activeSTTItem = modelList.find(m => m.val === currentSTTVal) || modelList[0];
        meetingModelLabel.textContent = activeSTTItem.name;

        meetingModelMenu.innerHTML = modelList.map(m => `
          <div class="dropdown-item ${m.val === currentSTTVal ? 'active' : ''}" data-value="${m.val}">
            <span>${escapeHtml(m.name)}</span>
            <span class="dropdown-item-badge">${m.badge}</span>
          </div>
        `).join('');

        meetingModelMenu.querySelectorAll('.dropdown-item').forEach(item => {
          item.onclick = async (e) => {
            e.stopPropagation();
            const val = item.getAttribute('data-value');
            meetingModelMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const found = modelList.find(m => m.val === val);
            if (found) meetingModelLabel.textContent = found.name;
            meetingModelDropdown?.classList.remove('open');

            try {
              const currentCfg = await window.go.main.SettingsApp.GetConfig();
              currentCfg.meeting_model = val;
              await window.go.main.SettingsApp.SaveConfig(currentCfg);
            } catch (err) {
              console.error('Failed to save meeting STT model:', err);
            }
          };
        });
      }

      // 2. LLM Models Menu
      if (meetingLLMMenu && meetingLLMLabel) {
        const llmModels = allModels.filter(m => (m.type === 'llm' || m.model_type === 'llm') && m.is_downloaded);
        let llmList = [{ val: '', name: 'Use Dictation Model', badge: 'Default' }];
        llmModels.forEach(m => {
          llmList.push({ val: m.id || m.filename, name: m.name, badge: 'LLM' });
        });

        const currentLLMVal = cfg.meeting_llm_model || '';
        const activeLLMItem = llmList.find(m => m.val === currentLLMVal) || llmList[0];
        meetingLLMLabel.textContent = activeLLMItem.name;

        meetingLLMMenu.innerHTML = llmList.map(m => `
          <div class="dropdown-item ${m.val === currentLLMVal ? 'active' : ''}" data-value="${m.val}">
            <span>${escapeHtml(m.name)}</span>
            <span class="dropdown-item-badge">${m.badge}</span>
          </div>
        `).join('');

        meetingLLMMenu.querySelectorAll('.dropdown-item').forEach(item => {
          item.onclick = async (e) => {
            e.stopPropagation();
            const val = item.getAttribute('data-value');
            meetingLLMMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const found = llmList.find(m => m.val === val);
            if (found) meetingLLMLabel.textContent = found.name;
            meetingLLMDropdown?.classList.remove('open');

            try {
              if (window.go.main.SettingsApp.SetMeetingLLMModel) {
                await window.go.main.SettingsApp.SetMeetingLLMModel(val);
              } else {
                const currentCfg = await window.go.main.SettingsApp.GetConfig();
                currentCfg.meeting_llm_model = val;
                await window.go.main.SettingsApp.SaveConfig(currentCfg);
              }
            } catch (err) {
              console.error('Failed to save meeting LLM model:', err);
            }
          };
        });
      }

      // 3. Meeting Bilingual Toggle
      const isBilingual = !!cfg.meeting_bilingual;
      if (meetingBilingualToggle) {
        meetingBilingualToggle.classList.toggle('active', isBilingual);
        if (meetingBilingualLabel) {
          meetingBilingualLabel.textContent = isBilingual ? 'Bilingual (ML/EN)' : 'English Only';
        }

        meetingBilingualToggle.onclick = async () => {
          try {
            const currentCfg = await window.go.main.SettingsApp.GetConfig();
            currentCfg.meeting_bilingual = !currentCfg.meeting_bilingual;
            await window.go.main.SettingsApp.SaveConfig(currentCfg);

            const newState = currentCfg.meeting_bilingual;
            meetingBilingualToggle.classList.toggle('active', newState);
            if (meetingBilingualLabel) {
              meetingBilingualLabel.textContent = newState ? 'Bilingual (ML/EN)' : 'English Only';
            }
          } catch (err) {
            console.error('Failed to toggle meeting bilingual mode:', err);
          }
        };
      }
    } catch (err) {
      console.warn('Failed to fetch initial meeting config:', err);
    }
  }

  // ── Browser Companion Modal (Method 3 Interactive Wizard) ───────────────────
  const companionModal = document.getElementById('companionModal');
  const openCompanionModalBtn = document.getElementById('openCompanionModalBtn');
  const closeCompanionModalBtn = document.getElementById('closeCompanionModalBtn');
  const companionDoneBtn = document.getElementById('companionDoneBtn');
  const companionBackBtn = document.getElementById('companionBackBtn');

  const companionStep1View = document.getElementById('companionStep1View');
  const companionStep2View = document.getElementById('companionStep2View');
  const stepPill1 = document.getElementById('stepPill1');
  const stepPill2 = document.getElementById('stepPill2');
  const stepPill3 = document.getElementById('stepPill3');

  const installedBrowsersGrid = document.getElementById('installedBrowsersGrid');
  const selectedBrowserTitle = document.getElementById('selectedBrowserTitle');
  const extensionFolderPathDisplay = document.getElementById('extensionFolderPathDisplay');
  const copyExtPathBtn = document.getElementById('copyExtPathBtn');
  const copyExtPathBtnText = document.getElementById('copyExtPathBtnText');
  const relaunchBrowserBtn = document.getElementById('relaunchBrowserBtn');

  const companionPulseDot = document.getElementById('companionPulseDot');
  const companionMainStatusLabel = document.getElementById('companionMainStatusLabel');
  const companionSubStatusLabel = document.getElementById('companionSubStatusLabel');
  const companionHeaderStatusDot = document.getElementById('companionHeaderStatusDot');

  let activeBrowserCandidate = null;

  const updateCompanionConnectionUI = (isConnected) => {
    if (companionPulseDot) {
      companionPulseDot.className = `status-pulse-circle ${isConnected ? 'connected' : 'disconnected'}`;
    }
    if (companionHeaderStatusDot) {
      companionHeaderStatusDot.className = `companion-status-dot ${isConnected ? 'connected' : 'disconnected'}`;
    }
    if (stepPill3) {
      stepPill3.classList.toggle('active', isConnected);
    }
    if (companionMainStatusLabel) {
      companionMainStatusLabel.textContent = isConnected ? 'Companion Connected ✅' : 'Waiting for connection...';
    }
    if (companionSubStatusLabel) {
      companionSubStatusLabel.textContent = isConnected
        ? 'Real-time speaker audio & names are streaming into LocalFlow!'
        : 'Open Google Meet, Zoom, Teams, Webex, Discord or Slack in your browser to begin streaming';
    }
  };

  // Poll or listen for connection status
  if (window.runtime?.EventsOn) {
    window.runtime.EventsOn('extension-connection-status', (connected) => {
      updateCompanionConnectionUI(connected);
    });
  }

  // Periodic polling check while companion modal is open
  setInterval(async () => {
    if (companionModal && companionModal.style.display !== 'none') {
      if (window.go?.main?.SettingsApp?.IsExtensionConnected) {
        try {
          const connected = await window.go.main.SettingsApp.IsExtensionConnected();
          updateCompanionConnectionUI(connected);
        } catch (e) {}
      }
    }
  }, 1000);

  // Initial connection check
  if (window.go?.main?.SettingsApp?.IsExtensionConnected) {
    window.go.main.SettingsApp.IsExtensionConnected().then(updateCompanionConnectionUI).catch(() => {});
  }

  const setCompanionStep = (step) => {
    if (step === 1) {
      if (companionStep1View) companionStep1View.style.display = 'block';
      if (companionStep2View) companionStep2View.style.display = 'none';
      if (stepPill1) stepPill1.classList.add('active');
      if (stepPill2) stepPill2.classList.remove('active');
      if (companionBackBtn) companionBackBtn.style.display = 'none';
    } else if (step === 2) {
      if (companionStep1View) companionStep1View.style.display = 'none';
      if (companionStep2View) companionStep2View.style.display = 'block';
      if (stepPill1) stepPill1.classList.remove('active');
      if (stepPill2) stepPill2.classList.add('active');
      if (companionBackBtn) companionBackBtn.style.display = 'inline-block';
    }
  };

  const openCompanionModal = async () => {
    if (!companionModal) return;
    companionModal.style.display = 'flex';
    setCompanionStep(1);

    // Get extension path
    let extPath = 'C:\\LocalFlow\\extension';
    if (window.go?.main?.SettingsApp?.GetExtensionPath) {
      try {
        extPath = await window.go.main.SettingsApp.GetExtensionPath();
      } catch (e) {}
    }
    if (extensionFolderPathDisplay) extensionFolderPathDisplay.textContent = extPath;

    // Fetch installed browsers
    if (installedBrowsersGrid && window.go?.main?.SettingsApp?.GetInstalledBrowsers) {
      try {
        const browsers = await window.go.main.SettingsApp.GetInstalledBrowsers();
        if (browsers && browsers.length > 0) {
          installedBrowsersGrid.innerHTML = browsers.map(b => {
            return `
              <div class="browser-card" data-browser-id="${b.id}" data-browser-path="${escapeHtml(b.path)}" data-browser-url="${b.url}" data-browser-name="${escapeHtml(b.name)}">
                <div class="browser-card-icon">
                  <svg viewBox="0 0 24 24" width="26" height="26" stroke="#10b981" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/><line x1="3.95" y1="6.06" x2="8.54" y2="14"/><line x1="10.88" y1="21.94" x2="15.46" y2="14"/></svg>
                </div>
                <div class="browser-card-name">${escapeHtml(b.name)}</div>
                <span class="browser-badge-installed">Installed</span>
              </div>
            `;
          }).join('');

          installedBrowsersGrid.querySelectorAll('.browser-card').forEach(card => {
            card.onclick = async () => {
              const bPath = card.getAttribute('data-browser-path');
              const bUrl = card.getAttribute('data-browser-url');
              const bName = card.getAttribute('data-browser-name');
              activeBrowserCandidate = { path: bPath, url: bUrl, name: bName };

              if (selectedBrowserTitle) selectedBrowserTitle.textContent = `Install on ${bName}`;
              setCompanionStep(2);

              // 1-Click Launch: Open browser to extensions page & open extension folder
              if (window.go?.main?.SettingsApp?.OpenBrowserExtensionPage) {
                try {
                  await window.go.main.SettingsApp.OpenBrowserExtensionPage(bPath, bUrl);
                } catch (err) {
                  console.error('Failed to open browser extensions page:', err);
                }
              }
            };
          });
        } else {
          installedBrowsersGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); font-size: 12px; padding: 16px;">
              No standard Chromium browsers detected. You can load unpacked manually from: <br><code>${escapeHtml(extPath)}</code>
            </div>
          `;
        }
      } catch (err) {
        console.warn('Failed to load installed browsers:', err);
      }
    }
  };

  const closeCompanionModal = () => {
    if (companionModal) companionModal.style.display = 'none';
  };

  if (openCompanionModalBtn) openCompanionModalBtn.onclick = openCompanionModal;
  if (closeCompanionModalBtn) closeCompanionModalBtn.onclick = closeCompanionModal;
  if (companionDoneBtn) companionDoneBtn.onclick = closeCompanionModal;
  if (companionBackBtn) companionBackBtn.onclick = () => setCompanionStep(1);

  if (companionModal) {
    companionModal.onclick = (e) => {
      if (e.target === companionModal) closeCompanionModal();
    };
  }

  if (copyExtPathBtn) {
    copyExtPathBtn.onclick = () => {
      const pathText = extensionFolderPathDisplay?.textContent || '';
      if (pathText && navigator.clipboard) {
        navigator.clipboard.writeText(pathText);
        if (copyExtPathBtnText) {
          copyExtPathBtnText.textContent = 'Copied!';
          setTimeout(() => {
            copyExtPathBtnText.textContent = 'Copy';
          }, 1500);
        }
      }
    };
  }

  if (relaunchBrowserBtn) {
    relaunchBrowserBtn.onclick = async () => {
      if (activeBrowserCandidate && window.go?.main?.SettingsApp?.OpenBrowserExtensionPage) {
        try {
          await window.go.main.SettingsApp.OpenBrowserExtensionPage(activeBrowserCandidate.path, activeBrowserCandidate.url);
        } catch (err) {
          console.error('Failed to re-open browser extension page:', err);
        }
      }
    };
  }

  const updateSpeakersBadge = () => {
    if (!liveSpeakerBadge) return;
    const count = liveSpeakersSet.size;
    liveSpeakerBadge.textContent = count === 1 ? '1 speaker' : `${count} speakers`;
  };

  // ── Meeting Card Rows List (1 per row) ──────────────────────────────────────
  const loadPastMeetings = async () => {
    if (!window.go?.main?.SettingsApp?.GetMeetingsList || !pastList) return;
    try {
      const meetings = await window.go.main.SettingsApp.GetMeetingsList();
      pastList.innerHTML = '';

      if (!meetings || meetings.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        pastList.style.display = 'none';
        if (pastCount) pastCount.textContent = '0 meetings';
        return;
      }

      if (emptyState) emptyState.style.display = 'none';
      pastList.style.display = 'flex';
      if (pastCount) pastCount.textContent = `${meetings.length} meeting${meetings.length === 1 ? '' : 's'}`;

      meetings.forEach(m => {
        const isGenerating = generatingMeetingIDs.has(m.id);
        const { date, timeRange, duration } = formatMeetingDateRange(m.created_at, m.duration_seconds);

        const card = document.createElement('div');
        card.className = `meeting-row-card ${isGenerating ? 'generating' : ''}`;
        card.setAttribute('data-meeting-id', m.id);

        let previewText = '';
        if (isGenerating) {
          previewText = 'Synthesizing executive minutes and structured action items in background with local model...';
        } else if (m.short_summary) {
          previewText = m.short_summary;
        } else if (m.summary_markdown) {
          previewText = stripMarkdown(m.summary_markdown);
        } else if (m.full_transcript) {
          previewText = stripMarkdown(m.full_transcript);
        } else {
          previewText = 'No dialogue recorded.';
        }

        let statusBadgeHtml = '';
        if (isGenerating) {
          statusBadgeHtml = `<span class="row-status-pill generating"><span class="spin-dot"></span> Generating Minutes</span>`;
        } else if (m.summary_markdown) {
          statusBadgeHtml = `<span class="row-status-pill concluded">● Concluded</span>`;
        } else {
          statusBadgeHtml = `<span class="row-status-pill recorded">● Recorded</span>`;
        }

        card.innerHTML = `
          <div class="row-left-section">
            <div class="row-main-info">
              <div class="row-title-bar">
                <span class="row-title" title="${escapeHtml(m.title || 'Untitled Meeting')}">${escapeHtml(m.title || 'Untitled Meeting')}</span>
                ${statusBadgeHtml}
              </div>
              <div class="row-meta-bar">
                <span class="meta-tag date-tag">
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  ${date}
                </span>
                ${timeRange ? `
                  <span class="meta-tag time-tag" title="Meeting time range">
                    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    ${timeRange}
                  </span>
                ` : ''}
                ${duration ? `
                  <span class="meta-tag duration-tag" title="Duration">
                    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    ${duration}
                  </span>
                ` : ''}
              </div>
              <div class="row-preview-text ${isGenerating ? 'generating-shimmer' : ''}">
                ${escapeHtml(previewText)}
              </div>
            </div>
          </div>
          <div class="row-open-indicator">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>
          </div>
        `;

        // Click row opens detail view
        card.onclick = () => {
          showDetailView(m.id, 'minutes');
        };

        pastList.appendChild(card);
      });
    } catch (err) {
      console.error('Failed to load past meetings:', err);
    }
  };

  // ── Meeting Detail View ─────────────────────────────────────────────────────
  const viewMeetingDetails = async (meetingId) => {
    try {
      activeDetailMeetingID = meetingId;
      const detail = await window.go.main.SettingsApp.GetMeeting(meetingId);
      if (!detail) return;

      if (detailTitle) detailTitle.textContent = detail.meeting.title || 'Untitled Meeting';
      if (detailTimeRange) {
        const { date, timeRange, duration } = formatMeetingDateRange(detail.meeting.created_at, detail.meeting.duration_seconds);
        detailTimeRange.textContent = `${date} • ${timeRange || ''} ${duration ? `(${duration})` : ''}`;
      }

      // Populate dialogue pane
      if (detailDialogueList) {
        detailDialogueList.innerHTML = '';
        if (detail.segments && detail.segments.length > 0) {
          detail.segments.forEach(seg => appendDialogueRow(seg, detailDialogueList));
        } else {
          detailDialogueList.innerHTML = `<div style="font-size: 13px; color: var(--text-muted); padding: 48px; text-align: center;">No speech segments recorded in this meeting.</div>`;
        }
      }

      // Render minutes
      const isGenerating = generatingMeetingIDs.has(meetingId);
      if (isGenerating) {
        summaryContent.innerHTML = `
          <div class="summary-loading">
            <div class="meeting-spinner"></div>
            <h3>Synthesizing Meeting Minutes</h3>
            <p>Processing conversation in background with local model...</p>
          </div>
        `;
      } else {
        const shortSummary = detail.meeting.short_summary || '';
        renderMarkdownSummary(detail.meeting.summary_markdown || 'No summary generated yet. Click "Regenerate" above to create minutes using your local model.', shortSummary);
      }

      if (regenSummaryBtn) {
        regenSummaryBtn.disabled = isGenerating;
      }
    } catch (err) {
      console.error('Failed to fetch meeting detail:', err);
    }
  };

  const appendDialogueRow = (seg, container) => {
    if (!container) return;
    const isYou = seg.speaker === 'You';
    const bubble = document.createElement('div');
    bubble.className = `dialogue-row ${isYou ? 'you' : 'remote'}`;

    const minutes = Math.floor(seg.start_ms / 60000);
    const seconds = Math.floor((seg.start_ms % 60000) / 1000);
    const timestampStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    let avatarLetter = 'S';
    if (isYou) {
      avatarLetter = 'Y';
    } else if (seg.speaker.startsWith('Speaker ')) {
      avatarLetter = seg.speaker.replace('Speaker ', 'S');
    } else if (seg.speaker && seg.speaker.length > 0) {
      avatarLetter = seg.speaker.charAt(0).toUpperCase();
    }

    bubble.innerHTML = `
      <div class="speaker-tag ${isYou ? 'speaker-you' : 'speaker-other'}">
        <span class="speaker-avatar">${escapeHtml(avatarLetter)}</span>
        <span class="speaker-name">${escapeHtml(seg.speaker)}</span>
        <span class="bubble-time">${timestampStr}</span>
        ${seg.language ? `<span class="bubble-lang">${seg.language.toUpperCase()}</span>` : ''}
      </div>
      <div class="dialogue-bubble">${escapeHtml(seg.text)}</div>
    `;

    container.appendChild(bubble);
  };

  const renderMarkdownSummary = (md, shortSummary) => {
    if (!summaryContent) return;
    if (!md) {
      summaryContent.innerHTML = `<div class="summary-placeholder">
          <div class="summary-placeholder-icon">
            <svg class="spinner-icon" viewBox="0 0 24 24" width="36" height="36" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          </div>
          <h3>Generating Summary</h3>
          <p>Processing with local model...</p>
        </div>`;
      return;
    }

    const tldrHtml = shortSummary ? `
      <div class="meeting-tldr">
        <span class="tldr-label">TL;DR</span>
        <span class="tldr-text">${escapeHtml(shortSummary)}</span>
      </div>` : '';

    const html = renderFullMarkdown(md);
    summaryContent.innerHTML = `
      <div class="markdown-article-card">
        ${tldrHtml}
        ${html}
      </div>
    `;
  };

  // ── Start Meeting Action ────────────────────────────────────────────────────
  startMeetingBtn.onclick = async () => {
    if (!window.go?.main?.SettingsApp?.StartMeeting) return;
    try {
      const enteredTitle = meetingTitleInput ? meetingTitleInput.value.trim() : '';
      const fallbackTitle = `Meeting ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
      const title = enteredTitle || fallbackTitle;

      startMeetingBtn.disabled = true;
      const meetingId = await window.go.main.SettingsApp.StartMeeting(title);
      activeRecordingMeetingID = meetingId;
      startMeetingBtn.disabled = false;

      closeModal();
      showRecordingView(title);

      // Reset recording studio state
      liveSpeakersSet.clear();
      if (liveDialogueList) liveDialogueList.innerHTML = '';
      if (liveEmptyState) liveDialogueList.appendChild(liveEmptyState);
      updateSpeakersBadge();

      // Start timer
      meetingElapsedSeconds = 0;
      if (timerLabel) timerLabel.textContent = '00:00:00';
      if (meetingTimerInterval) clearInterval(meetingTimerInterval);
      meetingTimerInterval = setInterval(() => {
        meetingElapsedSeconds++;
        if (timerLabel) timerLabel.textContent = formatTime(meetingElapsedSeconds);
      }, 1000);

    } catch (err) {
      alert('Error starting meeting: ' + err);
      startMeetingBtn.disabled = false;
    }
  };

  // ── Stop Meeting Action ─────────────────────────────────────────────────────
  if (stopMeetingBtn) {
    stopMeetingBtn.onclick = async () => {
      if (!window.go?.main?.SettingsApp?.StopMeeting) return;
      try {
        stopMeetingBtn.disabled = true;
        stopMeetingBtn.textContent = 'Ending...';
        if (meetingTimerInterval) clearInterval(meetingTimerInterval);

        const meetingId = activeRecordingMeetingID;
        await window.go.main.SettingsApp.StopMeeting();

        if (meetingId) {
          generatingMeetingIDs.add(meetingId);
        }

        stopMeetingBtn.disabled = false;
        stopMeetingBtn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> End Meeting`;

        // Return immediately to Hub — generation runs in background!
        showHubView();

      } catch (err) {
        alert('Error ending meeting: ' + err);
        stopMeetingBtn.disabled = false;
      }
    };
  }

  // ── Trigger Regenerate Action ───────────────────────────────────────────────
  const triggerRegenerate = async (meetingId) => {
    if (!meetingId || !window.go?.main?.SettingsApp?.RegenerateMeetingSummary) return;
    try {
      generatingMeetingIDs.add(meetingId);
      loadPastMeetings();

      if (activeDetailMeetingID === meetingId) {
        summaryContent.innerHTML = `
          <div class="summary-loading">
            <div class="meeting-spinner"></div>
            <h3>Regenerating Minutes</h3>
            <p>Running local meeting summarization pipeline in background...</p>
          </div>
        `;
        if (regenSummaryBtn) regenSummaryBtn.disabled = true;
      }

      await window.go.main.SettingsApp.RegenerateMeetingSummary(meetingId);
    } catch (err) {
      generatingMeetingIDs.delete(meetingId);
      loadPastMeetings();
      alert('Regeneration failed: ' + err);
      if (regenSummaryBtn) regenSummaryBtn.disabled = false;
    }
  };

  if (regenSummaryBtn) {
    regenSummaryBtn.onclick = () => {
      if (activeDetailMeetingID) {
        triggerRegenerate(activeDetailMeetingID);
      }
    };
  }

  // Copy Summary
  if (copySummaryBtn) {
    copySummaryBtn.onclick = () => {
      const text = summaryContent ? summaryContent.innerText : '';
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

  // Delete Meeting from Detail View
  if (deleteMeetingDetailBtn) {
    deleteMeetingDetailBtn.onclick = () => {
      if (!activeDetailMeetingID) return;
      showCustomConfirm({
        title: 'Delete Meeting',
        message: 'Permanently delete this meeting and all recorded transcripts?',
        confirmText: 'Delete',
        onConfirm: async () => {
          await window.go.main.SettingsApp.DeleteMeetingRecord(activeDetailMeetingID);
          showHubView();
        }
      });
    };
  }

  // ── Wails Event Listeners (Background & Multi-Threading) ─────────────────────
  if (window.runtime) {
    // Mic level
    window.runtime.EventsOff('meeting-level-mic');
    window.runtime.EventsOn('meeting-level-mic', (vol) => {
      if (micMeter) {
        const pct = Math.min(vol * 5, 100);
        micMeter.style.width = `${pct}%`;
      }
    });

    // Sys level
    window.runtime.EventsOff('meeting-level-sys');
    window.runtime.EventsOn('meeting-level-sys', (vol) => {
      if (sysMeter) {
        const pct = Math.min(vol * 5, 100);
        sysMeter.style.width = `${pct}%`;
      }
    });

    // Live segment transcribed during recording
    window.runtime.EventsOff('meeting-segment-transcribed');
    window.runtime.EventsOn('meeting-segment-transcribed', (seg) => {
      if (liveEmptyState && liveEmptyState.parentElement === liveDialogueList) {
        liveDialogueList.removeChild(liveEmptyState);
      }
      liveSpeakersSet.add(seg.speaker);
      updateSpeakersBadge();
      appendDialogueRow(seg, liveDialogueList);
      if (liveDialogueList) {
        liveDialogueList.scrollTop = liveDialogueList.scrollHeight;
      }
    });

    // Summary started generating in background
    window.runtime.EventsOff('meeting-summary-generating');
    window.runtime.EventsOn('meeting-summary-generating', (data) => {
      const id = typeof data === 'string' ? data : data?.id || data?.meeting_id;
      if (id) {
        generatingMeetingIDs.add(id);
        loadPastMeetings();
        if (activeDetailMeetingID === id && summaryContent) {
          summaryContent.innerHTML = `
            <div class="summary-loading">
              <div class="meeting-spinner"></div>
              <h3>Synthesizing Meeting Minutes</h3>
              <p>Analyzing conversation, decisions, timelines, and generating structured markdown minutes in background...</p>
            </div>
          `;
          if (regenSummaryBtn) regenSummaryBtn.disabled = true;
        }
      }
    });

    // Live streaming tokens from local model
    window.runtime.EventsOff('meeting-summary-token');
    window.runtime.EventsOn('meeting-summary-token', (data) => {
      if (activeDetailMeetingID !== data.meeting_id || !summaryContent) return;

      const partial = data.partial_content || '';
      if (!partial || partial.trim().length < 20) {
        summaryContent.innerHTML = `<div class="summary-placeholder">
          <div class="summary-placeholder-icon">
            <svg class="spinner-icon" viewBox="0 0 24 24" width="36" height="36" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          </div>
          <h3>Generating Summary</h3>
          <p>Processing with local model... (${data.token_count} tokens)</p>
        </div>`;
        return;
      }

      const html = renderFullMarkdown(partial);
      summaryContent.innerHTML = `
        <div class="markdown-article-card streaming">
          ${html}
          <span class="stream-cursor"></span>
        </div>
      `;
      summaryContent.scrollTop = summaryContent.scrollHeight;
    });

    // Summary completed in background
    window.runtime.EventsOff('meeting-summary-completed');
    window.runtime.EventsOn('meeting-summary-completed', (data) => {
      const id = data.id || data.meeting_id;
      if (id) {
        generatingMeetingIDs.delete(id);
      }
      loadPastMeetings();

      if (activeDetailMeetingID === id) {
        renderMarkdownSummary(data.summary_markdown || data.summary, data.short_summary || '');
        if (regenSummaryBtn) regenSummaryBtn.disabled = false;
      }
    });
  }

  // Initial display is the Hub
  showHubView();
}

// stripMarkdown: plain text preview helper
function stripMarkdown(md) {
  if (!md) return '';
  return md
    .replace(/^#+\s*/gm, '')       // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1') // italic
    .replace(/^[-*]\s+/gm, '')     // bullets
    .replace(/^>\s*/gm, '')        // blockquotes
    .replace(/- \[[ x]\]\s*/gi, '') // checkboxes
    .replace(/\n+/g, ' ')          // newlines → spaces
    .trim();
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
