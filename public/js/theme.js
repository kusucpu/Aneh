import Storage from './storage.js';

const ICONS = {
  dark:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>`,
  light: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
};

let current = Storage.getTheme();

// On first load with no saved theme, use system preference
if (!localStorage.getItem('aneh_theme')) {
  current = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function updateButton() {
  const btn = document.getElementById('btn-theme');
  if (!btn) return;
  btn.innerHTML = ICONS[current];
  btn.title = current === 'dark' ? 'Mode Gelap' : 'Mode Terang';
}

export function initTheme() {
  applyTheme(current);
  updateButton();
  document.getElementById('btn-theme')?.addEventListener('click', () => {
    current = current === 'dark' ? 'light' : 'dark';
    Storage.saveTheme(current);
    applyTheme(current);
    updateButton();
  });
}
