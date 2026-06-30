import { useEffect, useRef, useState } from 'react';
import type { RecordedClip, Recorder } from './useRecorder';

// Voice-activity-detection timing.
const POLL_MS = 120;
const MAX_UTTER_MS = 12000; // hard cap on a single chunk
// If nobody speaks for this long, recycle the recording (flush the silent file,
// fresh start). Must be < MAX_UTTER_MS or the hard cap would pre-empt it.
const MAX_WAIT_MS = 8000;

// Turn-based (Auto) vs streaming (Live) segmentation.
//  - endSilence: how long a pause ends a chunk. Shorter = more "live".
//  - minSpeech:  minimum voiced time to count as a chunk (rejects coughs).
//  - softMax:    in Live, flush a chunk this often even with no pause (run-ons). 0 = off.
// Tuned against published references rather than guessed: OpenAI's Realtime
// API (a deployed, natural-feeling conversational agent) defaults its
// speech-stop silence to 500ms; Deepgram explicitly recommends >=1000ms for a
// FULL utterance boundary (vs. its separate fast ~10ms partial-result cutoff)
// specifically to avoid mis-reading a mid-sentence breath as "done talking";
// and simultaneous-translation literature cites chunk sizes of 300ms-2s.
// Auto's endSilence sits between those two (it can't be interrupted once it
// commits to a translate+speak readback, so it's biased conservative vs. an
// interruptible agent). Live's softMax was the clear outlier — 4.5s of total
// silence-on-screen during a run-on sentence is well past the 2s upper bound
// even literature uses for "this still feels live".
const TURN = { endSilence: 800, minSpeech: 350, softMax: 0 };
const LIVE = { endSilence: 450, minSpeech: 250, softMax: 2200 };

const now = () => Date.now();
const msg = (e: any) => (e?.message ? String(e.message) : String(e));

export interface AutoListenerOptions {
  recorder: Recorder;
  enabled: boolean;
  /** dBFS threshold above which a sample counts as speech. */
  thresholdDb: number;
  /** Live = stream short chunks as the person speaks. Turn = wait for the full turn. */
  live: boolean;
  /** Called with each detected chunk. In turn mode it should resolve when fully handled
   *  (incl. TTS) — that's what keeps it half-duplex. In live mode it should resolve fast
   *  (just enqueue the clip) so listening continues uninterrupted. */
  onSegment: (clip: RecordedClip) => Promise<void>;
  onError?: (message: string) => void;
  /** Fired the instant real speech is first detected in a capture — before the
   *  pause/cap that actually ends it — so the caller can show feedback ("heard
   *  you, translating…") right away instead of waiting for the whole utterance. */
  onSpeechStart?: () => void;
  /** Fired if a capture that already triggered onSpeechStart never reaches
   *  onSegment (e.g. listening was turned off mid-capture) — lets the caller
   *  clean up whatever onSpeechStart showed. */
  onSpeechAbandon?: () => void;
}

/**
 * Always-listening loop: record → detect a speech burst followed by a pause →
 * hand the clip to `onSegment` → listen again.
 *  - Turn (Auto): long pause ends the turn; onSegment awaits translate+TTS, so we
 *    never hear our own spoken translation (half-duplex).
 *  - Live: short pauses (or a soft cap) cut frequent chunks; onSegment returns
 *    immediately (enqueue) so listening is continuous and text streams.
 */
export function useAutoListener(opts: AutoListenerOptions): { level: number } {
  const [level, setLevel] = useState(-160);

  const enabledRef = useRef(opts.enabled);
  const runningRef = useRef(false);
  const thresholdRef = useRef(opts.thresholdDb);
  const liveRef = useRef(opts.live);
  const onSegmentRef = useRef(opts.onSegment);
  const onErrorRef = useRef(opts.onError);
  const recorderRef = useRef(opts.recorder);
  const onSpeechStartRef = useRef(opts.onSpeechStart);
  const onSpeechAbandonRef = useRef(opts.onSpeechAbandon);

  // Keep latest values available to the long-lived loop without restarting it.
  thresholdRef.current = opts.thresholdDb;
  liveRef.current = opts.live;
  onSegmentRef.current = opts.onSegment;
  onErrorRef.current = opts.onError;
  recorderRef.current = opts.recorder;
  onSpeechStartRef.current = opts.onSpeechStart;
  onSpeechAbandonRef.current = opts.onSpeechAbandon;

  useEffect(() => {
    enabledRef.current = opts.enabled;
    if (opts.enabled && !runningRef.current) {
      runningRef.current = true;
      void runLoop();
    }
    // When disabled, the running loop observes enabledRef and exits on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled]);

  async function runLoop() {
    try {
      while (enabledRef.current) {
        const clip = await captureUtterance();
        if (!enabledRef.current) {
          if (clip) onSpeechAbandonRef.current?.(); // had real speech, but we're stopping — drop its bubble
          break;
        }
        if (!clip) continue; // pure silence — keep listening
        try {
          await onSegmentRef.current(clip);
        } catch (e) {
          onErrorRef.current?.(msg(e));
        }
      }
    } finally {
      runningRef.current = false;
      setLevel(-160);
      const r = recorderRef.current;
      try {
        if (r.isRecording) await r.stop();
      } catch {
        /* ignore */
      }
    }
  }

  function captureUtterance(): Promise<RecordedClip | null> {
    const r = recorderRef.current;
    return new Promise<RecordedClip | null>((resolve) => {
      let done = false;
      let timer: ReturnType<typeof setInterval> | null = null;

      const finish = async (capture: boolean) => {
        if (done) return;
        done = true;
        if (timer) clearInterval(timer);
        let clip: RecordedClip | null = null;
        try {
          clip = await r.stop();
        } catch {
          clip = null;
        }
        setLevel(-160);
        resolve(capture ? clip : null);
      };

      // Lock the segmentation profile for this chunk (Live vs Turn).
      const cfg = liveRef.current ? LIVE : TURN;

      r.start()
        .then(() => {
          const startTs = now();
          let lastVoiceTs = startTs;
          let voiceMs = 0;
          let hasSpeech = false;
          let lastShown = -160;

          timer = setInterval(() => {
            if (done) return;
            if (!enabledRef.current) {
              if (hasSpeech) onSpeechAbandonRef.current?.(); // started, but we're stopping mid-capture
              void finish(false);
              return;
            }
            const db = r.getMetering();
            if (Math.abs(db - lastShown) >= 2) {
              lastShown = db;
              setLevel(db);
            }
            const t = now();
            if (db > thresholdRef.current) {
              lastVoiceTs = t;
              voiceMs += POLL_MS;
              if (voiceMs >= cfg.minSpeech && !hasSpeech) {
                hasSpeech = true;
                onSpeechStartRef.current?.(); // rising edge only — fire once per capture
              }
            }
            const sinceStart = t - startTs;
            const sinceVoice = t - lastVoiceTs;
            if (hasSpeech && sinceVoice >= cfg.endSilence) void finish(true);
            else if (cfg.softMax && hasSpeech && sinceStart >= cfg.softMax) void finish(true);
            else if (sinceStart >= MAX_UTTER_MS) void finish(hasSpeech);
            else if (!hasSpeech && sinceStart >= MAX_WAIT_MS) void finish(false);
          }, POLL_MS);
        })
        .catch((e) => {
          enabledRef.current = false;
          onErrorRef.current?.(msg(e));
          resolve(null);
        });
    });
  }

  return { level };
}
