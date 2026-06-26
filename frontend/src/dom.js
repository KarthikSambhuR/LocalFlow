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
      <div class="nav-item" data-section="home">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        Home
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
        <div class="app-version-label" id="appVersionLabel">LocalFlow v1.0.0</div>
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
    <div class="section" id="sec-insights">
      <div class="insights-wrap" id="insightsRoot"></div>
    </div>
    <div class="section" id="sec-dictionary">
      <div class="dict-layout" style="display: flex; flex-direction: column; gap: 24px; max-width: 800px;">
        <div class="section-kicker" style="margin-bottom: 0;">Dictionary & Keywords</div>
        
        <!-- Token Progress Bar -->
        <div class="setting-item" style="flex-direction: column; align-items: stretch; gap: 12px; padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <div class="setting-info">
              <span class="setting-title" style="font-size: 15px;">Whisper Context Usage</span>
              <span class="setting-desc" style="font-size: 12px;">Prompt tokens used by custom vocabulary. Whisper supports up to 224 context tokens.</span>
            </div>
            <span id="dictTokenBadge" class="badge">0 / 224 tokens</span>
          </div>
          <div class="model-progress-bar-bg" style="height: 8px; width: 100%;">
            <div id="dictTokenProgress" class="model-progress-bar-fill" style="width: 0%; transition: width 0.3s ease;"></div>
          </div>
        </div>

        <!-- Word List like Todo list -->
        <div class="todo-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; padding: 24px; display: flex; flex-direction: column; gap: 20px;">
          <div style="display: flex; gap: 12px; width: 100%;">
            <input type="text" id="dictWordInput" class="brutal-input" style="flex: 1; height: 42px; box-sizing: border-box; border-radius: 12px;" placeholder="Add a custom word or phrase..." />
            <button id="addDictWordBtn" class="kbd-btn" style="padding: 0 24px; font-weight: 700; height: 42px; box-sizing: border-box; border-radius: 12px; background: var(--accent-soft); color: var(--accent); border-color: var(--accent);">Add</button>
          </div>

          <div class="dict-todo-list-wrapper" style="border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--bg-sidebar); width: 100%;">
            <div id="dictWordsList" style="display: flex; flex-direction: column; gap: 0; max-height: 400px; overflow-y: auto;">
              <!-- Words listed as row items with delete checkbox/button -->
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="section" id="sec-settings">
      <div class="setting-group">
        <label>Audio Settings</label>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Playback Amplifier</span>
            <span class="setting-desc">Boost volume of history playback</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <input type="range" id="ampSlider" min="1" max="10" step="0.5" value="1" class="brutal-slider">
            <span id="ampValue" class="badge">1.0x</span>
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Boost Whisper Input</span>
            <span class="setting-desc">Apply amp gain heavily to the microphone feed prior to AI transcription</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="boostToggle">
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Processing Engine</span>
            <span class="setting-desc">Use Vulkan acceleration when your GPU and drivers support it</span>
          </div>
          <div class="engine-toggle" role="group" aria-label="Processing engine">
            <button type="button" class="engine-option active" id="engineCpuBtn" data-engine="cpu">CPU</button>
            <button type="button" class="engine-option" id="engineVulkanBtn" data-engine="vulkan">Vulkan</button>
          </div>
        </div>
        <div class="setting-item" id="gpuSelectionItem" style="display: none;">
          <div class="setting-info">
            <span class="setting-title">Graphics Device</span>
            <span class="setting-desc">Select which GPU device to accelerate transcription</span>
          </div>
          <div class="custom-dropdown" id="gpuDropdown">
            <button class="dropdown-trigger">
              <span id="gpuLabel">Default</span>
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="dropdown-menu" id="gpuDropdownMenu" style="min-width: 200px; max-width: 400px; max-height: 250px; overflow-y: auto;">
              <div class="dropdown-item active" data-value="Default">Default</div>
            </div>
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Input Microphone</span>
            <span class="setting-desc">Choose which audio device dictates to AI transcription</span>
          </div>
          <div class="custom-dropdown" id="micDropdown">
            <button class="dropdown-trigger">
              <span id="micLabel">Default</span>
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="dropdown-menu" id="micDropdownMenu" style="min-width: 200px; max-width: 400px; max-height: 250px; overflow-y: auto;">
              <div class="dropdown-item active" data-value="Default">Default</div>
            </div>
          </div>
        </div>
        <div id="modelListWhisper" style="margin-top: 20px;"></div>
      </div>
      <div class="setting-group">
        <label>LLM Refinement (llama.cpp)</label>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Enable Refinement</span>
            <span class="setting-desc">Improve grammar and formatting using a local LLM server</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="llmEnabledToggle">
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="setting-item llm-choice-setting" id="llmThinkingSelection">
          <div class="setting-info">
            <span class="setting-title">Enable Thinking / Reasoning</span>
            <span class="setting-desc">Allow reasoning models (like Gemma 4 E2B) to output thinking steps. Turn off for faster, direct answers.</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="llmThinkingToggle">
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="setting-item llm-choice-setting" id="llmManglishSelection">
          <div class="setting-info">
            <span class="setting-title">Convert Malayalam to Manglish</span>
            <span class="setting-desc">Transliterate Malayalam text to English letters (Latin script) using refinement</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="llmManglishToggle">
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="setting-item llm-choice-setting" id="llmModeSelection">
          <div class="setting-info">
            <span class="setting-title">Refinement strength</span>
            <span class="setting-desc">Choose how freely LocalFlow can change your original wording.</span>
          </div>
          <div class="llm-choice-grid llm-mode-grid" id="llmModeOptions" role="group" aria-label="Refinement strength">
            <button type="button" class="llm-choice" data-value="minimal" aria-pressed="false">
              <span class="llm-choice-heading"><strong>Minimal</strong><span>Proofread</span></span>
              <span>Fixes clear transcription, spelling, capitalization, and punctuation errors only.</span>
            </button>
            <button type="button" class="llm-choice" data-value="low" aria-pressed="true">
              <span class="llm-choice-heading"><strong>Low</strong><span>Clean up</span></span>
              <span>Removes obvious stutters and filler while keeping your wording and structure.</span>
            </button>
            <button type="button" class="llm-choice" data-value="medium" aria-pressed="false">
              <span class="llm-choice-heading"><strong>Medium</strong><span>Clarify</span></span>
              <span>Lightly rephrases awkward sentences and improves flow without changing detail.</span>
            </button>
            <button type="button" class="llm-choice" data-value="high" aria-pressed="false">
              <span class="llm-choice-heading"><strong>High</strong><span>Polish</span></span>
              <span>Freely restructures the transcript into a polished, readable version.</span>
            </button>
          </div>
        </div>
        <div class="setting-item llm-choice-setting" id="llmToneSelection">
          <div class="setting-info">
            <span class="setting-title">Tone</span>
            <span class="setting-desc">Set the writing style. Refinement strength still limits how much wording can change.</span>
          </div>
          <div class="llm-choice-grid llm-tone-grid" id="llmToneOptions" role="group" aria-label="Refinement tone">
            <button type="button" class="llm-choice" data-value="auto" aria-pressed="true">
              <span class="llm-choice-heading"><strong>Auto</strong><span>Keep my voice</span></span>
              <span>Preserves the natural tone and level of formality in your transcript.</span>
            </button>
            <button type="button" class="llm-choice" data-value="casual" aria-pressed="false">
              <span class="llm-choice-heading"><strong>Casual</strong><span>Friendly</span></span>
              <span>Uses warm, relaxed, conversational phrasing.</span>
            </button>
            <button type="button" class="llm-choice" data-value="concise" aria-pressed="false">
              <span class="llm-choice-heading"><strong>Concise</strong><span>Direct</span></span>
              <span>Trims avoidable wordiness while keeping useful context.</span>
            </button>
            <button type="button" class="llm-choice" data-value="professional" aria-pressed="false">
              <span class="llm-choice-heading"><strong>Professional</strong><span>Work-ready</span></span>
              <span>Uses polished, precise, workplace-appropriate phrasing.</span>
            </button>
          </div>
        </div>
        <div class="setting-item llm-choice-setting" id="llmContextSizeSelection">
          <div class="setting-info">
            <span class="setting-title">Context Window</span>
            <span class="setting-desc">Max tokens the model reads at once. Higher values use more RAM.</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
            <input type="range" id="llmContextSlider" min="0" max="4" step="1" value="1" class="brutal-slider" style="flex: 1; width: 100%;">
            <span id="llmContextLabel" class="badge">4K</span>
          </div>
        </div>
        <div id="modelListLLM" style="margin-top: 20px;"></div>
      </div>
      <div class="setting-group">
        <label>Startup</label>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Start LocalFlow on system startup</span>
            <span class="setting-desc">Automatically launch application when you log in</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="startupToggle">
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="setting-item" id="startMinimizedItem">
          <div class="setting-info">
            <span class="setting-title">Start minimized</span>
            <span class="setting-desc">Launch in the tray instead of opening Home</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="startMinimizedToggle">
            <span class="toggle-track"></span>
          </label>
        </div>
      </div>
      <div class="setting-group">
        <label>Appearance</label>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Theme</span>
            <span class="setting-desc">Toggle interface appearance</span>
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
      <div class="setting-group">
        <label>Trigger Keybind</label>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Active Combination</span>
            <span class="setting-desc">Click the button to remap your hotkeys</span>
          </div>
          <button id="remapBtn" class="kbd-btn">
            <kbd id="k1Label">Ctrl</kbd> <span class="kbd-plus">+</span> <kbd id="k2Label">Win</kbd>
          </button>
        </div>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Use Copilot Key</span>
            <span class="setting-desc">Use the dedicated Copilot key on your keyboard as trigger</span>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="copilotKeyToggle">
            <span class="toggle-track"></span>
          </label>
        </div>
      </div>
      <div class="setting-group">
        <label>Storage & Cache</label>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Audio Files Lifespan</span>
            <span class="setting-desc">How long audio recordings (.wav) are kept on disk</span>
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
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Transcription Lifespan</span>
            <span class="setting-desc">How long dictation text is kept (analytics are kept forever)</span>
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
        <div class="setting-item" style="flex-direction: column; align-items: stretch; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div class="setting-info">
              <span class="setting-title">Data Storage Directory</span>
              <span class="setting-desc">Folder where database, cache, and all audio files are saved</span>
            </div>
            <button id="selectFolderBtn" class="kbd-btn" style="padding: 6px 12px; font-weight: 500;">
              Change Folder
            </button>
          </div>
          <div id="dataFolderDesc" style="font-family: monospace; font-size: 11px; background: var(--bg-sidebar); border: 1px dashed var(--border); padding: 8px 12px; border-radius: 6px; color: var(--text-secondary); word-break: break-all; margin-top: 4px;">
            Default
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Manual Cleanup</span>
            <span class="setting-desc">Prune expired files and texts immediately</span>
          </div>
          <button id="purgeNowBtn" class="kbd-btn" style="padding: 6px 12px; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.4); color: #ef4444;">
            Clean Cache Now
          </button>
        </div>
      </div>
    </div>
    <div class="section" id="sec-manglish">
      <div class="setting-group">
        <label>Personalization</label>
        <div class="models-panel" id="manglishPanel">
          <button class="models-panel-header" type="button" aria-expanded="false" id="manglishPanelHeader">
            <svg class="models-panel-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" id="manglishPanelChevron" style="transform: rotate(0deg); transition: transform 0.2s ease;"><polyline points="9 18 15 12 9 6"/></svg>
            <span class="models-panel-title">Malayalam to Manglish Custom Transliteration Examples</span>
          </button>
          
          <div class="models-panel-body" id="manglishPanelBody">
            <div class="setting-item" style="flex-direction: column; align-items: stretch; gap: 12px; padding: 20px; border: 0; background: transparent; margin-bottom: 0;">
              <div class="setting-info" style="margin-bottom: 8px;">
                <span class="setting-title">Custom Transliteration Examples</span>
                <span class="setting-desc">Personalize how Malayalam phrases are transliterated into Manglish. These examples will train the LLM refinement model on your spelling preferences. Fill out the boxes in Manglish:</span>
              </div>
              
              <div style="display: flex; flex-direction: column; gap: 20px;">
                <div style="display: flex; flex-direction: column; gap: 6px;">
                  <div style="font-weight: 700; font-size: 13px; color: var(--text-secondary);">ഹലോ സുഖമാണോ എന്ത് ചെയ്യുന്നു</div>
                  <input type="text" id="manglishEx1" class="brutal-input" style="height: 42px; border-radius: 12px; box-sizing: border-box;" placeholder="e.g. Hello, sukhamano enth cheyyunnu?" />
                </div>

                <div style="display: flex; flex-direction: column; gap: 6px;">
                  <div style="font-weight: 700; font-size: 13px; color: var(--text-secondary);">എനിക്ക് നാളെ വരാൻ പറ്റില്ല</div>
                  <input type="text" id="manglishEx2" class="brutal-input" style="height: 42px; border-radius: 12px; box-sizing: border-box;" placeholder="e.g. Enik naale varaan pattilla." />
                </div>

                <div style="display: flex; flex-direction: column; gap: 6px;">
                  <div style="font-weight: 700; font-size: 13px; color: var(--text-secondary);">നീ നാളെ കോളേജിൽ വരുന്നുണ്ടോ? നമുക്ക് ഒരുമിച്ച് പോകാം.</div>
                  <input type="text" id="manglishEx3" class="brutal-input" style="height: 42px; border-radius: 12px; box-sizing: border-box;" placeholder="e.g. Nee naale collegil varunnundo? Namukku orumichu pokam." />
                </div>

                <div style="display: flex; flex-direction: column; gap: 6px;">
                  <div style="font-weight: 700; font-size: 13px; color: var(--text-secondary);">ഞാൻ ആ കാര്യം അവളോട് പറഞ്ഞു, പക്ഷെ അവൾക്ക് മനസ്സിലായില്ല.</div>
                  <input type="text" id="manglishEx4" class="brutal-input" style="height: 42px; border-radius: 12px; box-sizing: border-box;" placeholder="e.g. Njan aa kaaryam avalodu paranju, pakshe avalkku manassilayilla." />
                </div>

                <div style="display: flex; flex-direction: column; gap: 6px;">
                  <div style="font-weight: 700; font-size: 13px; color: var(--text-secondary);">നീ ആ ഫയൽ എനിക്ക് വാട്സാപ്പിൽ അയച്ചു തരുമോ? ഞാൻ ഇപ്പോഴേ ഡൗൺലോഡ് ചെയ്യാം.</div>
                  <input type="text" id="manglishEx5" class="brutal-input" style="height: 42px; border-radius: 12px; box-sizing: border-box;" placeholder="e.g. Nee aa file enikk WhatsAppil ayachu tharumo? Njan ippozhe download cheyyam." />
                </div>
              </div>

              <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
                <button id="saveManglishExBtn" class="kbd-btn" style="padding: 10px 24px; font-weight: 700; border-radius: 12px;">Save Preferences</button>
              </div>
        </div>
      </div>
      <div class="setting-group" style="margin-top: 24px;">
        <label>Custom Word Mappings</label>
        <div class="setting-item" style="flex-direction: column; align-items: stretch; gap: 12px; padding: 20px;">
          <div class="setting-info" style="margin-bottom: 0;">
            <span class="setting-title" style="font-size: 15px;">Word-Level Transliteration Mappings</span>
            <span class="setting-desc" style="font-size: 12px;">Map specific Malayalam words to your preferred Latin/Manglish spelling when refining (e.g. ഹലോ to Hello).</span>
          </div>
        </div>
        <div class="todo-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; padding: 24px; display: flex; flex-direction: column; gap: 20px;">
          <div style="display: flex; gap: 12px; width: 100%;">
            <input type="text" id="translitMalInput" class="brutal-input" style="flex: 1; height: 42px; box-sizing: border-box; border-radius: 12px;" placeholder="Malayalam word (e.g. ഹലോ)" />
            <input type="text" id="translitEngInput" class="brutal-input" style="flex: 1; height: 42px; box-sizing: border-box; border-radius: 12px;" placeholder="Preferred spelling (e.g. Hello)" />
            <button id="addTranslitBtn" class="kbd-btn" style="padding: 0 24px; font-weight: 700; height: 42px; box-sizing: border-box; border-radius: 12px; background: var(--accent-soft); color: var(--accent); border-color: var(--accent);">Add</button>
          </div>

          <div class="dict-todo-list-wrapper" style="border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--bg-sidebar); width: 100%;">
            <div id="translitWordsList" style="display: flex; flex-direction: column; gap: 0; max-height: 400px; overflow-y: auto;">
              <!-- Dynamic entries -->
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
