import Storage from './storage.js';
import { renderHistory } from './sidebar.js';

let currentSession = null;
let isStreaming = false;
let pendingAttachment = null; // {kind:'image'|'file', dataUrl, name}

const ICONS = {
  copy:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  edit:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
  regen:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>`,
};

const FUNNY_ERRORS = [
  'Modelnya lagi ngambek, mungkin kuota gratisannya abis 😅 Coba ganti model lain di Pengaturan ya!',
  'Waduh, server AI-nya lagi pura-pura gak denger. Gonta-ganti model dulu deh, gas terus!',
  'Model ini kayaknya lagi cape mikir. Mending pindah ke model tetangga aja 🏃',
  'Sepertinya model ini lagi mogok kerja. Cobain model lain dulu, jangan nyerah!',
  'Eror nih bro, kayaknya jatah gratisannya abis bulan ini. Ganti model di Pengaturan, gas!',
  'Hmm model ini lagi bad mood. Ganti aja, banyak kok temennya di Pengaturan 😎',
];
function funnyError() { return FUNNY_ERRORS[Math.floor(Math.random() * FUNNY_ERRORS.length)]; }

// ── Ratio untuk gambar & video ───────────────────────────────────────
const RATIOS = [
  { id: '1:1',  label: '1:1',   sub: 'Persegi' },
  { id: '9:16', label: '9:16',  sub: 'Vertikal' },
  { id: '16:9', label: '16:9',  sub: 'Horizontal' },
];

export function initChat() {
  const input    = document.getElementById('chat-input');
  const btnSend  = document.getElementById('btn-send');
  const btnPlus  = document.getElementById('btn-plus');
  const fileInput = document.getElementById('file-upload-input');

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    btnSend.disabled = (!input.value.trim() && !pendingAttachment) || isStreaming;
  });

  btnSend.addEventListener('click', sendMessage);
  btnSend.disabled = true;

  btnPlus?.addEventListener('click', (e) => { e.stopPropagation(); toggleAttachMenu(); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.attach-wrap')) closeAttachMenu();
  });

  document.querySelectorAll('.attach-menu-item').forEach(item => {
    item.addEventListener('click', () => handleAttachAction(item.dataset.action));
  });
  document.querySelectorAll('.ratio-option').forEach(item => {
    item.addEventListener('click', () => handleRatioPick(item.dataset.ratio));
  });
  document.getElementById('btn-ratio-back')?.addEventListener('click', showAttachMenuRoot);

  fileInput?.addEventListener('change', handleFileSelected);
  document.getElementById('btn-remove-attachment')?.addEventListener('click', clearAttachment);

  renderInputState();
  newChat();
}

// ── Attach menu ───────────────────────────────────────────────────
let ratioMode = null; // 'image' | 'video'

function toggleAttachMenu() {
  const menu = document.getElementById('attach-menu');
  const isShown = menu.classList.contains('show');
  isShown ? closeAttachMenu() : openAttachMenu();
}
function openAttachMenu() {
  showAttachMenuRoot();
  document.getElementById('attach-menu').classList.add('show');
}
function closeAttachMenu() {
  document.getElementById('attach-menu')?.classList.remove('show');
  ratioMode = null;
}
function showAttachMenuRoot() {
  document.getElementById('attach-menu-root').classList.remove('hidden');
  document.getElementById('attach-menu-ratio').classList.add('hidden');
}
function showRatioMenu(mode) {
  ratioMode = mode;
  document.getElementById('attach-menu-root').classList.add('hidden');
  document.getElementById('attach-menu-ratio').classList.remove('hidden');
  document.getElementById('ratio-menu-title').textContent =
    mode === 'image' ? '🖼️ Pilih ukuran gambar' : '🎬 Pilih ukuran video';
}

function handleAttachAction(action) {
  if (action === 'upload') {
    closeAttachMenu();
    document.getElementById('file-upload-input').click();
  } else if (action === 'image' || action === 'video') {
    showRatioMenu(action);
  } else if (action === 'audio') {
    closeAttachMenu();
    generateAudio();
  } else if (action === 'music') {
    closeAttachMenu();
    generateMusic();
  }
}

function handleRatioPick(ratio) {
  const mode = ratioMode;
  closeAttachMenu();
  if (mode === 'image') generateImage(ratio);
  else if (mode === 'video') generateVideo(ratio);
}

// ── File upload ───────────────────────────────────────────────────
function handleFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) {
    showToast('Waduh kegedean filenya, max 3MB ya 🙏');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    pendingAttachment = {
      kind: file.type.startsWith('image/') ? 'image' : 'file',
      dataUrl: reader.result,
      name: file.name,
    };
    renderAttachmentPreview();
    document.getElementById('btn-send').disabled = false;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function renderAttachmentPreview() {
  const box = document.getElementById('attachment-preview');
  if (!pendingAttachment) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  if (pendingAttachment.kind === 'image') {
    box.innerHTML = `
      <img src="${pendingAttachment.dataUrl}" class="attachment-thumb">
      <span class="attachment-name">${esc(pendingAttachment.name)}</span>
      <button id="btn-remove-attachment" class="btn-remove-attachment" title="Hapus">✕</button>`;
  } else {
    box.innerHTML = `
      <span class="attachment-file-icon">📎</span>
      <span class="attachment-name">${esc(pendingAttachment.name)}</span>
      <button id="btn-remove-attachment" class="btn-remove-attachment" title="Hapus">✕</button>`;
  }
  document.getElementById('btn-remove-attachment').addEventListener('click', clearAttachment);
}

function clearAttachment() {
  pendingAttachment = null;
  renderAttachmentPreview();
  const input = document.getElementById('chat-input');
  document.getElementById('btn-send').disabled = !input.value.trim();
}

function renderInputState() { renderAttachmentPreview(); }

// ── Session ───────────────────────────────────────────────────────
export function newChat() {
  currentSession = { id: 'sess_' + Date.now(), title: '', messages: [], createdAt: Date.now() };
  clearAttachment();
  renderMessages();
}

export function loadSession(id) {
  const s = Storage.getSession(id);
  if (!s) return;
  currentSession = JSON.parse(JSON.stringify(s));
  clearAttachment();
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
  content.innerHTML = renderBubbleContent(msg);
  bubble.appendChild(content);

  const actions = document.createElement('div');
  actions.className = 'bubble-actions';
  if (msg.role === 'user') {
    actions.innerHTML = `
      <button class="bubble-action-btn" data-action="copy">${ICONS.copy} Salin</button>
      ${msg.type ? '' : `<button class="bubble-action-btn" data-action="edit">${ICONS.edit} Edit</button>`}
      <button class="bubble-action-btn danger" data-action="delete">${ICONS.delete} Hapus</button>`;
  } else {
    actions.innerHTML = `
      <button class="bubble-action-btn" data-action="copy">${ICONS.copy} Salin</button>
      ${!msg.type ? `<button class="bubble-action-btn" data-action="regen">${ICONS.regen} Ulangi</button>` : ''}
      <button class="bubble-action-btn danger" data-action="delete">${ICONS.delete} Hapus</button>`;
  }
  wrap.appendChild(bubble);
  wrap.appendChild(actions);

  actions.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const i = parseInt(wrap.dataset.idx);
    if (btn.dataset.action === 'copy') {
      const m = currentSession.messages[i];
      navigator.clipboard.writeText(m.type ? (m.content || '') : m.content);
      showToast('Disalin!');
    }
    if (btn.dataset.action === 'delete') { currentSession.messages.splice(i,1); saveSession(); renderMessages(); }
    if (btn.dataset.action === 'edit') startInlineEdit(wrap, bubble, content, i);
    if (btn.dataset.action === 'regen') { currentSession.messages.splice(i,1); saveSession(); renderMessages(); streamResponse(); }
  });

  return wrap;
}

function renderBubbleContent(msg) {
  if (msg.type === 'image') {
    return `<img src="${msg.content}" alt="Generated image" class="generated-media" loading="lazy">
      <a href="${msg.content}" target="_blank" class="img-open-link">Buka gambar ↗</a>`;
  }
  if (msg.type === 'video') {
    return `<video controls class="generated-media" src="${msg.content}"></video>`;
  }
  if (msg.type === 'audio') {
    return `<div class="media-bubble">🎵 <audio controls src="${msg.content}"></audio></div>`;
  }
  if (msg.type === 'music') {
    return `<div class="media-bubble">🎶 <audio controls src="${msg.content}"></audio></div>`;
  }
  if (msg.type === 'upload') {
    if (msg.kind === 'image') {
      return `<img src="${msg.content}" alt="upload" class="generated-media">
        ${msg.caption ? `<div class="upload-caption">${esc(msg.caption)}</div>` : ''}`;
    }
    return `<div class="file-chip">📎 ${esc(msg.fileName || 'File')}</div>
      ${msg.caption ? `<div class="upload-caption">${esc(msg.caption)}</div>` : ''}`;
  }
  return msg.role === 'assistant' ? renderMarkdown(msg.content) : esc(msg.content).replace(/\n/g, '<br>');
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

// ── Kirim pesan teks (+ attachment opsional) ────────────────────────
async function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text && !pendingAttachment) return;
  if (isStreaming) return;

  if (pendingAttachment) {
    currentSession.messages.push({
      role: 'user', type: 'upload',
      kind: pendingAttachment.kind,
      content: pendingAttachment.dataUrl,
      fileName: pendingAttachment.name,
      caption: text,
    });
    if (!currentSession.title) currentSession.title = (text || pendingAttachment.name).slice(0, 45);
    clearAttachment();
    input.value = ''; input.style.height = 'auto';
    saveSession(); renderMessages();
    showToast('File terupload! (fitur baca isi file masih dalam pengembangan 🐣)');
    return;
  }

  input.value = ''; input.style.height = 'auto';
  document.getElementById('btn-send').disabled = true;
  currentSession.messages.push({ role: 'user', content: text });
  if (!currentSession.title) currentSession.title = text.slice(0, 45) + (text.length > 45 ? '…' : '');
  saveSession(); renderMessages();
  await streamResponse();
}

// ── Generate gambar ──────────────────────────────────────────────
async function generateImage(ratio) {
  const input = document.getElementById('chat-input');
  const prompt = input.value.trim();
  if (!prompt) { showToast('Ketik dulu prompt-nya, jangan kosongan! 😆'); return; }
  if (isStreaming) return;
  input.value = ''; input.style.height = 'auto';
  document.getElementById('btn-send').disabled = true;

  currentSession.messages.push({ role: 'user', content: `🖼️ ${prompt} (${ratio})` });
  if (!currentSession.title) currentSession.title = `🖼️ ${prompt}`.slice(0, 45);
  saveSession(); renderMessages();

  const imgSettings = Storage.getActiveImage();
  const loading = pushLoadingBubble();

  try {
    const res = await fetch('/api/image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, ratio, provider: imgSettings.provider, model: imgSettings.model, apiKey: imgSettings.apiKey }),
    });
    loading.remove();
    const data = await res.json();
    if (data.error) { appendError(); return; }
    currentSession.messages.push({ role: 'assistant', content: data.url, type: 'image' });
    saveSession(); renderMessages(); renderHistory(currentSession.id);
  } catch { loading.remove(); appendError(); }

  finishStreamingState();
}

// ── Generate video ───────────────────────────────────────────────
async function generateVideo(ratio) {
  const input = document.getElementById('chat-input');
  const prompt = input.value.trim();
  if (!prompt) { showToast('Ketik dulu prompt-nya, jangan kosongan! 😆'); return; }
  if (isStreaming) return;
  input.value = ''; input.style.height = 'auto';
  document.getElementById('btn-send').disabled = true;

  currentSession.messages.push({ role: 'user', content: `🎬 ${prompt} (${ratio})` });
  if (!currentSession.title) currentSession.title = `🎬 ${prompt}`.slice(0, 45);
  saveSession(); renderMessages();

  const loading = pushLoadingBubble();
  try {
    const res = await fetch('/api/video', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, ratio }),
    });
    loading.remove();
    const data = await res.json();
    if (data.error) { appendError(); return; }
    currentSession.messages.push({ role: 'assistant', content: data.url, type: 'video' });
    saveSession(); renderMessages(); renderHistory(currentSession.id);
  } catch { loading.remove(); appendError(); }

  finishStreamingState();
}

// ── Generate audio (TTS) ─────────────────────────────────────────
async function generateAudio() {
  const input = document.getElementById('chat-input');
  const prompt = input.value.trim();
  if (!prompt) { showToast('Ketik dulu teks yang mau diomongin! 🎤'); return; }
  if (isStreaming) return;
  input.value = ''; input.style.height = 'auto';
  document.getElementById('btn-send').disabled = true;

  currentSession.messages.push({ role: 'user', content: `🎵 ${prompt}` });
  if (!currentSession.title) currentSession.title = `🎵 ${prompt}`.slice(0, 45);
  saveSession(); renderMessages();

  const loading = pushLoadingBubble();
  try {
    const res = await fetch('/api/audio', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: prompt, voice: 'nova' }),
    });
    loading.remove();
    const data = await res.json();
    if (data.error) { appendError(); return; }
    currentSession.messages.push({ role: 'assistant', content: data.url, type: 'audio' });
    saveSession(); renderMessages(); renderHistory(currentSession.id);
  } catch { loading.remove(); appendError(); }

  finishStreamingState();
}

// ── Generate musik ───────────────────────────────────────────────
async function generateMusic() {
  const input = document.getElementById('chat-input');
  const prompt = input.value.trim();
  if (!prompt) { showToast('Ketik dulu deskripsi musiknya! 🎶'); return; }
  if (isStreaming) return;
  input.value = ''; input.style.height = 'auto';
  document.getElementById('btn-send').disabled = true;

  currentSession.messages.push({ role: 'user', content: `🎶 ${prompt}` });
  if (!currentSession.title) currentSession.title = `🎶 ${prompt}`.slice(0, 45);
  saveSession(); renderMessages();

  const loading = pushLoadingBubble();
  try {
    const res = await fetch('/api/audio', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: prompt, model: 'elevenmusic' }),
    });
    loading.remove();
    const data = await res.json();
    if (data.error) { appendError(); return; }
    currentSession.messages.push({ role: 'assistant', content: data.url, type: 'music' });
    saveSession(); renderMessages(); renderHistory(currentSession.id);
  } catch { loading.remove(); appendError(); }

  finishStreamingState();
}

function pushLoadingBubble() {
  const inner = document.getElementById('messages-inner');
  const loading = document.createElement('div');
  loading.className = 'bubble-wrap ai';
  loading.innerHTML = `<div class="bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
  inner.appendChild(loading); scrollToBottom();
  return loading;
}
function finishStreamingState() {
  isStreaming = false;
  document.getElementById('btn-send').disabled = !document.getElementById('chat-input').value.trim();
}

// ── Chat streaming ───────────────────────────────────────────────
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
    if (!res.ok) { appendError(); finishStreamingState(); return; }

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

    if (!fullText.trim()) { aiWrap.remove(); appendError(); finishStreamingState(); return; }

    currentSession.messages.push({ role: 'assistant', content: fullText });
    saveSession(); renderMessages(); renderHistory(currentSession.id);
  } catch { typing.remove(); appendError(); }

  finishStreamingState();
}

function appendError() {
  const inner = document.getElementById('messages-inner');
  const el = document.createElement('div');
  el.className = 'bubble-wrap ai';
  el.innerHTML = `<div class="bubble" style="border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#f87171;font-size:13.5px;">😵 ${esc(funnyError())}</div>`;
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
  setTimeout(() => t.classList.remove('show'), 2200);
}
