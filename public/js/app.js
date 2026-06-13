import { initTheme } from './theme.js';
import { initSidebar, renderHistory } from './sidebar.js';
import { initChat, newChat, loadSession } from './chat.js';

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initChat();
  initSidebar(
    (id) => loadSession(id),
    () => newChat()
  );
  window._onSelectSession = (id) => {
    loadSession(id);
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('show');
  };
  window._onDeleteSession = (id) => { if (window._currentSessionId === id) newChat(); };
});
