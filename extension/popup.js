// LocalFlow Meeting Companion - Popup Script
document.addEventListener('DOMContentLoaded', () => {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
    const badge = document.getElementById('statusBadge');
    const text = document.getElementById('statusText');
    if (res && res.connected) {
      if (badge) badge.className = 'status-badge connected';
      if (text) text.textContent = 'Connected to LocalFlow';
    } else {
      if (badge) badge.className = 'status-badge disconnected';
      if (text) text.textContent = 'Disconnected (Start LocalFlow)';
    }
  });
});
