import * as Speech from 'expo-speech';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import type { Lang, Settings } from '../types';
import { ensurePlayAndRecord } from './audioSession';

export interface SpeakOptions {
  onDone?: () => void;
  onError?: (message: string) => void;
}

/** Ensure the shared play-and-record session is active (plays out the speaker). */
async function preparePlayback() {
  await ensurePlayAndRecord();
}

/** Stop any current speech / playback immediately. */
export function stopSpeaking() {
  Speech.stop();
  if (elPlayer) {
    try {
      elPlayer.remove();
    } catch {
      /* ignore */
    }
    elPlayer = null;
  }
}

/**
 * Speak text in the given language. German honours the slow / voice settings;
 * English plays at the normal English rate. Routes German through ElevenLabs
 * when the user has enabled it (for a more natural / Bavarian voice).
 */
export async function speak(
  text: string,
  lang: Lang,
  settings: Settings,
  opts: SpeakOptions = {},
) {
  const clean = text.trim();
  if (!clean) return;

  stopSpeaking();
  await preparePlayback();

  if (
    lang === 'de' &&
    settings.useElevenLabs &&
    settings.elevenLabsApiKey &&
    settings.elevenLabsVoiceId
  ) {
    try {
      await speakWithElevenLabs(clean, settings, opts);
      return;
    } catch (e: any) {
      // Fall back to the built-in voice if ElevenLabs fails for any reason.
      opts.onError?.(`ElevenLabs failed (${e?.message ?? e}); using built-in voice.`);
    }
  }

  const rate =
    lang === 'de'
      ? settings.germanSlow
        ? settings.germanSlowRate
        : settings.germanNormalRate
      : settings.englishRate;

  const voice = lang === 'de' ? settings.germanVoiceId : settings.englishVoiceId;

  Speech.speak(clean, {
    language: lang === 'de' ? 'de-DE' : 'en-US',
    rate,
    pitch: 1.0,
    voice: voice || undefined,
    onDone: opts.onDone,
    onStopped: opts.onDone,
    onError: (err) => opts.onError?.(String(err)),
  });
}

/**
 * Speak and resolve when playback finishes (or errors). Used by always-listening
 * mode so it can wait for the spoken translation to end before it resumes
 * listening — otherwise it would hear and re-translate its own output.
 * A safety timeout guarantees the promise always resolves.
 */
export function speakAsync(text: string, lang: Lang, settings: Settings): Promise<void> {
  const clean = text.trim();
  if (!clean) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    // Rough upper bound on how long speech could take, so we never hang.
    const perChar = lang === 'de' && settings.germanSlow ? 170 : 95;
    const timer = setTimeout(finish, Math.min(30000, 2500 + clean.length * perChar));
    speak(clean, lang, settings, { onDone: finish, onError: finish });
  });
}

// ── ElevenLabs (optional, paid) ──────────────────────────────────────────────
// Untested without a key. Enable via Settings → "Use ElevenLabs for German".

let elPlayer: AudioPlayer | null = null;

async function speakWithElevenLabs(text: string, settings: Settings, opts: SpeakOptions) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${settings.elevenLabsVoiceId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': settings.elevenLabsApiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      // Slow it down for elderly listeners when "slow German" is on.
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        speed: settings.germanSlow ? 0.7 : 1.0,
      },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const buf = await res.arrayBuffer();
  const file = new File(Paths.cache, 'el-tts.mp3');
  try {
    if (file.exists) file.delete();
  } catch {
    /* ignore */
  }
  file.write(new Uint8Array(buf));

  elPlayer = createAudioPlayer(file.uri);
  elPlayer.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish) {
      opts.onDone?.();
      stopSpeaking();
    }
  });
  elPlayer.play();
}

// ── Voice discovery ──────────────────────────────────────────────────────────

export interface VoiceInfo {
  identifier: string;
  name: string;
  language: string;
  quality?: string;
}

/** German-family + English voices installed on this device, for the picker. */
export async function loadVoices(): Promise<{ german: VoiceInfo[]; english: VoiceInfo[] }> {
  let voices: VoiceInfo[] = [];
  try {
    voices = (await Speech.getAvailableVoicesAsync()) as unknown as VoiceInfo[];
  } catch {
    return { german: [], english: [] };
  }
  const german = voices
    .filter((v) => v.language?.toLowerCase().startsWith('de'))
    // de-AT (Austrian) and de-CH sound closer to Bavarian — surface them first.
    .sort((a, b) => rankGerman(b) - rankGerman(a));
  const english = pickDistinctEnglish(voices.filter((v) => v.language?.toLowerCase().startsWith('en')));
  return { german, english };
}

const isEnhanced = (v: VoiceInfo) => !!v.quality && /enhanced|premium/i.test(v.quality);

/**
 * The English picker doesn't need every installed voice — just a few clearly
 * DIFFERENT ones. Pick the best-quality voice from up to three distinct accent
 * regions (US → UK → Australian → …), so the choices sound genuinely different.
 */
export function pickDistinctEnglish(voices: VoiceInfo[]): VoiceInfo[] {
  const order = ['en-us', 'en-gb', 'en-au', 'en-ie', 'en-in', 'en-za'];
  const bestByRegion = new Map<string, VoiceInfo>();
  for (const v of voices) {
    const lang = (v.language ?? '').toLowerCase();
    const cur = bestByRegion.get(lang);
    if (!cur || (isEnhanced(v) && !isEnhanced(cur))) bestByRegion.set(lang, v);
  }
  const picked: VoiceInfo[] = [];
  for (const region of order) {
    const v = bestByRegion.get(region);
    if (v) picked.push(v);
    if (picked.length === 3) return picked;
  }
  // Fewer than three regions installed → top up with any other distinct voices.
  for (const v of voices) {
    if (picked.length === 3) break;
    if (!picked.some((p) => p.identifier === v.identifier || p.name === v.name)) picked.push(v);
  }
  return picked;
}

function rankGerman(v: VoiceInfo): number {
  let score = 0;
  const lang = v.language?.toLowerCase() ?? '';
  if (lang.startsWith('de-at')) score += 3; // Austrian: closest to Bavarian
  if (lang.startsWith('de-ch')) score += 1;
  if (v.quality && /enhanced|premium/i.test(v.quality)) score += 2;
  return score;
}
