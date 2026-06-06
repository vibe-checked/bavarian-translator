import type { TranslateResult } from '../../types';
import type { TranslateInput, TranslationProvider } from './types';
import { audioInstruction, parseResult, httpError } from './prompt';

const CHAT_URL = 'https://api.openai.com/v1/chat/completions';

async function translate(input: TranslateInput): Promise<TranslateResult> {
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      modalities: ['text'],
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: audioInstruction(input.expected) },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Interpret this audio clip.' },
            { type: 'input_audio', input_audio: { data: input.base64, format: 'wav' } },
          ],
        },
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
    throw httpError('OpenAI', res.status, detail);
  }
  const json = await res.json();
  const text: string | undefined = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI returned no text.');
  return parseResult(text);
}

export const openaiProvider: TranslationProvider = {
  id: 'openai',
  label: 'OpenAI (GPT-4o audio)',
  tier: 'paid',
  apiKeyUrl: 'https://platform.openai.com/api-keys',
  keyHint: 'Pay-per-use (cheap for personal use). Strong audio understanding, including dialect.',
  models: [
    { id: 'gpt-4o-mini-audio-preview', label: 'GPT-4o mini audio (cheapest)' },
    { id: 'gpt-4o-audio-preview', label: 'GPT-4o audio (best)' },
  ],
  defaultModel: 'gpt-4o-mini-audio-preview',
  allowCustomModel: true,
  translate,
};
