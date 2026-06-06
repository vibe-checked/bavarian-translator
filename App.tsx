import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import type { Lang, Utterance } from './src/types';
import { useSettings } from './src/hooks/useSettings';
import { useRecorder, type RecordedClip } from './src/hooks/useRecorder';
import { useAutoListener } from './src/hooks/useAutoListener';
import { translateAudio, selectedKey } from './src/services/providers';
import { speak, speakAsync, stopSpeaking, loadVoices, type VoiceInfo } from './src/services/tts';
import { Pane } from './src/components/Pane';
import { SettingsSheet } from './src/components/SettingsSheet';

const newId = () => `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
const errMsg = (e: any) => (e?.message ? String(e.message) : String(e));
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

const GERMAN = '#C8102E';
const ENGLISH = '#1D5FB8';

type AutoPhase = 'translating' | 'speaking' | null;

export default function App() {
  const { settings, ready, update } = useSettings();
  const recorder = useRecorder();

  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [activePane, setActivePane] = useState<Lang | null>(null); // pane currently recording (tap mode)
  const [busyPane, setBusyPane] = useState<Lang | null>(null); // pane currently translating (tap mode)
  const [autoPhase, setAutoPhase] = useState<AutoPhase>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [voices, setVoices] = useState<{ german: VoiceInfo[]; english: VoiceInfo[] }>({
    german: [],
    english: [],
  });
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoMode = settings.conversationMode === 'auto';
  const liveMode = settings.conversationMode === 'live';
  const listening = autoMode || liveMode; // hands-free modes that drive the mic loop

  useEffect(() => {
    loadVoices().then(setVoices).catch(() => {});
  }, []);

  function addUtterance(res: { detected: Lang | 'other'; bavarian: boolean; de: string; en: string }, fallback: Lang) {
    const speaker: Lang = res.detected === 'en' ? 'en' : res.detected === 'de' ? 'de' : fallback;
    const u: Utterance = {
      id: newId(),
      speaker,
      de: res.de,
      en: res.en,
      bavarian: res.bavarian,
      createdAt: Date.now(),
    };
    setUtterances((prev) => [...prev, u]);
    setNotice(null);
    return u;
  }

  // A short message that clears itself after a few seconds (for soft "didn't
  // catch that" feedback, so it never lingers in the always-listening modes).
  function flashNotice(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(
      () => setNotice((cur) => (cur === message ? null : cur)),
      3500,
    );
  }

  const COULDNT = "🔇 Nicht verstanden · Didn't catch that";

  // ── Tap-to-talk ────────────────────────────────────────────────────────────
  async function handleMic(pane: Lang) {
    if (recorder.isRecording && activePane === pane) {
      let clip: RecordedClip | null = null;
      try {
        clip = await recorder.stop();
      } catch (e) {
        setNotice(errMsg(e));
        setActivePane(null);
        return;
      }
      setActivePane(null);
      if (!clip) {
        setNotice('No audio captured — try holding a little longer.');
        return;
      }
      setBusyPane(pane);
      try {
        const res = await translateAudio(settings, clip, pane);
        if (!res.de && !res.en) {
          flashNotice(pane === 'de' ? '🔇 Hab ich nicht verstanden — nochmal?' : "🔇 Didn't catch that — try again");
          return;
        }
        const u = addUtterance(res, pane);
        if (settings.autoSpeak) {
          if (u.speaker === 'de') speak(u.en, 'en', settings, { onError: setNotice });
          else speak(u.de, 'de', settings, { onError: setNotice });
        }
      } catch (e) {
        setNotice(errMsg(e));
      } finally {
        setBusyPane(null);
      }
      return;
    }

    if (recorder.isRecording || busyPane) return;
    stopSpeaking();
    try {
      await recorder.start();
      setActivePane(pane);
      setNotice(null);
    } catch (e) {
      setNotice(errMsg(e));
    }
  }

  // ── Always-listening (auto) ─────────────────────────────────────────────────
  async function handleAutoSegment(clip: RecordedClip) {
    setAutoPhase('translating');
    try {
      const res = await translateAudio(settings, clip, 'auto');
      if (!res.de && !res.en) {
        flashNotice(COULDNT); // heard speech but couldn't translate it
        return;
      }
      const u = addUtterance(res, 'de');
      if (settings.autoSpeak) {
        setAutoPhase('speaking');
        if (u.speaker === 'de') await speakAsync(u.en, 'en', settings);
        else await speakAsync(u.de, 'de', settings);
      }
    } catch (e) {
      const m = errMsg(e);
      setNotice(m);
      if (/No API key/i.test(m)) update({ conversationMode: 'tap' }); // stop spamming failures
    } finally {
      setAutoPhase(null);
    }
  }

  // ── Live streaming ───────────────────────────────────────────────────────────
  // Short chunks arrive fast; a single worker translates them in order and appends
  // text immediately. onSegment resolves at once so the mic never stops to wait
  // (that's what makes it "live"). No auto-TTS here — it would echo into the mic.
  const liveQueue = useRef<RecordedClip[]>([]);
  const liveDraining = useRef(false);

  function enqueueLive(clip: RecordedClip): Promise<void> {
    if (liveQueue.current.length > 8) liveQueue.current.shift(); // bound the backlog
    liveQueue.current.push(clip);
    if (!liveDraining.current) {
      liveDraining.current = true;
      void drainLive();
    }
    return Promise.resolve();
  }

  async function drainLive() {
    try {
      while (liveQueue.current.length) {
        const clip = liveQueue.current.shift()!;
        try {
          const res = await translateAudio(settings, clip, 'auto');
          if (res.de || res.en) addUtterance(res, 'de'); // single worker ⇒ in order
          else flashNotice(COULDNT); // heard speech but couldn't translate it
        } catch (e) {
          const m = errMsg(e);
          setNotice(m);
          if (/No API key/i.test(m)) {
            liveQueue.current = [];
            update({ conversationMode: 'tap' });
            break;
          }
        }
      }
    } finally {
      liveDraining.current = false;
    }
  }

  const { level } = useAutoListener({
    recorder,
    enabled: ready && listening,
    live: liveMode,
    thresholdDb: settings.autoSpeechThresholdDb,
    onSegment: liveMode ? enqueueLive : handleAutoSegment,
    onError: (m) => {
      setNotice(m);
      if (/permission/i.test(m)) update({ conversationMode: 'tap' });
    },
  });

  async function setMode(mode: 'tap' | 'auto' | 'live') {
    if (mode === settings.conversationMode) return;
    if (mode !== 'tap' && !selectedKey(settings)) {
      setNotice('Add an API key first (⚙︎ → Translation engine) to use hands-free modes.');
      return;
    }
    stopSpeaking();
    if (recorder.isRecording) {
      try {
        await recorder.stop();
      } catch {
        /* ignore */
      }
    }
    liveQueue.current = [];
    setActivePane(null);
    setBusyPane(null);
    setAutoPhase(null);
    setNotice(null);
    update({ conversationMode: mode });
  }

  const recording = recorder.isRecording;
  const germanRecording = recording && activePane === 'de';
  const englishRecording = recording && activePane === 'en';
  const germanDisabled = busyPane !== null || (recording && activePane !== 'de');
  const englishDisabled = busyPane !== null || (recording && activePane !== 'en');

  const autoPhaseShown: 'listening' | 'translating' | 'speaking' | 'starting' = autoPhase
    ? autoPhase
    : recorder.isRecording
      ? 'listening'
      : 'starting';

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <Pane
          lang="de"
          title="Deutsch · Oma"
          subtitle={settings.germanSlow ? 'langsame Aussprache' : 'normale Aussprache'}
          utterances={utterances}
          isRecording={germanRecording}
          busy={busyPane === 'de'}
          disabled={germanDisabled}
          flipped={settings.faceToFace}
          accent={GERMAN}
          bg="#FFF6F2"
          fontSize={24}
          micIdle="🎤  Sprechen"
          micRecording="■  Fertig"
          micBusy="Übersetze…"
          showMic={!listening}
          onMic={() => handleMic('de')}
          onReplay={(u) => speak(u.de, 'de', settings, { onError: setNotice })}
        />

        <View style={styles.divider}>
          <Pressable style={styles.iconBtn} onPress={() => setSettingsOpen(true)}>
            <Text style={styles.iconText}>⚙︎</Text>
          </Pressable>

          <View style={styles.segment}>
            {(['tap', 'auto', 'live'] as const).map((m) => {
              const active = settings.conversationMode === m;
              const label = m === 'tap' ? '👆 Tap' : m === 'auto' ? '🔁 Auto' : '🔴 Live';
              return (
                <Pressable
                  key={m}
                  style={[styles.segmentBtn, active ? styles.segmentBtnActive : null]}
                  onPress={() => setMode(m)}
                >
                  <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={styles.iconBtn}
            onPress={() => {
              stopSpeaking();
              setUtterances([]);
              setNotice(null);
            }}
          >
            <Text style={styles.iconText}>🗑</Text>
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          <Pressable
            style={[styles.pill, settings.germanSlow ? styles.pillOn : null]}
            onPress={() => update({ germanSlow: !settings.germanSlow })}
          >
            <Text style={[styles.pillText, settings.germanSlow ? styles.pillTextOn : null]}>
              🐢 Slow German: {settings.germanSlow ? 'On' : 'Off'}
            </Text>
          </Pressable>

          {listening ? (
            <AutoStatus phase={autoPhaseShown} level={level} live={liveMode} />
          ) : (
            <Text style={styles.hint}>Tap a mic, speak, tap again</Text>
          )}
        </View>

        {notice ? (
          <Pressable onPress={() => setNotice(null)} style={styles.notice}>
            <Text style={styles.noticeText} numberOfLines={2}>
              {notice}  (tap to dismiss)
            </Text>
          </Pressable>
        ) : null}

        <Pane
          lang="en"
          title="English"
          subtitle="normal speed"
          utterances={utterances}
          isRecording={englishRecording}
          busy={busyPane === 'en'}
          disabled={englishDisabled}
          accent={ENGLISH}
          bg="#F2F6FF"
          fontSize={20}
          micIdle="🎤  Speak"
          micRecording="■  Done"
          micBusy="Translating…"
          showMic={!listening}
          onMic={() => handleMic('en')}
          onReplay={(u) => speak(u.en, 'en', settings, { onError: setNotice })}
        />

        <SettingsSheet
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          update={update}
          voices={voices}
          onTestGerman={() =>
            speak('Grüß di! Schee, dass’d da bist. Wia geht’s da denn heid?', 'de', settings, {
              onError: setNotice,
            })
          }
          onTestEnglish={() =>
            speak('Hello! Nice to see you. How are you doing today?', 'en', settings, {
              onError: setNotice,
            })
          }
        />

        {!ready ? <View style={styles.loadingVeil} /> : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function AutoStatus({
  phase,
  level,
  live,
}: {
  phase: 'listening' | 'translating' | 'speaking' | 'starting';
  level: number;
  live: boolean;
}) {
  const label = live
    ? phase === 'listening'
      ? '🔴 Live · streaming…'
      : '🔴 Live'
    : phase === 'listening'
      ? '👂 Zuhören · Listening'
      : phase === 'translating'
        ? '🌐 Übersetze · Translating…'
        : phase === 'speaking'
          ? '🔊 Spricht · Speaking…'
          : '…';
  const fill = clamp01((level + 60) / 60); // ~-60 dB .. 0 dB → 0 .. 1
  return (
    <View style={styles.autoStatus}>
      <Text style={styles.autoLabel}>{label}</Text>
      {phase === 'listening' ? (
        <View style={styles.meterTrack}>
          <View style={[styles.meterFill, { flex: Math.max(0.001, fill) }]} />
          <View style={{ flex: Math.max(0.001, 1 - fill) }} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1A1A1A',
  },
  iconBtn: {
    width: 44,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
  },
  iconText: { color: '#fff', fontSize: 20 },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#333',
    borderRadius: 999,
    padding: 3,
  },
  segmentBtn: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999 },
  segmentBtnActive: { backgroundColor: '#fff' },
  segmentText: { color: '#ccc', fontWeight: '800', fontSize: 13 },
  segmentTextActive: { color: '#111' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#222',
  },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#3a3a3a' },
  pillOn: { backgroundColor: '#34C759' },
  pillText: { color: '#ddd', fontWeight: '700', fontSize: 14 },
  pillTextOn: { color: '#fff' },
  hint: { color: '#888', fontSize: 13, fontStyle: 'italic' },
  autoStatus: { flex: 1, alignItems: 'flex-end', gap: 4 },
  autoLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
  meterTrack: {
    width: 120,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#444',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  meterFill: { backgroundColor: '#34C759' },
  notice: { backgroundColor: '#FFE08A', paddingHorizontal: 14, paddingVertical: 8 },
  noticeText: { color: '#5A4500', fontSize: 13, fontWeight: '600' },
  loadingVeil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
  },
});
