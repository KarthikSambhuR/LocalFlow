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

  // Window Titlebar
  const header = document.createElement('div');
  header.className = 'window-header';

  const dragArea = document.createElement('div');
  dragArea.className = 'drag-area';
  dragArea.innerHTML = `<span class="app-title">LocalFlow Setup</span>`;

  const closeBtn = document.createElement('div');
  closeBtn.className = 'close-btn';
  closeBtn.title = 'Close';
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="1.8"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
  closeBtn.addEventListener('click', () => window.go?.main?.App?.CloseWindow());

  header.appendChild(dragArea);
  header.appendChild(closeBtn);
  appContainer.appendChild(header);

  if (state.screen === 'welcome') renderWelcome();
  else if (state.screen === 'options') renderOptions();
  else if (state.screen === 'progress') renderProgress();
  else if (state.screen === 'finished') renderFinished();
}

function renderWelcome() {
  appContainer.insertAdjacentHTML('beforeend', `
    <div class="wizard-banner">
      <h1>Welcome to LocalFlow Setup</h1>
      <p>This wizard will guide you through the installation of LocalFlow v1.5.0.</p>
    </div>
    <div class="wizard-body">
      <div class="info-box">
        LocalFlow is an offline speech-to-text dictation, meeting transcription, and local AI refinement app.<br><br>
        Click <strong>Next</strong> to choose the installation folder and shortcuts.
      </div>
    </div>
    <div class="wizard-footer">
      <button class="btn-primary" id="next-btn">Next &gt;</button>
      <button class="btn-secondary" id="cancel-btn">Cancel</button>
    </div>
  `);

  document.getElementById('next-btn').addEventListener('click', () => {
    state.screen = 'options';
    render();
  });
  document.getElementById('cancel-btn').addEventListener('click', () => {
    window.go?.main?.App?.CloseWindow();
  });
}

function renderOptions() {
  appContainer.insertAdjacentHTML('beforeend', `
    <div class="wizard-banner">
      <h1>Choose Install Location</h1>
      <p>Choose the folder in which to install LocalFlow.</p>
    </div>
    <div class="wizard-body">
      <div>
        <label class="field-label" for="pathInput">Destination Folder</label>
        <div class="path-selector">
          <input class="path-input" id="pathInput" type="text" value="${state.targetPath.replace(/"/g, '&quot;')}" />
          <button class="btn-secondary" id="browse-btn" type="button">Browse...</button>
        </div>
      </div>
      <div class="checkbox-group">
        <label class="checkbox-label">
          <input type="checkbox" id="deskChk" ${state.createDesktopShortcut ? 'checked' : ''} />
          <span>Create Desktop shortcut</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" id="startChk" ${state.createStartMenuShortcut ? 'checked' : ''} />
          <span>Create Start Menu shortcut</span>
        </label>
      </div>
      ${state.errorMessage ? `<div class="error-text">${state.errorMessage}</div>` : ''}
    </div>
    <div class="wizard-footer">
      <button class="btn-secondary" id="back-btn">&lt; Back</button>
      <button class="btn-primary" id="install-btn">Install</button>
      <button class="btn-secondary" id="cancel-btn">Cancel</button>
    </div>
  `);

  const pathInput = document.getElementById('pathInput');
  pathInput.addEventListener('input', (e) => { state.targetPath = e.target.value; });

  document.getElementById('deskChk').addEventListener('change', (e) => { state.createDesktopShortcut = e.target.checked; });
  document.getElementById('startChk').addEventListener('change', (e) => { state.createStartMenuShortcut = e.target.checked; });

  document.getElementById('browse-btn').addEventListener('click', async () => {
    if (!window.go?.main?.App?.SelectFolder) return;
    try {
      const selected = await window.go.main.App.SelectFolder(state.targetPath);
      if (selected) {
        state.targetPath = selected;
        pathInput.value = selected;
      }
    } catch (err) {
      state.errorMessage = 'Could not open folder picker: ' + err;
      render();
    }
  });

  document.getElementById('back-btn').addEventListener('click', () => {
    state.errorMessage = '';
    state.screen = 'welcome';
    render();
  });

  document.getElementById('cancel-btn').addEventListener('click', () => {
    window.go?.main?.App?.CloseWindow();
  });

  const installBtn = document.getElementById('install-btn');
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
      state.statusText = 'Extracting files...';
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
}

function renderProgress() {
  appContainer.insertAdjacentHTML('beforeend', `
    <div class="wizard-banner">
      <h1>Installing</h1>
      <p>Please wait while LocalFlow is being installed.</p>
    </div>
    <div class="wizard-body">
      <div class="progress-wrap">
        <div class="progress-header">
          <span id="status-text">${state.statusText}</span>
          <span id="pct-text">${state.progress}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-bar" id="pbar" style="width: ${state.progress}%"></div>
        </div>
      </div>
    </div>
    <div class="wizard-footer">
      <button class="btn-secondary" disabled>Cancel</button>
    </div>
  `);
}

function renderFinished() {
  appContainer.insertAdjacentHTML('beforeend', `
    <div class="wizard-banner">
      <h1>Installation Complete</h1>
      <p>LocalFlow v1.5.0 has been installed on your computer.</p>
    </div>
    <div class="wizard-body">
      <div class="info-box">
        Click <strong>Finish</strong> to close Setup.
      </div>
      <div class="checkbox-group">
        <label class="checkbox-label">
          <input type="checkbox" id="launchChk" ${state.launchOnFinish ? 'checked' : ''} />
          <span>Run LocalFlow</span>
        </label>
      </div>
    </div>
    <div class="wizard-footer">
      <button class="btn-primary" id="finish-btn">Finish</button>
    </div>
  `);

  document.getElementById('launchChk').addEventListener('change', (e) => {
    state.launchOnFinish = e.target.checked;
  });

  document.getElementById('finish-btn').addEventListener('click', () => {
    if (window.go?.main?.App) {
      if (state.launchOnFinish) window.go.main.App.LaunchApp(state.targetPath);
      else window.go.main.App.CloseWindow();
    }
  });
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
