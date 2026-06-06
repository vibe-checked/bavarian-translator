import type { Settings, TranslateResult } from '../../types';
import type { AudioClip, Expected, TranslationProvider } from './types';
import { geminiProvider } from './gemini';
import { groqProvider } from './groq';
import { mistralProvider } from './mistral';
import { openrouterProvider } from './openrouter';
import { openaiProvider } from './openai';

export type { TranslationProvider, ModelOption, Tier, Expected } from './types';

/** Ordered list shown in the engine picker. Add a new provider here to expose it. */
export const PROVIDERS: TranslationProvider[] = [
  geminiProvider,
  groqProvider,
  mistralProvider,
  openrouterProvider,
  openaiProvider,
];

export function getProvider(id: string): TranslationProvider {
  return PROVIDERS.find((p) => p.id === id) ?? geminiProvider;
}

/** The model id in effect for the active engine (chosen, or the provider default). */
export function selectedModel(settings: Settings): string {
  const provider = getProvider(settings.engineId);
  return settings.engineModels[settings.engineId]?.trim() || provider.defaultModel;
}

/** The API key for the active engine. */
export function selectedKey(settings: Settings): string {
  return (settings.engineKeys[settings.engineId] ?? '').trim();
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
