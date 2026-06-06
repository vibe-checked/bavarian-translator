import { setAudioModeAsync } from 'expo-audio';

// The whole app uses ONE audio session: play-and-record, output to the speaker.
// Recording and text-to-speech both work under this category, so we never have
// to toggle it. Toggling per chunk (record↔playback) in the always-listening
// loop causes the audio device to keep reconfiguring ("reconfig pending"),
// which drops recordings. So we set it exactly once.
let configured = false;

export async function ensurePlayAndRecord(): Promise<void> {
  if (configured) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true, // speak even if the ring/silent switch is on
      allowsRecording: true, // play-and-record category (mic stays available)
      shouldRouteThroughEarpiece: false, // route TTS to the loud speaker
    });
    configured = true;
  } catch {
    // leave unconfigured so the next call retries
  }
}
