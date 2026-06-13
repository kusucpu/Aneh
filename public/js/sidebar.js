import Storage from './storage.js';

export function initSidebar(onSelectSession, onNewChat) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const btnHamburger = document.getElementById('btn-hamburger');
  const btnNewChat = document.getElementById('btn-new-chat');
  const btnApiKey = document.getElementById('btn-api-key');
  const apiModal = document.getElementById('modal-api');

  // Toggle mobile
  btnHamburger?.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
  });
  overlay?.addEventListener('click', closeSidebar);

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  }

  btnNewChat?.addEventListener('click', () => {
    closeSidebar();
    onNewChat();
    renderHistory();
  });

  // API Key modal
  btnApiKey?.addEventListener('click', () => {
    apiModal.classList.add('show');
    const input = document.getElementById('api-key-input');
    input.value = Storage.getApiKey();
    updateApiStatus();
  });

  document.getElementById('btn-modal-close')?.addEventListener('click', () => {
    apiModal.classList.remove('show');
  });
  apiModal?.addEventListener('click', (e) => {
    if (e.target === apiModal) apiModal.classList.remove('show');
  });

  document.getElementById('btn-save-key')?.addEventListener('click', () => {
    const val = document.getElementById('api-key-input').value.trim();
    Storage.saveApiKey(val);
    updateApiStatus();
    showKeyStatus('saved', val ? 'API key tersimpan.' : 'Key kosong disimpan.');
  });

  document.getElementById('btn-clear-key')?.addEventListener('click', () => {
    Storage.clearApiKey();
    document.getElementById('api-key-input').value = '';
    updateApiStatus();
    showKeyStatus('cleared', 'API key dihapus.');
  });

  document.getElementById('btn-cancel-key')?.addEventListener('click', () => {
    apiModal.classList.remove('show');
  });

  // Toggle password visibility
  document.getElementById('btn-toggle-key')?.addEventListener('click', () => {
    const input = document.getElementById('api-key-input');
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    document.getElementById('btn-toggle-key').innerHTML = isPass
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  });

  function updateApiStatus() {
    const dot = document.getElementById('api-key-status-dot');
    const has = !!Storage.getApiKey();
    dot?.classList.toggle('active', has);
  }

  function showKeyStatus(type, msg) {
    const el = document.getElementById('modal-key-status');
    el.textContent = msg;
    el.className = `modal-key-status ${type}`;
  }

  updateApiStatus();
  renderHistory();
}

export function renderHistory(activeId = null) {
  const list = document.getElementById('history-list');
  const sessions = Storage.getSessions();

  if (!sessions.length) {
    list.innerHTML = `<div class="history-empty">Belum ada riwayat chat.<br>Mulai ngobrol dulu!</div>`;
    return;
  }

  list.innerHTML = sessions.map(s => `
    <div class="history-item ${s.id === activeId ? 'active' : ''}" data-id="${s.id}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span>${escHtml(s.title || 'Chat tanpa judul')}</span>
      <button class="history-item-delete" data-id="${s.id}" title="Hapus">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </div>
  `).join('');

  list.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.history-item-delete')) return;
      const id = el.dataset.id;
      window._onSelectSession?.(id);
    });
  });

  list.querySelectorAll('.history-item-delete').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      Storage.deleteSession(id);
      renderHistory(activeId);
      window._onDeleteSession?.(id);
    });
  });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
