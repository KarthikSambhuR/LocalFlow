import logoImg from './assets/images/logo-universal.png';
import { BAR_COUNT } from './constants.js';

export const root = document.getElementById('root');

// Neo-brutalist / Wispr Flow module container
export const moduleNode = document.createElement('div');
moduleNode.className = 'module';
moduleNode.id = 'module';

export const ring = document.createElement('div');
ring.className = 'processing-ring';
moduleNode.appendChild(ring);

export const visualizer = document.createElement('div');
visualizer.className = 'visualizer';

export const bars = [];
for (let i = 0; i < BAR_COUNT; i++) {
  const bar = document.createElement('div');
  bar.className = 'bar idle';
  visualizer.appendChild(bar);
  bars.push(bar);
}
moduleNode.appendChild(visualizer);

// ── Settings UI DOM ────────────────────────────────────────────────────────
export const settingsOverlay = document.createElement('div');
settingsOverlay.className = 'settings-overlay';
settingsOverlay.id = 'settingsOverlay';

export const settingsModal = document.createElement('div');
settingsModal.className = 'settings-modal';

settingsModal.innerHTML = `
  <div class="window-titlebar" id="windowTitlebar">
    <div class="titlebar-brand">
      <img class="titlebar-logo" src="${logoImg}" alt="" />
      <span>LocalFlow</span>
    </div>
    <div class="titlebar-controls">
      <button class="titlebar-button" type="button" id="windowMinimizeBtn" aria-label="Minimize">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>
      </button>
      <button class="titlebar-button" type="button" id="windowMaximizeBtn" aria-label="Maximize">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>
      </button>
      <button class="titlebar-button titlebar-close" type="button" id="windowCloseBtn" aria-label="Close">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>
      </button>
    </div>
  </div>
  <div class="settings-shell">
    <div class="settings-sidebar">
      <div class="sidebar-brand">
        <img class="brand-logo" src="${logoImg}" alt="LocalFlow Logo" />
        <div>
          <div class="sidebar-header">LocalFlow</div>
          <div class="sidebar-subtitle">Your transcriber</div>
        </div>
      </div>
      <div class="nav-item active" data-section="home">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        Home
      </div>
      <div class="nav-item" data-section="meetings" id="navMeetings">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Meetings
      </div>
      <div class="nav-item" data-section="insights">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16V9"/><path d="M12 16V5"/><path d="M17 16v-3"/></svg>
        Insights
      </div>
      <div class="nav-item" data-section="dictionary">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/></svg>
        Dictionary
      </div>
      <div class="nav-item" data-section="manglish" id="navManglish">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        Personalization
      </div>
      <div class="nav-item" data-section="models">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
        Models
      </div>
      <div class="nav-item" data-section="settings">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
        Settings
      </div>
      <div class="update-notification" id="updateNotification" style="display: none;">
        <div class="update-box">
          <div class="update-title">New Update Available</div>
          <div class="update-progress-container" id="updateProgressContainer" style="display: none;">
            <div class="update-progress-bar-bg">
              <div class="update-progress-bar-fill" id="updateProgressBar" style="width: 0%"></div>
            </div>
            <div class="update-progress-text" id="updateProgressText">Downloading... 0%</div>
          </div>
          <button id="restartUpdateBtn" class="update-btn" type="button" style="display: none;">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            Restart to Update
          </button>
        </div>
      </div>
      <div class="sidebar-footer">
        <div class="shortcut-preview">
          <span>Shortcut</span>
          <div><kbd id="sideK1">Ctrl</kbd><b>+</b><kbd id="sideK2">Win</kbd></div>
        </div>
        <div class="app-version-label" id="appVersionLabel">LocalFlow v1.4.1</div>
      </div>
    </div>
    <div class="settings-content">
    <div class="content-header">
      <span class="section-title">Home</span>
    </div>
    <div class="section" id="sec-home">
      <div class="home-layout">
        <div class="home-stats-bar" id="homeRail"></div>
        <main class="home-main">
          <div class="recent-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div class="section-kicker" style="margin-bottom: 0;">Recent dictation</div>
            <div class="view-toggle" id="globalViewToggle" style="margin-top: 0;">
              <div class="toggle-pill">
                <div class="toggle-slider" id="globalToggleSlider"></div>
                <button type="button" class="toggle-opt toggle-opt-raw" id="globalToggleRaw" data-view="raw">
                  <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/></svg>
                  Transcription
                </button>
                <button type="button" class="toggle-opt toggle-opt-refined active" id="globalToggleRefined" data-view="refined">
                  <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                  Refined
                </button>
                <button type="button" class="toggle-opt toggle-opt-diff" id="globalToggleDiff" data-view="diff">
                  <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 9v7c0 1.1.9 2 2 2h7"/><path d="M9 6h7a2 2 0 0 1 2 2v7"/></svg>
                  Diff
                </button>
              </div>
            </div>
          </div>
          <div class="history-list show-refined" id="historyList"></div>
        </main>
      </div>
    </div>
    <div class="section" id="sec-meetings">
      <div class="meeting-layout">

        <!-- 1. MAIN MEETINGS HUB VIEW (Default landing view) -->
        <div class="meeting-subview" id="meetingHubView">
          <!-- Hub Top Bar -->
          <div class="meeting-hub-header">
            <div class="meeting-hub-title-group">
              <span class="meetings-count-pill" id="pastMeetingsCount">0 meetings</span>
            </div>
            
            <div class="meeting-hub-actions">
              <!-- Custom STT Model Dropdown -->
              <div class="custom-dropdown meeting-custom-dropdown" id="meetingModelDropdown">
                <button type="button" class="dropdown-trigger meeting-dropdown-btn" title="Meeting STT Model">
                  <svg class="meeting-picker-icon" viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>
                  <span id="meetingModelLabel">Tiny English</span>
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="dropdown-menu meeting-dropdown-menu" id="meetingModelMenu">
                  <!-- Populated dynamically -->
                </div>
              </div>

              <!-- Custom LLM Model Dropdown -->
              <div class="custom-dropdown meeting-custom-dropdown" id="meetingLLMDropdown">
                <button type="button" class="dropdown-trigger meeting-dropdown-btn" title="Meeting Summary Model">
                  <svg class="meeting-picker-icon" viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span id="meetingLLMLabel">Use Dictation Model</span>
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="dropdown-menu meeting-dropdown-menu" id="meetingLLMMenu">
                  <!-- Populated dynamically -->
                </div>
              </div>

              <!-- Meeting Bilingual Routing Toggle Pill -->
              <button type="button" id="meetingBilingualToggle" class="meeting-dropdown-btn bilingual-btn" title="Toggle Malayalam/English bilingual routing for this meeting">
                <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
                <span id="meetingBilingualLabel">English</span>
              </button>

              <!-- Browser Companion Extension Modal Trigger -->
              <button type="button" id="openCompanionModalBtn" class="meeting-dropdown-btn companion-btn" title="Setup Browser Extension for Zoom, Google Meet, Teams, Webex, Discord & Slack speaker names">
                <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/><line x1="3.95" y1="6.06" x2="8.54" y2="14"/><line x1="10.88" y1="21.94" x2="15.46" y2="14"/></svg>
                <span id="companionBtnText">Browser Extension</span>
                <span class="companion-status-dot disconnected" id="companionHeaderStatusDot" title="Extension Status"></span>
              </button>

              <!-- "+ New Meeting" Primary Button -->
              <button type="button" id="openNewMeetingModalBtn" class="meeting-new-btn">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                New Meeting
              </button>
            </div>
          </div>

          <!-- Meeting Cards Container (Scrollable) -->
          <div class="meetings-feed-wrapper">
            <!-- Empty State when 0 meetings exist -->
            <div class="meeting-hub-empty" id="meetingHubEmptyState" style="display: none;">
              <div class="empty-sparkle-icon">
                <svg viewBox="0 0 24 24" width="38" height="38" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/><circle cx="12" cy="12" r="10" stroke-opacity="0.2"/></svg>
              </div>
              <div class="empty-hub-title">No Meetings Yet</div>
              <p class="empty-hub-desc">Record conversations with dual-channel mic and system audio. LocalFlow automatically separates speakers and synthesizes executive minutes in the background.</p>
              <button type="button" class="meeting-new-btn large" id="emptyNewMeetingBtn">
                <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                Start First Meeting
              </button>
            </div>

            <!-- List of Meeting Rows (1 per row) -->
            <div class="meeting-rows-container" id="pastMeetingsList">
              <!-- Dynamically populated rows -->
            </div>
          </div>
        </div>

        <!-- 2. LIVE RECORDING STUDIO VIEW (Active during active recording) -->
        <div class="meeting-subview" id="meetingRecordingView" style="display: none;">
          <div class="recording-studio-header">
            <div class="recording-studio-meta">
              <div class="recording-badge-box">
                <span class="studio-pulse-dot"></span>
                <span class="studio-rec-tag">RECORDING</span>
              </div>
              <div class="studio-timer" id="meetingTimer">00:00:00</div>
              <div class="studio-title-display" id="studioMeetingTitleDisplay">Untitled Meeting</div>
            </div>

            <!-- Dual Audio VU meters -->
            <div class="meeting-levels-bar" id="meetingLevelsBar">
              <div class="level-metric" title="Microphone Level">
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/></svg>
                <span class="level-label">Mic</span>
                <div class="level-track"><div class="level-fill mic-fill" id="meetingMicMeter"></div></div>
              </div>
              <div class="level-metric" title="System Loopback Level">
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                <span class="level-label">System</span>
                <div class="level-track"><div class="level-fill sys-fill" id="meetingSysMeter"></div></div>
              </div>
            </div>

            <div class="recording-studio-actions">
              <span class="feed-count-badge" id="meetingSpeakerCount">0 speakers</span>
              <button type="button" id="stopMeetingBtn" class="meeting-stop-btn danger">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                End Meeting
              </button>
            </div>
          </div>

          <!-- Live Dialogue Stream -->
          <div class="studio-dialogue-pane">
            <div class="meeting-dialogue-list" id="meetingDialogueList">
              <div class="meeting-empty-state" id="meetingEmptyState">
                <div class="empty-icon-wrap">
                  <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
                </div>
                <div class="empty-title">Listening...</div>
                <p>Speak or play audio. Transcriptions with speaker separation will appear here live.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. MEETING DETAIL VIEW (Executive Minutes + Dialogue) -->
        <div class="meeting-subview" id="meetingDetailView" style="display: none;">
          <div class="detail-top-nav">
            <button type="button" class="detail-back-btn" id="meetingDetailBackBtn">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg>
              Meetings
            </button>
            <div class="detail-heading-group">
              <div class="detail-title" id="detailMeetingTitle">Meeting Details</div>
              <div class="detail-time-range" id="detailMeetingTimeRange">Oct 13, 2026 • 10:15 AM → 10:45 AM</div>
            </div>

            <!-- Detail Sub-tabs: Minutes vs Dialogue -->
            <div class="detail-tabs-group">
              <button type="button" class="detail-tab active" id="detailTabMinutes">Executive Minutes</button>
              <button type="button" class="detail-tab" id="detailTabDialogue">Dialogue</button>
            </div>

            <div class="detail-action-buttons">
              <button type="button" id="copyMeetingSummaryBtn" class="meeting-ghost-btn" title="Copy text">
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copy
              </button>
              <button type="button" id="regenSummaryBtn" class="meeting-ghost-btn" title="Regenerate summary with Gemma">
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                Regenerate
              </button>
              <button type="button" id="deleteMeetingDetailBtn" class="meeting-ghost-btn danger" title="Delete meeting">
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Delete
              </button>
            </div>
          </div>

          <div class="detail-content-area">
            <!-- Pane: Minutes & Summary -->
            <div class="detail-pane active" id="detailPaneMinutes">
              <div class="meeting-summary-full-wrapper" id="meetingSummaryContent">
                <!-- Minutes rendered here -->
              </div>
            </div>
            <!-- Pane: Dialogue -->
            <div class="detail-pane" id="detailPaneDialogue" style="display: none;">
              <div class="meeting-dialogue-list" id="detailDialogueList">
                <!-- Historical dialogue rendered here -->
              </div>
            </div>
          </div>
        </div>

        <!-- 4. NEW MEETING MODAL DIALOG -->
        <div class="new-meeting-modal-overlay" id="newMeetingModal" style="display: none;">
          <div class="new-meeting-modal-card">
            <div class="modal-card-header">
              <div class="modal-header-icon">
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>
              </div>
              <div class="modal-header-text">
                <h3>New Meeting</h3>
                <p>Dual-channel audio capture with instant speaker separation</p>
              </div>
              <button type="button" class="modal-close-icon" id="closeNewMeetingModalBtn">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div class="modal-body">
              <label class="modal-input-label" for="meetingTitleInput">Meeting Title</label>
              <input type="text" id="meetingTitleInput" class="modal-title-input" placeholder="e.g. Sprint Planning, Client Sync, Design Review..." autocomplete="off" />
              <div class="modal-features-hint">
                <div class="feature-hint-item">
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/></svg>
                  <span>Mic &amp; System Audio</span>
                </div>
                <div class="feature-hint-item">
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  <span>Background AI Summaries</span>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="modal-cancel-btn" id="cancelNewMeetingBtn">Cancel</button>
              <button type="button" class="modal-start-btn" id="startMeetingBtn">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>
                Start Recording
              </button>
            </div>
          </div>
        </div>

        <!-- 5. BROWSER EXTENSION SETUP MODAL (Method 3 Interactive Wizard) -->
        <div class="companion-modal-overlay" id="companionModal" style="display: none;">
          <div class="companion-modal-card">
            <!-- Modal Header -->
            <div class="modal-card-header">
              <div class="modal-header-icon companion-icon-badge">
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/><line x1="3.95" y1="6.06" x2="8.54" y2="14"/><line x1="10.88" y1="21.94" x2="15.46" y2="14"/></svg>
              </div>
              <div class="modal-header-text">
                <h3>Browser Meeting Companion</h3>
                <p>Isolates speaker audio &amp; captures names on Google Meet, Zoom, Teams, Webex, Discord &amp; Slack</p>
              </div>
              <button type="button" class="modal-close-icon" id="closeCompanionModalBtn">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div class="modal-body companion-modal-body">
              <!-- Step Progress Indicators -->
              <div class="companion-stepper">
                <div class="step-pill active" id="stepPill1">
                  <span class="step-num">1</span> Choose Browser
                </div>
                <div class="step-connector"></div>
                <div class="step-pill" id="stepPill2">
                  <span class="step-num">2</span> Load Unpacked
                </div>
                <div class="step-connector"></div>
                <div class="step-pill" id="stepPill3">
                  <span class="step-num">3</span> Connected
                </div>
              </div>

              <!-- VIEW 1: Choose Browser -->
              <div class="companion-step-view active" id="companionStep1View">
                <div class="companion-step-heading">
                  <h4>Select Your Browser</h4>
                  <p>LocalFlow automatically detects installed Chromium browsers on your computer.</p>
                </div>
                <div class="browser-cards-grid" id="installedBrowsersGrid">
                  <!-- Dynamically populated browser cards -->
                </div>
              </div>

              <!-- VIEW 2: 1-Click Launch & Load Unpacked Guide -->
              <div class="companion-step-view" id="companionStep2View" style="display: none;">
                <div class="companion-step-heading">
                  <h4 id="selectedBrowserTitle">Install on Google Chrome</h4>
                  <p>Follow the 2 simple steps below. The extension folder has been opened and copied to your clipboard!</p>
                </div>

                <div class="animated-guide-container">
                  <div class="guide-card">
                    <div class="guide-card-badge">Step A</div>
                    <div class="guide-card-content">
                      <div class="guide-card-title">Turn ON "Developer mode"</div>
                      <p class="guide-card-desc">Toggle the Developer Mode switch in the top-right corner of your browser's extensions page.</p>
                      <div class="guide-visual-toggle">
                        <span>Developer mode</span>
                        <div class="mock-toggle on"><div class="mock-toggle-circle"></div></div>
                      </div>
                    </div>
                  </div>

                  <div class="guide-card">
                    <div class="guide-card-badge">Step B</div>
                    <div class="guide-card-content">
                      <div class="guide-card-title">Click "Load unpacked" &amp; Select Folder</div>
                      <p class="guide-card-desc">Click <strong>Load unpacked</strong> at the top left. Paste the path or select the folder we opened in Explorer.</p>
                      <div class="guide-path-box">
                        <span id="extensionFolderPathDisplay">C:\LocalFlow\extension</span>
                        <button type="button" class="copy-path-btn" id="copyExtPathBtn" title="Copy Folder Path">
                          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          <span id="copyExtPathBtnText">Copy</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Launch Button Action -->
                <div class="launch-action-bar">
                  <button type="button" class="browser-relaunch-btn" id="relaunchBrowserBtn">
                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Re-open Browser Extensions &amp; Folder
                  </button>
                </div>
              </div>

              <!-- VIEW 3: Real-Time Connection Status -->
              <div class="companion-status-indicator-bar" id="companionConnectionBar">
                <div class="status-pulse-circle disconnected" id="companionPulseDot"></div>
                <div class="status-info-text">
                  <span class="status-main-label" id="companionMainStatusLabel">Waiting for connection...</span>
                  <span class="status-sub-label" id="companionSubStatusLabel">Open Google Meet, Zoom, Teams, Webex, Discord or Slack in your browser to begin streaming</span>
                </div>
              </div>
            </div>

            <div class="modal-footer companion-modal-footer">
              <button type="button" class="modal-cancel-btn" id="companionBackBtn" style="display: none;">Back to Browsers</button>
              <button type="button" class="modal-start-btn" id="companionDoneBtn">Done</button>
            </div>
          </div>
        </div>

      </div>
    </div>
    <div class="section" id="sec-insights">
      <div class="insights-wrap" id="insightsRoot"></div>
    </div>
    <div class="section" id="sec-dictionary">
      <div class="personalization-layout">
        
        <!-- Intro Banner -->
        <div class="personalization-intro-card">
          <div class="personalization-intro-icon">
            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
              <path d="M6 6h10M6 10h10"/>
            </svg>
          </div>
          <div class="personalization-intro-content">
            <h2 class="personalization-intro-title">Custom Vocabulary & Keywords</h2>
            <p class="personalization-intro-desc">
              Prime speech recognition with domain names, jargon, acronyms, and specialized technical terms. Whisper biases towards these phrases during transcription.
            </p>
          </div>
        </div>

        <!-- Token Usage & Word Manager Card -->
        <div class="personalization-card">
          <div class="personalization-card-header no-collapse">
            <div class="personalization-card-title-group">
              <div class="personalization-card-badge">Context Budget</div>
              <div>
                <h3 class="personalization-card-title">Whisper Context Usage</h3>
                <p class="personalization-card-subtitle">Custom keywords share Whisper's 224-token prompt context window.</p>
              </div>
            </div>
            <span id="dictTokenBadge" class="badge">0 / 224 tokens</span>
          </div>

          <div class="personalization-card-body open">
            <div class="model-progress-bar-bg" style="height: 6px; width: 100%; border-radius: 9999px;">
              <div id="dictTokenProgress" class="model-progress-bar-fill" style="width: 0%; transition: width 0.3s ease;"></div>
            </div>

            <!-- Add Keyword Input Bar -->
            <div class="mapping-creator-bar" style="align-items: center; margin-top: 4px;">
              <div class="mapping-input-col">
                <input type="text" id="dictWordInput" class="brutal-input personalization-input" placeholder="Add a custom word, brand name, or technical phrase..." />
              </div>
              <button id="addDictWordBtn" class="kbd-btn personalization-add-btn">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Keyword
              </button>
            </div>

            <!-- Existing Keywords List Container -->
            <div class="mappings-list-container">
              <div class="mappings-list-header">
                <span>Active Vocabulary</span>
              </div>
              <div id="dictWordsList" class="dict-chips-grid">
                <!-- Words listed as interactive pill chips -->
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
    <div class="section" id="sec-models">
      <!-- TOP: DOWNLOADED MODELS -->
      <div class="setting-group" id="groupDownloadedSTT" style="margin-bottom: 24px;">
        <label>Speech to Text</label>
        <div id="modelsDownloadedSTT"></div>
      </div>
      <div class="setting-group" id="groupDownloadedLLM" style="margin-bottom: 32px;">
        <label>Text Refinement</label>
        <div id="modelsDownloadedLLM"></div>
      </div>

      <!-- BOTTOM: AVAILABLE TO DOWNLOAD -->
      <div style="margin-top: 36px; padding-top: 24px; border-top: 1px solid var(--border);">
        <div class="setting-group" id="groupAvailableSTT" style="margin-bottom: 24px;">
          <label>Download Speech to Text Models</label>
          <div id="modelsAvailableSTT"></div>
        </div>
        <div class="setting-group" id="groupAvailableLLM">
          <label>Download Text Refinement Models</label>
          <div id="modelsAvailableLLM"></div>
        </div>
      </div>
    </div>
    <div class="section" id="sec-settings">
      <div class="settings-container">
        
        <!-- AUDIO & ACCELERATION -->
        <div class="settings-group-section">
          <div class="settings-section-header">
            <span class="settings-section-tag">Audio & Acceleration</span>
            <p class="settings-section-desc">Configure audio input devices, processing engines, and mic gain</p>
          </div>
          <div class="settings-card">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Microphone</span>
                <span class="setting-desc">Speech input capture device</span>
              </div>
              <div class="custom-dropdown" id="micDropdown">
                <button class="dropdown-trigger">
                  <span id="micLabel">Default</span>
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="dropdown-menu" id="micDropdownMenu" style="min-width: 200px; max-width: 320px; max-height: 250px; overflow-y: auto;">
                  <div class="dropdown-item active" data-value="Default">Default</div>
                </div>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Processing Engine</span>
                <span class="setting-desc">Acceleration backend for whisper & models</span>
              </div>
              <div class="engine-toggle" role="group" aria-label="Processing engine">
                <button type="button" class="engine-option active" id="engineCpuBtn" data-engine="cpu">CPU</button>
                <button type="button" class="engine-option" id="engineVulkanBtn" data-engine="vulkan">Vulkan</button>
              </div>
            </div>

            <div class="setting-row" id="gpuSelectionItem" style="display: none;">
              <div class="setting-info">
                <span class="setting-title">Graphics Device</span>
                <span class="setting-desc">Target GPU accelerator for inference</span>
              </div>
              <div class="custom-dropdown" id="gpuDropdown">
                <button class="dropdown-trigger">
                  <span id="gpuLabel">Default</span>
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="dropdown-menu" id="gpuDropdownMenu" style="min-width: 200px; max-width: 320px; max-height: 250px; overflow-y: auto;">
                  <div class="dropdown-item active" data-value="Default">Default</div>
                </div>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Playback Volume</span>
                <span class="setting-desc">History audio preview volume multiplier</span>
              </div>
              <div style="display: flex; align-items: center; gap: 12px;">
                <input type="range" id="ampSlider" min="1" max="10" step="0.5" value="1" class="brutal-slider" style="width: 120px;">
                <span id="ampValue" class="badge">1.0x</span>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Mic Gain Boost</span>
                <span class="setting-desc">Pre-amplify quiet microphone recordings</span>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="boostToggle">
                <span class="toggle-track"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- BILINGUAL ROUTING -->
        <div class="settings-group-section">
          <div class="settings-section-header">
            <span class="settings-section-tag">Bilingual Routing</span>
            <p class="settings-section-desc">Auto-detect speech and switch between English and Malayalam</p>
          </div>
          <div class="settings-card">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Automatic Language Routing</span>
                <span class="setting-desc">Route speech to Whisper or Conformer based on detected language</span>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="bilingualRoutingToggle">
                <span class="toggle-track"></span>
              </label>
            </div>

            <div class="setting-row bilingual-setting" id="bilingualWhisperModelSelection" style="display: none;">
              <div class="setting-info">
                <span class="setting-title">English Model</span>
                <span class="setting-desc">Active model for English speech</span>
              </div>
              <div class="custom-dropdown" id="bilingualWhisperDropdown">
                <button class="dropdown-trigger">
                  <span id="bilingualWhisperLabel">ggml-tiny.en.bin</span>
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="dropdown-menu" id="bilingualWhisperDropdownMenu" style="min-width: 200px; max-width: 320px; max-height: 250px; overflow-y: auto;">
                </div>
              </div>
            </div>

            <div class="setting-row bilingual-setting" id="bilingualConformerModelSelection" style="display: none;">
              <div class="setting-info">
                <span class="setting-title">Malayalam Model</span>
                <span class="setting-desc">Active model for Malayalam speech</span>
              </div>
              <div class="custom-dropdown" id="bilingualConformerDropdown">
                <button class="dropdown-trigger">
                  <span id="bilingualConformerLabel">indicconformer.int8.onnx</span>
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="dropdown-menu" id="bilingualConformerDropdownMenu" style="min-width: 200px; max-width: 320px; max-height: 250px; overflow-y: auto;">
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- AI REFINEMENT & INTELLIGENCE -->
        <div class="settings-group-section">
          <div class="settings-section-header">
            <span class="settings-section-tag">AI Refinement & Intelligence</span>
            <p class="settings-section-desc">Local LLM punctuation, grammar correction, and tone customization</p>
          </div>
          <div class="settings-card">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Enable Refinement</span>
                <span class="setting-desc">Process dictations through a local neural model</span>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="llmEnabledToggle">
                <span class="toggle-track"></span>
              </label>
            </div>

            <div class="setting-row llm-choice-setting" id="llmThinkingSelection">
              <div class="setting-info">
                <span class="setting-title">Reasoning Steps</span>
                <span class="setting-desc">Enable chain-of-thought output on supported models</span>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="llmThinkingToggle">
                <span class="toggle-track"></span>
              </label>
            </div>

            <div class="setting-row llm-choice-setting" id="llmManglishSelection">
              <div class="setting-info">
                <span class="setting-title">Transliterate to Manglish</span>
                <span class="setting-desc">Convert Malayalam speech to Latin characters</span>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="llmManglishToggle">
                <span class="toggle-track"></span>
              </label>
            </div>

            <div class="setting-row-stacked llm-choice-setting" id="llmModeSelection">
              <div class="setting-info">
                <span class="setting-title">Refinement Strength</span>
                <span class="setting-desc">Determines how substantially phrasing may be edited</span>
              </div>
              <div class="llm-choice-grid llm-mode-grid" id="llmModeOptions" role="group" aria-label="Refinement strength">
                <button type="button" class="llm-choice" data-value="minimal" aria-pressed="false">
                  <span class="llm-choice-heading"><strong>Minimal</strong></span>
                  <span class="setting-desc" style="font-size: 12px;">Proofread errors only</span>
                </button>
                <button type="button" class="llm-choice" data-value="low" aria-pressed="true">
                  <span class="llm-choice-heading"><strong>Low</strong></span>
                  <span class="setting-desc" style="font-size: 12px;">Remove stutters & fillers</span>
                </button>
                <button type="button" class="llm-choice" data-value="medium" aria-pressed="false">
                  <span class="llm-choice-heading"><strong>Medium</strong></span>
                  <span class="setting-desc" style="font-size: 12px;">Clarify sentence flow</span>
                </button>
                <button type="button" class="llm-choice" data-value="high" aria-pressed="false">
                  <span class="llm-choice-heading"><strong>High</strong></span>
                  <span class="setting-desc" style="font-size: 12px;">Full rewrite & polish</span>
                </button>
              </div>
            </div>

            <div class="setting-row-stacked llm-choice-setting" id="llmToneSelection">
              <div class="setting-info">
                <span class="setting-title">Writing Tone</span>
                <span class="setting-desc">Stylistic preference for refined transcription</span>
              </div>
              <div class="llm-choice-grid llm-tone-grid" id="llmToneOptions" role="group" aria-label="Refinement tone">
                <button type="button" class="llm-choice" data-value="auto" aria-pressed="true">
                  <span class="llm-choice-heading"><strong>Auto</strong></span>
                  <span class="setting-desc" style="font-size: 12px;">Preserve your voice</span>
                </button>
                <button type="button" class="llm-choice" data-value="casual" aria-pressed="false">
                  <span class="llm-choice-heading"><strong>Casual</strong></span>
                  <span class="setting-desc" style="font-size: 12px;">Friendly & relaxed</span>
                </button>
                <button type="button" class="llm-choice" data-value="concise" aria-pressed="false">
                  <span class="llm-choice-heading"><strong>Concise</strong></span>
                  <span class="setting-desc" style="font-size: 12px;">Direct & brief</span>
                </button>
                <button type="button" class="llm-choice" data-value="professional" aria-pressed="false">
                  <span class="llm-choice-heading"><strong>Work</strong></span>
                  <span class="setting-desc" style="font-size: 12px;">Polished & workplace-ready</span>
                </button>
              </div>
            </div>

            <div class="setting-row llm-choice-setting" id="llmContextSizeSelection">
              <div class="setting-info">
                <span class="setting-title">Context Window</span>
                <span class="setting-desc">Token limit for refinement memory</span>
              </div>
              <div style="display: flex; align-items: center; gap: 12px;">
                <input type="range" id="llmContextSlider" min="0" max="4" step="1" value="1" class="brutal-slider" style="width: 140px;">
                <span id="llmContextLabel" class="badge">4K</span>
              </div>
            </div>
          </div>
        </div>

        <!-- HOTKEYS & SYSTEM BEHAVIOR -->
        <div class="settings-group-section">
          <div class="settings-section-header">
            <span class="settings-section-tag">Hotkeys & System</span>
            <p class="settings-section-desc">Global triggers, system startup, and application theme</p>
          </div>
          <div class="settings-card">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Dictation Keybind</span>
                <span class="setting-desc">Hold or press shortcut to trigger speech dictation</span>
              </div>
              <button id="remapBtn" class="kbd-btn">
                <kbd id="k1Label">Ctrl</kbd> <span class="kbd-plus">+</span> <kbd id="k2Label">Win</kbd>
              </button>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Dedicated Copilot Key</span>
                <span class="setting-desc">Trigger dictation directly via Windows Copilot key</span>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="copilotKeyToggle">
                <span class="toggle-track"></span>
              </label>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Launch on Startup</span>
                <span class="setting-desc">Start LocalFlow automatically when Windows boots</span>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="startupToggle">
                <span class="toggle-track"></span>
              </label>
            </div>

            <div class="setting-row" id="startMinimizedItem">
              <div class="setting-info">
                <span class="setting-title">Start Minimized</span>
                <span class="setting-desc">Launch silently to the Windows system tray</span>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="startMinimizedToggle">
                <span class="toggle-track"></span>
              </label>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Theme</span>
                <span class="setting-desc">Interface appearance style</span>
              </div>
              <div class="custom-dropdown" id="themeDropdown">
                <button class="dropdown-trigger">
                  <span id="themeLabel">Dark Mode</span>
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="dropdown-menu">
                  <div class="dropdown-item" data-value="light">Light Mode</div>
                  <div class="dropdown-item" data-value="dark">Dark Mode</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- STORAGE & RETENTION -->
        <div class="settings-group-section">
          <div class="settings-section-header">
            <span class="settings-section-tag">Storage & Retention</span>
            <p class="settings-section-desc">Manage local audio recordings, history retention, and database cache</p>
          </div>
          <div class="settings-card">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Audio Retention</span>
                <span class="setting-desc">Lifespan of recorded WAV audio files on disk</span>
              </div>
              <div class="custom-dropdown" id="audioRetentionDropdown">
                <button class="dropdown-trigger">
                  <span id="audioRetentionLabel">7 Days</span>
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="dropdown-menu">
                  <div class="dropdown-item" data-value="1">1 Day</div>
                  <div class="dropdown-item" data-value="3">3 Days</div>
                  <div class="dropdown-item" data-value="7">7 Days</div>
                  <div class="dropdown-item" data-value="14">14 Days</div>
                  <div class="dropdown-item" data-value="30">30 Days</div>
                  <div class="dropdown-item" data-value="-1">Forever</div>
                </div>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Transcription Retention</span>
                <span class="setting-desc">Lifespan of dictation text history (stats preserved)</span>
              </div>
              <div class="custom-dropdown" id="transcriptionRetentionDropdown">
                <button class="dropdown-trigger">
                  <span id="transcriptionRetentionLabel">30 Days</span>
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="dropdown-menu">
                  <div class="dropdown-item" data-value="7">7 Days</div>
                  <div class="dropdown-item" data-value="14">14 Days</div>
                  <div class="dropdown-item" data-value="30">30 Days</div>
                  <div class="dropdown-item" data-value="90">90 Days</div>
                  <div class="dropdown-item" data-value="180">180 Days</div>
                  <div class="dropdown-item" data-value="-1">Forever</div>
                </div>
              </div>
            </div>

            <div class="setting-row" style="align-items: flex-start;">
              <div class="setting-info" style="flex: 1;">
                <span class="setting-title">Storage Directory</span>
                <span class="setting-desc">Location of local database, cache and models</span>
                <div id="dataFolderDesc" style="font-family: monospace; font-size: 11px; background: var(--bg-sidebar); border: 1px solid var(--border); padding: 8px 12px; border-radius: 8px; color: var(--text-secondary); word-break: break-all; margin-top: 8px; max-width: 460px;">
                  Default
                </div>
              </div>
              <button id="selectFolderBtn" class="kbd-btn" style="padding: 8px 16px; font-weight: 600; margin-top: 2px;">
                Change
              </button>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-title">Cache Maintenance</span>
                <span class="setting-desc">Remove expired audio recordings and historical records</span>
              </div>
              <button id="purgeNowBtn" class="kbd-btn" style="padding: 8px 16px; background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.25); color: #ef4444; font-weight: 600;">
                Clean Cache Now
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
    <div class="section" id="sec-manglish">
      <div class="personalization-layout">
        
        <!-- Header Banner / Intro -->
        <div class="personalization-intro-card">
          <div class="personalization-intro-icon">
            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </div>
          <div class="personalization-intro-content">
            <h2 class="personalization-intro-title">Language Personalization & Transliteration</h2>
            <p class="personalization-intro-desc">
              Teach the refinement AI your personal writing habits, phrasing style, and word-by-word transliteration preferences from Malayalam into Manglish.
            </p>
          </div>
        </div>

        <!-- Section 1: Transliteration Tone & Phrasing Examples -->
        <div class="personalization-card open" id="manglishPanel">
          <div class="personalization-card-header" id="manglishPanelHeader" role="button" tabindex="0" aria-expanded="true">
            <div class="personalization-card-title-group">
              <div class="personalization-card-badge">Style Guide</div>
              <div>
                <h3 class="personalization-card-title">Transliteration Style & Phrasing Examples</h3>
                <p class="personalization-card-subtitle">Provide your preferred Latin script spelling for common Malayalam phrases. The model will adapt to match your rhythm.</p>
              </div>
            </div>
            <div class="personalization-chevron-wrap">
              <svg class="models-panel-chevron" id="manglishPanelChevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transform: rotate(90deg); transition: transform 0.2s ease;">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </div>

          <div class="personalization-card-body" id="manglishPanelBody">
            <div class="examples-grid">
              
              <!-- Example 1 -->
              <div class="example-box">
                <div class="example-box-header">
                  <span class="example-num">01</span>
                  <span class="example-malayalam-prompt">ഹലോ സുഖമാണോ എന്ത് ചെയ്യുന്നു</span>
                </div>
                <input type="text" id="manglishEx1" class="brutal-input personalization-input" placeholder="e.g. Hello, sukhamano enth cheyyunnu?" />
              </div>

              <!-- Example 2 -->
              <div class="example-box">
                <div class="example-box-header">
                  <span class="example-num">02</span>
                  <span class="example-malayalam-prompt">എനിക്ക് നാളെ വരാൻ പറ്റില്ല</span>
                </div>
                <input type="text" id="manglishEx2" class="brutal-input personalization-input" placeholder="e.g. Enik naale varaan pattilla." />
              </div>

              <!-- Example 3 -->
              <div class="example-box">
                <div class="example-box-header">
                  <span class="example-num">03</span>
                  <span class="example-malayalam-prompt">നീ നാളെ കോളേജിൽ വരുന്നുണ്ടോ? നമുക്ക് ഒരുമിച്ച് പോകാം.</span>
                </div>
                <input type="text" id="manglishEx3" class="brutal-input personalization-input" placeholder="e.g. Nee naale collegil varunnundo? Namukku orumichu pokam." />
              </div>

              <!-- Example 4 -->
              <div class="example-box">
                <div class="example-box-header">
                  <span class="example-num">04</span>
                  <span class="example-malayalam-prompt">ഞാൻ ആ കാര്യം അവളോട് പറഞ്ഞു, പക്ഷെ അവൾക്ക് മനസ്സിലായില്ല.</span>
                </div>
                <input type="text" id="manglishEx4" class="brutal-input personalization-input" placeholder="e.g. Njan aa kaaryam avalodu paranju, pakshe avalkku manassilayilla." />
              </div>

              <!-- Example 5 -->
              <div class="example-box">
                <div class="example-box-header">
                  <span class="example-num">05</span>
                  <span class="example-malayalam-prompt">നീ ആ ഫയൽ എനിക്ക് വാട്സാപ്പിൽ അയച്ചു തരുമോ? ഞാൻ ഇപ്പോഴേ ഡൗൺലോഡ് ചെയ്യാം.</span>
                </div>
                <input type="text" id="manglishEx5" class="brutal-input personalization-input" placeholder="e.g. Nee aa file enikk WhatsAppil ayachu tharumo? Njan ippozhe download cheyyam." />
              </div>

            </div>

            <div class="personalization-actions">
              <span class="personalization-tip">Note: Use Latin/English script characters only.</span>
              <button id="saveManglishExBtn" class="kbd-btn personalization-save-btn">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Save Preferences
              </button>
            </div>
          </div>
        </div>

        <!-- Section 2: Exact Word-Level Transliteration Mappings -->
        <div class="personalization-card">
          <div class="personalization-card-header no-collapse">
            <div class="personalization-card-title-group">
              <div class="personalization-card-badge">Dictionary Mappings</div>
              <div>
                <h3 class="personalization-card-title">Word-Level Transliteration Rules</h3>
                <p class="personalization-card-subtitle">Force exact word replacements during refinement (e.g. rewrite "ഹലോ" directly into "Hello").</p>
              </div>
            </div>
          </div>

          <div class="personalization-card-body open">
            <!-- Add New Mapping Bar -->
            <div class="mapping-creator-bar">
              <div class="mapping-input-col">
                <label class="mapping-input-label">Malayalam Word</label>
                <input type="text" id="translitMalInput" class="brutal-input personalization-input" placeholder="e.g. ഹലോ" />
              </div>
              <div class="mapping-arrow-indicator">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </div>
              <div class="mapping-input-col">
                <label class="mapping-input-label">Preferred Latin Spelling</label>
                <input type="text" id="translitEngInput" class="brutal-input personalization-input" placeholder="e.g. Hello" />
              </div>
              <button id="addTranslitBtn" class="kbd-btn personalization-add-btn">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Rule
              </button>
            </div>

            <!-- Existing Mappings List -->
            <div class="mappings-list-container">
              <div class="mappings-list-header">
                <span>Configured Word Rules</span>
              </div>
              <div id="translitWordsList" class="mappings-list-body">
                <!-- Dynamic entries -->
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
    </div>
  </div>
`;

settingsOverlay.appendChild(settingsModal);
root.appendChild(settingsOverlay);
root.appendChild(moduleNode);

// Custom confirm modal for cleanups
export const confirmModalOverlay = document.createElement('div');
confirmModalOverlay.className = 'custom-modal-overlay';
confirmModalOverlay.id = 'confirmModal';
confirmModalOverlay.innerHTML = `
  <div class="custom-modal">
    <h3>Clear All Cache?</h3>
    <p>This will permanently delete all raw audio files and transcription texts. Your historical stats will be preserved.</p>
    <div class="modal-actions">
      <button class="modal-btn cancel" id="confirmModalCancel">Cancel</button>
      <button class="modal-btn confirm" id="confirmModalConfirm">Clear Everything</button>
    </div>
  </div>
`;
root.appendChild(confirmModalOverlay);

// Onboarding overlay
export const onboardingOverlay = document.createElement('div');
onboardingOverlay.className = 'onboarding-overlay';
onboardingOverlay.id = 'onboardingOverlay';
onboardingOverlay.innerHTML = `
  <div class="onboarding-card" id="onboardingCard">
    <!-- content injected dynamically -->
  </div>
`;
root.appendChild(onboardingOverlay);
export const onboardingCard = onboardingOverlay.querySelector('#onboardingCard');
