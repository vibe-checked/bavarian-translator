import type { Settings, TranslateResult } from '../../types';
import type { AudioClip, Expected, TranslationProvider } from './types';
import type { ProviderError } from './prompt';
import { geminiProvider } from './gemini';
import { groqProvider } from './groq';
import { mistralProvider } from './mistral';

export type { TranslationProvider, ModelOption, Tier, Expected } from './types';

/**
 * Ordered list shown in the engine picker. Every model here was tested to WORK
 * for free on the user's own keys — no credit card / prepaid balance.
 * Dropped: OpenAI (paid-only) and OpenRouter (all its models, even ":free" ones,
 * require a >=$0.50 prepaid balance for audio, so none work on a $0 key).
 */
export const PROVIDERS: TranslationProvider[] = [geminiProvider, groqProvider, mistralProvider];

export function getProvider(id: string): TranslationProvider {
  return PROVIDERS.find((p) => p.id === id) ?? geminiProvider;
}

/** Fallback cooldown when the API gave no hint (httpError usually sets a smarter value). */
export const COOLDOWN_MS = 5 * 60 * 1000; // 5 min — conservative default; real value comes from the 429
/** Default per-attempt request timeout. */
const DEFAULT_TIMEOUT_MS = 18000;

// Look up model/key by the RESOLVED provider's id (not the raw saved engineId).
// If a saved engine was removed (e.g. OpenRouter), getProvider() falls back to
// Gemini, and we must use Gemini's own key/model — never the removed engine's.

/** The model id in effect for the active engine (chosen, or the provider default). */
export function selectedModel(settings: Settings): string {
  const provider = getProvider(settings.engineId);
  return settings.engineModels[provider.id]?.trim() || provider.defaultModel;
}

/** The API key for the active engine. */
export function selectedKey(settings: Settings): string {
  const provider = getProvider(settings.engineId);
  return (settings.engineKeys[provider.id] ?? '').trim();
}

// ── Cooldown registry ──────────────────────────────────────────────────────
export function cooldownKey(engineId: string, model: string): string {
  return `${engineId}:${model}`;
}
export function cooldownUntil(settings: Settings, engineId: string, model: string): number {
  return settings.cooldowns?.[cooldownKey(engineId, model)] ?? 0;
}
export function isCooled(settings: Settings, engineId: string, model: string, now: number): boolean {
  return cooldownUntil(settings, engineId, model) > now;
}

// ── Failover candidates ──────────────────────────────────────────────────────
interface Candidate {
  engineId: string;
  model: string;
  apiKey: string;
  engineLabel: string;
  modelLabel: string;
  score: number;
}

function modelLabelOf(provider: TranslationProvider, modelId: string): string {
  return provider.models.find((m) => m.id === modelId)?.label ?? modelId;
}
function scoreOf(provider: TranslationProvider, modelId: string): number {
  return provider.models.find((m) => m.id === modelId)?.score ?? 0;
}

/**
 * Ordered list of (engine, model) the translator may use, best first:
 *   1. the user's preferred engine — its selected model, then its other models
 *      (Gemini's two models have SEPARATE daily quotas, so this genuinely helps);
 *   2. every other engine's selected/default model, by quality score.
 * Only candidates whose engine has an API key are included.
 */
function candidatesFor(settings: Settings): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const add = (provider: TranslationProvider, modelId: string) => {
    const apiKey = (settings.engineKeys[provider.id] ?? '').trim();
    if (!apiKey || !modelId) return;
    const ck = cooldownKey(provider.id, modelId);
    if (seen.has(ck)) return;
    seen.add(ck);
    out.push({
      engineId: provider.id,
      model: modelId,
      apiKey,
      engineLabel: provider.label,
      modelLabel: modelLabelOf(provider, modelId),
      score: scoreOf(provider, modelId),
    });
  };

  const preferred = getProvider(settings.engineId);
  add(preferred, selectedModel(settings)); // exact current choice first
  [...preferred.models]
    .sort((a, b) => b.score - a.score)
    .forEach((m) => add(preferred, m.id)); // then its other models

  PROVIDERS.filter((p) => p.id !== preferred.id)
    .sort((a, b) => Math.max(...b.models.map((m) => m.score)) - Math.max(...a.models.map((m) => m.score)))
    .forEach((p) => add(p, settings.engineModels[p.id]?.trim() || p.defaultModel));

  return out;
}

export interface EnginePick {
  engineId: string;
  model: string;
  engineLabel: string;
  modelLabel: string;
}

/** The (engine, model) that would actually be used right now (skips cooled ones). */
export function firstAvailable(settings: Settings, now: number): EnginePick | null {
  const all = candidatesFor(settings);
  const c = all.find((x) => !isCooled(settings, x.engineId, x.model, now)) ?? all[0];
  return c ? { engineId: c.engineId, model: c.model, engineLabel: c.engineLabel, modelLabel: c.modelLabel } : null;
}

export interface TranslateOutcome {
  result: TranslateResult;
  /** What actually produced the result. */
  used: EnginePick;
  /** What the user would normally use (their selection). */
  preferred: EnginePick;
  /** Models newly parked on cooldown during this call → caller persists these. */
  cooldowns: Record<string, number>;
}

function isAbort(e: any): boolean {
  return e?.name === 'AbortError' || /abort/i.test(String(e?.message ?? ''));
}

/** One translate attempt with a hard timeout (aborts the fetch AND unblocks us). */
async function attempt(
  c: Candidate,
  clip: AudioClip,
  expected: Expected,
  timeoutMs: number,
): Promise<TranslateResult> {
  const provider = getProvider(c.engineId);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutP = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const e = new Error(`${provider.label} timed out`) as ProviderError;
      e.timeout = true;
      reject(e);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      provider.translate({
        uri: clip.uri,
        base64: clip.base64,
        expected,
        model: c.model,
        apiKey: c.apiKey,
        signal: controller.signal,
      }),
      timeoutP,
    ]);
  } catch (e: any) {
    if (e?.timeout) throw e;
    if (isAbort(e)) {
      const te = new Error(`${provider.label} timed out`) as ProviderError;
      te.timeout = true;
      throw te;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Translate a recorded clip, automatically failing over across models/engines.
 *
 * - Tries candidates best-first, skipping any on cooldown.
 * - A quota/429 parks that model on cooldown (returned in `cooldowns`) and moves on.
 * - A timeout or transient error just moves on (no cooldown).
 * - Returns the first success, noting which engine/model was actually used.
 * - Throws ONLY when every candidate failed (message explains why); the thrown
 *   error carries `.cooldowns` so the caller can still persist what it learned.
 */
export async function translateAudio(
  settings: Settings,
  clip: AudioClip,
  expected: Expected,
  opts?: { timeoutMs?: number; now?: number },
): Promise<TranslateOutcome> {
  const now = opts?.now ?? Date.now();
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const all = candidatesFor(settings);
  if (all.length === 0) {
    const provider = getProvider(settings.engineId);
    throw new Error(
      `No API key for ${provider.label}. Open Settings (⚙︎) → Translation engine and paste a key from ${provider.apiKeyUrl}.`,
    );
  }

  const preferred: EnginePick = {
    engineId: all[0].engineId,
    model: all[0].model,
    engineLabel: all[0].engineLabel,
    modelLabel: all[0].modelLabel,
  };

  // Prefer not-cooled candidates; if everything is cooled, still try them all
  // (a quota may have actually reset — better to attempt than hard-fail).
  const fresh = all.filter((c) => !isCooled(settings, c.engineId, c.model, now));
  const queue = fresh.length ? fresh : all;

  const cooldowns: Record<string, number> = {};
  let lastErr: ProviderError | null = null;

  for (const c of queue) {
    try {
      const result = await attempt(c, clip, expected, timeoutMs);
      return {
        result,
        used: { engineId: c.engineId, model: c.model, engineLabel: c.engineLabel, modelLabel: c.modelLabel },
        preferred,
        cooldowns,
      };
    } catch (e: any) {
      lastErr = e;
      // Park on cooldown for the duration the API hinted at (Retry-After / per-day vs
      // per-minute); fall back to a short default. Timeouts/auth/transient don't cooldown.
      if (e?.quota) cooldowns[cooldownKey(c.engineId, c.model)] = now + (e.cooldownMs ?? COOLDOWN_MS);
      // quota / timeout / auth / transient → just try the next candidate
    }
  }

  let message: string;
  if (Object.keys(cooldowns).length) {
    message = '⚠ Every engine hit its rate limit. Quotas reset within ~1 hour (some overnight) — try again soon.';
  } else if (lastErr?.timeout) {
    message = '⚠ Translation timed out — check your connection and try again.';
  } else {
    message = lastErr?.message || 'Translation failed.';
  }
  const err = new Error(message) as ProviderError & { cooldowns: Record<string, number> };
  err.cooldowns = cooldowns;
  throw err;
}
