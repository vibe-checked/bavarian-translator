import type { TranslateResult } from '../../types';
import type { TranslateInput, TranslationProvider } from './types';
import { audioInstruction, parseResult, httpError, retryAfterSeconds, isLikelyNonSpeech } from './prompt';
import { endpointFor } from './proxy';
import { attestHeaders } from '../attest';

// Gemini uses its own (uppercase) schema dialect.
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    detected: { type: 'STRING' },
    bavarian: { type: 'BOOLEAN' },
    de: { type: 'STRING' },
    en: { type: 'STRING' },
  },
  required: ['detected', 'bavarian', 'de', 'en'],
};

async function translate(input: TranslateInput): Promise<TranslateResult> {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: audioInstruction(input.expected) },
          { inlineData: { mimeType: 'audio/wav', data: input.base64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_SCHEMA,
      temperature: 0.2,
    },
  };

  let res: Response;
  try {
    const ep = endpointFor({
      provider: 'gemini',
      proxyRoute: 'gemini',
      proxyParams: { model: input.model },
      directUrl: `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`,
      directKeyInUrl: true,
    });
    const attest = await attestHeaders(input.base64); // bound to the audio being sent this call
    res = await fetch(ep.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ep.headers, ...attest },
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (e: any) {
    throw new Error(`Network error reaching Gemini: ${e?.message ?? e}`);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const err = (await res.json())?.error;
      // Gemini puts the per-DAY/per-minute marker in details[].violations[].quotaId
      // (e.g. "GenerateRequestsPerDayPerProjectPerModel-FreeTier"), NOT in `message`.
      // Fold it into `detail` so the cooldown layer can tell a daily cap (park ~1h)
      // from a per-minute throttle — the human message alone can't.
      const quotaIds = (err?.details ?? [])
        .flatMap((d: any) => d?.violations ?? [])
        .map((v: any) => v?.quotaId)
        .filter(Boolean)
        .join(' ');
      detail = [err?.message ?? '', quotaIds].filter(Boolean).join(' · ');
    } catch {
      /* ignore */
    }
    throw httpError('Gemini', res.status, detail, retryAfterSeconds(res));
  }

  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no text (the clip may have been empty).');
  const r = parseResult(text);
  // Backstop: even the multimodal model occasionally emits a canned caption/recipe
  // line on silence. Only drop when a NON-empty field is junk (no duration arg —
  // its text is cleaned, so words/sec is moot); empty results fall through to the
  // app's normal "didn't catch that" handling.
  const junk = (t: string) => t.trim() !== '' && isLikelyNonSpeech(t);
  if (junk(r.de) || junk(r.en)) {
    return { detected: 'other', bavarian: false, de: '', en: '' };
  }
  return r;
}

export const geminiProvider: TranslationProvider = {
  id: 'gemini',
  label: 'Google Gemini',
  tier: 'free',
  apiKeyUrl: 'https://aistudio.google.com/apikey',
  keyHint: 'Free key from Google AI Studio — no credit card. Best Bavarian understanding.',
  // 2.5 Pro is omitted: it's paid-only on the free tier (limit:0). 3.x return 404
  // on a free key. So Flash is the best Gemini that actually runs for free.
  // Both models hear the audio directly (unlike Groq/Mistral, no shared transcribe),
  // so they genuinely differ. Audio test: Flash was the ONLY model in the whole test
  // to correctly render the moderate-Bavarian clip; Flash-Lite was faster but more
  // erratic (sometimes plausible, sometimes hallucinated) — hence the gap.
  // NOTE (2026-06-07): scores kept from the earlier test — Gemini's free daily quota
  // was exhausted during real-audio testing, so its REAL spontaneous-dialect quality
  // is still UNCONFIRMED (Groq's was validated and raised). Pending a real head-to-head.
  models: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — best', score: 82, quota: '' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite — fastest', score: 72, quota: '' },
  ],
  defaultModel: 'gemini-2.5-flash',
  allowCustomModel: true,
  translate,
};
