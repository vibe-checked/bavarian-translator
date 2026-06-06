import type { Settings, TranslateResult } from '../../types';
import type { AudioClip, Expected, TranslationProvider } from './types';
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

// Look up model/key by the RESOLVED provider's id (not the raw saved engineId).
// If a saved engine was removed (e.g. OpenRouter), getProvider() falls back to
// Gemini, and we must use Gemini's own key/model — never the removed engine's
// (which would send an OpenRouter model id to Gemini and 404).

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

/**
 * Translate a recorded clip with whichever engine the user selected.
 * Throws with a readable message when no key is set or the request fails.
 */
export async function translateAudio(
  settings: Settings,
  clip: AudioClip,
  expected: Expected,
): Promise<TranslateResult> {
  const provider = getProvider(settings.engineId);
  const apiKey = selectedKey(settings);
  if (!apiKey) {
    throw new Error(
      `No API key for ${provider.label}. Open Settings (⚙︎) → Translation engine and paste a key from ${provider.apiKeyUrl}.`,
    );
  }
  return provider.translate({
    uri: clip.uri,
    base64: clip.base64,
    expected,
    model: selectedModel(settings),
    apiKey,
  });
}
