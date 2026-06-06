import type { TranslateResult } from '../../types';
import type { TranslateInput, TranslationProvider } from './types';
import { audioInstruction, parseResult, httpError } from './prompt';

const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

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
    res = await fetch(ENDPOINT(input.model, input.apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e: any) {
    throw new Error(`Network error reaching Gemini: ${e?.message ?? e}`);
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message ?? '';
    } catch {
      /* ignore */
    }
    throw httpError('Gemini', res.status, detail);
  }

  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no text (the clip may have been empty).');
  return parseResult(text);
}

export const geminiProvider: TranslationProvider = {
  id: 'gemini',
  label: 'Google Gemini',
  tier: 'free',
  apiKeyUrl: 'https://aistudio.google.com/apikey',
  keyHint: 'Free key from Google AI Studio — no credit card. Best Bavarian understanding.',
  models: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (recommended)' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (fastest)' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
  defaultModel: 'gemini-2.5-flash',
  allowCustomModel: true,
  translate,
};
