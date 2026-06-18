const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const POLL_BASE = 'https://gen.pollinations.ai';

// ── Chat ─────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages, provider = 'groq', apiKey, model } = req.body;
  const key = apiKey || process.env.GROQ_API_KEY;

  if (provider !== 'pollinations' && !key)
    return res.status(500).json({ error: 'API key tidak ditemukan.' });

  try {
    const configs = {
      groq:       { url: 'https://api.groq.com/openai/v1/chat/completions',                    headers: { 'Authorization': `Bearer ${key}` } },
      openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions',                      headers: { 'Authorization': `Bearer ${key}`, 'HTTP-Referer': 'https://aneh.vercel.app', 'X-Title': 'Aneh Chat' } },
      gemini:     { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', headers: { 'Authorization': `Bearer ${key}` } },
      pollinations: { url: `${POLL_BASE}/v1/chat/completions`,                                 headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {} },
    };

    const cfg = configs[provider];
    if (!cfg) return res.status(400).json({ error: 'Provider tidak dikenal.' });

    const response = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cfg.headers },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL[provider] || '',
        messages,
        max_tokens: 2048,
        stream: true,
      }),
    });

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
  const key = apiKey || (provider === 'groq' ? process.env.GROQ_API_KEY : '');

  try {
    let models = [];

    if (provider === 'groq') {
      if (!key) return res.json({ models: DEFAULTS.groq });
      const r = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      if (r.ok) {
        const d = await r.json();
        models = d.data
          .filter(m => !m.id.includes('guard') && !m.id.includes('tool-use'))
          .map(m => ({
            id: m.id, name: fmtName(m.id),
            desc: m.context_window ? `${Math.round(m.context_window/1000)}k ctx` : '',
            type: m.id.includes('whisper') || m.id.includes('distil-whisper') ? 'audio' : 'chat',
          }));
      } else models = DEFAULTS.groq;

    } else if (provider === 'openrouter') {
      // Fetch all free models from OpenRouter
      const r = await fetch('https://openrouter.ai/api/v1/models', {
        headers: key ? { 'Authorization': `Bearer ${key}` } : {}
      });
      if (r.ok) {
        const d = await r.json();
        // Filter: free + not deprecated + has been updated recently
        models = d.data
          .filter(m => m.id.endsWith(':free'))
          .filter(m => !m.id.includes('auto'))
          .map(m => ({
            id: m.id,
            name: m.name || m.id.split('/').pop().replace(':free',''),
            desc: m.context_length ? `${Math.round(m.context_length/1000)}k ctx · Gratis` : 'Gratis',
            type: 'chat',
          }))
          .slice(0, 30);
        if (!models.length) models = DEFAULTS.openrouter;
      } else models = DEFAULTS.openrouter;

    } else if (provider === 'gemini') {
      if (!key) return res.json({ models: DEFAULTS.gemini });
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (r.ok) {
        const d = await r.json();
        models = (d.models || [])
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .filter(m => !m.name.includes('embedding') && !m.name.includes('aqa'))
          .map(m => ({
            id: m.name.replace('models/', ''),
            name: m.displayName || m.name,
            desc: m.description?.slice(0, 55) || '',
            type: modelType('gemini', m.name),
          }));
        if (!models.length) models = DEFAULTS.gemini;
      } else models = DEFAULTS.gemini;

    } else if (provider === 'pollinations') {
      // Fetch text models dari endpoint baru
      const headers = key ? { 'Authorization': `Bearer ${key}` } : {};
      const r = await fetch(`${POLL_BASE}/text/models`, { headers }).catch(() => null);
      if (r?.ok) {
        const d = await r.json();
        models = Array.isArray(d)
          ? d.map(m => ({
              id: m.name || m.id || m,
              name: m.name || m.id || m,
              desc: m.description ? m.description.slice(0, 55) : 'Pollinations',
              type: 'chat',
            }))
          : DEFAULTS.pollinations_text;
      } else models = DEFAULTS.pollinations_text;

    } else if (provider === 'pollinations_image') {
      const headers = key ? { 'Authorization': `Bearer ${key}` } : {};
      const r = await fetch(`${POLL_BASE}/image/models`, { headers }).catch(() => null);
      if (r?.ok) {
        const d = await r.json();
        models = Array.isArray(d)
          ? d.map(m => ({
              id: m.name || m.id || m,
              name: m.name || m.id || m,
              desc: m.description ? m.description.slice(0, 55) : '',
              type: 'image',
            }))
          : DEFAULTS.pollinations_image;
      } else models = DEFAULTS.pollinations_image;

    } else if (provider === 'pollinations_audio') {
      const headers = key ? { 'Authorization': `Bearer ${key}` } : {};
      const r = await fetch(`${POLL_BASE}/audio/models`, { headers }).catch(() => null);
      if (r?.ok) {
        const d = await r.json();
        models = Array.isArray(d)
          ? d.map(m => ({
              id: m.name || m.id || m,
              name: m.name || m.id || m,
              desc: m.description || '',
              type: 'audio',
            }))
          : DEFAULTS.pollinations_audio;
      } else models = DEFAULTS.pollinations_audio;
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
      const params = new URLSearchParams({ model: model || 'flux', width, height, nologo: 'true', seed });
      if (apiKey) params.set('key', apiKey);
      return res.json({ url: `${POLL_BASE}/image/${encodeURIComponent(prompt)}?${params}` });
    }
    res.status(400).json({ error: 'Provider gambar tidak didukung.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Audio (TTS via Pollinations) ──────────────────────────────────
app.post('/api/audio', async (req, res) => {
  const { text, voice = 'nova', apiKey } = req.body;
  if (!text) return res.status(400).json({ error: 'Teks diperlukan.' });
  const params = new URLSearchParams({ voice });
  if (apiKey) params.set('key', apiKey);
  res.json({ url: `${POLL_BASE}/audio/${encodeURIComponent(text)}?${params}` });
});

// ── Helpers ───────────────────────────────────────────────────────
const DEFAULT_MODEL = {
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  gemini: 'gemini-2.0-flash',
  pollinations: 'openai',
};

function fmtName(id) {
  return id.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function modelType(provider, id) {
  if (provider === 'gemini') {
    if (id.includes('imagen')) return 'image';
    if (id.includes('embedding')) return 'embedding';
  }
  return 'chat';
}

const DEFAULTS = {
  groq: [
    { id:'llama-3.3-70b-versatile',          name:'Llama 3.3 70B',         desc:'Pintar & versatile',    type:'chat'  },
    { id:'llama-3.1-8b-instant',              name:'Llama 3.1 8B',          desc:'Super cepat',           type:'chat'  },
    { id:'deepseek-r1-distill-llama-70b',     name:'DeepSeek R1 70B',       desc:'Reasoning',             type:'chat'  },
    { id:'gemma2-9b-it',                      name:'Gemma 2 9B',            desc:'Buatan Google',         type:'chat'  },
    { id:'mixtral-8x7b-32768',                name:'Mixtral 8x7B',          desc:'32k context',           type:'chat'  },
    { id:'whisper-large-v3',                  name:'Whisper Large V3',      desc:'Speech-to-text',        type:'audio' },
    { id:'whisper-large-v3-turbo',            name:'Whisper Large V3 Turbo',desc:'STT cepat',             type:'audio' },
  ],
  openrouter: [
    { id:'meta-llama/llama-3.3-70b-instruct:free',          name:'Llama 3.3 70B',      desc:'Gratis', type:'chat' },
    { id:'deepseek/deepseek-r1:free',                       name:'DeepSeek R1',         desc:'Gratis, reasoning', type:'chat' },
    { id:'mistralai/mistral-7b-instruct:free',              name:'Mistral 7B',          desc:'Gratis, cepat', type:'chat' },
    { id:'google/gemma-2-9b-it:free',                       name:'Gemma 2 9B',          desc:'Gratis', type:'chat' },
    { id:'microsoft/phi-3-mini-128k-instruct:free',         name:'Phi-3 Mini 128k',     desc:'Gratis, 128k ctx', type:'chat' },
    { id:'nousresearch/hermes-3-llama-3.1-405b:free',       name:'Hermes 3 405B',       desc:'Gratis, besar', type:'chat' },
  ],
  gemini: [
    { id:'gemini-2.0-flash',       name:'Gemini 2.0 Flash',    desc:'Terbaru & cepat',   type:'chat' },
    { id:'gemini-1.5-flash',       name:'Gemini 1.5 Flash',    desc:'Cepat & efisien',   type:'chat' },
    { id:'gemini-1.5-pro',         name:'Gemini 1.5 Pro',      desc:'Paling pintar',     type:'chat' },
    { id:'gemini-1.5-flash-8b',    name:'Gemini 1.5 Flash 8B', desc:'Paling ringan',     type:'chat' },
  ],
  pollinations_text: [
    { id:'openai',         name:'GPT-4o (via Pollinations)', desc:'Kuat & populer',  type:'chat' },
    { id:'openai-large',   name:'GPT-4o Large',              desc:'Lebih besar',      type:'chat' },
    { id:'claude',         name:'Claude (via Pollinations)', desc:'Anthropic',        type:'chat' },
    { id:'gemini',         name:'Gemini (via Pollinations)', desc:'Google',           type:'chat' },
    { id:'deepseek',       name:'DeepSeek',                  desc:'Reasoning',        type:'chat' },
    { id:'mistral',        name:'Mistral',                   desc:'Cepat',            type:'chat' },
    { id:'llama',          name:'Llama',                     desc:'Meta',             type:'chat' },
    { id:'grok',           name:'Grok',                      desc:'xAI',              type:'chat' },
  ],
  pollinations_image: [
    { id:'flux',           name:'FLUX',          desc:'Kualitas terbaik',  type:'image' },
    { id:'flux-realism',   name:'FLUX Realism',  desc:'Foto realistis',    type:'image' },
    { id:'gptimage',       name:'GPT Image',     desc:'OpenAI DALL-E',     type:'image' },
    { id:'grok-imagine',   name:'Grok Imagine',  desc:'xAI image gen',     type:'image' },
    { id:'kontext',        name:'Kontext',        desc:'Context-aware',     type:'image' },
    { id:'seedream',       name:'SeDream',       desc:'Variatif',          type:'image' },
    { id:'turbo',          name:'Turbo',          desc:'Lebih cepat',       type:'image' },
  ],
  pollinations_audio: [
    { id:'elevenlabs',   name:'ElevenLabs',   desc:'Kualitas premium',  type:'audio' },
    { id:'elevenflash',  name:'ElevenFlash',  desc:'Cepat',             type:'audio' },
    { id:'openai-audio', name:'OpenAI Audio', desc:'TTS OpenAI',        type:'audio' },
  ],
};

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server jalan di http://localhost:${PORT}`));
