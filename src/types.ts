export type Lang = 'de' | 'en';

/** One thing that was said, stored once but shown in both languages. */
export interface Utterance {
  id: string;
  /** Who actually spoke. */
  speaker: Lang;
  /** German rendering (Standard German, cleaned up from Bavarian if needed). */
  de: string;
  /** English rendering. */
  en: string;
  /** True when the German speaker used Bavarian dialect. */
  bavarian: boolean;
  createdAt: number;
}

/** Result of sending an audio clip to a translation engine. */
export interface TranslateResult {
  detected: Lang | 'other';
  bavarian: boolean;
  de: string;
  en: string;
}

export interface Settings {
  /** Which translation provider is active (see services/providers). */
  engineId: string;
  /** Per-provider chosen model id (empty → that provider's default). */
  engineModels: Record<string, string>;
  /** Per-provider API key, stored on this device. */
  engineKeys: Record<string, string>;

  /** Speak the translation aloud automatically after each turn. */
  autoSpeak: boolean;
  /** Use the slow German rate for the elderly listener. */
  germanSlow: boolean;
  /** expo-speech rate used when germanSlow is on (1.0 = normal). */
  germanSlowRate: number;
  /** expo-speech rate for German when slow is off. */
  germanNormalRate: number;
  /** expo-speech rate for English. */
  englishRate: number;
  /** Chosen iOS/Android voice identifier for German (empty = system default). */
  germanVoiceId: string;
  /** Chosen voice identifier for English. */
  englishVoiceId: string;
  /** Rotate the German (top) pane 180° for face-to-face across a table. */
  faceToFace: boolean;

  /**
   * 'tap'  = press a mic per turn.
   * 'auto' = always-listening, turn-based, speaks the translation (half-duplex).
   * 'live' = always-listening, streams translated TEXT in short chunks as you speak (no auto-TTS).
   */
  conversationMode: 'tap' | 'auto' | 'live';
  /** Auto-mode voice threshold in dBFS — above this counts as speech. Lower = more sensitive. */
  autoSpeechThresholdDb: number;

  /** Optional ElevenLabs key for a more natural / Bavarian German voice. */
  elevenLabsApiKey: string;
  /** ElevenLabs voice id to use for German (e.g. a cloned Bavarian voice). */
  elevenLabsVoiceId: string;
  /** Route German speech through ElevenLabs instead of expo-speech. */
  useElevenLabs: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  // Gemini 2.5 Flash is the default: best Bavarian quality that runs on a free key
  // (Pro is paid). Switch to Groq in Settings for far higher quota (weaker dialect).
  engineId: 'gemini',
  engineModels: {},
  engineKeys: {
    gemini: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
    groq: process.env.EXPO_PUBLIC_GROQ_API_KEY ?? '',
    mistral: process.env.EXPO_PUBLIC_MISTRAL_API_KEY ?? '',
  },

  autoSpeak: true,
  germanSlow: true,
  germanSlowRate: 0.45,
  germanNormalRate: 0.9,
  englishRate: 1.0,
  germanVoiceId: '',
  englishVoiceId: '',
  faceToFace: false,

  conversationMode: 'tap',
  autoSpeechThresholdDb: -35,

  elevenLabsApiKey: process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY ?? '',
  elevenLabsVoiceId: process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_ID ?? '',
  useElevenLabs: false,
};
