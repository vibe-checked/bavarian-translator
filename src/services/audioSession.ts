import { setAudioModeAsync } from 'expo-audio';

// The whole app uses ONE audio session: play-and-record, output to the speaker.
// Recording and text-to-speech both work under this category, so we never have
// to toggle it. Toggling per chunk (record↔playback) in the always-listening
// loop causes the audio device to keep reconfiguring ("reconfig pending"),
// which drops recordings. So we set it once per distinct config.
//
// `background` controls `shouldPlayInBackground`: with UIBackgroundModes:audio
// (set in app.json) + allowsRecording, this keeps the mic session — and thus the
// JS listen/translate loop — alive when the app is backgrounded or the screen is
// locked. Off by default (battery); re-applied when the value changes.
let appliedBackground: boolean | null = null;

export async function ensurePlayAndRecord(background = false): Promise<void> {
  if (appliedBackground === background) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true, // speak even if the ring/silent switch is on
      allowsRecording: true, // play-and-record category (mic stays available)
      shouldRouteThroughEarpiece: false, // route TTS to the loud speaker
      shouldPlayInBackground: background, // keep running in background when on
    });
    appliedBackground = background;
  } catch {
    // leave unapplied so the next call retries
  }
}
