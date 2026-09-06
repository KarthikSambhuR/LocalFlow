import { state } from './state.js';
import { loadDashboard, showCustomConfirm } from './dashboard.js';
import openaiLogo from './assets/images/openai-logo.png';
import ai4bharatLogo from './assets/images/ai4bharat-logo.png';


export async function setupAmp() {
  const slider = document.getElementById('ampSlider');
  const disp   = document.getElementById('ampValue');
  const toggle = document.getElementById('boostToggle');
  if (!slider) return;

  // Load current values from shared config file
  const cfg = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetConfig()
    : null;

  const initGain = cfg ? cfg.input_boost_gain : 1.0;
  const initEnabled = cfg ? cfg.input_boost_enabled : false;

  slider.value = initGain;
  state.currentAmp = initGain;
  disp.textContent = initGain.toFixed(1) + 'x';
  if (toggle) toggle.checked = initEnabled;

  const persist = () => {
    if (window.go?.main?.SettingsApp) {
      window.go.main.SettingsApp.SetInputBoost(
        toggle ? toggle.checked : false,
        state.currentAmp
      );
    }
  };

  slider.addEventListener('input', (e) => {
    state.currentAmp = parseFloat(e.target.value);
    disp.textContent = state.currentAmp.toFixed(1) + 'x';
    if (state.gainNode) {
      state.gainNode.gain.setTargetAtTime(state.currentAmp, state.audioCtx.currentTime, 0.1);
    }
    persist();
  });

  if (toggle) {
    toggle.addEventListener('change', persist);
  }
}

export async function setupLLM() {
  const toggle = document.getElementById('llmEnabledToggle');
  const modeSelection = document.getElementById('llmModeSelection');
  const toneSelection = document.getElementById('llmToneSelection');
  const contextSizeSelection = document.getElementById('llmContextSizeSelection');
  if (!toggle) return;

  const modeOptions = Array.from(document.querySelectorAll('#llmModeOptions .llm-choice'));
  const toneOptions = Array.from(document.querySelectorAll('#llmToneOptions .llm-choice'));

  // Load current values from shared config file
  const cfg = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetConfig()
    : null;

  const thinkingToggle = document.getElementById('llmThinkingToggle');
  const manglishToggle = document.getElementById('llmManglishToggle');

  const updateSubsettingsVisibility = async () => {
    const show = toggle.checked;
    const currentCfg = window.go?.main?.SettingsApp
      ? await window.go.main.SettingsApp.GetConfig()
      : null;
    const activeModel = currentCfg ? currentCfg.active_model : '';
    const isConformer = activeModel === 'indicconformer.int8.onnx' || activeModel === 'indicconformer.fp32.onnx';
    const activeLLM = currentCfg ? currentCfg.llm_active_model : '';
    const isSarvam = activeLLM === 'sarvam-1-Q4_K_M.gguf';
    const showManglish = show && isConformer && !isSarvam;

    document.querySelectorAll('.llm-choice-setting').forEach(el => {
      if (el.id === 'llmManglishSelection') {
        el.classList.toggle('visible', showManglish);
      } else {
        el.classList.toggle('visible', show);
      }
    });

  };

  const setActiveOption = (options, value) => {
    options.forEach(option => {
      const active = option.dataset.value === value;
      option.classList.toggle('active', active);
      option.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  };

  if (cfg) {
    toggle.checked = cfg.llm_enabled || false;
    setActiveOption(modeOptions, cfg.llm_refinement_mode || 'low');
    setActiveOption(toneOptions, cfg.llm_tone || 'auto');
    if (thinkingToggle) {
      thinkingToggle.checked = cfg.llm_enable_thinking || false;
    }
    if (manglishToggle) {
      manglishToggle.checked = cfg.manglish_enabled || false;
    }
  }

  await updateSubsettingsVisibility();

  toggle.addEventListener('change', async () => {
    await updateSubsettingsVisibility();
    if (window.go?.main?.SettingsApp) {
      window.go.main.SettingsApp.SetLLMEnabled(toggle.checked);
    }
  });

  if (thinkingToggle) {
    thinkingToggle.addEventListener('change', () => {
      if (window.go?.main?.SettingsApp) {
        window.go.main.SettingsApp.SetLLMEnableThinking(thinkingToggle.checked);
      }
    });
  }

  if (manglishToggle) {
    manglishToggle.addEventListener('change', () => {
      if (window.go?.main?.SettingsApp) {
        window.go.main.SettingsApp.SetManglishEnabled(manglishToggle.checked);
      }
    });
  }

  window.addEventListener('active-model-changed', updateSubsettingsVisibility);

  const setupChoiceListeners = (options, persist) => {
    options.forEach(option => {
      option.addEventListener('click', async () => {
        const previous = options.find(item => item.classList.contains('active'))?.dataset.value;
        setActiveOption(options, option.dataset.value);
        if (!window.go?.main?.SettingsApp) return;
        try {
          await persist(option.dataset.value);
        } catch (err) {
          setActiveOption(options, previous);
          console.error('Failed to update LLM refinement setting', err);
        }
      });
    });
  };

  setupChoiceListeners(modeOptions, val => window.go.main.SettingsApp.SetLLMRefinementMode(val));
  setupChoiceListeners(toneOptions, val => window.go.main.SettingsApp.SetLLMTone(val));

  // Context window slider (snaps to powers of 2: 2048, 4096, 8192, 16384, 32768)
  const CTX_STEPS = [2048, 4096, 8192, 16384, 32768];
  const CTX_LABELS = ['2K', '4K', '8K', '16K', '32K'];
  const ctxSlider = document.getElementById('llmContextSlider');
  const ctxLabel  = document.getElementById('llmContextLabel');

  function ctxSizeToIndex(size) {
    for (let i = 0; i < CTX_STEPS.length; i++) {
      if (size <= CTX_STEPS[i]) return i;
    }
    return CTX_STEPS.length - 1;
  }

  if (ctxSlider && ctxLabel) {
    const savedSize = cfg?.llm_context_size || 4096;
    const initIdx = ctxSizeToIndex(savedSize);
    ctxSlider.value = initIdx;
    ctxLabel.textContent = CTX_LABELS[initIdx];

    ctxSlider.addEventListener('input', () => {
      ctxLabel.textContent = CTX_LABELS[ctxSlider.value];
    });

    ctxSlider.addEventListener('change', async () => {
      const size = CTX_STEPS[ctxSlider.value];
      ctxLabel.textContent = CTX_LABELS[ctxSlider.value];
      if (window.go?.main?.SettingsApp) {
        try {
          await window.go.main.SettingsApp.SetLLMContextSize(size);
        } catch (err) {
          console.error('Failed to update LLM context size', err);
        }
      }
    });
  }
}

export async function setupProcessingEngine() {
  const buttons = Array.from(document.querySelectorAll('.engine-option'));
  const gpuContainer = document.getElementById('gpuSelectionItem');
  if (!buttons.length) return;

  const cfg = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetConfig()
    : null;

  let currentEngine = cfg?.processing_engine === 'vulkan' ? 'vulkan' : 'cpu';

  const render = () => {
    buttons.forEach((btn) => {
      const active = btn.dataset.engine === currentEngine;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (gpuContainer) {
      gpuContainer.style.display = currentEngine === 'vulkan' ? 'flex' : 'none';
    }
  };

  render();

  buttons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nextEngine = btn.dataset.engine === 'vulkan' ? 'vulkan' : 'cpu';
      if (nextEngine === currentEngine) return;
      currentEngine = nextEngine;
      render();
      if (window.go?.main?.SettingsApp) {
        await window.go.main.SettingsApp.SetProcessingEngine(currentEngine);
      }
    });
  });
}

export async function setupGPUSelector() {
  const container = document.getElementById('gpuSelectionItem');
  const dropdown = document.getElementById('gpuDropdown');
  const label = document.getElementById('gpuLabel');
  const menu = document.getElementById('gpuDropdownMenu');
  if (!container || !dropdown || !label || !menu) return;

  const cfg = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetConfig()
    : null;

  const selectedGpu = cfg?.selected_gpu || 'Default';
  label.textContent = selectedGpu;

  const trigger = dropdown.querySelector('.dropdown-trigger');
  trigger.onclick = (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  };

  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
  });

  if (window.go?.main?.SettingsApp) {
    const gpus = await window.go.main.SettingsApp.GetGPUDevices();
    menu.innerHTML = `<div class="dropdown-item ${selectedGpu === 'Default' ? 'active' : ''}" data-value="Default">Default</div>`;

    gpus.forEach((gpu) => {
      const active = gpu === selectedGpu;
      const item = document.createElement('div');
      item.className = `dropdown-item ${active ? 'active' : ''}`;
      item.dataset.value = gpu;
      item.textContent = gpu;
      menu.appendChild(item);
    });

    const items = menu.querySelectorAll('.dropdown-item');
    items.forEach((item) => {
      item.onclick = async (e) => {
        e.stopPropagation();
        const val = item.dataset.value;
        label.textContent = val;
        items.forEach(i => i.classList.toggle('active', i.dataset.value === val));
        dropdown.classList.remove('open');
        await window.go.main.SettingsApp.SetSelectedGPU(val);
      };
    });
  }
}

export async function setupKeybinds() {
  const btn = document.getElementById('remapBtn');
  const k1Label = document.getElementById('k1Label');
  const k2Label = document.getElementById('k2Label');
  const sideK1 = document.getElementById('sideK1');
  const sideK2 = document.getElementById('sideK2');
  if (!btn) return;

  let cfg = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetConfig()
    : null;

  const copilotToggle = document.getElementById('copilotKeyToggle');
  const isCopilot = cfg && cfg.keybind1_rawcode === 255;
  if (copilotToggle) {
    copilotToggle.checked = isCopilot;
  }

  const updateUIForCopilot = (active) => {
    const plusSpanEl = btn.querySelector('.kbd-plus');
    const sidePlusEl = sideK1 ? sideK1.nextSibling : null;
    
    if (active) {
      k1Label.textContent = "Copilot";
      k2Label.style.display = 'none';
      if (plusSpanEl) plusSpanEl.style.display = 'none';
      btn.style.opacity = '0.6';
      btn.style.pointerEvents = 'none';
      
      if (sideK1) {
        sideK1.textContent = "Copilot";
        if (sidePlusEl) sidePlusEl.style.display = 'none';
      }
      if (sideK2) {
        sideK2.style.display = 'none';
      }
    } else {
      k1Label.textContent = cfg ? cfg.keybind1_name : "Ctrl";
      k2Label.textContent = cfg ? cfg.keybind2_name : "Win";
      k2Label.style.display = 'inline-block';
      if (plusSpanEl) plusSpanEl.style.display = 'inline';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      
      if (sideK1) {
        sideK1.textContent = k1Label.textContent;
        if (sidePlusEl) sidePlusEl.style.display = 'inline';
      }
      if (sideK2) {
        sideK2.textContent = k2Label.textContent;
        sideK2.style.display = 'inline-block';
      }
    }
  };

  updateUIForCopilot(isCopilot);

  if (copilotToggle) {
    copilotToggle.addEventListener('change', async () => {
      if (copilotToggle.checked) {
        updateUIForCopilot(true);
        if (window.go?.main?.SettingsApp) {
          await window.go.main.SettingsApp.SetKeybinds(255, "Copilot", 255, "Copilot");
        }
      } else {
        cfg = {
          keybind1_rawcode: 162,
          keybind1_name: "Ctrl",
          keybind2_rawcode: 91,
          keybind2_name: "Win"
        };
        updateUIForCopilot(false);
        if (window.go?.main?.SettingsApp) {
          await window.go.main.SettingsApp.SetKeybinds(162, "Ctrl", 91, "Win");
        }
      }
    });
  }

  let isRecording = false;
  let capturedKeys = [];

  function getRawCode(e) {
    if (e.keyCode === 17) return e.location === 2 ? 163 : 162; // Ctrl
    if (e.keyCode === 16) return e.location === 2 ? 161 : 160; // Shift
    if (e.keyCode === 18) return e.location === 2 ? 165 : 164; // Alt
    if (e.keyCode === 91) return 91; // LWin
    if (e.keyCode === 92) return 92; // RWin
    return e.keyCode;
  }

  function getFriendlyName(e) {
    let name = e.code.replace('Left', '').replace('Right', '').replace('Key', '').replace('Digit', '');
    if (name === 'Meta') return 'Win';
    if (name === 'Control') return 'Ctrl';
    return name || String.fromCharCode(e.keyCode);
  }

  const handleKeydown = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const raw = getRawCode(e);
    const name = getFriendlyName(e);

    // Prevent identical keys (must be a combination)
    if (capturedKeys.length === 1 && capturedKeys[0].raw === raw) return;

    capturedKeys.push({ raw, name });

    if (capturedKeys.length === 1) {
      k1Label.textContent = name;
      k2Label.textContent = "...";
    }

    if (capturedKeys.length === 2) {
      k2Label.textContent = name;
      if (sideK1) sideK1.textContent = capturedKeys[0].name;
      if (sideK2) sideK2.textContent = name;
      window.removeEventListener('keydown', handleKeydown, true);
      btn.classList.remove('recording');
      isRecording = false;

      // Save to backend
      if (window.go?.main?.SettingsApp) {
        await window.go.main.SettingsApp.SetKeybinds(
          capturedKeys[0].raw, capturedKeys[0].name,
          capturedKeys[1].raw, capturedKeys[1].name
        );
        cfg = await window.go.main.SettingsApp.GetConfig();
      }
      if (copilotToggle) {
        copilotToggle.checked = false;
      }
    }
  };

  btn.addEventListener('click', async () => {
    if (isRecording) return;
    isRecording = true;
    capturedKeys = [];
    if (window.go?.main?.SettingsApp) {
      await window.go.main.SettingsApp.SetKeybindCaptureActive(true);
    }
    btn.classList.add('recording');
    k1Label.textContent = "...";
    k2Label.textContent = "...";
    window.addEventListener('keydown', handleKeydown, true);
  });
}

export async function setupStartupSettings() {
  const startupToggle = document.getElementById('startupToggle');
  const minimizedToggle = document.getElementById('startMinimizedToggle');
  if (!startupToggle || !minimizedToggle) return;

  const cfg = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetConfig()
    : null;

  startupToggle.checked = cfg ? cfg.start_on_startup : false;
  minimizedToggle.checked = cfg ? cfg.start_minimized : false;

  startupToggle.addEventListener('change', async () => {
    const nextValue = startupToggle.checked;
    if (!window.go?.main?.SettingsApp) return;
    try {
      await window.go.main.SettingsApp.SetStartOnStartup(nextValue);
    } catch (err) {
      startupToggle.checked = !nextValue;
      console.error('Failed to update startup setting', err);
      alert('Could not update the Windows startup setting. Please try again.');
    }
  });

  minimizedToggle.addEventListener('change', async () => {
    const nextValue = minimizedToggle.checked;
    if (!window.go?.main?.SettingsApp) return;
    try {
      await window.go.main.SettingsApp.SetStartMinimized(nextValue);
    } catch (err) {
      minimizedToggle.checked = !nextValue;
      console.error('Failed to update start minimized setting', err);
      alert('Could not update the start minimized setting. Please try again.');
    }
  });
}

export async function setupStorageSettings() {
  const audioDropdown = document.getElementById('audioRetentionDropdown');
  const transDropdown = document.getElementById('transcriptionRetentionDropdown');
  const purgeBtn = document.getElementById('purgeNowBtn');
  if (!audioDropdown || !transDropdown || !purgeBtn) return;

  const audioTrigger = audioDropdown.querySelector('.dropdown-trigger');
  const audioLabel = document.getElementById('audioRetentionLabel');
  const audioItems = audioDropdown.querySelectorAll('.dropdown-item');

  const transTrigger = transDropdown.querySelector('.dropdown-trigger');
  const transLabel = document.getElementById('transcriptionRetentionLabel');
  const transItems = transDropdown.querySelectorAll('.dropdown-item');

  let currentAudioVal = 7;
  let currentTransVal = 30;

  const getLabelText = (val) => {
    val = parseInt(val, 10);
    if (val === -1 || val === 99999 || val <= 0) return 'Forever';
    return val === 1 ? '1 Day' : `${val} Days`;
  };

  const cfg = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetConfig()
    : null;

  if (cfg) {
    currentAudioVal = cfg.audio_retention_days;
    currentTransVal = cfg.transcription_retention_days;
    
    audioLabel.textContent = getLabelText(currentAudioVal);
    audioItems.forEach(item => {
      const active = parseInt(item.getAttribute('data-value'), 10) === currentAudioVal;
      item.classList.toggle('active', active);
    });

    transLabel.textContent = getLabelText(currentTransVal);
    transItems.forEach(item => {
      const active = parseInt(item.getAttribute('data-value'), 10) === currentTransVal;
      item.classList.toggle('active', active);
    });
  }

  const persist = () => {
    if (window.go?.main?.SettingsApp) {
      window.go.main.SettingsApp.SetRetention(
        currentAudioVal,
        currentTransVal
      );
    }
  };

  // Audio dropdown trigger
  audioTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    audioDropdown.classList.toggle('open');
    transDropdown.classList.remove('open');
  });

  audioItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      currentAudioVal = parseInt(item.getAttribute('data-value'), 10);
      audioLabel.textContent = getLabelText(currentAudioVal);
      audioItems.forEach(i => i.classList.toggle('active', i === item));
      audioDropdown.classList.remove('open');
      persist();
    });
  });

  // Transcription dropdown trigger
  transTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    transDropdown.classList.toggle('open');
    audioDropdown.classList.remove('open');
  });

  transItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      currentTransVal = parseInt(item.getAttribute('data-value'), 10);
      transLabel.textContent = getLabelText(currentTransVal);
      transItems.forEach(i => i.classList.toggle('active', i === item));
      transDropdown.classList.remove('open');
      persist();
    });
  });

  // Close dropdowns on click outside
  document.addEventListener('click', () => {
    audioDropdown.classList.remove('open');
    transDropdown.classList.remove('open');
  });

  purgeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showCustomConfirm({
      title: 'Clear All Cache?',
      message: 'This will permanently delete all raw audio files and transcription texts. Your historical stats will be preserved.',
      confirmText: 'Clear Everything',
      onConfirm: async () => {
        if (window.go?.main?.SettingsApp) {
          purgeBtn.disabled = true;
          purgeBtn.textContent = 'Cleaning...';
          try {
            await window.go.main.SettingsApp.PurgeNow();
            await loadDashboard();
            purgeBtn.textContent = 'Done!';
            setTimeout(() => {
              purgeBtn.textContent = 'Clean Cache Now';
              purgeBtn.disabled = false;
            }, 1500);
          } catch (err) {
            console.error(err);
            purgeBtn.textContent = 'Error';
            setTimeout(() => {
              purgeBtn.textContent = 'Clean Cache Now';
              purgeBtn.disabled = false;
            }, 1500);
          }
        }
      }
    });
  });
}

export async function setupDataFolderSettings() {
  const selectBtn = document.getElementById('selectFolderBtn');
  const folderDesc = document.getElementById('dataFolderDesc');
  if (!selectBtn || !folderDesc) return;

  const updatePathDisplay = async () => {
    const cfg = window.go?.main?.SettingsApp
      ? await window.go.main.SettingsApp.GetConfig()
      : null;
    if (cfg && cfg.data_folder) {
      folderDesc.textContent = cfg.data_folder;
    } else {
      folderDesc.textContent = 'Default';
    }
  };

  // Initial load
  await updatePathDisplay();

  selectBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!window.go?.main?.SettingsApp) return;

    try {
      const selectedPath = await window.go.main.SettingsApp.SelectDataFolder();
      if (!selectedPath) {
        // User cancelled dialog
        return;
      }

      // Show migrating loader state
      selectBtn.disabled = true;
      selectBtn.textContent = 'Migrating...';
      folderDesc.textContent = `Migrating files to: ${selectedPath}...`;

      await window.go.main.SettingsApp.SetDataFolder(selectedPath);

      selectBtn.textContent = 'Done!';
      await updatePathDisplay();
      
      // Reload dashboard stats and history from the new database path
      await loadDashboard();

      setTimeout(() => {
        selectBtn.textContent = 'Change Folder';
        selectBtn.disabled = false;
      }, 1500);
    } catch (err) {
      console.error('Migration failed:', err);
      selectBtn.textContent = 'Error';
      await updatePathDisplay();
      setTimeout(() => {
        selectBtn.textContent = 'Change Folder';
        selectBtn.disabled = false;
      }, 1500);
    }
  });
}

// Authentic Brand Logos and Icons for Model Families
const MODEL_FAMILY_ICONS = {
  openai: `<img src="${openaiLogo}" alt="OpenAI" class="brand-logo-img" />`,
  indic: `<img src="${ai4bharatLogo}" alt="AI4Bharat" class="brand-logo-img" style="object-fit: contain; padding: 2px;" />`,
  google: `<svg viewBox="0 0 24 24" width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/></svg>`,
  superwhisper: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#A5B4FC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  qwen: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#C4B5FD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/></svg>`,
  hf: `<svg viewBox="0 0 24 24" width="20" height="20" fill="#FBBF24"><circle cx="12" cy="12" r="10"/><circle cx="9" cy="10" r="1.5" fill="#000"/><circle cx="15" cy="10" r="1.5" fill="#000"/><path d="M8 14.5s1.5 2.5 4 2.5 4-2.5 4-2.5" stroke="#000" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`,
  sarvam: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#F472B6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`
};

// Family Definitions that group models together
const MODEL_FAMILIES_DEF = [
  {
    familyId: 'whisper',
    type: 'whisper',
    name: 'OpenAI Whisper',
    provider: 'OpenAI',
    iconKey: 'openai',
    iconClass: 'provider-openai',
    description: 'Speech-to-text with English and multilingual variants.',
    variantMatcher: (m) => m.model_type === 'whisper' && m.id.startsWith('tiny') || m.id.startsWith('base') || m.id.startsWith('small') || m.id.startsWith('medium') || m.id.startsWith('large'),
    variants: [
      { label: 'Tiny (EN)', id: 'tiny' },
      { label: 'Base (EN)', id: 'base' },
      { label: 'Small (EN)', id: 'small' },
      { label: 'Medium (EN)', id: 'medium' },
      { label: 'Turbo (EN)', id: 'large-turbo' },
      { label: 'Tiny (Multi)', id: 'tiny-multilingual' },
      { label: 'Base (Multi)', id: 'base-multilingual' },
      { label: 'Small (Multi)', id: 'small-multilingual' },
    ]
  },
  {
    familyId: 'indic-conformer',
    type: 'whisper',
    name: 'Indic Conformer',
    provider: 'AI4Bharat',
    iconKey: 'indic',
    iconClass: 'provider-indic',
    description: 'Malayalam speech recognition built on ONNX.',
    variantMatcher: (m) => m.id.startsWith('indic-conformer'),
    variants: [
      { label: '120M INT8 (Fast)', id: 'indic-conformer-120m-int8' },
      { label: '120M FP32 (Full)', id: 'indic-conformer-120m-fp32' }
    ]
  },
  {
    familyId: 's1-mini',
    type: 'llm',
    name: 'S1-mini Normalizer',
    provider: 'Superwhisper',
    iconKey: 'superwhisper',
    iconClass: 'provider-super',
    description: 'Specialized normalizer for filler words, stutters and numbers.',
    variantMatcher: (m) => m.id === 's1-mini',
    variants: [
      { label: '0.6B Q4_K_M', id: 's1-mini' }
    ]
  },
  {
    familyId: 'gemma4',
    type: 'llm',
    name: 'Gemma 4 E2B',
    provider: 'Google',
    iconKey: 'google',
    iconClass: 'provider-google',
    description: 'High-intelligence reasoning and grammar refinement.',
    variantMatcher: (m) => m.id.startsWith('gemma4'),
    variants: [
      { label: 'E2B Refinement', id: 'gemma4-e2b' },
      { label: 'Direct Audio STT', id: 'gemma4-e2b-audio' }
    ]
  },
  {
    familyId: 'qwen3',
    type: 'llm',
    name: 'Qwen 3 0.6B',
    provider: 'Alibaba',
    iconKey: 'qwen',
    iconClass: 'provider-qwen',
    description: 'Ultra-fast and lightweight LLM for real-time formatting.',
    variantMatcher: (m) => m.id === 'qwen3-0.6b',
    variants: [
      { label: '0.6B Q4_K_XL', id: 'qwen3-0.6b' }
    ]
  },
  {
    familyId: 'smollm2',
    type: 'llm',
    name: 'SmolLM2 135M',
    provider: 'HuggingFace',
    iconKey: 'hf',
    iconClass: 'provider-hf',
    description: 'Compact 135M model running on CPU with minimal RAM.',
    variantMatcher: (m) => m.id === 'smollm2-135m',
    variants: [
      { label: '135M Q8_0', id: 'smollm2-135m' }
    ]
  },
  {
    familyId: 'sarvam',
    type: 'llm',
    name: 'Sarvam 1 3B',
    provider: 'Sarvam AI',
    iconKey: 'sarvam',
    iconClass: 'provider-sarvam',
    description: 'Bilingual English and Malayalam text refinement.',
    variantMatcher: (m) => m.id === 'sarvam-1-3b',
    variants: [
      { label: '1 3B Q4_K_M', id: 'sarvam-1-3b' }
    ]
  }
];

// Track selected variant ID per family card in UI
const selectedVariantPerFamily = {};

export async function setupModelsSettings() {
  const modelListWhisper = document.getElementById('modelListWhisper');
  const modelListLLM = document.getElementById('modelListLLM');
  if (!modelListWhisper || !modelListLLM) return;

  const renderModels = async () => {
    if (!window.go?.main?.SettingsApp) return;
    try {
      const allModels = await window.go.main.SettingsApp.GetModelsList() || [];
      const modelMap = {};
      allModels.forEach(m => { modelMap[m.id] = m; });

      modelListWhisper.innerHTML = '';
      modelListLLM.innerHTML = '';

      const renderFamilyCard = (fam) => {
        // Collect model instances for this family
        const availableVariantModels = fam.variants.map(v => modelMap[v.id]).filter(Boolean);
        if (availableVariantModels.length === 0) return null;

        // Default selected variant: active one if any, or downloaded, or first
        let selectedId = selectedVariantPerFamily[fam.familyId];
        if (!selectedId || !modelMap[selectedId]) {
          const activeM = availableVariantModels.find(m => m.is_active);
          const dlM = availableVariantModels.find(m => m.is_downloaded);
          selectedId = (activeM || dlM || availableVariantModels[0]).id;
          selectedVariantPerFamily[fam.familyId] = selectedId;
        }

        const currentModel = modelMap[selectedId] || availableVariantModels[0];
        const statusText = currentModel.is_active ? 'Active' : currentModel.is_disabled ? 'Unavailable' : currentModel.is_downloaded ? 'Downloaded' : 'Available';
        const statusClass = currentModel.is_active ? 'active' : currentModel.is_disabled ? 'unavailable' : currentModel.is_downloaded ? 'downloaded' : 'available';

        let actionHtml = '';
        if (currentModel.is_downloading) {
          actionHtml = `
            <div class="model-progress-container" style="min-width: 140px;">
              <div class="model-progress-bar-bg">
                <div class="model-progress-bar-fill" id="bar-${currentModel.id}" style="width: ${currentModel.download_progress}%"></div>
              </div>
              <div class="model-progress-text" id="text-${currentModel.id}">Downloading... ${currentModel.download_progress}%</div>
            </div>
          `;
        } else if (currentModel.is_downloaded) {
          actionHtml = `
            ${currentModel.is_active ? `<span class="badge" style="background: var(--accent); color: #090909; font-weight: 800; padding: 6px 14px;">Active</span>` : `<button class="kbd-btn activate-btn model-action-btn" ${currentModel.is_disabled ? 'disabled title="Only Gemma and Sarvam are supported with Malayalam Conformer"' : ''} data-id="${currentModel.id}">Activate</button>`}
            ${!currentModel.is_active ? `<button class="kbd-btn delete-btn model-action-btn danger" data-filename="${currentModel.filename}">Delete</button>` : ''}
          `;
        } else {
          actionHtml = `<button class="kbd-btn download-btn model-action-btn" ${currentModel.is_disabled ? 'disabled' : ''} data-id="${currentModel.id}">Download</button>`;
        }

        const card = document.createElement('div');
        card.className = 'model-family-card';
        card.innerHTML = `
          <div class="model-family-header">
            <div class="model-family-identity">
              <div class="model-provider-icon ${fam.iconClass}">
                ${MODEL_FAMILY_ICONS[fam.iconKey] || ''}
              </div>
              <div class="model-family-title-wrap">
                <div class="model-family-name-row">
                  <span class="model-family-name">${fam.name}</span>
                  <span class="model-family-provider-tag">${fam.provider}</span>
                  <span class="model-status-pill ${statusClass}">${statusText}</span>
                </div>
                <div class="model-family-desc">${fam.description}</div>
              </div>
            </div>
          </div>

          <div class="model-variant-selector-wrapper">
            <div class="model-variant-toolbar">
              <span class="model-variant-label">Variants & Sizes</span>
              <div class="model-variant-segmented-btn-group">
                ${fam.variants.map(v => {
                  const mInstance = modelMap[v.id];
                  if (!mInstance) return '';
                  const isSelected = v.id === currentModel.id;
                  const isDl = mInstance.is_downloaded;
                  const isActive = mInstance.is_active;
                  const dotBadge = isActive ? ' • Active' : isDl ? ' • ✓' : '';
                  return `
                    <button type="button" class="model-variant-btn ${isSelected ? 'active' : ''}" data-family="${fam.familyId}" data-id="${v.id}">
                      ${v.label}${dotBadge}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="model-variant-details-bar">
              <div class="model-variant-meta">
                <span class="model-variant-pill">${currentModel.size_mb} MB</span>
                <span class="model-variant-pill">${currentModel.speed_label}</span>
                <span class="model-variant-pill">${currentModel.speed_description}</span>
                <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${currentModel.filename}</span>
              </div>
              <div class="model-variant-actions">
                ${actionHtml}
              </div>
            </div>
          </div>
        `;

        // Variant toggle buttons
        card.querySelectorAll('.model-variant-btn').forEach(btn => {
          btn.onclick = (e) => {
            e.stopPropagation();
            selectedVariantPerFamily[fam.familyId] = btn.dataset.id;
            renderModels();
          };
        });

        // Download Action
        card.querySelectorAll('.download-btn').forEach(btn => {
          btn.onclick = async (e) => {
            e.stopPropagation();
            btn.disabled = true;
            btn.textContent = 'Starting...';
            await window.go.main.SettingsApp.DownloadModel(btn.dataset.id);
            renderModels();
          };
        });

        // Activate Action
        card.querySelectorAll('.activate-btn').forEach(btn => {
          btn.onclick = async (e) => {
            e.stopPropagation();
            btn.disabled = true;
            btn.textContent = 'Activating...';
            try {
              await window.go.main.SettingsApp.SetActiveModel(btn.dataset.id);
              window.dispatchEvent(new CustomEvent('active-model-changed'));
            } catch (err) {
              alert(err);
            }
            renderModels();
          };
        });

        // Delete Action
        card.querySelectorAll('.delete-btn').forEach(btn => {
          btn.onclick = async (e) => {
            e.stopPropagation();
            const filename = btn.dataset.filename;
            const m = allModels.find(x => x.filename === filename);
            showCustomConfirm({
              title: 'Delete Model',
              message: `Are you sure you want to delete ${m?.name || 'this model'}?`,
              confirmText: 'Delete',
              onConfirm: async () => {
                btn.disabled = true;
                btn.textContent = 'Deleting...';
                try {
                  await window.go.main.SettingsApp.DeleteModel(filename);
                } catch (err) {
                  alert(err);
                }
                renderModels();
              }
            });
          };
        });

        return card;
      };

      // Render Speech Recognition Families into modelListWhisper
      const whisperFamilies = MODEL_FAMILIES_DEF.filter(f => f.type === 'whisper');
      whisperFamilies.forEach(fam => {
        const card = renderFamilyCard(fam);
        if (card) modelListWhisper.appendChild(card);
      });

      // Render LLM Refinement Families into modelListLLM
      const llmFamilies = MODEL_FAMILIES_DEF.filter(f => f.type === 'llm');
      llmFamilies.forEach(fam => {
        const card = renderFamilyCard(fam);
        if (card) modelListLLM.appendChild(card);
      });

    } catch (err) {
      console.error(err);
    }
  };

  window.runtime.EventsOn('model-download-progress', (id, percent, speed, eta) => {
    const fill = document.getElementById(`bar-${id}`);
    const txt = document.getElementById(`text-${id}`);
    if (fill && txt) {
      fill.style.width = `${percent}%`;
      if (speed && eta) {
        txt.textContent = `Downloading... ${percent}% (${speed}, ETA: ${eta})`;
      } else {
        txt.textContent = `Downloading... ${percent}%`;
      }
    }
  });

  window.runtime.EventsOn('model-download-done', (id) => {
    renderModels();
  });

  window.runtime.EventsOn('model-download-error', (id, errMsg) => {
    alert(`Download failed for model ${id}: ${errMsg}`);
    renderModels();
  });

  await renderModels();
}

export async function setupOnboarding() {
  const overlay = document.getElementById('onboardingOverlay');
  const card = document.getElementById('onboardingCard');
  if (!overlay || !card) return;

  if (!window.go?.main?.SettingsApp) return;

  const isCompleted = await window.go.main.SettingsApp.IsSetupCompleted();
  if (isCompleted) {
    return;
  }

  // Show overlay
  overlay.classList.add('active');

  const showScreen1 = () => {
    card.innerHTML = `
      <h2 class="onboarding-title">Setting Up LocalFlow</h2>
      <p class="onboarding-desc">We are downloading the default speech recognition model and local typography so the application can operate 100% offline with complete privacy.</p>
      <div class="onboarding-progress-container">
        <div class="onboarding-progress-bar-bg">
          <div class="onboarding-progress-bar-fill" id="setupBar" style="width: 0%"></div>
        </div>
        <div class="onboarding-progress-status" id="setupStatus">Initializing...</div>
      </div>
    `;

    // Start download
    window.go.main.SettingsApp.DownloadEssentialAssets();

    window.runtime.EventsOn('setup-progress', (percent, statusText) => {
      const bar = document.getElementById('setupBar');
      const status = document.getElementById('setupStatus');
      if (bar) bar.style.width = `${percent}%`;
      if (status) status.textContent = statusText;
    });

    window.runtime.EventsOn('setup-error', (errMsg) => {
      const status = document.getElementById('setupStatus');
      if (status) {
        status.style.color = '#ef4444';
        status.textContent = `Error: ${errMsg}`;
      }
    });

    window.runtime.EventsOn('setup-done', () => {
      setTimeout(showScreen2, 800);
    });
  };

  const showScreen2 = () => {
    card.innerHTML = `
      <h2 class="onboarding-title">Welcome to LocalFlow</h2>
      <p class="onboarding-desc">Your transcripts and recordings stay securely on your device. Let's start by getting to know you. What should we call you?</p>
      <div class="onboarding-input-container">
        <input type="text" id="usernameInput" class="onboarding-input" placeholder="Your Name" />
      </div>
      <button id="nextBtn" class="onboarding-btn" disabled>Continue</button>
    `;

    const input = document.getElementById('usernameInput');
    const btn = document.getElementById('nextBtn');

    input.focus();
    input.oninput = () => {
      btn.disabled = input.value.trim().length === 0;
    };

    btn.onclick = async () => {
      const name = input.value.trim();
      btn.disabled = true;
      btn.textContent = 'Saving...';
      await window.go.main.SettingsApp.SetProfileName(name);
      showScreen3();
    };
  };

  const showScreen3 = async () => {
    // Load config keybind names dynamically
    const cfg = await window.go.main.SettingsApp.GetConfig();
    const k1 = cfg.keybind1_name || 'Ctrl';
    const k2 = cfg.keybind2_name || 'Win';

    card.innerHTML = `
      <h2 class="onboarding-title">All Ready!</h2>
      <p class="onboarding-desc">Press and hold this shortcut combination while speaking, then release to instantly dictate directly into any active input.</p>
      <div class="onboarding-keybind-demo">
        <kbd>${k1}</kbd> <span>+</span> <kbd>${k2}</kbd>
      </div>
      <button id="finishBtn" class="onboarding-btn">Get Started</button>
    `;

    const btn = document.getElementById('finishBtn');
    btn.onclick = () => {
      overlay.classList.remove('active');
      // Reload dashboard in case stats/history are present
      loadDashboard();
    };
  };

  // Start with Screen 1
  showScreen1();
}

export async function setupMicrophoneSettings() {
  const micDropdown = document.getElementById('micDropdown');
  const micLabel = document.getElementById('micLabel');
  const micMenu = document.getElementById('micDropdownMenu');
  if (!micDropdown || !micLabel || !micMenu) return;

  const trigger = micDropdown.querySelector('.dropdown-trigger');

  const mics = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetMicrophones()
    : ["Default"];

  const cfg = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetConfig()
    : null;

  let currentMic = cfg ? cfg.active_microphone : "Default";

  const renderMics = () => {
    micMenu.innerHTML = mics.map(m => `
      <div class="dropdown-item ${m === currentMic ? 'active' : ''}" data-value="${m}">${m}</div>
    `).join('');

    const items = micMenu.querySelectorAll('.dropdown-item');
    items.forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        currentMic = item.getAttribute('data-value');
        micLabel.textContent = currentMic;
        micDropdown.classList.remove('open');
        renderMics();

        if (window.go?.main?.SettingsApp) {
          await window.go.main.SettingsApp.SetMicrophone(currentMic);
        }
      });
    });
  };

  micLabel.textContent = currentMic;
  renderMics();

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    micDropdown.classList.toggle('open');
    const audioDropdown = document.getElementById('audioRetentionDropdown');
    const transDropdown = document.getElementById('transcriptionRetentionDropdown');
    if (audioDropdown) audioDropdown.classList.remove('open');
    if (transDropdown) transDropdown.classList.remove('open');
  });

  document.addEventListener('click', () => {
    micDropdown.classList.remove('open');
  });
}

export async function setupDictionary() {
  const input = document.getElementById('dictWordInput');
  const addBtn = document.getElementById('addDictWordBtn');
  const container = document.getElementById('dictWordsList');
  const tokenBadge = document.getElementById('dictTokenBadge');
  const tokenProgress = document.getElementById('dictTokenProgress');
  if (!input || !addBtn || !container) return;

  const estimateTokens = (wordsArray) => {
    const text = wordsArray.join(', ');
    if (!text.trim()) return 0;
    // Estimated: 1 token is roughly 4 characters (standard tokenization estimate)
    return Math.min(224, Math.ceil(text.length / 4));
  };

  const loadWords = async () => {
    if (!window.go?.main?.SettingsApp) return;
    const words = await window.go.main.SettingsApp.GetDictionaryWords() || [];
    
    // Update token usage UI
    const tokens = estimateTokens(words);
    if (tokenBadge) {
      tokenBadge.textContent = `${tokens} / 224 tokens`;
    }
    if (tokenProgress) {
      const percentage = (tokens / 224) * 100;
      tokenProgress.style.width = `${percentage}%`;
      // Color coded thresholds
      if (percentage > 90) {
        tokenProgress.style.background = '#ef4444'; // Red if near limit
      } else if (percentage > 70) {
        tokenProgress.style.background = '#f59e0b'; // Amber
      } else {
        tokenProgress.style.background = 'var(--accent)'; // Cyan/Green
      }
    }

    container.innerHTML = '';
    if (words.length === 0) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; font-size: 13px; color: var(--text-muted); font-style: italic;">No custom vocabulary added yet. Add some above!</div>';
      return;
    }
    words.forEach(word => {
      const row = document.createElement('div');
      row.className = 'dict-row-item';
      row.innerHTML = `
        <span class="dict-word-text">${escapeHtml(word)}</span>
        <button class="dict-row-delete-btn" title="Delete word">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;
      row.querySelector('.dict-row-delete-btn').onclick = async (e) => {
        e.stopPropagation();
        await window.go.main.SettingsApp.DeleteDictionaryWord(word);
        loadWords();
      };
      container.appendChild(row);
    });
  };

  const escapeHtml = (val = '') => {
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  addBtn.onclick = async () => {
    const word = input.value.trim();
    if (!word) {
      input.classList.add('brutal-input-error');
      input.placeholder = "Please enter a word first!";
      input.focus();
      setTimeout(() => {
        input.classList.remove('brutal-input-error');
        input.placeholder = "Add a custom word or phrase...";
      }, 1500);
      return;
    }
    if (window.go?.main?.SettingsApp) {
      await window.go.main.SettingsApp.AddDictionaryWord(word);
      input.value = '';
      loadWords();
    }
  };

  input.onkeydown = async (e) => {
    if (e.key === 'Enter') {
      addBtn.click();
    }
  };

  loadWords();
}

export async function setupManglishPersonalization() {
  const ex1 = document.getElementById('manglishEx1');
  const ex2 = document.getElementById('manglishEx2');
  const ex3 = document.getElementById('manglishEx3');
  const ex4 = document.getElementById('manglishEx4');
  const ex5 = document.getElementById('manglishEx5');
  const saveBtn = document.getElementById('saveManglishExBtn');
  if (!saveBtn) return;

  const panel = document.getElementById('manglishPanel');
  const header = document.getElementById('manglishPanelHeader');
  const chevron = document.getElementById('manglishPanelChevron');
  if (header && panel && chevron) {
    header.onclick = () => {
      const isOpen = panel.classList.toggle('open');
      header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      chevron.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';
    };
  }

  const cfg = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetConfig()
    : null;

  if (cfg) {
    if (ex1) ex1.value = cfg.manglish_example_1 || '';
    if (ex2) ex2.value = cfg.manglish_example_2 || '';
    if (ex3) ex3.value = cfg.manglish_example_3 || '';
    if (ex4) ex4.value = cfg.manglish_example_4 || '';
    if (ex5) ex5.value = cfg.manglish_example_5 || '';
  }

  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    // Validation: make sure they type in Manglish (no Malayalam script characters)
    const inputs = [ex1, ex2, ex3, ex4, ex5];
    for (let input of inputs) {
      if (!input) continue;
      const val = input.value.trim();
      if (!val) {
        alert("Please fill out all Manglish transcription boxes!");
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Preferences';
        input.focus();
        return;
      }
      if (/[\u0D00-\u0D7F]/.test(val)) {
        alert("Please write in Manglish (using English letters/Latin script only, no Malayalam script characters)!");
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Preferences';
        input.focus();
        return;
      }
    }

    try {
      if (window.go?.main?.SettingsApp) {
        await window.go.main.SettingsApp.SetManglishExamples(
          ex1.value.trim(),
          ex2.value.trim(),
          ex3.value.trim(),
          ex4.value.trim(),
          ex5.value.trim()
        );
        saveBtn.textContent = 'Saved!';
        setTimeout(() => {
          saveBtn.textContent = 'Save Preferences';
          saveBtn.disabled = false;
        }, 1500);
      }
    } catch (err) {
      console.error('Failed to save Manglish examples:', err);
      saveBtn.textContent = 'Error';
      setTimeout(() => {
        saveBtn.textContent = 'Save Preferences';
        saveBtn.disabled = false;
      }, 1500);
    }
  };

  const malInput = document.getElementById('translitMalInput');
  const engInput = document.getElementById('translitEngInput');
  const addTransBtn = document.getElementById('addTranslitBtn');
  const transList = document.getElementById('translitWordsList');

  const escapeHtml = (val = '') => {
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const loadMappings = async () => {
    if (!window.go?.main?.SettingsApp || !transList) return;
    const mappings = await window.go.main.SettingsApp.GetTransliterations() || [];
    transList.innerHTML = '';
    if (mappings.length === 0) {
      transList.innerHTML = '<div style="padding: 20px; text-align: center; font-size: 13px; color: var(--text-muted); font-style: italic;">No custom word mappings added yet.</div>';
      return;
    }
    mappings.forEach(m => {
      const row = document.createElement('div');
      row.className = 'dict-row-item';
      row.innerHTML = `
        <span class="dict-word-text"><strong>${escapeHtml(m.malayalam)}</strong> &rarr; ${escapeHtml(m.translit)}</span>
        <button class="dict-row-delete-btn" title="Delete mapping">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;
      row.querySelector('.dict-row-delete-btn').onclick = async (e) => {
        e.stopPropagation();
        await window.go.main.SettingsApp.DeleteTransliteration(m.malayalam);
        loadMappings();
      };
      transList.appendChild(row);
    });
  };

  if (addTransBtn && malInput && engInput) {
    addTransBtn.onclick = async () => {
      const malVal = malInput.value.trim();
      const engVal = engInput.value.trim();
      if (!malVal || !engVal) {
        alert("Please enter both Malayalam word(s) and preferred transliteration!");
        return;
      }
      
      const malWords = malVal.split(',').map(w => w.trim()).filter(Boolean);
      if (malWords.length === 0) {
        alert("Please enter at least one Malayalam word!");
        return;
      }

      for (const w of malWords) {
        if (!/[\u0D00-\u0D7F]/.test(w)) {
          alert(`"${w}" must contain Malayalam characters!`);
          malInput.focus();
          return;
        }
      }

      if (/[\u0D00-\u0D7F]/.test(engVal)) {
        alert("The translit preferred spelling must be in English letters/Latin script (no Malayalam script characters)!");
        engInput.focus();
        return;
      }

      if (window.go?.main?.SettingsApp) {
        for (const w of malWords) {
          await window.go.main.SettingsApp.AddTransliteration(w, engVal);
        }
        malInput.value = '';
        engInput.value = '';
        loadMappings();
      }
    };

    const handleKey = async (e) => {
      if (e.key === 'Enter') {
        addTransBtn.click();
      }
    };
    malInput.onkeydown = handleKey;
    engInput.onkeydown = handleKey;
  }

  loadMappings();
}

export async function setupBilingualRouting() {
  const toggle = document.getElementById('bilingualRoutingToggle');
  if (!toggle) return;

  const whisperDropdown = document.getElementById('bilingualWhisperDropdown');
  const whisperLabel = document.getElementById('bilingualWhisperLabel');
  const whisperMenu = document.getElementById('bilingualWhisperDropdownMenu');

  const conformerDropdown = document.getElementById('bilingualConformerDropdown');
  const conformerLabel = document.getElementById('bilingualConformerLabel');
  const conformerMenu = document.getElementById('bilingualConformerDropdownMenu');

  const whisperSelectionDiv = document.getElementById('bilingualWhisperModelSelection');
  const conformerSelectionDiv = document.getElementById('bilingualConformerModelSelection');

  const cfg = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetConfig()
    : null;

  const models = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetModelsList()
    : [];

  const updateDropdownVisibility = () => {
    const show = toggle.checked;
    if (whisperSelectionDiv) whisperSelectionDiv.style.display = show ? 'flex' : 'none';
    if (conformerSelectionDiv) conformerSelectionDiv.style.display = show ? 'flex' : 'none';
  };

  // Populate Whisper Dropdown (only multilingual models allowed in bilingual mode)
  const whisperModels = models.filter(m => m.model_type === 'whisper' && m.filename.endsWith('.bin') && m.language === 'multilingual' && m.is_downloaded);

  let activeWhisper = cfg?.bilingual_whisper_model || '';
  if (activeWhisper === '' || activeWhisper.endsWith('.en.bin')) {
    const firstMulti = whisperModels.find(m => m.is_downloaded);
    activeWhisper = firstMulti ? firstMulti.filename : 'ggml-tiny.bin';
  }

  if (cfg) {
    toggle.checked = cfg.bilingual_routing_enabled || false;
    if (whisperLabel) whisperLabel.textContent = activeWhisper;
    if (conformerLabel) conformerLabel.textContent = cfg.bilingual_conformer_model || 'indicconformer.int8.onnx';
  }
  updateDropdownVisibility();

  if (whisperMenu) {
    if (whisperModels.length === 0) {
      whisperMenu.innerHTML = `<div class="dropdown-item disabled" style="color: var(--text-muted); cursor: not-allowed; padding: 10px 14px;">No multilingual Whisper models downloaded</div>`;
    } else {
      whisperMenu.innerHTML = whisperModels.map(m => `
        <div class="dropdown-item ${m.filename === activeWhisper ? 'active' : ''}" data-value="${m.filename}">${m.name}</div>
      `).join('');
    }

    const items = whisperMenu.querySelectorAll('.dropdown-item:not(.disabled)');
    items.forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const selected = item.getAttribute('data-value');
        whisperLabel.textContent = selected;
        whisperDropdown.classList.remove('open');
        
        // Remove active class from siblings and add to this one
        whisperMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        if (window.go?.main?.SettingsApp) {
          await window.go.main.SettingsApp.SetBilingualWhisperModel(selected);
        }
      });
    });
  }

  // Populate Conformer Dropdown
  const conformerModels = models.filter(m => m.model_type === 'whisper' && m.filename.endsWith('.onnx') && m.is_downloaded);
  if (conformerMenu) {
    if (conformerModels.length === 0) {
      conformerMenu.innerHTML = `<div class="dropdown-item disabled" style="color: var(--text-muted); cursor: not-allowed; padding: 10px 14px;">No Conformer models downloaded</div>`;
    } else {
      conformerMenu.innerHTML = conformerModels.map(m => `
        <div class="dropdown-item ${m.filename === cfg?.bilingual_conformer_model ? 'active' : ''}" data-value="${m.filename}">${m.name}</div>
      `).join('');
    }

    const items = conformerMenu.querySelectorAll('.dropdown-item:not(.disabled)');
    items.forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const selected = item.getAttribute('data-value');
        conformerLabel.textContent = selected;
        conformerDropdown.classList.remove('open');

        // Remove active class from siblings and add to this one
        conformerMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        if (window.go?.main?.SettingsApp) {
          await window.go.main.SettingsApp.SetBilingualConformerModel(selected);
        }
      });
    });
  }

  // Toggle Dropdown logic
  if (whisperDropdown) {
    const trigger = whisperDropdown.querySelector('.dropdown-trigger');
    trigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      whisperDropdown.classList.toggle('open');
      conformerDropdown?.classList.remove('open');
    });
  }

  if (conformerDropdown) {
    const trigger = conformerDropdown.querySelector('.dropdown-trigger');
    trigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      conformerDropdown.classList.toggle('open');
      whisperDropdown?.classList.remove('open');
    });
  }

  // Close when clicking outside
  document.addEventListener('click', () => {
    whisperDropdown?.classList.remove('open');
    conformerDropdown?.classList.remove('open');
  });

  toggle.addEventListener('change', () => {
    updateDropdownVisibility();
    if (window.go?.main?.SettingsApp) {
      window.go.main.SettingsApp.SetBilingualRoutingEnabled(toggle.checked);
    }
  });
}

