import './style.css';

const state = {
  screen: 'welcome', // welcome, options, progress, finished
  targetPath: '',
  createDesktopShortcut: true,
  createStartMenuShortcut: true,
  launchOnFinish: true,
  progress: 0,
  statusText: 'Preparing installation...',
  errorMessage: ''
};

const appContainer = document.getElementById('app');

function render() {
  appContainer.innerHTML = '';

  const steps = ['welcome', 'options', 'progress', 'finished'];
  const currentIdx = steps.indexOf(state.screen);

  const header = document.createElement('div');
  header.className = 'window-header';

  const dragArea = document.createElement('div');
  dragArea.className = 'drag-area';
  dragArea.innerHTML = `
    <span class="app-title">LocalFlow Setup</span>
    <div class="step-pills">
      ${steps.map((_, i) => `<span class="step-dot ${i < currentIdx ? 'done' : i === currentIdx ? 'active' : ''}"></span>`).join('')}
    </div>
  `;

  const closeBtn = document.createElement('div');
  closeBtn.className = 'close-btn';
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
  closeBtn.addEventListener('click', () => window.go?.main?.App?.CloseWindow());

  header.appendChild(dragArea);
  header.appendChild(closeBtn);
  appContainer.appendChild(header);

  const content = document.createElement('div');
  content.className = 'wizard-content';

  if (state.screen === 'welcome') content.appendChild(renderWelcome());
  else if (state.screen === 'options') content.appendChild(renderOptions());
  else if (state.screen === 'progress') content.appendChild(renderProgress());
  else if (state.screen === 'finished') content.appendChild(renderFinished());

  appContainer.appendChild(content);
}

function renderWelcome() {
  const container = document.createElement('div');
  container.className = 'screen';
  container.innerHTML = `
    <div>
      <h1>Install LocalFlow v1.5.0</h1>
      <p class="description">
        Offline speech-to-text dictation, meeting transcription, and local AI refinement.
      </p>
      <div class="feature-grid">
        <div class="feature-card">
          <strong>100% Local</strong>
          <span>Whisper, Conformer, and local GGUF models run on your machine.</span>
        </div>
        <div class="feature-card">
          <strong>Instant Paste</strong>
          <span>Hold Ctrl + Win anywhere to dictate directly into any app.</span>
        </div>
        <div class="feature-card">
          <strong>Clean Uninstall</strong>
          <span>Zero bloat—lightweight standalone uninstaller included.</span>
        </div>
      </div>
    </div>
    <div class="actions">
      <button class="btn-primary" id="start-btn">Continue</button>
    </div>
  `;

  container.querySelector('#start-btn').addEventListener('click', () => {
    state.screen = 'options';
    render();
  });

  return container;
}

function renderOptions() {
  const container = document.createElement('div');
  container.className = 'screen';

  const titleNode = document.createElement('div');
  titleNode.innerHTML = `
    <h1>Installation Options</h1>
    <p class="description">Per-user installation requires no administrator prompt.</p>
  `;
  container.appendChild(titleNode);

  const selector = document.createElement('div');
  selector.className = 'path-selector';

  const pathInput = document.createElement('input');
  pathInput.className = 'path-input';
  pathInput.type = 'text';
  pathInput.value = state.targetPath;
  pathInput.addEventListener('input', (e) => {
    state.targetPath = e.target.value;
  });

  const browseBtn = document.createElement('button');
  browseBtn.className = 'btn-secondary';
  browseBtn.innerText = 'Browse';
  browseBtn.addEventListener('click', async () => {
    if (window.go?.main?.App) {
      try {
        const path = await window.go.main.App.SelectFolder(state.targetPath);
        if (path) {
          state.targetPath = path;
          pathInput.value = path;
        }
      } catch (err) {
        console.error('Failed to select folder', err);
      }
    }
  });

  selector.appendChild(pathInput);
  selector.appendChild(browseBtn);
  container.appendChild(selector);

  const checkGroup = document.createElement('div');
  checkGroup.className = 'checkbox-group';

  const createCheck = (labelText, checked, key) => {
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', (e) => { state[key] = e.target.checked; });
    const custom = document.createElement('div');
    custom.className = 'custom-checkbox';
    label.appendChild(input);
    label.appendChild(custom);
    label.appendChild(document.createTextNode(labelText));
    return label;
  };

  checkGroup.appendChild(createCheck('Create Desktop shortcut', state.createDesktopShortcut, 'createDesktopShortcut'));
  checkGroup.appendChild(createCheck('Create Start Menu shortcut', state.createStartMenuShortcut, 'createStartMenuShortcut'));
  container.appendChild(checkGroup);

  if (state.errorMessage) {
    const err = document.createElement('div');
    err.className = 'error-text';
    err.innerText = state.errorMessage;
    container.appendChild(err);
  }

  const actions = document.createElement('div');
  actions.className = 'actions';

  const backBtn = document.createElement('button');
  backBtn.className = 'btn-secondary';
  backBtn.innerText = 'Back';
  backBtn.addEventListener('click', () => {
    state.errorMessage = '';
    state.screen = 'welcome';
    render();
  });

  const installBtn = document.createElement('button');
  installBtn.className = 'btn-primary';
  installBtn.id = 'install-btn';
  installBtn.innerText = 'Install';
  installBtn.addEventListener('click', async () => {
    state.errorMessage = '';
    if (!window.go?.main?.App) return;
    installBtn.disabled = true;
    try {
      const writable = await window.go.main.App.CheckWritePermission(state.targetPath);
      if (!writable) {
        state.errorMessage = 'Permission denied: Cannot write to selected directory.';
        installBtn.disabled = false;
        render();
        return;
      }

      state.screen = 'progress';
      state.progress = 0;
      state.statusText = 'Extracting LocalFlow files...';
      render();

      window.go.main.App.Install(
        state.targetPath,
        state.createDesktopShortcut,
        state.createStartMenuShortcut
      ).then(() => {
        state.screen = 'finished';
        render();
      }).catch((err) => {
        state.screen = 'options';
        state.errorMessage = 'Installation Error: ' + err;
        render();
      });
    } catch (err) {
      state.errorMessage = 'Validation failed: ' + err;
      installBtn.disabled = false;
      render();
    }
  });

  actions.appendChild(backBtn);
  actions.appendChild(installBtn);
  container.appendChild(actions);

  return container;
}

function renderProgress() {
  const container = document.createElement('div');
  container.className = 'screen';
  container.innerHTML = `
    <div>
      <h1>Installing LocalFlow</h1>
      <p class="description">Configuring application files, runtime libraries, and shortcuts.</p>
    </div>
    <div class="progress-container">
      <div class="progress-header">
        <span id="status-text">${state.statusText}</span>
        <span class="progress-pct" id="pct-text">${state.progress}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-bar" id="pbar" style="width: ${state.progress}%"></div>
      </div>
    </div>
  `;
  return container;
}

function renderFinished() {
  const container = document.createElement('div');
  container.className = 'screen';
  container.innerHTML = `
    <div class="checkmark-wrapper">
      <div class="checkmark-circle"><div class="checkmark"></div></div>
    </div>
    <h1 style="text-align: center; margin-bottom: 6px;">Setup Complete</h1>
    <p class="description" style="text-align: center;">LocalFlow v1.5.0 is ready to use.</p>

    <div style="display: flex; justify-content: center; margin: 12px 0;">
      <label class="checkbox-label" id="launch-lbl"></label>
    </div>

    <div class="actions">
      <button class="btn-primary" id="finish-btn">Finish</button>
    </div>
  `;

  const checkLabel = container.querySelector('#launch-lbl');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = state.launchOnFinish;
  input.addEventListener('change', (e) => { state.launchOnFinish = e.target.checked; });
  const custom = document.createElement('div');
  custom.className = 'custom-checkbox';
  checkLabel.appendChild(input);
  checkLabel.appendChild(custom);
  checkLabel.appendChild(document.createTextNode('Launch LocalFlow now'));

  container.querySelector('#finish-btn').addEventListener('click', () => {
    if (window.go?.main?.App) {
      if (state.launchOnFinish) window.go.main.App.LaunchApp(state.targetPath);
      else window.go.main.App.CloseWindow();
    }
  });

  return container;
}

if (window.runtime?.EventsOn) {
  window.runtime.EventsOn('install-progress', (data) => {
    if (!data) return;
    state.progress = data.percentage || 0;
    state.statusText = data.status || '';
    const pbar = document.getElementById('pbar');
    const statusNode = document.getElementById('status-text');
    const pctNode = document.getElementById('pct-text');
    if (pbar) pbar.style.width = `${state.progress}%`;
    if (statusNode) statusNode.innerText = state.statusText;
    if (pctNode) pctNode.innerText = `${state.progress}%`;
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.go?.main?.App?.CloseWindow();
  } else if (e.key === 'Enter') {
    if (state.screen === 'welcome') document.getElementById('start-btn')?.click();
    else if (state.screen === 'options' && document.activeElement?.tagName !== 'INPUT') {
      document.getElementById('install-btn')?.click();
    } else if (state.screen === 'finished') {
      document.getElementById('finish-btn')?.click();
    }
  }
});

async function bootstrap() {
  if (window.go?.main?.App?.GetDefaultInstallDir) {
    try {
      state.targetPath = await window.go.main.App.GetDefaultInstallDir();
    } catch (_) {}
  }
  if (!state.targetPath) {
    state.targetPath = 'C:\\Program Files\\LocalFlow';
  }
  render();
}

bootstrap();
