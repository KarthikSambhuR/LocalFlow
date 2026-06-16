import { state } from './state.js';
import { loadDashboard, showCustomConfirm } from './dashboard.js';


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
    const isConformer = activeModel === 'indic-conformer-600m-multilingual';

    document.querySelectorAll('.llm-choice-setting').forEach(el => {
      if (el.id === 'llmManglishSelection') {
        el.classList.toggle('visible', show && isConformer);
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

  const cfg = window.go?.main?.SettingsApp
    ? await window.go.main.SettingsApp.GetConfig()
    : null;

  k1Label.textContent = cfg ? cfg.keybind1_name : "Ctrl";
  k2Label.textContent = cfg ? cfg.keybind2_name : "Win";
  if (sideK1) sideK1.textContent = k1Label.textContent;
  if (sideK2) sideK2.textContent = k2Label.textContent;

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

export async function setupModelsSettings() {
  const modelListWhisper = document.getElementById('modelListWhisper');
  const modelListLLM = document.getElementById('modelListLLM');
  if (!modelListWhisper || !modelListLLM) return;

  let whisperExpanded = false;
  let llmExpanded = false;

  const renderModels = async () => {
    if (!window.go?.main?.SettingsApp) return;
    try {
      const allModels = await window.go.main.SettingsApp.GetModelsList() || [];
      modelListWhisper.innerHTML = '';
      modelListLLM.innerHTML = '';
      modelListWhisper.className = 'model-list model-list-expanded';
      modelListLLM.className = 'model-list model-list-expanded';

      const renderPanel = (type, title, isExpanded, setExpanded) => {
        const models = allModels.filter(m => m.model_type === type || (type === 'whisper' && !m.model_type));
        const activeModel = models.find(m => m.is_active);
        const downloadedModels = models.filter(m => m.is_downloaded);
        const downloadedCount = downloadedModels.length;

        const panel = document.createElement('div');
        panel.className = `models-panel ${isExpanded ? 'open' : ''}`;
        panel.style.marginBottom = '20px';
        panel.innerHTML = `
          <button class="models-panel-header" type="button" aria-expanded="${isExpanded}">
            <svg class="models-panel-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transform: rotate(${isExpanded ? '90deg' : '0deg'});"><polyline points="9 18 15 12 9 6"/></svg>
            <span class="models-panel-title">${title}</span>
            <div class="models-panel-meta">
              <span class="badge" style="font-size: 11px; padding: 4px 10px; text-transform: none; font-weight: 700; width: auto;">${activeModel ? activeModel.name : 'No model active'}</span>
              <span class="badge ghost" style="font-size: 11px; padding: 4px 10px; text-transform: none; font-weight: 700; width: auto;">${downloadedCount}/${models.length} downloaded</span>
            </div>
          </button>
          <div class="models-panel-body">
            ${models.map(m => {
              const statusText = m.is_active ? 'Active' : m.is_disabled ? 'Unavailable' : m.is_downloaded ? 'Downloaded' : 'Available';
              const statusClass = m.is_active ? 'active' : m.is_disabled ? 'unavailable' : m.is_downloaded ? 'downloaded' : 'available';
              let actionHtml = '';
              if (m.is_downloading) {
                actionHtml = `
                  <div class="model-progress-container">
                    <div class="model-progress-bar-bg">
                      <div class="model-progress-bar-fill" id="bar-${m.id}" style="width: ${m.download_progress}%"></div>
                    </div>
                    <div class="model-progress-text" id="text-${m.id}">Downloading... ${m.download_progress}%</div>
                  </div>
                `;
              } else if (m.is_downloaded) {
                actionHtml = `
                  ${m.is_active ? '' : `<button class="kbd-btn activate-btn model-action-btn" ${m.is_disabled ? 'disabled title="Only Gemma is supported with Malayalam Conformer"' : ''} data-filename="${m.filename}">Activate</button>`}
                  ${downloadedCount > 1 && !m.is_active ? `<button class="kbd-btn delete-btn model-action-btn danger" data-filename="${m.filename}">Delete</button>` : ''}
                `;
              } else {
                actionHtml = `<button class="kbd-btn download-btn model-action-btn" ${m.is_disabled ? 'disabled title="Only Gemma is supported with Malayalam Conformer"' : ''} data-id="${m.id}">Download</button>`;
              }

              return `
                <div class="model-row ${m.is_disabled ? 'disabled' : ''}">
                  <div class="model-row-main">
                    <div class="model-name-line">
                      <span class="model-name">${m.name}</span>
                      <span class="model-status-pill ${statusClass}" ${m.is_disabled ? 'title="Only Gemma is supported with Malayalam Conformer"' : ''}>${statusText}</span>
                    </div>
                    <div class="model-desc">${m.description}</div>
                    <div class="model-row-specs">
                      <span>${m.size_mb} MB</span>
                      <span>${m.speed_label}</span>
                      <span>${m.speed_description}</span>
                    </div>
                    <div class="model-filename">${m.filename}</div>
                  </div>
                  <div class="model-row-actions">
                    ${actionHtml}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;

        const header = panel.querySelector('.models-panel-header');
        header.onclick = () => {
          setExpanded(!isExpanded);
          renderModels();
        };

        panel.querySelectorAll('.download-btn').forEach((downloadBtn) => {
          downloadBtn.onclick = async (event) => {
            event.stopPropagation();
            downloadBtn.disabled = true;
            downloadBtn.textContent = 'Starting...';
            await window.go.main.SettingsApp.DownloadModel(downloadBtn.dataset.id);
            renderModels();
          };
        });

        panel.querySelectorAll('.activate-btn').forEach((activateBtn) => {
          activateBtn.onclick = async (event) => {
            event.stopPropagation();
            activateBtn.disabled = true;
            activateBtn.textContent = 'Activating...';
            try {
              await window.go.main.SettingsApp.SetActiveModel(activateBtn.dataset.filename);
              window.dispatchEvent(new CustomEvent('active-model-changed'));
            } catch (err) {
              alert(err);
            }
            renderModels();
          };
        });

        panel.querySelectorAll('.delete-btn').forEach((deleteBtn) => {
          deleteBtn.onclick = async (event) => {
            event.stopPropagation();
            const model = models.find(m => m.filename === deleteBtn.dataset.filename);
            showCustomConfirm({
              title: 'Delete Model',
              message: `Are you sure you want to delete ${model?.name || 'this model'}?`,
              confirmText: 'Delete',
              onConfirm: async () => {
                deleteBtn.disabled = true;
                deleteBtn.textContent = 'Deleting...';
                try {
                  await window.go.main.SettingsApp.DeleteModel(deleteBtn.dataset.filename);
                } catch (err) {
                  alert(err);
                }
                renderModels();
              }
            });
          };
        });

        if (type === 'whisper') {
          modelListWhisper.appendChild(panel);
        } else {
          modelListLLM.appendChild(panel);
        }
      };

      renderPanel('whisper', 'Speech Recognition Models', whisperExpanded, (val) => whisperExpanded = val);
      renderPanel('llm', 'Grammar & Formatting Models', llmExpanded, (val) => llmExpanded = val);

    } catch (err) {
      console.error(err);
    }
  };

  window.runtime.EventsOn('model-download-progress', (id, percent) => {
    const fill = document.getElementById(`bar-${id}`);
    const txt = document.getElementById(`text-${id}`);
    if (fill && txt) {
      fill.style.width = `${percent}%`;
      txt.textContent = `Downloading... ${percent}%`;
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

