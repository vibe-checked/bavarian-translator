import type { TranslateResult } from '../../types';
import type { Expected } from './types';

const BAVARIAN_GUIDE =
  'Examples of Bavarian you must handle: "Servus", "Grüß di / Grüß God", "Habedere", "Pfiat di", "fei", "gell/gö", "a weng / a bissl", "ned / net / nia / nix / koa", "Bua", "Madl / Dirndl", "Brotzeit", "Semme/Semmal", "dahoam", "schee", "passt scho", "geh weida", "i mog di", "wos", "des", "ebba", "nimmer", "Buam", "Wiesn", "Maß", diminutives ending in "-erl".';

function expectedLabel(expected: Expected): string {
  if (expected === 'de')
    return 'German — most likely BAVARIAN dialect (Boarisch/Bairisch), possibly from an elderly speaker';
  if (expected === 'en') return 'English';
  return 'either German (possibly BAVARIAN dialect / Boarisch, possibly from an elderly speaker) or English — you must work out which';
}

/**
 * Instruction for providers that receive the audio directly (Gemini, OpenAI).
 * Asks for BOTH a German and an English rendering so each person reads their own.
 */
export function audioInstruction(expected: Expected): string {
  return `You are a live, two-way interpreter sitting between a German speaker who often speaks BAVARIAN dialect (Boarisch) and an English speaker. You just received a short audio clip.

The person who tapped to speak was most likely speaking: ${expectedLabel(expected)}. But trust the audio — detect the language yourself.

Do this:
1. Transcribe what was actually said.
2. Produce a clean, natural STANDARD GERMAN rendering in "de" and a natural, faithful ENGLISH rendering in "en", so both people can read the same sentence in their own language. Keep it first person and conversational, the way it was spoken.
3. If the speaker used Bavarian dialect, understand it correctly and set "bavarian": true. ${BAVARIAN_GUIDE}
4. If you genuinely cannot make out any speech, return empty strings for "de" and "en".

Return ONLY a JSON object of the form {"detected":"de|en|other","bavarian":true|false,"de":"...","en":"..."}. No markdown, no commentary.`;
}

/**
 * Instruction for the text-translation step of two-step providers (Groq):
 * we already have a transcript, now translate + clean it up.
 */
export function transcriptInstruction(expected: Expected): string {
  return `You are a two-way interpreter between a German speaker who often speaks BAVARIAN dialect (Boarisch) and an English speaker. You are given a raw transcript that was most likely spoken in ${expectedLabel(expected)}.

Produce a clean STANDARD GERMAN rendering in "de" and a natural ENGLISH rendering in "en", first person and conversational. If the transcript reflects Bavarian dialect, interpret it correctly and set "bavarian": true. ${BAVARIAN_GUIDE}

Return ONLY a JSON object {"detected":"de|en|other","bavarian":true|false,"de":"...","en":"..."}.`;
}

/** The OpenAI-style JSON schema some providers accept for structured output. */
export const JSON_SCHEMA = {
  type: 'object',
  properties: {
    detected: { type: 'string', enum: ['de', 'en', 'other'] },
    bavarian: { type: 'boolean' },
    de: { type: 'string' },
    en: { type: 'string' },
  },
  required: ['detected', 'bavarian', 'de', 'en'],
  additionalProperties: false,
} as const;

/**
 * Robustly parse a model's JSON text into a TranslateResult. Never throws —
 * on total failure it returns empty strings, which the app surfaces as
 * "didn't catch that". Handles code fences and JSON wrapped in prose (some
 * OpenRouter models add commentary).
 */
export function parseResult(text: string): TranslateResult {
  const attempt = (s: string): any => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const braced = start >= 0 && end > start ? cleaned.slice(start, end + 1) : '';
  const parsed = attempt(text) ?? attempt(cleaned) ?? (braced ? attempt(braced) : null) ?? {};
  return {
    detected: parsed.detected === 'en' ? 'en' : parsed.detected === 'de' ? 'de' : 'other',
    bavarian: Boolean(parsed.bavarian),
    de: typeof parsed.de === 'string' ? parsed.de.trim() : '',
    en: typeof parsed.en === 'string' ? parsed.en.trim() : '',
  };
}

/** Shared friendly HTTP error → message. */
export function httpError(provider: string, status: number, detail: string): Error {
  if (status === 401 || status === 403) {
    return new Error(`${provider}: API key rejected. Check it in Settings → Translation engine.`);
  }
  if (status === 429) {
    return new Error(`${provider}: rate/quota limit hit. Wait a moment and try again.`);
  }
  if (status === 400 && /api key|api_key|invalid/i.test(detail)) {
    return new Error(`${provider}: that API key looks invalid. Check it in Settings.`);
  }
  return new Error(`${provider} error ${status}: ${detail || 'request failed'}`);
}
