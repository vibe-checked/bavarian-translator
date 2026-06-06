import React, { useRef } from 'react';
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
          <Text style={[styles.title, { color: props.accent }]}>{props.title}</Text>
          {props.subtitle ? <Text style={styles.subtitle}>{props.subtitle}</Text> : null}
        </View>
        {props.headerRight}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {utterances.length === 0 ? (
          <Text style={styles.empty}>
            {lang === 'de'
              ? 'Drück auf das Mikrofon und sprich. Übersetzungen erscheinen hier.'
              : 'Tap the mic and speak. Translations appear here.'}
          </Text>
        ) : (
          utterances.map((u) => {
            const mine = u.speaker === lang;
            const text = lang === 'de' ? u.de : u.en;
            if (!text) return null;
            return (
              <Pressable
                key={u.id}
                onPress={() => props.onReplay(u)}
                style={[
                  styles.bubble,
                  mine
                    ? [styles.bubbleMine, { backgroundColor: props.accent }]
                    : styles.bubbleTheirs,
                ]}
              >
                <Text style={[styles.bubbleText, { fontSize }, mine ? styles.bubbleTextMine : null]}>
                  {text}
                </Text>
                <View style={styles.bubbleFooter}>
                  {u.bavarian && u.speaker === 'de' ? (
                    <Text style={[styles.tag, mine ? styles.tagMine : null]}>Bairisch</Text>
                  ) : (
                    <View />
                  )}
                  <Text style={[styles.replay, mine ? styles.replayMine : null]}>🔊 tap to replay</Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

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
              <ActivityIndicator color="#fff" />
              <Text style={styles.micText}>{props.micBusy}</Text>
            </>
          ) : (
            <Text style={styles.micText}>
              {props.isRecording ? props.micRecording : props.micIdle}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  flipped: { transform: [{ rotate: '180deg' }] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    paddingBottom: 6,
    marginBottom: 6,
  },
  headerText: { flexShrink: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13, color: '#555', marginTop: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: 6, gap: 8 },
  empty: { color: '#888', fontSize: 16, textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '92%' },
  bubbleMine: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4 },
  bubbleText: { color: '#111', lineHeight: 28 },
  bubbleTextMine: { color: '#fff' },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 8,
  },
  tag: {
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
  replay: { fontSize: 11, color: '#888' },
  replayMine: { color: 'rgba(255,255,255,0.8)' },
  mic: {
    marginTop: 8,
    minHeight: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  micDisabled: { opacity: 0.4 },
  micText: { color: '#fff', fontSize: 20, fontWeight: '800' },
});
