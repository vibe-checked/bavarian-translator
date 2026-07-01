import React, { useEffect, useRef, useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

// Smooth, fast collapse/swap for the pending-bubble lifecycle — long enough to
// read as intentional, short enough not to feel laggy on a live transcript.
// iOS only — this app has no Android build target.
const BUBBLE_ANIM = { ...LayoutAnimation.Presets.easeInEaseOut, duration: 220 };

import type { Lang, Utterance } from './src/types';
import { useSettings } from './src/hooks/useSettings';
import { useRecorder, type RecordedClip } from './src/hooks/useRecorder';
import { useAutoListener } from './src/hooks/useAutoListener';
import { useKeepScreenAwake } from './src/hooks/useKeepScreenAwake';
import { translateAudio, type TranslateOutcome } from './src/services/providers';
import { speak, speakAsync, stopSpeaking, loadVoices, type VoiceInfo } from './src/services/tts';
import { ensureEnrolled } from './src/services/attest';
import { Pane } from './src/components/Pane';
import { SettingsSheet } from './src/components/SettingsSheet';
import { ModeHelpSheet } from './src/components/ModeHelpSheet';

const newId = () => `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
const errMsg = (e: any) => (e?.message ? String(e.message) : String(e));
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

const GERMAN = '#C8102E';
const ENGLISH = '#1D5FB8';

type AutoPhase = 'translating' | 'speaking' | null;
type NoticeKind = 'info' | 'error' | 'switch';
interface Notice {
  text: string;
  kind: NoticeKind;
}

export default function App() {
  const { settings, ready, update } = useSettings();
  const recorder = useRecorder(settings.backgroundListening, settings.autoSpeechThresholdDb);

  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [activePane, setActivePane] = useState<Lang | null>(null); // pane currently recording (tap mode)
  const [busyPane, setBusyPane] = useState<Lang | null>(null); // pane currently translating (tap mode)
  const [autoPhase, setAutoPhase] = useState<AutoPhase>(null);
  const [replaying, setReplaying] = useState(false); // suspends Auto/Live listening during a manual bubble replay
  const [notice, setNotice] = useState<Notice | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modeHelpOpen, setModeHelpOpen] = useState(false);
  const [voices, setVoices] = useState<{ german: VoiceInfo[]; english: VoiceInfo[] }>({
    german: [],
    english: [],
  });
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoMode = settings.conversationMode === 'auto';
  const liveMode = settings.conversationMode === 'live';
  const listening = autoMode || liveMode; // hands-free modes that drive the mic loop

  // Keep the screen awake during hands-free listening — otherwise iOS dims and
  // locks it after a few seconds (no touches), cutting the mic loop short.
  useKeepScreenAwake(listening);

  useEffect(() => {
    loadVoices().then(setVoices).catch(() => {});
    ensureEnrolled(); // best-effort App Attest enrollment; no-op on Simulator or if it fails
  }, []);

  function addUtterance(
    res: { detected: Lang | 'other'; bavarian: boolean; de: string; en: string },
    fallback: Lang,
  ): Utterance | null {
    const speaker: Lang = res.detected === 'en' ? 'en' : res.detected === 'de' ? 'de' : fallback;
    // German-only mode: listen to the German speaker, ignore the English side
    // entirely (no bubble, no spoken-back translation).
    if (settings.germanOnly && speaker === 'en') return null;
    const u: Utterance = {
      id: newId(),
      speaker,
      de: res.de,
      en: res.en,
      bavarian: res.bavarian,
      createdAt: Date.now(),
    };
    setUtterances((prev) => [...prev, u]);
    clearNotice();
    return u;
  }

  // ── Live-mode placeholders ───────────────────────────────────────────────
  // The instant a chunk is captured we drop in a "…" bubble (shown in both
  // panes — we don't know the speaker yet) so the user sees "heard you,
  // translating" right away. It's swapped for the real text in place once the
  // response lands, so position/order never changes.
  function addPendingUtterance(): string {
    const id = newId();
    const placeholder: Utterance = {
      id,
      speaker: 'de', // unused while pending — Pane renders the placeholder before reading it
      de: '',
      en: '',
      bavarian: false,
      createdAt: Date.now(),
      pending: true,
    };
    setUtterances((prev) => [...prev, placeholder]);
    return id;
  }

  function resolvePendingUtterance(
    id: string,
    res: { detected: Lang | 'other'; bavarian: boolean; de: string; en: string },
    fallback: Lang,
  ): Utterance | null {
    const speaker: Lang = res.detected === 'en' ? 'en' : res.detected === 'de' ? 'de' : fallback;
    if (settings.germanOnly && speaker === 'en') {
      dropPendingUtterance(id);
      return null;
    }
    const resolved: Utterance = {
      id,
      speaker,
      de: res.de,
      en: res.en,
      bavarian: res.bavarian,
      createdAt: Date.now(),
      pending: false,
    };
    LayoutAnimation.configureNext(BUBBLE_ANIM); // animate the "…" → real-text swap
    setUtterances((prev) => prev.map((u) => (u.id === id ? resolved : u)));
    clearNotice();
    return resolved;
  }

  function dropPendingUtterance(id: string) {
    LayoutAnimation.configureNext(BUBBLE_ANIM); // animate the collapse instead of snapping
    setUtterances((prev) => prev.filter((u) => u.id !== id));
  }

  // One place for all on-screen toasts. Errors stay until dismissed; soft and
  // success notes clear themselves so they never linger in always-listening modes.
  function showNotice(text: string, kind: NoticeKind, autoMs?: number) {
    setNotice({ text, kind });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    if (autoMs) {
      noticeTimer.current = setTimeout(
        () => setNotice((cur) => (cur?.text === text ? null : cur)),
        autoMs,
      );
    }
  }
  const showError = (m: string) => showNotice(m, 'error'); // sticky — needs a read
  const showInfo = (m: string) => showNotice(m, 'info', 3500); // soft "didn't catch that"
  const showSwitch = (m: string) => showNotice(m, 'switch', 5000); // auto-failover to another engine
  function clearNotice() {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(null);
  }

  // Persist any cooldowns the failover discovered, and tell the user when it had
  // to switch away from their chosen engine.
  function applyOutcome(o: TranslateOutcome) {
    const hitLimit = Object.keys(o.cooldowns).length > 0;
    if (hitLimit) {
      update((prev) => ({ cooldowns: { ...prev.cooldowns, ...o.cooldowns } }));
    }
    const switched =
      o.used.engineId !== o.preferred.engineId || o.used.model !== o.preferred.model;
    // Only announce at the MOMENT of switching (a fresh 429 this call). On later
    // chunks we keep riding the fallback silently — no per-chunk toast spam.
    if (switched && hitLimit) {
      // Concise model name without the "— descriptor" suffix (e.g. "Llama 3.3 70B").
      const shortName = (p: { modelLabel: string }) => p.modelLabel.split(' — ')[0];
      const from = o.blocked ?? o.preferred; // the model that just hit its limit
      showSwitch(`⚡ ${shortName(from)} hit its limit — switched to ${shortName(o.used)}`);
    }
  }
  // translateAudio only throws when EVERY engine failed; still persist whatever
  // cooldowns it learned, then surface the (already-friendly) message.
  function handleTranslateError(e: any) {
    const cd = e?.cooldowns;
    if (cd && Object.keys(cd).length) update((prev) => ({ cooldowns: { ...prev.cooldowns, ...cd } }));
    showError(errMsg(e));
  }

  // Tap a bubble to hear it again. In Tap mode the mic is idle between taps, so
  // a plain fire-and-forget speak() is fine. In Auto/Live the mic is ALWAYS
  // listening — without this, the replay's own speaker output gets picked back
  // up by the live mic and re-translated as a brand-new (duplicate) utterance.
  // So there we suspend listening for the duration, same as the app's own
  // auto-speak-after-translate flow already does.
  async function replayUtterance(text: string, lang: Lang) {
    if (!listening) {
      speak(text, lang, settings, { onError: showError });
      return;
    }
    setReplaying(true);
    if (recorder.isRecording) {
      try {
        await recorder.stop();
      } catch {
        /* ignore */
      }
    }
    await speakAsync(text, lang, settings);
    setReplaying(false);
  }

  const COULDNT = "🔇 Nicht verstanden · Didn't catch that";

  // ── Tap-to-talk ────────────────────────────────────────────────────────────
  async function handleMic(pane: Lang) {
    if (recorder.isRecording && activePane === pane) {
      let clip: RecordedClip | null = null;
      try {
        clip = await recorder.stop();
      } catch (e) {
        showError(errMsg(e));
        setActivePane(null);
        return;
      }
      setActivePane(null);
      if (!clip) {
        showInfo('No audio captured — try holding a little longer.');
        return;
      }
      if (!clip.hadSpeech) {
        // No real speech crossed the threshold — skip the API call entirely so
        // silence/background noise can't be mistaken for a hallucinated reply
        // (e.g. ASR models often return a stock "Thank you" on pure silence).
        showInfo(pane === 'de' ? '🔇 Hab ich nicht verstanden — nochmal?' : "🔇 Didn't catch that — try again");
        return;
      }
      setBusyPane(pane);
      try {
        const outcome = await translateAudio(settings, clip, pane);
        applyOutcome(outcome);
        const res = outcome.result;
        if (!res.de && !res.en) {
          showInfo(pane === 'de' ? '🔇 Hab ich nicht verstanden — nochmal?' : "🔇 Didn't catch that — try again");
          return;
        }
        const u = addUtterance(res, pane);
        if (u && settings.autoSpeak) {
          if (u.speaker === 'de') speak(u.en, 'en', settings, { onError: showError });
          else speak(u.de, 'de', settings, { onError: showError });
        }
      } catch (e) {
        handleTranslateError(e);
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
      clearNotice();
    } catch (e) {
      showError(errMsg(e));
    }
  }

  // The "…" bubble for the capture currently in progress. Created the instant
  // useAutoListener's onSpeechStart fires (loudness crossed the threshold) —
  // well before the segment finishes — then claimed by enqueueLive/
  // handleAutoSegment once that capture actually resolves into a clip.
  const pendingStartIdRef = useRef<string | null>(null);

  // ── Always-listening (auto) ─────────────────────────────────────────────────
  // Half-duplex: only one segment is ever in flight (the loop doesn't capture
  // the next one until this fully resolves), but translate+speak can still take
  // a few seconds on top of that — the "…" bubble (already showing since
  // onSpeechStart) stays up the whole time so there's no gap before the text.
  async function handleAutoSegment(clip: RecordedClip) {
    setAutoPhase('translating');
    const pendingId = pendingStartIdRef.current ?? addPendingUtterance(); // fallback if onSpeechStart was missed
    pendingStartIdRef.current = null;
    try {
      const outcome = await translateAudio(settings, clip, 'auto');
      applyOutcome(outcome);
      const res = outcome.result;
      if (!res.de && !res.en) {
        dropPendingUtterance(pendingId);
        showInfo(COULDNT); // heard speech but couldn't translate it
        return;
      }
      const u = resolvePendingUtterance(pendingId, res, 'de');
      if (u && settings.autoSpeak) {
        setAutoPhase('speaking');
        if (u.speaker === 'de') await speakAsync(u.en, 'en', settings);
        else await speakAsync(u.de, 'de', settings);
      }
    } catch (e) {
      dropPendingUtterance(pendingId);
      handleTranslateError(e);
      if (/No API key/i.test(errMsg(e))) update({ conversationMode: 'tap' }); // stop spamming failures
    } finally {
      setAutoPhase(null);
    }
  }

  // ── Live streaming ───────────────────────────────────────────────────────────
  // Short chunks arrive fast; a single worker translates them in order and appends
  // text immediately. onSegment resolves at once so the mic never stops to wait
  // (that's what makes it "live"). No auto-TTS here — it would echo into the mic.
  // Each clip's "…" bubble already exists by the time it gets here (created on
  // onSpeechStart, well before the capture finished) — claimed below, not created.
  interface LiveQueueItem {
    id: string;
    clip: RecordedClip;
  }
  const liveQueue = useRef<LiveQueueItem[]>([]);
  const liveDraining = useRef(false);

  function enqueueLive(clip: RecordedClip): Promise<void> {
    const id = pendingStartIdRef.current ?? addPendingUtterance(); // fallback if onSpeechStart was missed
    pendingStartIdRef.current = null;
    if (liveQueue.current.length > 8) {
      const dropped = liveQueue.current.shift(); // bound the backlog
      if (dropped) dropPendingUtterance(dropped.id);
    }
    liveQueue.current.push({ id, clip });
    if (!liveDraining.current) {
      liveDraining.current = true;
      void drainLive();
    }
    return Promise.resolve();
  }

  async function drainLive() {
    try {
      while (liveQueue.current.length) {
        const { id, clip } = liveQueue.current.shift()!;
        try {
          const outcome = await translateAudio(settings, clip, 'auto', { timeoutMs: 12000 });
          applyOutcome(outcome);
          const res = outcome.result;
          if (res.de || res.en) resolvePendingUtterance(id, res, 'de'); // single worker ⇒ in order
          else {
            dropPendingUtterance(id);
            showInfo(COULDNT); // heard speech but couldn't translate it
          }
        } catch (e) {
          // A throw here means every engine failed — drop the backlog (and its
          // still-pending bubbles) so we don't replay the same failure per chunk.
          dropPendingUtterance(id);
          handleTranslateError(e);
          liveQueue.current.forEach((q) => dropPendingUtterance(q.id));
          liveQueue.current = [];
          if (/No API key/i.test(errMsg(e))) update({ conversationMode: 'tap' });
          break;
        }
      }
    } finally {
      liveDraining.current = false;
    }
  }

  const { level } = useAutoListener({
    recorder,
    enabled: ready && listening && !replaying,
    live: liveMode,
    thresholdDb: settings.autoSpeechThresholdDb,
    onSegment: liveMode ? enqueueLive : handleAutoSegment,
    onSpeechStart: () => {
      pendingStartIdRef.current = addPendingUtterance(); // show "…" immediately, before the segment even finishes
    },
    onSpeechAbandon: () => {
      if (pendingStartIdRef.current) {
        dropPendingUtterance(pendingStartIdRef.current);
        pendingStartIdRef.current = null;
      }
    },
    onError: (m) => {
      showError(m);
      if (/permission/i.test(m)) update({ conversationMode: 'tap' });
    },
  });

  async function setMode(mode: 'tap' | 'auto' | 'live') {
    if (mode === settings.conversationMode) return;
    stopSpeaking();
    if (recorder.isRecording) {
      try {
        await recorder.stop();
      } catch {
        /* ignore */
      }
    }
    if (pendingStartIdRef.current) {
      dropPendingUtterance(pendingStartIdRef.current); // drop a capture-in-progress bubble too
      pendingStartIdRef.current = null;
    }
    liveQueue.current.forEach((q) => dropPendingUtterance(q.id)); // drop any still-waiting "…" bubbles
    liveQueue.current = [];
    setActivePane(null);
    setBusyPane(null);
    setAutoPhase(null);
    clearNotice();
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
      <View style={styles.root}>
        <SafeAreaView edges={['top']} style={styles.paneWrapTop}>
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
          fontSize={28}
          micIdle="🎤  Sprechen"
          micRecording="■  Fertig"
          micBusy="Übersetze…"
          showMic={!listening}
          mode={settings.conversationMode}
          onMic={() => handleMic('de')}
          onReplay={(u) => replayUtterance(u.de, 'de')}
        />
        </SafeAreaView>

        <View style={styles.divider}>
          <Pressable style={styles.iconBtn} onPress={() => setSettingsOpen(true)}>
            <Text style={styles.iconText}>⚙︎</Text>
          </Pressable>

          <View style={styles.segmentWrap}>
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
              style={styles.modeHelpBtn}
              onPress={() => setModeHelpOpen(true)}
              hitSlop={8}
              accessibilityLabel="Which mode should I use?"
            >
              <Text style={styles.modeHelpText}>?</Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.iconBtn}
            onPress={() => {
              stopSpeaking();
              setUtterances([]);
              clearNotice();
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

        <SafeAreaView edges={['bottom']} style={styles.paneWrapBottom}>
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
          fontSize={24}
          micIdle="🎤  Speak"
          micRecording="■  Done"
          micBusy="Translating…"
          showMic={!listening && !settings.germanOnly}
          mode={settings.conversationMode}
          onMic={() => handleMic('en')}
          onReplay={(u) => replayUtterance(u.en, 'en')}
        />
        </SafeAreaView>

        {/* Floating toast — centered over the divider, not attached to either pane. */}
        {notice ? (
          <View style={styles.noticeOverlay} pointerEvents="box-none">
            <Pressable onPress={clearNotice} style={[styles.noticePill, NOTICE_STYLE[notice.kind].box]}>
              <Text style={[styles.noticeText, NOTICE_STYLE[notice.kind].text]} numberOfLines={3}>
                {notice.text}
                {notice.kind === 'error' ? '  (tap to dismiss)' : ''}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <SettingsSheet
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          update={update}
          voices={voices}
          onTestGerman={() =>
            speak('Grüß di! Schee, dass’d da bist. Wia geht’s da denn heid?', 'de', settings, {
              onError: showError,
            })
          }
          onTestEnglish={() =>
            speak('Hello! Nice to see you. How are you doing today?', 'en', settings, {
              onError: showError,
            })
          }
        />

        <ModeHelpSheet visible={modeHelpOpen} onClose={() => setModeHelpOpen(false)} />

        {!ready ? <View style={styles.loadingVeil} /> : null}
      </View>
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
  root: { flex: 1, backgroundColor: '#1A1A1A' },
  // Each pane gets its own safe-area wrapper so the inset (notch / home indicator)
  // is filled with that pane's color — no white gap above German or below English.
  paneWrapTop: { flex: 1, backgroundColor: '#FFF6F2' },
  paneWrapBottom: { flex: 1, backgroundColor: '#F2F6FF' },
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
  segmentWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modeHelpBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    borderWidth: 1,
    borderColor: '#555',
  },
  modeHelpText: { color: '#ccc', fontSize: 13, fontWeight: '800' },
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
  // Floating toast: a centered overlay that lets taps pass through except on the pill.
  noticeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticePill: {
    maxWidth: '88%',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  noticeText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  noticeInfoBox: { backgroundColor: '#FFE08A' },
  noticeInfoText: { color: '#5A4500' },
  noticeErrorBox: { backgroundColor: '#FFD8D6' },
  noticeErrorText: { color: '#8A1C13' },
  // Failover toast — same soft pill as "didn't catch that", a calm blue instead of yellow.
  noticeSwitchBox: { backgroundColor: '#D7E7FF' },
  noticeSwitchText: { color: '#0A3D8F' },
  loadingVeil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
  },
});

// Toast colors by severity (defined after `styles` so it can reference them).
const NOTICE_STYLE: Record<NoticeKind, { box: object; text: object }> = {
  info: { box: styles.noticeInfoBox, text: styles.noticeInfoText },
  error: { box: styles.noticeErrorBox, text: styles.noticeErrorText },
  switch: { box: styles.noticeSwitchBox, text: styles.noticeSwitchText },
};
