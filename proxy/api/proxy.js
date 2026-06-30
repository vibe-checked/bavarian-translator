// Bavarian Translator — key proxy (Edge Runtime).
//
// Holds the Gemini / Groq / Mistral API keys server-side and injects them. Runs
// on Vercel's Edge Runtime (V8 isolates) so there's effectively no cold start
// and it executes at the POP nearest the user — minimising the latency the proxy
// hop adds over talking to each provider directly.
//
// Route via ?route=  (gemini | groq/chat | groq/transcribe | mistral/chat |
// mistral/transcribe), with ?model= for gemini.
//
// Defense in depth: x-app-key gate, per-route upstream allowlist, model prefix
// allowlist. Only POST is forwarded.

export const config = { runtime: 'edge' };

const MODEL_ALLOW = {
  gemini: [/^gemini-/i],
  groq: [/^llama-/i, /^meta-llama\//i, /^qwen\//i, /^whisper-/i],
  mistral: [/^mistral-/i, /^voxtral-/i],
};

function modelAllowed(provider, model) {
  if (!model) return false;
  return (MODEL_ALLOW[provider] || []).some((re) => re.test(model));
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

export default async function handler(req) {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const APP_KEY = process.env.APP_PROXY_TOKEN || '';
  if (!APP_KEY || req.headers.get('x-app-key') !== APP_KEY) return json(401, { error: 'unauthorized' });

  const url = new URL(req.url);
  const route = url.searchParams.get('route') || '';
  const contentType = req.headers.get('content-type') || 'application/octet-stream';
  const body = await req.arrayBuffer();

  const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
  const GROQ_KEY = process.env.GROQ_API_KEY || '';
  const MISTRAL_KEY = process.env.MISTRAL_API_KEY || '';

  let target;
  const headers = { 'content-type': contentType };

  try {
    if (route === 'gemini') {
      const model = url.searchParams.get('model') || '';
      if (!modelAllowed('gemini', model)) return json(400, { error: `model not allowed: ${model}` });
      if (!GEMINI_KEY) throw new Error('server missing GEMINI_API_KEY');
      target =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
        `:generateContent?key=${GEMINI_KEY}`;
    } else if (route === 'groq/chat' || route === 'mistral/chat') {
      const provider = route.split('/')[0];
      let model = '';
      try {
        model = JSON.parse(new TextDecoder().decode(body))?.model || '';
      } catch {
        /* reject below */
      }
      if (!modelAllowed(provider, model)) return json(400, { error: `model not allowed: ${model}` });
      const key = provider === 'groq' ? GROQ_KEY : MISTRAL_KEY;
      if (!key) throw new Error(`server missing ${provider} key`);
      target =
        provider === 'groq'
          ? 'https://api.groq.com/openai/v1/chat/completions'
          : 'https://api.mistral.ai/v1/chat/completions';
      headers['authorization'] = `Bearer ${key}`;
    } else if (route === 'groq/transcribe' || route === 'mistral/transcribe') {
      const provider = route.split('/')[0];
      const key = provider === 'groq' ? GROQ_KEY : MISTRAL_KEY;
      if (!key) throw new Error(`server missing ${provider} key`);
      target =
        provider === 'groq'
          ? 'https://api.groq.com/openai/v1/audio/transcriptions'
          : 'https://api.mistral.ai/v1/audio/transcriptions';
      headers['authorization'] = `Bearer ${key}`;
    } else {
      return json(404, { error: `unknown route: ${route}` });
    }

    const upstream = await fetch(target, { method: 'POST', headers, body });
    const out = new Headers();
    const ct = upstream.headers.get('content-type');
    if (ct) out.set('content-type', ct);
    const ra = upstream.headers.get('retry-after');
    if (ra) out.set('retry-after', ra);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch (e) {
    return json(502, { error: `proxy error: ${e?.message || e}` });
  }
}
