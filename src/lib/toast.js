let toastEl = null;
let hideTimer = null;

function ensure() {
  if (toastEl) return toastEl;
  toastEl = document.createElement('div');
  toastEl.className = 'toast';
  document.body.appendChild(toastEl);
  return toastEl;
}

export function toast(message, duration = 2400) {
  const el = ensure();
  el.textContent = message;
  el.dataset.show = 'true';
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    el.dataset.show = 'false';
  }, duration);
}
