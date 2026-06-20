const DB_NAME = 'aneh-db';
const DB_VERSION = 1;
const STORE = 'sessions';

function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB tidak didukung')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(session) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(session);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// ── Migrasi sekali jalan: localStorage lama -> IndexedDB ──────────
// Biar history chat yang udah ada sebelum update ini ga hilang.
const migrationPromise = (async () => {
  if (localStorage.getItem('aneh_idb_migrated')) return;
  try {
    const raw = localStorage.getItem('aneh_sessions');
    if (raw) {
      const sessions = JSON.parse(raw);
      for (const s of sessions) { await idbPut(s); }
      localStorage.removeItem('aneh_sessions');
    }
  } catch { /* gpp kalo gagal, ga fatal */ }
  localStorage.setItem('aneh_idb_migrated', '1');
})();

// ── Default models per provider ──────────────────────────────────
const DEFAULT_MODELS = {
  groq:         'llama-3.3-70b-versatile',
  openrouter:   'meta-llama/llama-3.3-70b-instruct:free',
  gemini:       'gemini-2.0-flash',
  pollinations: 'openai',
};
const DEFAULT_IMAGE_MODELS = { pollinations: 'flux' };
const VALID_PROVIDERS = ['groq', 'openrouter', 'gemini', 'pollinations'];

const Storage = {
  // ── Sessions (IndexedDB, async) ──────────────────────────────
  async getSessions() {
    await migrationPromise;
    try {
      const all = await idbGetAll();
      return all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch { return []; }
  },
  async getSession(id) {
    await migrationPromise;
    try { return await idbGet(id); } catch { return null; }
  },
  async saveSession(session) {
    await migrationPromise;
    try { await idbPut(session); return { ok: true }; }
    catch { return { ok: false }; }
  },
  async deleteSession(id) {
    await migrationPromise;
    try { await idbDelete(id); return true; } catch { return false; }
  },

  // ── Theme (localStorage, kecil, sync) ────────────────────────
  getTheme() { return localStorage.getItem('aneh_theme') || 'dark'; },
  saveTheme(t) { localStorage.setItem('aneh_theme', t); },

  // ── Settings (localStorage, kecil, sync) ─────────────────────
  getSettings() {
    try { return JSON.parse(localStorage.getItem('aneh_settings') || '{}'); } catch { return {}; }
  },
  saveSettings(patch) {
    const current = this.getSettings();
    const merged = deepMerge(current, patch);
    localStorage.setItem('aneh_settings', JSON.stringify(merged));
    return merged;
  },
  getActiveChat() {
    const s = this.getSettings();
    let provider = s.chatProvider || 'groq';
    if (!VALID_PROVIDERS.includes(provider)) { provider = 'groq'; this.saveSettings({ chatProvider: 'groq' }); }
    return {
      provider,
      apiKey: s.apiKeys?.[provider] || '',
      model:  s.chatModels?.[provider] || DEFAULT_MODELS[provider] || '',
    };
  },
  getActiveImage() {
    const s = this.getSettings();
    let provider = s.imageProvider || 'pollinations';
    if (!VALID_PROVIDERS.includes(provider)) provider = 'pollinations';
    return {
      provider,
      apiKey: s.apiKeys?.[provider] || '',
      model:  s.imageModels?.[provider] || DEFAULT_IMAGE_MODELS[provider] || 'flux',
    };
  },

  // ── Storage usage (akurat, pake browser API beneran) ─────────
  // navigator.storage.estimate() ngasih tau pemakaian REAL gabungan
  // localStorage + IndexedDB, dan quota REAL yang dikasih browser
  // (biasanya jauh lebih dari 5-10MB kalo pake IndexedDB).
  async getStorageUsage() {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        return {
          usedBytes: usage,
          usedMB: usage / (1024 * 1024),
          quotaMB: quota / (1024 * 1024),
          percent: quota ? Math.min(100, (usage / quota) * 100) : 0,
          supported: true,
        };
      } catch { /* fallthrough */ }
    }
    return { usedBytes: 0, usedMB: 0, quotaMB: 0, percent: 0, supported: false };
  },
};

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export default Storage;
