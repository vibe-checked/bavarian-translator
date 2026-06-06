import type { Lang, TranslateResult } from '../../types';

/** A recorded clip, available both as a file (for multipart uploads) and base64 (for inline). */
export interface AudioClip {
  uri: string;
  base64: string;
}

/** The language the speaker most likely used; 'auto' when we don't know (always-listening mode). */
export type Expected = Lang | 'auto';

export interface TranslateInput extends AudioClip {
  expected: Expected;
  model: string;
  apiKey: string;
}

export interface ModelOption {
  id: string;
  label: string;
}

export type Tier = 'free' | 'freemium' | 'paid';

export interface TranslationProvider {
  id: string;
  label: string;
  tier: Tier;
  /** Where to get an API key. */
  apiKeyUrl: string;
  /** Short, human description shown under the key field. */
  keyHint: string;
  /** Selectable models for this provider. */
  models: ModelOption[];
  defaultModel: string;
  /** Allow typing a custom model id (future-proofing against renames). */
  allowCustomModel: boolean;
  translate(input: TranslateInput): Promise<TranslateResult>;
}
