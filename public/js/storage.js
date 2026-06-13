const Storage = {
  // API Key (note: stored client-side for user convenience, actual key used server-side via env)
  saveApiKey(key) {
    localStorage.setItem('aneh_note', key); // just a user-side note/reference
  },
  getApiKey() {
    return localStorage.getItem('aneh_note') || '';
  },
  clearApiKey() {
    localStorage.removeItem('aneh_note');
  },

  // Chat sessions
  getSessions() {
    try {
      return JSON.parse(localStorage.getItem('aneh_sessions') || '[]');
    } catch { return []; }
  },
  saveSession(session) {
    const sessions = this.getSessions();
    const idx = sessions.findIndex(s => s.id === session.id);
    if (idx >= 0) sessions[idx] = session;
    else sessions.unshift(session);
    // keep max 60
    localStorage.setItem('aneh_sessions', JSON.stringify(sessions.slice(0, 60)));
  },
  deleteSession(id) {
    const sessions = this.getSessions().filter(s => s.id !== id);
    localStorage.setItem('aneh_sessions', JSON.stringify(sessions));
  },
  getSession(id) {
    return this.getSessions().find(s => s.id === id) || null;
  },

  // Theme
  getTheme() { return localStorage.getItem('aneh_theme') || 'system'; },
  saveTheme(t) { localStorage.setItem('aneh_theme', t); },
};

export default Storage;
