import './style.css';

// Default configuration
let state = {
  screen: 'welcome', // welcome, options, progress, finished
  targetPath: 'C:\\Program Files\\LocalFlow',
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

  // 1. Header (Window Title & Close Button)
  const header = document.createElement('div');
  header.className = 'window-header';
  
  const dragArea = document.createElement('div');
  dragArea.className = 'drag-area';
  dragArea.innerHTML = `<span class="app-title">LocalFlow Setup</span>`;
  
  const closeBtn = document.createElement('div');
  closeBtn.className = 'close-btn';
  closeBtn.innerHTML = '✕';
  closeBtn.addEventListener('click', () => {
    if (window.go && window.go.main.App) {
      window.go.main.App.CloseWindow();
    }
  });

  header.appendChild(dragArea);
  header.appendChild(closeBtn);
  appContainer.appendChild(header);

  // 2. Main content container
  const content = document.createElement('div');
  content.className = 'wizard-content';

  // Render current screen
  if (state.screen === 'welcome') {
    content.appendChild(renderWelcome());
  } else if (state.screen === 'options') {
    content.appendChild(renderOptions());
  } else if (state.screen === 'progress') {
    content.appendChild(renderProgress());
  } else if (state.screen === 'finished') {
    content.appendChild(renderFinished());
  }

  appContainer.appendChild(content);
}

// WELCOME SCREEN
function renderWelcome() {
  const container = document.createElement('div');
  container.className = 'screen';
  container.innerHTML = `
    <div style="margin-top: 10px; z-index: 10;">
      <h1>Welcome to LocalFlow</h1>
      <p class="description">
        LocalFlow is a minimal, offline dictation overlay powered by Whisper.cpp.<br>
        Let's get the software and required system components installed on your computer.
      </p>
    </div>
    <div class="ambient-bg">
      <div class="wave"></div>
      <div class="wave wave-2"></div>
    </div>
    <div class="actions" style="z-index: 10;">
      <button class="btn-primary" id="start-btn">Next</button>
    </div>
  `;

  // Event Listener
  container.querySelector('#start-btn').addEventListener('click', () => {
    state.screen = 'options';
    render();
  });

  return container;
}

// OPTIONS SCREEN
function renderOptions() {
  const container = document.createElement('div');
  container.className = 'screen';

  const titleNode = document.createElement('div');
  titleNode.innerHTML = `
    <h1>Install Settings</h1>
    <p class="description">Select where you want to install LocalFlow and choose shortcuts configuration.</p>
  `;
  container.appendChild(titleNode);

  // Path Selection
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
    if (window.go && window.go.main.App) {
      try {
        const path = await window.go.main.App.SelectFolder(state.targetPath);
        if (path) {
          state.targetPath = path;
          pathInput.value = path;
        }
      } catch (err) {
        console.error("Failed to select folder", err);
      }
    }
  });

  selector.appendChild(pathInput);
  selector.appendChild(browseBtn);
  container.appendChild(selector);

  // Checkboxes
  const checkGroup = document.createElement('div');
  checkGroup.className = 'checkbox-group';

  // Helper function to create custom checkbox
  const createCheck = (labelText, checked, key) => {
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', (e) => {
      state[key] = e.target.checked;
    });

    const custom = document.createElement('div');
    custom.className = 'custom-checkbox';

    label.appendChild(input);
    label.appendChild(custom);
    label.appendChild(document.createTextNode(labelText));
    return label;
  };

  checkGroup.appendChild(createCheck("Create Desktop Shortcut", state.createDesktopShortcut, 'createDesktopShortcut'));
  checkGroup.appendChild(createCheck("Create Start Menu Shortcut", state.createStartMenuShortcut, 'createStartMenuShortcut'));
  container.appendChild(checkGroup);

  if (state.errorMessage) {
    const err = document.createElement('div');
    err.className = 'error-text';
    err.innerText = state.errorMessage;
    container.appendChild(err);
  }

  // Actions
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
  installBtn.innerText = 'Install';
  installBtn.addEventListener('click', async () => {
    state.errorMessage = '';
    if (window.go && window.go.main.App) {
      installBtn.disabled = true;
      try {
        // Validate write permission
        const writable = await window.go.main.App.CheckWritePermission(state.targetPath);
        if (!writable) {
          state.errorMessage = 'Permission denied: Cannot write to selected directory.';
          installBtn.disabled = false;
          render();
          return;
        }

        // Run Installation
        state.screen = 'progress';
        state.progress = 0;
        state.statusText = 'Extracting LocalFlow resources...';
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
    }
  });

  actions.appendChild(backBtn);
  actions.appendChild(installBtn);
  container.appendChild(actions);

  return container;
}

// PROGRESS SCREEN
function renderProgress() {
  const container = document.createElement('div');
  container.className = 'screen';
  
  container.innerHTML = `
    <div style="margin-top: 10px;">
      <h1>Installing LocalFlow</h1>
      <p class="description">Please wait while files and libraries are being configured...</p>
    </div>
    <div class="progress-container">
      <div class="progress-track">
        <div class="progress-bar" id="pbar" style="width: ${state.progress}%"></div>
      </div>
      <div class="status-text" id="status-text">${state.statusText}</div>
    </div>
  `;

  return container;
}

// FINISHED SCREEN
function renderFinished() {
  const container = document.createElement('div');
  container.className = 'screen';
  container.innerHTML = `
    <div class="checkmark-wrapper">
      <div class="checkmark-circle">
        <div class="checkmark"></div>
      </div>
    </div>
    <h1 style="text-align: center; margin-bottom: 6px;">Setup Complete</h1>
    <p class="description" style="text-align: center;">LocalFlow has been successfully installed on your PC!</p>
    
    <div style="display: flex; justify-content: center; margin: 20px 0;">
      <label class="checkbox-label" id="launch-lbl"></label>
    </div>

    <div class="ambient-bg">
      <div class="wave"></div>
      <div class="wave wave-2"></div>
    </div>

    <div class="actions" style="z-index: 10;">
      <button class="btn-primary" id="finish-btn">Finish</button>
    </div>
  `;

  // Append customized launch checkbox
  const checkLabel = container.querySelector('#launch-lbl');
  
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = state.launchOnFinish;
  input.addEventListener('change', (e) => {
    state.launchOnFinish = e.target.checked;
  });

  const custom = document.createElement('div');
  custom.className = 'custom-checkbox';

  checkLabel.appendChild(input);
  checkLabel.appendChild(custom);
  checkLabel.appendChild(document.createTextNode("Launch LocalFlow immediately"));

  container.querySelector('#finish-btn').addEventListener('click', () => {
    if (window.go && window.go.main.App) {
      if (state.launchOnFinish) {
        window.go.main.App.LaunchApp(state.targetPath);
      } else {
        window.go.main.App.CloseWindow();
      }
    }
  });

  return container;
}

// Listen to Wails events for progress update
if (window.runtime && window.runtime.EventsOn) {
  window.runtime.EventsOn('install-progress', (data) => {
    if (data) {
      state.progress = data.percentage || 0;
      state.statusText = data.status || '';
      
      const pbar = document.getElementById('pbar');
      const statusNode = document.getElementById('status-text');
      if (pbar) pbar.style.width = `${state.progress}%`;
      if (statusNode) statusNode.innerText = state.statusText;
    }
  });
}

// Initial render
render();
