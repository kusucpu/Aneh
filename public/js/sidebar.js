import Storage from './storage.js';

const TYPE_ICON  = { chat:'💬', image:'🖼️', audio:'🎵', video:'🎬', embedding:'🔢' };
const TYPE_LABEL = { chat:'Chat', image:'Gambar', audio:'Audio', video:'Video', embedding:'Embedding' };

const PROVIDERS = {
  groq:         { name:'Groq',                  keyRequired:false, serverKey:true,  placeholder:'gsk_xxxxxxxxxxxx (boleh kosong)', imageProvider:false, note:'Key server udah standby gan, gratis tis-tisan! 😎 Mau pake jurus key sendiri? Gas isi di bawah.' },
  openrouter:   { name:'OpenRouter',             keyRequired:true,  serverKey:false, placeholder:'sk-or-xxxxxxxxxx',            imageProvider:false, note:'Model gratisan numpuk di sini, tapi kadang rame & ngambek. Eror? Cus pindah model laen aja 🙃' },
  gemini:       { name:'Google Gemini',          keyRequired:true,  serverKey:false, placeholder:'AIzaSyxxxxxxxxxx',            imageProvider:false, note:'Buatan Google, encer & pinter — tapi jatah gratisnya suka pelit 😅' },
  pollinations: { name:'Pollinations.ai',        keyRequired:true,  serverKey:false, placeholder:'sk_xxxx atau pk_xxxx',        imageProvider:true,  note:'Butuh key dulu biar gaspol. Jajan gratis di enter.pollinations.ai 🍯🔑' },
};

export function initSidebar(onSelectSession, onNewChat) {
  const sidebar      = document.getElementById('sidebar');
  const overlay      = document.getElementById('sidebar-overlay');
  const btnHamburger = document.getElementById('btn-hamburger');
  const btnClose     = document.getElementById('btn-sidebar-close');
  const btnNew       = document.getElementById('btn-new-chat');
  const btnSettings  = document.getElementById('btn-settings');
  const viewHistory  = document.getElementById('sidebar-view-history');
  const viewSettings = document.getElementById('sidebar-view-settings');

  btnHamburger?.addEventListener('click', () => { sidebar.classList.add('open'); overlay.classList.add('show'); });
  btnClose?.addEventListener('click', closeSidebar);
  overlay?.addEventListener('click', closeSidebar);

  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('show'); }

  btnNew?.addEventListener('click', () => { closeSidebar(); onNewChat(); renderHistory(); });

  let settingsOpen = false;
  btnSettings?.addEventListener('click', () => {
    settingsOpen = !settingsOpen;
    viewHistory.classList.toggle('hidden', settingsOpen);
    viewSettings.classList.toggle('hidden', !settingsOpen);
    btnSettings.innerHTML = settingsOpen
      ? `${iconArrow()}<span>Riwayat</span>`
      : `${iconGear()}<span>Pengaturan</span>`;
    if (settingsOpen) initSettingsView();
  });

  window._onSelectSession = (id) => { onSelectSession(id); closeSidebar(); };
  window._onDeleteSession = (id) => { if (window._currentSessionId === id) onNewChat(); };

  renderHistory();
}

// ── History ───────────────────────────────────────────────────────
let lastActiveId = null;

export async function renderHistory(activeId = null) {
  lastActiveId = activeId;
  ensureContextMenu();
  const list = document.getElementById('history-list');
  if (!list) return;
  list.innerHTML = `<div class="history-empty">Memuat riwayat…</div>`;
  const sessions = await Storage.getSessions();
  if (!sessions.length) {
    list.innerHTML = `<div class="history-empty">Belum ada riwayat.<br>Mulai ngobrol dulu!</div>`;
    return;
  }
  list.innerHTML = sessions.map(s => `
    <div class="history-item ${s.id === activeId ? 'active':''}" data-id="${s.id}">
      <button class="history-item-menu-btn" data-id="${s.id}" title="Opsi">
        <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
      </button>
      <span class="history-title">${esc(s.title || 'Chat tanpa judul')}</span>
      ${s.pinned ? '<span class="pin-badge" title="Dipin">📌</span>' : ''}
    </div>`).join('');

  list.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.history-item-menu-btn')) return;
      window._onSelectSession?.(el.dataset.id);
    });
  });
  list.querySelectorAll('.history-item-menu-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const sessions2 = await Storage.getSessions();
      const session = sessions2.find(s => s.id === id);
      if (session) openHistoryMenu(btn, session);
    });
  });
}

// ── Context menu (Edit Judul / Pin / Hapus) ───────────────────────
function ensureContextMenu() {
  if (document.getElementById('history-context-menu')) return;
  const div = document.createElement('div');
  div.id = 'history-context-menu';
  div.className = 'history-context-menu';
  document.body.appendChild(div);
  document.addEventListener('click', e => {
    if (!e.target.closest('.history-item-menu-btn') && !e.target.closest('.history-context-menu')) {
      closeHistoryMenu();
    }
  });
}
function closeHistoryMenu() {
  document.getElementById('history-context-menu')?.classList.remove('show');
}

function openHistoryMenu(btn, session) {
  const menu = document.getElementById('history-context-menu');
  menu.innerHTML = `
    <button data-action="rename">✏️ <span>Edit Judul</span></button>
    <button data-action="pin">📌 <span>${session.pinned ? 'Lepas Pin' : 'Pin Chat'}</span></button>
    <button data-action="delete" class="danger">🗑️ <span>Hapus</span></button>`;

  const rect = btn.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${Math.max(8, rect.left)}px`;
  menu.classList.add('show');

  menu.querySelectorAll('button[data-action]').forEach(b => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const action = b.dataset.action;
      closeHistoryMenu();
      if (action === 'delete') {
        await Storage.deleteSession(session.id);
        renderHistory(lastActiveId);
        window._onDeleteSession?.(session.id);
      } else if (action === 'pin') {
        session.pinned = !session.pinned;
        await Storage.saveSession(session);
        renderHistory(lastActiveId);
      } else if (action === 'rename') {
        startRenameInline(session.id);
      }
    };
  });
}

async function startRenameInline(id) {
  const item = document.querySelector(`.history-item[data-id="${id}"]`);
  if (!item) return;
  const titleSpan = item.querySelector('.history-title');
  if (!titleSpan) return;
  const current = titleSpan.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'history-rename-input';
  input.value = current;
  titleSpan.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  const commit = async () => {
    if (committed) return;
    committed = true;
    const newTitle = input.value.trim() || current;
    const sessions = await Storage.getSessions();
    const fresh = sessions.find(s => s.id === id);
    if (fresh) { fresh.title = newTitle; await Storage.saveSession(fresh); }
    renderHistory(lastActiveId);
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { committed = true; renderHistory(lastActiveId); }
  });
  input.addEventListener('blur', commit);
}

// ── Settings View ─────────────────────────────────────────────────
function initSettingsView() {
  const chatProviderIds  = Object.keys(PROVIDERS);
  const mediaProviderIds = Object.keys(PROVIDERS).filter(id => PROVIDERS[id].imageProvider);

  initProviderSection('chat', chatProviderIds, 'chatProvider');
  initProviderSection('media', mediaProviderIds, 'imageProvider');
}

function initProviderSection(kind, providerIds, settingKey) {
  const sel = document.getElementById(`settings-${kind}-provider`);
  if (!sel || !providerIds.length) return;

  sel.innerHTML = providerIds.map(id => `<option value="${id}">${PROVIDERS[id].name}</option>`).join('');

  const saved = Storage.getSettings();
  let current = saved[settingKey] || providerIds[0];
  if (!providerIds.includes(current)) {
    current = providerIds[0];
    Storage.saveSettings({ [settingKey]: current });
  }
  sel.value = current;

  renderProviderDetails(kind, current, settingKey);

  sel.onchange = () => {
    Storage.saveSettings({ [settingKey]: sel.value });
    renderProviderDetails(kind, sel.value, settingKey);
  };
}

function renderProviderDetails(kind, providerId, settingKey) {
  const cfg = PROVIDERS[providerId];
  const saved = Storage.getSettings();
  const currentKey = saved.apiKeys?.[providerId] || '';

  const keyInput = document.getElementById(`settings-${kind}-key-input`);
  const noteEl = document.getElementById(`settings-${kind}-provider-note`);
  keyInput.value = currentKey;
  keyInput.placeholder = cfg.placeholder;

  if (noteEl) {
    noteEl.textContent = cfg.note || '';
    noteEl.style.display = cfg.note ? 'block' : 'none';
  }

  updateKeyStatusFor(kind, !!currentKey, providerId);

  document.getElementById(`btn-save-${kind}-key`).onclick = () => {
    const val = keyInput.value.trim();
    Storage.saveSettings({ apiKeys: { [providerId]: val } });
    updateKeyStatusFor(kind, !!val, providerId);
    loadModelsForSection(kind, providerId, val);
    showToast(val ? '✓ Key tersimpan' : 'Key dikosongkan');
  };

  document.getElementById(`btn-toggle-${kind}-key`).onclick = () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
  };

  loadModelsForSection(kind, providerId, currentKey);
}

function loadModelsForSection(kind, providerId, apiKey) {
  if (kind === 'chat') {
    loadModelGroup(providerId, apiKey, providerId, 'settings-chat-models', 'chatModels');
  } else {
    loadModelGroup(providerId, apiKey, `${providerId}_image`, 'settings-image-models-list', 'imageModels');
    loadModelGroup(providerId, apiKey, `${providerId}_audio`, 'settings-audio-models-list', 'audioModels');
  }
}

function updateKeyStatusFor(kind, hasKey, providerId) {
  const el = document.getElementById(`settings-${kind}-key-status`);
  if (!el) return;
  const cfg = PROVIDERS[providerId];
  if (hasKey) {
    el.textContent = '● Key kamu aktif';
    el.className = 'key-status active';
  } else if (cfg?.serverKey) {
    el.textContent = '● Server key aktif';
    el.className = 'key-status active';
  } else {
    el.textContent = '○ Belum diset';
    el.className = 'key-status';
  }
}

async function loadModelGroup(providerId, apiKey, fetchKey, containerId, storageKey) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<div class="models-loading">Memuat…</div>`;
  try {
    const res = await fetch('/api/providers/models', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: fetchKey, apiKey }),
    });
    const data = await res.json();
    renderModelList(container, data.models || [], providerId, storageKey);
  } catch { container.innerHTML = '<div class="models-error">Gagal memuat.</div>'; }
}

function renderModelList(container, models, providerId, storageKey) {
  if (!models.length) { container.innerHTML = '<div class="models-error">Tidak ada model.</div>'; return; }

  const saved = Storage.getSettings();
  const selectedModel = saved[storageKey]?.[providerId] || '';

  const groups = {};
  models.forEach(m => { const t = m.type || 'chat'; (groups[t] = groups[t] || []).push(m); });

  const typeOrder = ['chat','image','audio','video','embedding'];
  let html = '';
  for (const type of typeOrder) {
    if (!groups[type]) continue;
    html += groups[type].map((m, i) => {
      const isSelected = selectedModel ? selectedModel === m.id : (i === 0);
      return `
        <label class="model-option ${isSelected ? 'selected' : ''}">
          <input type="radio" name="${storageKey}_${providerId}" value="${m.id}" ${isSelected ? 'checked' : ''}>
          <div class="model-info">
            <span class="model-name">${TYPE_ICON[type] || '•'} ${esc(m.name)}</span>
            ${m.desc ? `<span class="model-desc">${esc(m.desc)}</span>` : ''}
          </div>
        </label>`;
    }).join('');
  }
  container.innerHTML = html;

  if (!selectedModel && models.length) {
    Storage.saveSettings({ [storageKey]: { [providerId]: models[0].id } });
  }

  container.querySelectorAll(`input[name="${storageKey}_${providerId}"]`).forEach(radio => {
    radio.addEventListener('change', () => {
      Storage.saveSettings({ [storageKey]: { [providerId]: radio.value } });
      container.querySelectorAll('.model-option').forEach(o => o.classList.remove('selected'));
      radio.closest('.model-option').classList.add('selected');
    });
  });
}

// ── Utils ─────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function iconGear() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`; }
function iconArrow() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`; }
