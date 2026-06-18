const DEFAULT_MODELS = {
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  gemini: 'gemini-2.0-flash',
  pollinations: 'openai',
};

const Storage = {
  getSessions() {
    try { return JSON.parse(localStorage.getItem('aneh_sessions') || '[]'); } catch { return []; }
  },
  saveSession(session) {
    const sessions = this.getSessions();
    const idx = sessions.findIndex(s => s.id === session.id);
    if (idx >= 0) sessions[idx] = session; else sessions.unshift(session);
    localStorage.setItem('aneh_sessions', JSON.stringify(sessions.slice(0, 60)));
  },
  deleteSession(id) {
    localStorage.setItem('aneh_sessions', JSON.stringify(this.getSessions().filter(s => s.id !== id)));
  },
  getSession(id) { return this.getSessions().find(s => s.id === id) || null; },

  getTheme() { return localStorage.getItem('aneh_theme') || 'dark'; },
  saveTheme(t) { localStorage.setItem('aneh_theme', t); },

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
    const provider = s.chatProvider || 'groq';
    return {
      provider,
      apiKey: s.apiKeys?.[provider] || '',
      // Default model per provider kalau belum dipilih
      model: s.chatModels?.[provider] || DEFAULT_MODELS[provider] || '',
    };
  },
  getActiveImage() {
    const s = this.getSettings();
    const provider = s.imageProvider || 'pollinations';
    return {
      provider: provider === 'pollinations' ? 'pollinations' : provider,
      apiKey: s.apiKeys?.[provider] || '',
      model: s.imageModels?.[provider] || 'flux',
    };
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
