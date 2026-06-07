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

/** An Error carrying classification flags so the failover layer can react. */
export interface ProviderError extends Error {
  status?: number;
  /** True for rate/quota limits (429, or a 403 that mentions quota) → park on cooldown. */
  quota?: boolean;
  /** True for a rejected/invalid API key → skip this engine, don't cooldown. */
  auth?: boolean;
  /** True when the request was aborted by our timeout. */
  timeout?: boolean;
  /** How long to park this model after a quota hit (ms) — derived from the API's hint. */
  cooldownMs?: number;
}

// Most free-tier 429s are a per-MINUTE request throttle (e.g. Mistral free = 4 req/min,
// Groq has per-minute limits) that clears in seconds — so park briefly, not for an hour.
// Only a 429 that clearly reads like a per-DAY quota (e.g. Gemini free ~20/day) gets the
// long cooldown. An explicit Retry-After header always wins.
const SHORT_RATE_LIMIT_MS = 90 * 1000; // per-minute throttle → back in ~1–2 min
const DAILY_QUOTA_MS = 60 * 60 * 1000; // looks like a daily cap → come back much later

/** Parse a numeric Retry-After header (seconds) from a response, if present. */
export function retryAfterSeconds(res: { headers?: { get?(name: string): string | null } }): number | undefined {
  const v = res?.headers?.get?.('retry-after');
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

// Whisper/Voxtral hallucinate canned caption phrases on silence or noise
// ("Vielen Dank fürs Zuschauen", "Thanks for watching", "Untertitel … Amara.org",
// music notes …). These never occur in real conversation, so treat them as
// no-speech → the app shows "didn't catch that" instead of a spurious bubble.
// NOTE: deliberately does NOT match bare "Danke"/"Thank you" — those are real.
const NON_SPEECH =
  /amara\.org|untertitel|zuschauen|aufmerksamkeit|thanks?\s+for\s+watching|please\s+subscribe|like\s+and\s+subscribe|untertitelung|^[\s♪♫🎵.,!?-]*$|^[\s]*[♪♫🎵]/i;

/** True when a transcript is empty or an obvious non-speech hallucination. */
export function isLikelyNonSpeech(transcript: string): boolean {
  const s = transcript.trim();
  if (!s) return true;
  return NON_SPEECH.test(s);
}

/** Shared friendly HTTP error → message, tagged for the failover layer. */
export function httpError(
  provider: string,
  status: number,
  detail: string,
  retryAfterSec?: number,
): ProviderError {
  const quota = status === 429 || (status === 403 && /quota|exhaust|rate/i.test(detail));
  const auth =
    status === 401 ||
    (status === 403 && !quota) ||
    (status === 400 && /api key|api_key|invalid/i.test(detail));

  let message: string;
  if (quota) message = `${provider}: rate/quota limit hit.`;
  else if (status === 401 || status === 403)
    message = `${provider}: API key rejected. Check it in Settings → Translation engine.`;
  else if (auth) message = `${provider}: that API key looks invalid. Check it in Settings.`;
  else message = `${provider} error ${status}: ${detail || 'request failed'}`;

  const e = new Error(message) as ProviderError;
  e.status = status;
  e.quota = quota;
  e.auth = auth;
  if (quota) {
    // Cap at 1h: a free quota never needs longer (daily ones reset overnight, and
    // the app retries on its own), so the "auto in Xm" countdown stays ≤ ~60 min.
    if (retryAfterSec && retryAfterSec > 0)
      e.cooldownMs = Math.min(DAILY_QUOTA_MS, Math.max(15000, retryAfterSec * 1000));
    else if (/per[\s-]?day|\bdaily\b|requests per day|perday/i.test(detail)) e.cooldownMs = DAILY_QUOTA_MS;
    else e.cooldownMs = SHORT_RATE_LIMIT_MS;
  }
  return e;
}
