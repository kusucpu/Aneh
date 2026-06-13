import Storage from './storage.js';

const TYPE_ICON = { chat:'💬', image:'🖼️', audio:'🎵', video:'🎬', embedding:'🔢' };
const TYPE_LABEL = { chat:'Chat', image:'Gambar', audio:'Audio', video:'Video', embedding:'Embedding' };

const PROVIDERS = {
  groq:        { name:'Groq',                keyRequired:true,  placeholder:'gsk_xxxxxxxxxxxx',  imageProvider:false },
  openrouter:  { name:'OpenRouter',           keyRequired:true,  placeholder:'sk-or-xxxxxxxxxx',  imageProvider:false },
  gemini:      { name:'Google Gemini',        keyRequired:true,  placeholder:'AIzaSyxxxxxxxxxx',  imageProvider:false },
  pollinations:{ name:'Pollinations (Gratis)',keyRequired:false, placeholder:'',                  imageProvider:true  },
  together:    { name:'Together AI',          keyRequired:true,  placeholder:'xxxxxxxxxxxxxxxxx', imageProvider:true  },
};

export function initSidebar(onSelectSession, onNewChat) {
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebar-overlay');
  const btnHamburger = document.getElementById('btn-hamburger');
  const btnClose  = document.getElementById('btn-sidebar-close');
  const btnNew    = document.getElementById('btn-new-chat');
  const btnSettings = document.getElementById('btn-settings');

  const viewHistory  = document.getElementById('sidebar-view-history');
  const viewSettings = document.getElementById('sidebar-view-settings');

  // Mobile open/close
  btnHamburger?.addEventListener('click', () => { sidebar.classList.add('open'); overlay.classList.add('show'); });
  btnClose?.addEventListener('click', closeSidebar);
  overlay?.addEventListener('click', closeSidebar);

  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('show'); }

  // New chat
  btnNew?.addEventListener('click', () => { closeSidebar(); onNewChat(); renderHistory(); });

  // Toggle settings
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

  // History item click
  window._onSelectSession = (id) => { onSelectSession(id); closeSidebar(); };
  window._onDeleteSession = (id) => { if (window._currentSessionId === id) onNewChat(); };

  renderHistory();
}

// ── History ──────────────────────────────────────────────────────
export function renderHistory(activeId = null) {
  const list = document.getElementById('history-list');
  if (!list) return;
  const sessions = Storage.getSessions();
  if (!sessions.length) {
    list.innerHTML = `<div class="history-empty">Belum ada riwayat.<br>Mulai ngobrol dulu!</div>`;
    return;
  }
  list.innerHTML = sessions.map(s => `
    <div class="history-item ${s.id === activeId ? 'active':''}" data-id="${s.id}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span>${esc(s.title || 'Chat tanpa judul')}</span>
      <button class="history-item-delete" data-id="${s.id}" title="Hapus">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>`).join('');

  list.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.history-item-delete')) return;
      window._onSelectSession?.(el.dataset.id);
    });
  });
  list.querySelectorAll('.history-item-delete').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      Storage.deleteSession(el.dataset.id);
      renderHistory(activeId);
      window._onDeleteSession?.(el.dataset.id);
    });
  });
}

// ── Settings View ─────────────────────────────────────────────────
function initSettingsView() {
  const providerSel = document.getElementById('settings-provider');
  if (!providerSel) return;

  // Populate provider options
  providerSel.innerHTML = Object.entries(PROVIDERS)
    .map(([id, p]) => `<option value="${id}">${p.name}</option>`).join('');

  const saved = Storage.getSettings();
  providerSel.value = saved.chatProvider || 'groq';

  renderSettingsForProvider(providerSel.value);

  providerSel.addEventListener('change', () => {
    Storage.saveSettings({ chatProvider: providerSel.value });
    renderSettingsForProvider(providerSel.value);
  });
}

function renderSettingsForProvider(providerId) {
  const cfg = PROVIDERS[providerId];
  const saved = Storage.getSettings();
  const currentKey = saved.apiKeys?.[providerId] || '';
  const hasKey = !!currentKey;

  // Key section
  const keySection = document.getElementById('settings-key-section');
  if (cfg.keyRequired) {
    keySection.classList.remove('hidden');
    document.getElementById('settings-key-input').value = currentKey;
    document.getElementById('settings-key-input').placeholder = cfg.placeholder;
    updateKeyStatus(hasKey);
  } else {
    keySection.classList.add('hidden');
  }

  // Bind save key
  const btnSave = document.getElementById('btn-save-settings-key');
  btnSave.onclick = () => {
    const val = document.getElementById('settings-key-input').value.trim();
    Storage.saveSettings({ apiKeys: { [providerId]: val } });
    updateKeyStatus(!!val);
    loadModels(providerId, val);
    showToast(val ? '✓ Key tersimpan' : 'Key dikosongkan');
  };

  // Toggle key visibility
  document.getElementById('btn-toggle-settings-key').onclick = () => {
    const inp = document.getElementById('settings-key-input');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  };

  loadModels(providerId, currentKey);

  // If provider supports image, also load image models
  if (cfg.imageProvider) loadImageModels(providerId, currentKey);
}

function updateKeyStatus(hasKey) {
  const el = document.getElementById('settings-key-status');
  if (!el) return;
  el.textContent = hasKey ? '● Aktif' : '○ Belum diset';
  el.className = 'key-status ' + (hasKey ? 'active' : '');
}

async function loadModels(providerId, apiKey) {
  const container = document.getElementById('settings-chat-models');
  if (!container) return;
  container.innerHTML = `<div class="models-loading">Memuat model…</div>`;
  try {
    const res = await fetch('/api/providers/models', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: providerId, apiKey }),
    });
    const data = await res.json();
    renderModelList(container, data.models || [], 'chat_model', providerId, 'chatModels');
  } catch { container.innerHTML = '<div class="models-error">Gagal memuat.</div>'; }
}

async function loadImageModels(providerId, apiKey) {
  const container = document.getElementById('settings-image-models');
  if (!container) return;
  container.classList.remove('hidden');
  container.innerHTML = `<div class="models-loading">Memuat model gambar…</div>`;
  const imageKey = providerId === 'pollinations' ? 'pollinations_image' : providerId + '_image';
  try {
    const res = await fetch('/api/providers/models', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: imageKey, apiKey }),
    });
    const data = await res.json();
    renderModelList(container, data.models || [], 'image_model', providerId, 'imageModels');
  } catch { container.innerHTML = '<div class="models-error">Gagal memuat.</div>'; }
}

function renderModelList(container, models, radioName, providerId, storageKey) {
  if (!models.length) { container.innerHTML = '<div class="models-error">Tidak ada model.</div>'; return; }

  const saved = Storage.getSettings();
  const selectedModel = saved[storageKey]?.[providerId] || '';

  // Group by type
  const groups = {};
  models.forEach(m => { const t = m.type || 'chat'; (groups[t] = groups[t]||[]).push(m); });

  const typeOrder = ['chat','image','audio','video','embedding'];
  let html = '';
  for (const type of typeOrder) {
    if (!groups[type]) continue;
    html += `<div class="model-group-label">${TYPE_ICON[type] || '•'} ${TYPE_LABEL[type] || type}</div>`;
    html += groups[type].map((m, i) => {
      const isSelected = selectedModel === m.id || (!selectedModel && type === 'chat' && i === 0 && storageKey === 'chatModels');
      return `
        <label class="model-option ${isSelected ? 'selected' : ''}">
          <input type="radio" name="${radioName}_${providerId}" value="${m.id}" ${isSelected ? 'checked' : ''}>
          <div class="model-info">
            <span class="model-name">${esc(m.name)}</span>
            ${m.desc ? `<span class="model-desc">${esc(m.desc)}</span>` : ''}
          </div>
        </label>`;
    }).join('');
  }
  container.innerHTML = html;

  // Auto-save first if none selected
  if (!selectedModel && models.length) {
    const firstChat = models.find(m => m.type === 'chat' || !m.type) || models[0];
    Storage.saveSettings({ [storageKey]: { [providerId]: firstChat.id } });
  }

  container.querySelectorAll(`input[name="${radioName}_${providerId}"]`).forEach(radio => {
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
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function iconGear() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`; }
function iconArrow() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`; }
