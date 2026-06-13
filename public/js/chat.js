import Storage from './storage.js';
import { renderHistory } from './sidebar.js';

let currentSession = null;
let isStreaming = false;

const ICONS = {
  copy:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  edit:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
  regen:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>`,
  image:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
};

export function initChat() {
  const input  = document.getElementById('chat-input');
  const btnSend  = document.getElementById('btn-send');
  const btnImg   = document.getElementById('btn-image');

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    btnSend.disabled = !input.value.trim() || isStreaming;
  });

  btnSend.addEventListener('click', sendMessage);
  btnSend.disabled = true;

  btnImg?.addEventListener('click', generateImage);

  newChat();
}

export function newChat() {
  currentSession = { id: 'sess_' + Date.now(), title: '', messages: [], createdAt: Date.now() };
  renderMessages();
}

export function loadSession(id) {
  const s = Storage.getSession(id);
  if (!s) return;
  currentSession = JSON.parse(JSON.stringify(s));
  renderMessages();
  renderHistory(currentSession.id);
}

function renderMessages() {
  const inner = document.getElementById('messages-inner');
  if (!currentSession.messages.length) {
    inner.innerHTML = `<div class="welcome"><h2>Aneh.</h2><p>Chat aneh dimulai dari sini.</p></div>`;
    return;
  }
  inner.innerHTML = '';
  currentSession.messages.forEach((msg, idx) => inner.appendChild(createBubble(msg, idx)));
  scrollToBottom();
}

function createBubble(msg, idx) {
  const wrap = document.createElement('div');
  wrap.className = `bubble-wrap ${msg.role === 'user' ? 'user' : 'ai'}`;
  wrap.dataset.idx = idx;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const content = document.createElement('div');
  content.className = 'bubble-content';

  if (msg.type === 'image') {
    content.innerHTML = `<img src="${msg.content}" alt="Generated image" class="generated-image" loading="lazy">
      <a href="${msg.content}" target="_blank" class="img-open-link">Buka gambar ↗</a>`;
  } else {
    content.innerHTML = msg.role === 'assistant'
      ? renderMarkdown(msg.content)
      : esc(msg.content).replace(/\n/g, '<br>');
  }
  bubble.appendChild(content);

  const actions = document.createElement('div');
  actions.className = 'bubble-actions';
  if (msg.role === 'user') {
    actions.innerHTML = `
      <button class="bubble-action-btn" data-action="copy">${ICONS.copy} Salin</button>
      <button class="bubble-action-btn" data-action="edit">${ICONS.edit} Edit</button>
      <button class="bubble-action-btn danger" data-action="delete">${ICONS.delete} Hapus</button>`;
  } else {
    actions.innerHTML = `
      <button class="bubble-action-btn" data-action="copy">${ICONS.copy} Salin</button>
      <button class="bubble-action-btn" data-action="regen">${ICONS.regen} Ulangi</button>
      <button class="bubble-action-btn danger" data-action="delete">${ICONS.delete} Hapus</button>`;
  }
  wrap.appendChild(bubble);
  wrap.appendChild(actions);

  actions.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const i = parseInt(wrap.dataset.idx);
    if (btn.dataset.action === 'copy') { navigator.clipboard.writeText(currentSession.messages[i].content); showToast('Disalin!'); }
    if (btn.dataset.action === 'delete') { currentSession.messages.splice(i,1); saveSession(); renderMessages(); }
    if (btn.dataset.action === 'edit') startInlineEdit(wrap, bubble, content, i);
    if (btn.dataset.action === 'regen') { currentSession.messages.splice(i,1); saveSession(); renderMessages(); streamResponse(); }
  });

  return wrap;
}

function startInlineEdit(wrap, bubble, content, idx) {
  const original = currentSession.messages[idx].content;
  bubble.innerHTML = '';
  const ta = document.createElement('textarea');
  ta.className = 'bubble-editor';
  ta.value = original;
  ta.rows = Math.min(original.split('\n').length + 1, 8);
  const btnRow = document.createElement('div');
  btnRow.className = 'bubble-editor-actions';
  btnRow.innerHTML = `<button class="btn-cancel-edit">Batal</button><button class="btn-save-edit">Simpan</button>`;
  bubble.appendChild(ta);
  bubble.appendChild(btnRow);
  wrap.querySelector('.bubble-actions').style.display = 'none';
  ta.focus();
  btnRow.querySelector('.btn-cancel-edit').addEventListener('click', () => renderMessages());
  btnRow.querySelector('.btn-save-edit').addEventListener('click', () => {
    const newText = ta.value.trim();
    if (!newText) return;
    currentSession.messages[idx].content = newText;
    currentSession.messages = currentSession.messages.slice(0, idx + 1);
    saveSession(); renderMessages(); streamResponse();
  });
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || isStreaming) return;
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('btn-send').disabled = true;
  currentSession.messages.push({ role: 'user', content: text });
  if (!currentSession.title) currentSession.title = text.slice(0, 45) + (text.length > 45 ? '…' : '');
  saveSession(); renderMessages();
  await streamResponse();
}

async function generateImage() {
  const input = document.getElementById('chat-input');
  const prompt = input.value.trim();
  if (!prompt || isStreaming) return;
  input.value = ''; input.style.height = 'auto';
  document.getElementById('btn-send').disabled = true;

  currentSession.messages.push({ role: 'user', content: `🖼️ ${prompt}` });
  if (!currentSession.title) currentSession.title = `🖼️ ${prompt}`.slice(0, 45);
  saveSession(); renderMessages();

  const imgSettings = Storage.getActiveImage();

  // Show loading bubble
  const inner = document.getElementById('messages-inner');
  const loading = document.createElement('div');
  loading.className = 'bubble-wrap ai';
  loading.innerHTML = `<div class="bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
  inner.appendChild(loading); scrollToBottom();

  try {
    const res = await fetch('/api/image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, provider: imgSettings.provider, model: imgSettings.model, apiKey: imgSettings.apiKey }),
    });
    loading.remove();
    const data = await res.json();
    if (data.error) { appendError(data.error); return; }
    currentSession.messages.push({ role: 'assistant', content: data.url, type: 'image' });
    saveSession(); renderMessages(); renderHistory(currentSession.id);
  } catch (err) {
    loading.remove(); appendError('Gagal generate gambar.');
  }
  isStreaming = false;
  document.getElementById('btn-send').disabled = !document.getElementById('chat-input').value.trim();
}

async function streamResponse() {
  if (isStreaming) return;
  isStreaming = true;
  document.getElementById('btn-send').disabled = true;

  const inner = document.getElementById('messages-inner');
  const typing = document.createElement('div');
  typing.className = 'bubble-wrap ai';
  typing.innerHTML = `<div class="bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
  inner.appendChild(typing); scrollToBottom();

  const chatSettings = Storage.getActiveChat();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: currentSession.messages, provider: chatSettings.provider, apiKey: chatSettings.apiKey, model: chatSettings.model }),
    });
    typing.remove();
    if (!res.ok) { const e = await res.json(); appendError(e.error || 'Terjadi kesalahan.'); isStreaming = false; return; }

    const aiWrap = document.createElement('div');
    aiWrap.className = 'bubble-wrap ai';
    const aiBubble = document.createElement('div');
    aiBubble.className = 'bubble';
    const aiContent = document.createElement('div');
    aiContent.className = 'bubble-content';
    aiBubble.appendChild(aiContent); aiWrap.appendChild(aiBubble); inner.appendChild(aiWrap);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '', buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          fullText += json.choices?.[0]?.delta?.content || '';
          aiContent.innerHTML = renderMarkdown(fullText);
          scrollToBottom();
        } catch {}
      }
    }
    currentSession.messages.push({ role: 'assistant', content: fullText });
    saveSession(); renderMessages(); renderHistory(currentSession.id);
  } catch { typing.remove(); appendError('Gagal terhubung ke server.'); }

  isStreaming = false;
  document.getElementById('btn-send').disabled = !document.getElementById('chat-input').value.trim();
}

function appendError(msg) {
  const inner = document.getElementById('messages-inner');
  const el = document.createElement('div');
  el.className = 'bubble-wrap ai';
  el.innerHTML = `<div class="bubble" style="border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#f87171;font-size:13.5px;">⚠️ ${esc(msg)}</div>`;
  inner.appendChild(el); scrollToBottom();
}

function saveSession() { Storage.saveSession(currentSession); window._currentSessionId = currentSession.id; }
function scrollToBottom() { const el = document.getElementById('messages'); el.scrollTop = el.scrollHeight; }
function renderMarkdown(text) {
  if (typeof marked === 'undefined') return esc(text).replace(/\n/g,'<br>');
  try { return marked.parse(text, { breaks:true, gfm:true }); } catch { return esc(text); }
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
export function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}
