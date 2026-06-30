// Bavarian Translator — key proxy.
//
// Holds the Gemini / Groq / Mistral API keys server-side so they are never
// shipped in the app bundle. The app sends the SAME request shapes it used to
// send directly to each provider; this function injects the secret key and
// forwards the request upstream, passing the response (status + body +
// retry-after) straight back so the app's existing failover/cooldown logic
// keeps working unchanged.
//
// Route is selected via ?route=  (gemini | groq/chat | groq/transcribe |
// mistral/chat | mistral/transcribe), with ?model= for gemini.
//
// Defense in depth (not a substitute for App Attest, but raises the bar and is
// centrally revocable without an app update):
//   • x-app-key shared token gate
//   • per-route upstream allowlist
//   • model prefix allowlist (limits which models our key can be used for)
//   • only POST is forwarded

export const config = { api: { bodyParser: false } };

const APP_KEY = process.env.APP_PROXY_TOKEN || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const MISTRAL_KEY = process.env.MISTRAL_API_KEY || '';

// Which model id prefixes our key may be used for, per provider. Keeps the
// blast radius small if the app token ever leaks (can't be used to call
// arbitrary expensive models on our account).
const MODEL_ALLOW = {
  gemini: [/^gemini-/i],
  groq: [/^llama-/i, /^meta-llama\//i, /^qwen\//i, /^whisper-/i],
  mistral: [/^mistral-/i, /^voxtral-/i],
};

function modelAllowed(provider, model) {
  if (!model) return false;
  return (MODEL_ALLOW[provider] || []).some((re) => re.test(model));
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  if (!APP_KEY || req.headers['x-app-key'] !== APP_KEY) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const route = String(req.query.route || ''); // e.g. "gemini", "groq/chat"
  const body = await readRawBody(req);
  const contentType = req.headers['content-type'] || 'application/octet-stream';

  let url;
  const headers = {};

  try {
    if (route === 'gemini') {
      const model = String(req.query.model || '');
      if (!modelAllowed('gemini', model)) {
        res.status(400).json({ error: `model not allowed: ${model}` });
        return;
      }
      if (!GEMINI_KEY) throw new Error('server missing GEMINI_API_KEY');
      url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
        `:generateContent?key=${GEMINI_KEY}`;
      headers['content-type'] = contentType;
    } else if (route === 'groq/chat' || route === 'mistral/chat') {
      const provider = route.split('/')[0];
      // Chat bodies are JSON — validate the model before spending our key.
      let model = '';
      try {
        model = JSON.parse(body.toString('utf8'))?.model || '';
      } catch {
        /* fall through to allowlist reject */
      }
      if (!modelAllowed(provider, model)) {
        res.status(400).json({ error: `model not allowed: ${model}` });
        return;
      }
      const key = provider === 'groq' ? GROQ_KEY : MISTRAL_KEY;
      if (!key) throw new Error(`server missing ${provider} key`);
      url =
        provider === 'groq'
          ? 'https://api.groq.com/openai/v1/chat/completions'
          : 'https://api.mistral.ai/v1/chat/completions';
      headers['content-type'] = contentType;
      headers['authorization'] = `Bearer ${key}`;
    } else if (route === 'groq/transcribe' || route === 'mistral/transcribe') {
      const provider = route.split('/')[0];
      const key = provider === 'groq' ? GROQ_KEY : MISTRAL_KEY;
      if (!key) throw new Error(`server missing ${provider} key`);
      url =
        provider === 'groq'
          ? 'https://api.groq.com/openai/v1/audio/transcriptions'
          : 'https://api.mistral.ai/v1/audio/transcriptions';
      // Multipart: forward the body + boundary verbatim, just add auth.
      headers['content-type'] = contentType;
      headers['authorization'] = `Bearer ${key}`;
    } else {
      res.status(404).json({ error: `unknown route: ${route}` });
      return;
    }

    const upstream = await fetch(url, { method: 'POST', headers, body });
    const buf = Buffer.from(await upstream.arrayBuffer());

    // Pass through the bits the app's failover layer reads.
    res.status(upstream.status);
    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('content-type', ct);
    const ra = upstream.headers.get('retry-after');
    if (ra) res.setHeader('retry-after', ra);
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: `proxy error: ${e?.message || e}` });
  }
}
