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

  providerSel.innerHTML = Object.entries(PROVIDERS)
    .map(([id, p]) => `<option value="${id}">${p.name}</option>`).join('');

  const saved = Storage.getSettings();
  let initialProvider = saved.chatProvider || 'groq';
  if (!PROVIDERS[initialProvider]) {
    initialProvider = 'groq';
    Storage.saveSettings({ chatProvider: 'groq' });
  }
  providerSel.value = initialProvider;

  renderSettingsForProvider(providerSel.value);

  providerSel.onchange = () => {
    Storage.saveSettings({ chatProvider: providerSel.value });
    renderSettingsForProvider(providerSel.value);
  };
}

function renderSettingsForProvider(providerId) {
  const cfg = PROVIDERS[providerId];
  const saved = Storage.getSettings();
  const currentKey = saved.apiKeys?.[providerId] || '';

  // Key section
  const keySection = document.getElementById('settings-key-section');
  const noteEl = document.getElementById('settings-provider-note');

  // Show key input for all providers (groq = optional, others = required)
  keySection.classList.remove('hidden');
  document.getElementById('settings-key-input').value = currentKey;
  document.getElementById('settings-key-input').placeholder = cfg.placeholder;

  if (noteEl) {
    noteEl.textContent = cfg.note || '';
    noteEl.style.display = cfg.note ? 'block' : 'none';
  }

  updateKeyStatus(!!currentKey, providerId);

  // Bind save key
  document.getElementById('btn-save-settings-key').onclick = () => {
    const val = document.getElementById('settings-key-input').value.trim();
    Storage.saveSettings({ apiKeys: { [providerId]: val } });
    updateKeyStatus(!!val, providerId);
    loadAllModels(providerId, val);
    showToast(val ? '✓ Key tersimpan' : 'Key dikosongkan');
  };

  document.getElementById('btn-toggle-settings-key').onclick = () => {
    const inp = document.getElementById('settings-key-input');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  };

  loadAllModels(providerId, currentKey);
}

function updateKeyStatus(hasKey, providerId) {
  const el = document.getElementById('settings-key-status');
  if (!el) return;
  const cfg = PROVIDERS[providerId || 'groq'];
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

async function loadAllModels(providerId, apiKey) {
  const cfg = PROVIDERS[providerId];

  // Chat models
  await loadModelGroup(providerId, apiKey, providerId, 'settings-chat-models', 'chatModels');

  // Image models (only for providers that support it)
  const imgSection = document.getElementById('settings-image-models');
  if (cfg.imageProvider) {
    imgSection.classList.remove('hidden');
    await loadModelGroup(providerId, apiKey, `${providerId}_image`, 'settings-image-models-list', 'imageModels');

    // Audio models (only Pollinations)
    if (providerId === 'pollinations') {
      const audioSection = document.getElementById('settings-audio-models');
      if (audioSection) {
        audioSection.classList.remove('hidden');
        await loadModelGroup(providerId, apiKey, 'pollinations_audio', 'settings-audio-models-list', 'audioModels');
      }
    }
  } else {
    imgSection.classList.add('hidden');
    const audioSection = document.getElementById('settings-audio-models');
    if (audioSection) audioSection.classList.add('hidden');
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
