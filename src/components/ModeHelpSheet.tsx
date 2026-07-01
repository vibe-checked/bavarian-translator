import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Plain-language comparison — no jargon, one concrete example per mode. */
const MODES: { icon: string; name: string; what: string; best: string }[] = [
  {
    icon: '👆',
    name: 'Tap',
    what: 'Press the mic, say one thing, tap again to translate.',
    best: 'A quick one-off phrase — like asking "Where\'s the bathroom?"',
  },
  {
    icon: '🔁',
    name: 'Auto',
    what: 'Hands-free. It listens, waits for you to pause, then speaks the translation out loud.',
    best: 'A real back-and-forth chat — like talking with Oma across the table, one of you at a time.',
  },
  {
    icon: '🔴',
    name: 'Live',
    what: 'Hands-free. Translated text streams in as you talk — no spoken playback.',
    best: 'Someone talking for a while, like a story — just read along live, no interruptions.',
  },
];

export function ModeHelpSheet(props: Props) {
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.backdrop} onPress={props.onClose}>
        {/* Swallow taps on the card itself so they don't bubble to the backdrop's onPress. */}
        <Pressable onPress={() => {}}>
          <View style={styles.card}>
            {/* Everything above the button scrolls together as one region, so on a
                small screen or large Dynamic Type it scrolls instead of clipping —
                the "Got it" button stays pinned and always reachable either way. */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <Text style={styles.eyebrow}>WHICH MODE?</Text>
              <Text style={styles.title}>Pick how you want to talk</Text>

              {MODES.map((m) => (
                <View key={m.name} style={styles.row}>
                  <Text style={styles.icon}>{m.icon}</Text>
                  <View style={styles.rowText}>
                    <Text style={styles.name}>{m.name}</Text>
                    <Text style={styles.what}>{m.what}</Text>
                    <Text style={styles.best}>
                      <Text style={styles.bestLabel}>Best for: </Text>
                      {m.best}
                    </Text>
                  </View>
                </View>
              ))}

              <Text style={styles.tip}>💡 Not sure? Start with Auto for a normal conversation.</Text>
            </ScrollView>

            <Pressable onPress={props.onClose} style={styles.doneBtn}>
              <Text style={styles.doneText}>Got it</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 22,
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
  },
  scrollContent: { paddingBottom: 14 },
  eyebrow: { fontSize: 11, letterSpacing: 2, fontWeight: '800', color: '#888', marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 16 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  icon: { fontSize: 24, width: 30, textAlign: 'center' },
  rowText: { flex: 1 },
  name: { fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 2 },
  what: { fontSize: 14, color: '#444', lineHeight: 19, marginBottom: 4 },
  best: { fontSize: 13, color: '#555', lineHeight: 18 },
  bestLabel: { fontWeight: '700', color: '#222' },
  tip: {
    fontSize: 13,
    color: '#555',
    backgroundColor: '#F4F1FF',
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
    lineHeight: 18,
  },
  doneBtn: {
    backgroundColor: '#222',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 22,
  },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
