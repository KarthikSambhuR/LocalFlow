// Shared UI utilities: escaping, non-blocking toasts, button feedback, time formatting.

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatTimeMMSS(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

let toastContainer = null;

function ensureToastContainer() {
  if (!toastContainer || !document.body.contains(toastContainer)) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'lf-toast-container';
    toastContainer.id = 'lfToastContainer';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/**
 * Shows a non-blocking toast notification.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [type='info']
 * @param {number} [duration=3200]
 */
export function showToast(message, type = 'info', duration = 3200) {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `lf-toast lf-toast-${type}`;

  const iconMap = {
    success: `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    error: `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info: `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };

  toast.innerHTML = `
    <span class="lf-toast-icon">${iconMap[type] || iconMap.info}</span>
    <span class="lf-toast-msg">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));

  const dismiss = () => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 200);
  };

  toast.addEventListener('click', dismiss);
  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}

export function setButtonFeedback(btn, label = 'Copied', duration = 1500) {
  if (!btn) return;
  const origHtml = btn.dataset.origHtml || btn.innerHTML;
  btn.dataset.origHtml = origHtml;
  btn.classList.add('is-success');
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>${escapeHtml(label)}</span>`;
  clearTimeout(btn._feedbackTimer);
  btn._feedbackTimer = setTimeout(() => {
    btn.classList.remove('is-success');
    btn.innerHTML = origHtml;
  }, duration);
}
