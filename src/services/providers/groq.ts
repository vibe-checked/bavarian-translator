import { File } from 'expo-file-system';
import type { TranslateResult } from '../../types';
import type { TranslateInput, TranslationProvider } from './types';
import { transcriptInstruction, parseResult, httpError } from './prompt';

// Groq does speech in two steps: Whisper transcription, then an LLM translates.
const TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TRANSCRIBE_MODEL = 'whisper-large-v3'; // full model — more accurate on dialect than turbo

async function transcribe(input: TranslateInput): Promise<string> {
  const form = new FormData();
  // Expo's winter fetch encodes multipart from a Blob/File with .bytes() — the RN
  // { uri } convention is NOT supported there. expo-file-system File is a Blob.
  form.append('file', new File(input.uri) as any, 'audio.wav');
  form.append('model', TRANSCRIBE_MODEL);
  // In auto mode we don't know the language up front — let Whisper detect it.
  if (input.expected === 'de' || input.expected === 'en') {
    form.append('language', input.expected);
  }
  form.append('response_format', 'json');
  if (input.expected !== 'en') {
    // Bias Whisper toward German spelling; the dialect cleanup happens in the LLM step.
    form.append('prompt', 'Gesprochenes Bairisch bzw. Hochdeutsch.');
  }

  const res = await fetch(TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message ?? '';
    } catch {
      /* ignore */
    }
    throw httpError('Groq (transcribe)', res.status, detail);
  }
  const json = await res.json();
  return (json?.text ?? '').trim();
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
      detail = (await res.json())?.error?.message ?? '';
    } catch {
      /* ignore */
    }
    throw httpError('Groq', res.status, detail);
  }
  const json = await res.json();
  const text: string | undefined = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq returned no text.');
  return parseResult(text);
}

export const groqProvider: TranslationProvider = {
  id: 'groq',
  label: 'Groq (Whisper + Llama)',
  tier: 'free',
  apiKeyUrl: 'https://console.groq.com/keys',
  keyHint:
    'Free key with a generous quota. Whisper transcribes, then your chosen model translates with Bavarian cleanup.',
  models: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (recommended)' },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (fastest)' },
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
  ],
  defaultModel: 'llama-3.3-70b-versatile',
  allowCustomModel: true,
  translate,
};
