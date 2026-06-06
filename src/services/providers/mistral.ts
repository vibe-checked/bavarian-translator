import { File } from 'expo-file-system';
import type { TranslateResult } from '../../types';
import type { TranslateInput, TranslationProvider } from './types';
import { transcriptInstruction, parseResult, httpError } from './prompt';

// Mistral does speech in two steps: Voxtral transcription, then an LLM translates.
const TRANSCRIBE_URL = 'https://api.mistral.ai/v1/audio/transcriptions';
const CHAT_URL = 'https://api.mistral.ai/v1/chat/completions';
const TRANSCRIBE_MODEL = 'voxtral-mini-latest';

async function transcribe(input: TranslateInput): Promise<string> {
  const form = new FormData();
  // expo-file-system File is a Blob with .bytes() — required by Expo's winter fetch
  // multipart encoder (the RN { uri } form-data convention is not supported there).
  form.append('file', new File(input.uri) as any, 'audio.wav');
  form.append('model', TRANSCRIBE_MODEL);
  // In auto mode we don't know the language up front — let Voxtral detect it.
  if (input.expected === 'de' || input.expected === 'en') {
    form.append('language', input.expected);
  }

  const res = await fetch(TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.message ?? j?.error?.message ?? '';
    } catch {
      /* ignore */
    }
    throw httpError('Mistral (transcribe)', res.status, detail);
  }
  const json = await res.json();
  return (json?.text ?? json?.transcription ?? '').trim();
}

async function translate(input: TranslateInput): Promise<TranslateResult> {
  const transcript = await transcribe(input);
  if (!transcript) return { detected: 'other', bavarian: false, de: '', en: '' };

  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: transcriptInstruction(input.expected) },
        { role: 'user', content: `Transcript: "${transcript}"` },
      ],
    }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.message ?? '';
    } catch {
      /* ignore */
    }
    throw httpError('Mistral', res.status, detail);
  }
  const json = await res.json();
  const text: string | undefined = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Mistral returned no text.');
  return parseResult(text);
}

export const mistralProvider: TranslationProvider = {
  id: 'mistral',
  label: 'Mistral (Voxtral)',
  tier: 'freemium',
  apiKeyUrl: 'https://console.mistral.ai/api-keys',
  keyHint:
    'European provider with a free experiment tier. Voxtral transcribes, then your chosen Mistral model translates with Bavarian cleanup.',
  models: [
    { id: 'mistral-small-latest', label: 'Mistral Small (recommended)' },
    { id: 'mistral-large-latest', label: 'Mistral Large (best)' },
  ],
  defaultModel: 'mistral-small-latest',
  allowCustomModel: true,
  translate,
};
