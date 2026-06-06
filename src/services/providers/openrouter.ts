import type { TranslateResult } from '../../types';
import type { TranslateInput, TranslationProvider } from './types';
import { audioInstruction, parseResult, httpError } from './prompt';

// OpenRouter is OpenAI-compatible and proxies many providers behind one key.
// We send the audio inline to whichever audio-capable model the user picked.
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function translate(input: TranslateInput): Promise<TranslateResult> {
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'BavarianTranslator',
    },
    body: JSON.stringify({
      // No response_format here on purpose: OpenRouter routes to many models,
      // and some 400 on json_object. The prompt + robust parseResult handle JSON.
      model: input.model,
      temperature: 0.2,
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
    throw httpError('OpenRouter', res.status, detail);
  }
  const json = await res.json();
  const text: string | undefined = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter returned no text (the model may not accept audio).');
  return parseResult(text);
}

export const openrouterProvider: TranslationProvider = {
  id: 'openrouter',
  label: 'OpenRouter (many models)',
  tier: 'freemium',
  apiKeyUrl: 'https://openrouter.ai/keys',
  keyHint:
    'One key to reach top models (e.g. gemini-2.5-pro). Audio needs a small prepaid balance (≥$0.50) — even the “free” models. Top up at openrouter.ai/credits.',
  // One key, but pay-as-you-go credits. Reaches the top models that Gemini/OpenAI
  // gate behind billing on their own free tiers.
  models: [
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro — top quality', score: 95, quota: 'credits/paid' },
    { id: 'openai/gpt-audio', label: 'GPT-audio (OpenAI omni)', score: 90, quota: 'credits/paid' },
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', score: 86, quota: 'credits/paid' },
  ],
  defaultModel: 'google/gemini-2.5-pro',
  allowCustomModel: true,
  translate,
};
