const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Chat ─────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages, provider = 'groq', apiKey, model } = req.body;
  const key = apiKey || process.env.GROQ_API_KEY;
  if (provider !== 'pollinations' && !key)
    return res.status(500).json({ error: 'API key tidak ditemukan.' });
  try {
    let response;
    if (provider === 'pollinations') {
      response = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model || 'openai', messages, stream: true }),
      });
    } else {
      const urls = {
        groq: 'https://api.groq.com/openai/v1/chat/completions',
        openrouter: 'https://openrouter.ai/api/v1/chat/completions',
        gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        together: 'https://api.together.xyz/v1/chat/completions',
      };
      const url = urls[provider];
      if (!url) return res.status(400).json({ error: 'Provider tidak dikenal.' });
      const headers = { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://aneh.vercel.app';
        headers['X-Title'] = 'Aneh Chat';
      }
      response = await fetch(url, {
        method: 'POST', headers,
        body: JSON.stringify({ model: model || defaultModel(provider), messages, max_tokens: 2048, stream: true }),
      });
    }
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || `${provider} error` });
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Models ────────────────────────────────────────────────────────
app.post('/api/providers/models', async (req, res) => {
  const { provider, apiKey } = req.body;
  const key = apiKey || process.env.GROQ_API_KEY;
  try {
    let models = [];
    if (provider === 'groq') {
      if (!key) return res.json({ models: DEFAULTS.groq });
      const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { 'Authorization': `Bearer ${key}` } });
      if (r.ok) {
        const d = await r.json();
        models = d.data.map(m => ({
          id: m.id, name: fmtName(m.id),
          desc: m.context_window ? `${Math.round(m.context_window/1000)}k ctx` : '',
          type: modelType('groq', m.id),
        }));
      } else models = DEFAULTS.groq;
    } else if (provider === 'openrouter') {
      const r = await fetch('https://openrouter.ai/api/v1/models');
      if (r.ok) {
        const d = await r.json();
        models = d.data.filter(m => m.id.endsWith(':free') || m.pricing?.prompt === '0').slice(0, 30)
          .map(m => ({ id: m.id, name: m.name || m.id, desc: 'Gratis', type: 'chat' }));
        if (!models.length) models = DEFAULTS.openrouter;
      } else models = DEFAULTS.openrouter;
    } else if (provider === 'gemini') {
      if (!key) return res.json({ models: DEFAULTS.gemini });
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (r.ok) {
        const d = await r.json();
        models = (d.models || [])
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => ({
            id: m.name.replace('models/', ''),
            name: m.displayName || m.name,
            desc: m.description?.slice(0, 60) || '',
            type: modelType('gemini', m.name),
          }));
        if (!models.length) models = DEFAULTS.gemini;
      } else models = DEFAULTS.gemini;
    } else if (provider === 'pollinations') {
      const r = await fetch('https://text.pollinations.ai/models').catch(() => null);
      if (r?.ok) {
        const d = await r.json();
        models = Array.isArray(d) ? d.map(m => ({
          id: typeof m === 'string' ? m : m.name,
          name: typeof m === 'string' ? m : (m.description || m.name),
          desc: 'Tanpa key', type: 'chat',
        })) : DEFAULTS.pollinations_text;
      } else models = DEFAULTS.pollinations_text;
    } else if (provider === 'pollinations_image') {
      const r = await fetch('https://image.pollinations.ai/models').catch(() => null);
      if (r?.ok) {
        const d = await r.json();
        models = Array.isArray(d) ? d.map(m => ({
          id: typeof m === 'string' ? m : m.name,
          name: typeof m === 'string' ? m : m.name,
          desc: 'Tanpa key', type: 'image',
        })) : DEFAULTS.pollinations_image;
      } else models = DEFAULTS.pollinations_image;
    } else if (provider === 'together') {
      if (!key) return res.json({ models: DEFAULTS.together });
      const r = await fetch('https://api.together.xyz/v1/models', { headers: { 'Authorization': `Bearer ${key}` } }).catch(() => null);
      if (r?.ok) {
        const d = await r.json();
        models = d.map(m => ({ id: m.id, name: m.display_name || m.id, desc: '', type: m.type === 'image' ? 'image' : 'chat' }));
        if (!models.length) models = DEFAULTS.together;
      } else models = DEFAULTS.together;
    }
    res.json({ models });
  } catch { res.json({ models: DEFAULTS[provider] || [] }); }
});

// ── Image ─────────────────────────────────────────────────────────
app.post('/api/image', async (req, res) => {
  const { prompt, provider = 'pollinations', model, apiKey, width = 1024, height = 1024 } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt diperlukan.' });
  try {
    if (provider === 'pollinations') {
      const seed = Math.floor(Math.random() * 999999);
      return res.json({ url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${model || 'flux'}&width=${width}&height=${height}&nologo=true&seed=${seed}` });
    }
    if (provider === 'together') {
      const key = apiKey || process.env.TOGETHER_API_KEY;
      if (!key) return res.status(500).json({ error: 'Together AI key tidak ada.' });
      const r = await fetch('https://api.together.xyz/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model || 'black-forest-labs/FLUX.1-schnell-Free', prompt, n: 1, width, height }),
      });
      if (!r.ok) { const e = await r.json().catch(()=>({})); return res.status(r.status).json({ error: e.error?.message || 'Together error' }); }
      const d = await r.json();
      const url = d.data?.[0]?.url || d.data?.[0]?.b64_json;
      return res.json({ url: url?.startsWith('http') ? url : `data:image/png;base64,${url}` });
    }
    res.status(400).json({ error: 'Provider tidak dikenal.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Helpers ───────────────────────────────────────────────────────
function fmtName(id) { return id.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }
function defaultModel(p) { return { groq:'llama-3.3-70b-versatile', openrouter:'meta-llama/llama-3.3-70b-instruct:free', gemini:'gemini-2.0-flash', together:'meta-llama/Llama-3-70b-chat-hf' }[p] || ''; }
function modelType(provider, id) {
  if (provider === 'groq') { if (id.includes('whisper') || id.includes('distil-whisper')) return 'audio'; return 'chat'; }
  if (provider === 'gemini') { if (id.includes('imagen')) return 'image'; if (id.includes('embedding')) return 'embedding'; return 'chat'; }
  return 'chat';
}

const DEFAULTS = {
  groq: [
    { id:'llama-3.3-70b-versatile', name:'Llama 3.3 70B', desc:'Pintar & versatile', type:'chat' },
    { id:'llama-3.1-8b-instant', name:'Llama 3.1 8B', desc:'Super cepat', type:'chat' },
    { id:'deepseek-r1-distill-llama-70b', name:'DeepSeek R1 70B', desc:'Reasoning', type:'chat' },
    { id:'gemma2-9b-it', name:'Gemma 2 9B', desc:'Buatan Google', type:'chat' },
    { id:'mixtral-8x7b-32768', name:'Mixtral 8x7B', desc:'32k context', type:'chat' },
    { id:'whisper-large-v3', name:'Whisper Large V3', desc:'Speech to text', type:'audio' },
    { id:'whisper-large-v3-turbo', name:'Whisper Large V3 Turbo', desc:'STT cepat', type:'audio' },
  ],
  openrouter: [
    { id:'meta-llama/llama-3.3-70b-instruct:free', name:'Llama 3.3 70B', desc:'Gratis', type:'chat' },
    { id:'deepseek/deepseek-r1:free', name:'DeepSeek R1', desc:'Gratis, reasoning', type:'chat' },
    { id:'mistralai/mistral-7b-instruct:free', name:'Mistral 7B', desc:'Gratis, cepat', type:'chat' },
    { id:'google/gemma-2-9b-it:free', name:'Gemma 2 9B', desc:'Gratis', type:'chat' },
    { id:'nousresearch/hermes-3-llama-3.1-405b:free', name:'Hermes 3 405B', desc:'Gratis, besar', type:'chat' },
  ],
  gemini: [
    { id:'gemini-2.0-flash', name:'Gemini 2.0 Flash', desc:'Terbaru, cepat', type:'chat' },
    { id:'gemini-1.5-flash', name:'Gemini 1.5 Flash', desc:'Cepat & efisien', type:'chat' },
    { id:'gemini-1.5-pro', name:'Gemini 1.5 Pro', desc:'Paling pintar', type:'chat' },
    { id:'gemini-1.5-flash-8b', name:'Gemini 1.5 Flash 8B', desc:'Paling ringan', type:'chat' },
  ],
  pollinations_text: [
    { id:'openai', name:'GPT-4o', desc:'Tanpa key', type:'chat' },
    { id:'mistral', name:'Mistral', desc:'Tanpa key', type:'chat' },
    { id:'llama', name:'Llama', desc:'Tanpa key', type:'chat' },
    { id:'claude-hybridspace', name:'Claude Hybrid', desc:'Tanpa key', type:'chat' },
  ],
  pollinations_image: [
    { id:'flux', name:'FLUX', desc:'Kualitas terbaik', type:'image' },
    { id:'flux-realism', name:'FLUX Realism', desc:'Foto realistis', type:'image' },
    { id:'flux-cablyai', name:'FLUX CablyAI', desc:'Variatif', type:'image' },
    { id:'turbo', name:'Turbo', desc:'Lebih cepat', type:'image' },
    { id:'dreamshaper', name:'DreamShaper', desc:'Artistic', type:'image' },
  ],
  together: [
    { id:'meta-llama/Llama-3-70b-chat-hf', name:'Llama 3 70B', desc:'Chat', type:'chat' },
    { id:'black-forest-labs/FLUX.1-schnell-Free', name:'FLUX Schnell', desc:'Gratis', type:'image' },
    { id:'stabilityai/stable-diffusion-xl-base-1.0', name:'SDXL', desc:'Classic', type:'image' },
  ],
};

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server jalan di http://localhost:${PORT}`));
