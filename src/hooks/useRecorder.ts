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
}

export interface Recorder {
  isRecording: boolean;
  start: () => Promise<void>;
  /** Stops and returns the clip, or null if nothing was captured. */
  stop: () => Promise<RecordedClip | null>;
  /** Current mic level in dBFS (~-160 silent .. 0 loud). -160 when not recording. */
  getMetering: () => number;
}

export function useRecorder(): Recorder {
  const recorder = useAudioRecorder(WAV_16K);
  const [isRecording, setIsRecording] = useState(false);
  const grantedRef = useRef(false);

  async function ensurePermission(): Promise<boolean> {
    if (grantedRef.current) return true;
    const { granted } = await requestRecordingPermissionsAsync();
    grantedRef.current = granted;
    return granted;
  }

  async function start() {
    if (!(await ensurePermission())) {
      throw new Error('Microphone permission denied. Enable it in Settings → BavarianTranslator.');
    }
    await ensurePlayAndRecord(); // set the session once; do not toggle per chunk
    await recorder.prepareToRecordAsync();
    recorder.record();
    setIsRecording(true);
  }

  function getMetering(): number {
    try {
      return recorder.getStatus().metering ?? -160;
    } catch {
      return -160;
    }
  }

  async function stop(): Promise<RecordedClip | null> {
    await recorder.stop();
    setIsRecording(false);
    // Session stays play-and-record (set once) — no toggling, so TTS still plays
    // out the speaker and the next chunk records without a device reconfigure.
    const uri = recorder.uri;
    if (!uri) return null;
    const base64 = await new File(uri).base64();
    return { uri, base64 };
  }

  return { isRecording, start, stop, getMetering };
}
