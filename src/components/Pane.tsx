import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { Lang, Utterance } from '../types';

interface PaneProps {
  lang: Lang;
  title: string;
  subtitle?: string;
  utterances: Utterance[];
  isRecording: boolean;
  busy: boolean;
  /** Disable the mic because the other side is recording / processing. */
  disabled: boolean;
  /** Rotate 180° so a person sitting across the table reads it upright. */
  flipped?: boolean;
  accent: string;
  bg: string;
  /** Body font size — larger for the elderly German reader. */
  fontSize: number;
  micIdle: string;
  micRecording: string;
  micBusy: string;
  onMic: () => void;
  onReplay: (u: Utterance) => void;
  /** Extra control shown in the header (e.g. the slow-speech toggle). */
  headerRight?: React.ReactNode;
  /** Hide the mic button (auto mode drives recording itself). Default true. */
  showMic?: boolean;
  /** Current conversation mode — drives the empty-state placeholder text. */
  mode?: 'tap' | 'auto' | 'live';
}

/** Empty-state hint, tailored to how the active mode actually works. */
function placeholder(lang: Lang, mode: 'tap' | 'auto' | 'live'): string {
  if (mode === 'auto') {
    return lang === 'de'
      ? 'Einfach sprechen — die Übersetzung erscheint automatisch, sobald du kurz innehältst.'
      : 'Just talk — the translation appears here automatically when you pause.';
  }
  if (mode === 'live') {
    return lang === 'de'
      ? 'Sprich einfach weiter — die Übersetzung läuft live mit, während du redest.'
      : 'Just keep talking — translations stream in here live as you speak.';
  }
  return lang === 'de'
    ? 'Drück auf das Mikrofon und sprich. Übersetzungen erscheinen hier.'
    : 'Tap the mic and speak. Translations appear here.';
}

const DOT_FRAMES = ['.', '..', '...', '....'];

/** Looping "." → ".." → "..." → "...." — shown while a Live-mode chunk is translating. */
function PendingDots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % DOT_FRAMES.length), 380);
    return () => clearInterval(t);
  }, []);
  return <Text style={styles.pendingDots}>{DOT_FRAMES[frame]}</Text>;
}

export function Pane(props: PaneProps) {
  const { lang, utterances, fontSize } = props;
  const scrollRef = useRef<ScrollView>(null);

  const containerStyle: StyleProp<ViewStyle> = [
    styles.pane,
    { backgroundColor: props.bg },
    props.flipped ? styles.flipped : null,
  ];

  return (
    <View style={containerStyle}>
      <View style={[styles.header, { borderBottomColor: props.accent }]}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: props.accent }]} numberOfLines={1}>
            {props.title}
          </Text>
          {props.subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {props.subtitle}
            </Text>
          ) : null}
        </View>
        {props.headerRight}
        {/* Mic lives in the header (compact) so the transcript gets the full pane. */}
        {props.showMic === false ? null : (
          <Pressable
            onPress={props.onMic}
            disabled={props.disabled || props.busy}
            style={[
              styles.mic,
              { backgroundColor: props.isRecording ? '#B00020' : props.accent },
              (props.disabled || props.busy) && !props.isRecording ? styles.micDisabled : null,
            ]}
          >
            {props.busy ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.micText}>{props.micBusy}</Text>
              </>
            ) : (
              <Text style={styles.micText} numberOfLines={1}>
                {props.isRecording ? props.micRecording : props.micIdle}
              </Text>
            )}
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
        scrollIndicatorInsets={{ right: 1 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {utterances.length === 0 ? (
          <Text style={styles.empty}>{placeholder(lang, props.mode ?? 'tap')}</Text>
        ) : (
          utterances.map((u) => {
            if (u.pending) {
              // Shown identically in both panes — we don't know the speaker yet.
              return (
                <View key={u.id} style={styles.bubblePending}>
                  <PendingDots />
                </View>
              );
            }
            const mine = u.speaker === lang;
            const text = lang === 'de' ? u.de : u.en;
            if (!text) return null;
            const tagged = u.bavarian && u.speaker === 'de';
            return (
              <Pressable
                key={u.id}
                onPress={() => props.onReplay(u)}
                style={[
                  styles.bubble,
                  tagged ? styles.bubbleTagged : null,
                  mine
                    ? [styles.bubbleMine, { backgroundColor: props.accent }]
                    : styles.bubbleTheirs,
                ]}
              >
                {tagged ? (
                  <Text style={[styles.tag, mine ? styles.tagMine : null]}>Bairisch</Text>
                ) : null}
                <Text
                  style={[
                    styles.bubbleText,
                    { fontSize, lineHeight: Math.round(fontSize * 1.22) },
                    mine ? styles.bubbleTextMine : null,
                  ]}
                >
                  {text}
                </Text>
                {/* Speaker icon only — no label, to save vertical space. Tap the bubble to replay. */}
                <Text style={[styles.replayIcon, mine ? styles.replayIconMine : null]}>🔊</Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // No horizontal padding here: the ScrollView spans the full width so its scroll
  // indicator sits at the very right edge (like Settings). Content is inset instead
  // via the header's margin and the scroll content's padding.
  pane: { flex: 1, paddingTop: 7, paddingBottom: 8 },
  flipped: { transform: [{ rotate: '180deg' }] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginHorizontal: 14,
    borderBottomWidth: 2,
    paddingBottom: 5,
    marginBottom: 5,
  },
  headerText: { flexShrink: 1 },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 12, color: '#555', marginTop: 0 },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: 6, paddingHorizontal: 14, gap: 8 },
  empty: { color: '#888', fontSize: 16, textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },
  // Wide bubble + slim right gutter (just enough to clear the corner icon) so each
  // line packs as many words as possible before wrapping.
  bubble: { borderRadius: 16, paddingLeft: 13, paddingRight: 26, paddingVertical: 9, maxWidth: '96%' },
  // Extra top room for the absolutely-positioned "Bairisch" tag (only when present).
  bubbleTagged: { paddingTop: 26 },
  bubbleMine: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4 },
  bubbleText: { color: '#111' },
  bubbleTextMine: { color: '#fff' },
  // Live mode: shown while a chunk is heard but not yet translated — centered,
  // neutral (speaker isn't known yet), same in both panes.
  bubblePending: {
    alignSelf: 'center',
    borderRadius: 16,
    backgroundColor: '#ECECEC',
    paddingHorizontal: 22,
    paddingVertical: 10,
    minWidth: 56,
    alignItems: 'center',
  },
  pendingDots: { fontSize: 20, fontWeight: '800', color: '#9aa0a6', letterSpacing: 2 },
  tag: {
    position: 'absolute',
    top: 6,
    left: 14,
    fontSize: 11,
    fontWeight: '700',
    color: '#7A4B00',
    backgroundColor: '#FFE2B0',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tagMine: { color: '#fff', backgroundColor: 'rgba(255,255,255,0.25)' },
  // Small speaker glyph tucked into the bottom-right gutter — no text label.
  replayIcon: { position: 'absolute', right: 6, bottom: 6, fontSize: 13, color: '#9aa0a6' },
  replayIconMine: { color: 'rgba(255,255,255,0.85)' },
  // Compact pill in the header (was a full-width 64px block at the bottom).
  mic: {
    minHeight: 40,
    maxWidth: '54%',
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  micDisabled: { opacity: 0.4 },
  micText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
