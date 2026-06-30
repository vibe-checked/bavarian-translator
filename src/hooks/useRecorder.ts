import { useRef, useState } from 'react';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  IOSOutputFormat,
  AudioQuality,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { ensurePlayAndRecord } from '../services/audioSession';

/**
 * 16 kHz mono linear-PCM WAV. Small to upload and a format the translation
 * engine reliably accepts. We start from the HIGH_QUALITY preset so every
 * required per-platform field is present, then override what we need.
 */
const WAV_16K: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  isMeteringEnabled: true, // needed for the always-listening modes' voice detection
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

export interface RecordedClip {
  /** file:// uri of the WAV (for multipart uploads, e.g. Groq). */
  uri: string;
  /** base64 of the same WAV (for inline uploads, e.g. Gemini / OpenAI). */
  base64: string;
  /**
   * True if metering crossed the speech threshold for a minimum cumulative
   * duration while this clip was recording. Tap mode uses this to skip
   * sending pure silence/background-noise clips to the translation API —
   * which otherwise sometimes hallucinates a stock phrase (e.g. "Thank you")
   * instead of returning empty, the same failure mode Auto/Live's VAD avoids
   * by never capturing a silent clip in the first place.
   */
  hadSpeech: boolean;
}

export interface Recorder {
  isRecording: boolean;
  start: () => Promise<void>;
  /** Stops and returns the clip, or null if nothing was captured. */
  stop: () => Promise<RecordedClip | null>;
  /** Current mic level in dBFS (~-160 silent .. 0 loud). -160 when not recording. */
  getMetering: () => number;
}

// Mirrors useAutoListener's TURN profile: 120ms polling, 350ms of cumulative
// voiced time to count as real speech (rejects brief breath/room-noise spikes).
const POLL_MS = 120;
const MIN_SPEECH_MS = 350;

export function useRecorder(backgroundListening = false, thresholdDb = -35): Recorder {
  const recorder = useAudioRecorder(WAV_16K);
  const [isRecording, setIsRecording] = useState(false);
  const grantedRef = useRef(false);
  // Latest values available to start()/the poll loop without re-creating the recorder.
  const backgroundRef = useRef(backgroundListening);
  backgroundRef.current = backgroundListening;
  const thresholdRef = useRef(thresholdDb);
  thresholdRef.current = thresholdDb;

  const hadSpeechRef = useRef(false);
  const voiceMsRef = useRef(0);
  const meterTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function ensurePermission(): Promise<boolean> {
    if (grantedRef.current) return true;
    const { granted } = await requestRecordingPermissionsAsync();
    grantedRef.current = granted;
    return granted;
  }

  function getMetering(): number {
    try {
      return recorder.getStatus().metering ?? -160;
    } catch {
      return -160;
    }
  }

  async function start() {
    if (!(await ensurePermission())) {
      throw new Error('Microphone permission denied. Enable it in Settings → BavarianTranslator.');
    }
    await ensurePlayAndRecord(backgroundRef.current); // keep session alive in bg when enabled
    await recorder.prepareToRecordAsync();
    recorder.record();
    setIsRecording(true);

    // Track whether real speech (not just silence/room noise) was heard during
    // this recording — checked by callers (tap mode) before sending the clip.
    hadSpeechRef.current = false;
    voiceMsRef.current = 0;
    if (meterTimer.current) clearInterval(meterTimer.current);
    meterTimer.current = setInterval(() => {
      if (getMetering() > thresholdRef.current) {
        voiceMsRef.current += POLL_MS;
        if (voiceMsRef.current >= MIN_SPEECH_MS) hadSpeechRef.current = true;
      }
    }, POLL_MS);
  }

  async function stop(): Promise<RecordedClip | null> {
    if (meterTimer.current) {
      clearInterval(meterTimer.current);
      meterTimer.current = null;
    }
    await recorder.stop();
    setIsRecording(false);
    // Session stays play-and-record (set once) — no toggling, so TTS still plays
    // out the speaker and the next chunk records without a device reconfigure.
    const uri = recorder.uri;
    if (!uri) return null;
    const base64 = await new File(uri).base64();
    return { uri, base64, hadSpeech: hadSpeechRef.current };
  }

  return { isRecording, start, stop, getMetering };
}
