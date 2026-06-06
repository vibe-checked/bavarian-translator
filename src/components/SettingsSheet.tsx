import React from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Settings } from '../types';
import type { VoiceInfo } from '../services/tts';
import { PROVIDERS, getProvider, type Tier, type TranslationProvider } from '../services/providers';

interface Props {
  visible: boolean;
  onClose: () => void;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  voices: { german: VoiceInfo[]; english: VoiceInfo[] };
  onTestGerman: () => void;
  onTestEnglish: () => void;
}

const SLOW_PRESETS = [
  { label: 'Sehr langsam', rate: 0.3 },
  { label: 'Langsam', rate: 0.45 },
  { label: 'Mittel', rate: 0.6 },
];

const SENSITIVITY = [
  { label: 'Sensitive', db: -45 },
  { label: 'Normal', db: -35 },
  { label: 'Strict', db: -25 },
];

export function SettingsSheet(props: Props) {
  const { settings, update, voices } = props;

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <View style={styles.root}>
        <View style={styles.topBar}>
          <Text style={styles.h1}>Settings</Text>
          <Pressable onPress={props.onClose} style={styles.done}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {/* Translation engine */}
          <Section title="Translation engine">
            <Text style={styles.help}>
              Choose which AI transcribes and translates (this drives the Bavarian understanding).
              Each engine uses its own API key, saved on this device.
            </Text>
            {PROVIDERS.map((p) => (
              <ProviderRow
                key={p.id}
                provider={p}
                active={settings.engineId === p.id}
                onSelect={() => update({ engineId: p.id })}
              />
            ))}

            <EngineConfig settings={settings} update={update} />
          </Section>

          {/* German speech speed */}
          <Section title="German speech for Oma">
            <ToggleRow
              label="Slow German (for elderly listeners)"
              value={settings.germanSlow}
              onValueChange={(v) => update({ germanSlow: v })}
            />
            <Text style={styles.help}>How slow when “Slow German” is on:</Text>
            <View style={styles.chips}>
              {SLOW_PRESETS.map((p) => (
                <Chip
                  key={p.rate}
                  label={p.label}
                  active={Math.abs(settings.germanSlowRate - p.rate) < 0.001}
                  onPress={() => update({ germanSlowRate: p.rate })}
                />
              ))}
            </View>
            <Pressable style={styles.testBtn} onPress={props.onTestGerman}>
              <Text style={styles.testText}>▶︎ Test German voice</Text>
            </Pressable>
          </Section>

          {/* Voices */}
          <Section title="German voice">
            <Text style={styles.help}>
              Austrian (de-AT) voices sound closest to Bavarian. Install more voices in iOS Settings →
              Accessibility → Spoken Content → Voices.
            </Text>
            <VoicePicker
              voices={voices.german}
              selected={settings.germanVoiceId}
              onSelect={(id) => update({ germanVoiceId: id })}
            />
          </Section>

          <Section title="English voice">
            <VoicePicker
              voices={voices.english}
              selected={settings.englishVoiceId}
              onSelect={(id) => update({ englishVoiceId: id })}
            />
            <Pressable style={styles.testBtn} onPress={props.onTestEnglish}>
              <Text style={styles.testText}>▶︎ Test English voice</Text>
            </Pressable>
          </Section>

          {/* Behaviour */}
          <Section title="Conversation">
            <ToggleRow
              label="Speak translations automatically"
              value={settings.autoSpeak}
              onValueChange={(v) => update({ autoSpeak: v })}
            />
            <ToggleRow
              label="Face-to-face mode (flip German half)"
              value={settings.faceToFace}
              onValueChange={(v) => update({ faceToFace: v })}
            />
            <Text style={styles.help}>
              Face-to-face flips the top (German) half upside-down so Oma can read it sitting across
              the table from you.
            </Text>

            <Text style={styles.subhead}>Hands-free modes (always listening)</Text>
            <Text style={styles.help}>
              Switch modes with the control on the main screen:{'\n'}
              • 👆 Tap — press a mic per turn (most reliable).{'\n'}
              • 🔁 Auto — turn-based and hands-free; waits for you to finish, then translates and
              speaks it aloud (pauses while speaking, so it never hears itself). Best for back-and-forth
              with Oma.{'\n'}
              • 🔴 Live — streams the translated text as you speak, cutting on short pauses, without
              waiting for you to finish. Text only (no speaking aloud — that would echo into the mic).
              Best for following a longer story.
            </Text>
            <Text style={styles.help}>
              Sensitivity (Auto + Live) — how loud counts as speech. If it cuts you off or misses a
              quiet talker, pick Sensitive; if it triggers on background noise, pick Strict.
            </Text>
            <View style={styles.chips}>
              {SENSITIVITY.map((s) => (
                <Chip
                  key={s.db}
                  label={s.label}
                  active={settings.autoSpeechThresholdDb === s.db}
                  onPress={() => update({ autoSpeechThresholdDb: s.db })}
                />
              ))}
            </View>
          </Section>

          {/* ElevenLabs */}
          <Section title="ElevenLabs voice (optional, paid)">
            <Text style={styles.help}>
              For a more natural — or cloned Bavarian — German voice. Leave off to use the free
              built-in voice.
            </Text>
            <ToggleRow
              label="Use ElevenLabs for German"
              value={settings.useElevenLabs}
              onValueChange={(v) => update({ useElevenLabs: v })}
            />
            <TextInput
              style={styles.input}
              placeholder="ElevenLabs API key"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              value={settings.elevenLabsApiKey}
              onChangeText={(t) => update({ elevenLabsApiKey: t.trim() })}
            />
            <TextInput
              style={styles.input}
              placeholder="ElevenLabs voice ID (e.g. a Bavarian voice)"
              autoCapitalize="none"
              autoCorrect={false}
              value={settings.elevenLabsVoiceId}
              onChangeText={(t) => update({ elevenLabsVoiceId: t.trim() })}
            />
          </Section>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function TierBadge({ tier }: { tier: Tier }) {
  const label = tier === 'free' ? 'FREE' : tier === 'freemium' ? 'FREE TIER' : 'PAID';
  const tone = tier === 'paid' ? styles.badgePaid : tier === 'freemium' ? styles.badgeFreemium : styles.badgeFree;
  return <Text style={[styles.badge, tone]}>{label}</Text>;
}

function ProviderRow({
  provider,
  active,
  onSelect,
}: {
  provider: TranslationProvider;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable onPress={onSelect} style={[styles.voiceRow, active ? styles.voiceRowActive : null]}>
      <View style={styles.providerLeft}>
        <Text style={[styles.voiceText, active ? styles.voiceTextActive : null]}>{provider.label}</Text>
        <TierBadge tier={provider.tier} />
      </View>
      {active ? <Text style={styles.check}>✓</Text> : null}
    </Pressable>
  );
}

function EngineConfig({
  settings,
  update,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const provider = getProvider(settings.engineId);
  const curModel = settings.engineModels[settings.engineId] || provider.defaultModel;
  const curKey = settings.engineKeys[settings.engineId] ?? '';
  const isPreset = provider.models.some((m) => m.id === curModel);

  const setModel = (id: string) =>
    update({ engineModels: { ...settings.engineModels, [settings.engineId]: id } });
  const setKey = (t: string) =>
    update({ engineKeys: { ...settings.engineKeys, [settings.engineId]: t.trim() } });

  return (
    <View style={styles.engineConfig}>
      <Text style={styles.subhead}>Model · {provider.label}</Text>
      {provider.models.map((m) => (
        <VoiceRow key={m.id} label={m.label} active={curModel === m.id} onPress={() => setModel(m.id)} />
      ))}
      {provider.allowCustomModel ? (
        <TextInput
          style={styles.input}
          placeholder="Custom model id (optional)"
          autoCapitalize="none"
          autoCorrect={false}
          value={isPreset ? '' : curModel}
          onChangeText={(t) => setModel(t.trim())}
        />
      ) : null}

      <Text style={styles.subhead}>API key · {provider.label}</Text>
      <TextInput
        style={styles.input}
        placeholder={`Paste your ${provider.label} API key`}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        value={curKey}
        onChangeText={setKey}
      />
      <Text style={styles.help}>{provider.keyHint}</Text>
      <Pressable onPress={() => Linking.openURL(provider.apiKeyUrl)}>
        <Text style={styles.link}>Get a key → {provider.apiKeyUrl}</Text>
      </Pressable>
      <Text style={styles.keyState}>
        {curKey ? '✓ Key saved on this device' : '⚠ No key yet — this engine won’t work until you add one'}
      </Text>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active ? styles.chipActive : null]}>
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function VoicePicker({
  voices,
  selected,
  onSelect,
}: {
  voices: VoiceInfo[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  if (voices.length === 0) {
    return <Text style={styles.help}>No installed voices found for this language.</Text>;
  }
  return (
    <View>
      <VoiceRow label="System default" active={selected === ''} onPress={() => onSelect('')} />
      {voices.map((v) => (
        <VoiceRow
          key={v.identifier}
          label={`${v.name} · ${v.language}${v.quality && /enhanced|premium/i.test(v.quality) ? ' · HD' : ''}`}
          active={selected === v.identifier}
          onPress={() => onSelect(v.identifier)}
        />
      ))}
    </View>
  );
}

function VoiceRow({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.voiceRow, active ? styles.voiceRowActive : null]}>
      <Text style={[styles.voiceText, active ? styles.voiceTextActive : null]}>{label}</Text>
      {active ? <Text style={styles.check}>✓</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  topBar: {
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  h1: { fontSize: 24, fontWeight: '800' },
  done: { paddingHorizontal: 12, paddingVertical: 6 },
  doneText: { color: '#007AFF', fontSize: 17, fontWeight: '600' },
  body: { padding: 16, gap: 18 },
  section: { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#222' },
  help: { fontSize: 13, color: '#666', lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: '#D0D0D5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#FAFAFC',
  },
  keyState: { fontSize: 12, color: '#555' },
  subhead: { fontSize: 13, fontWeight: '800', color: '#444', marginTop: 6 },
  link: { color: '#007AFF', fontSize: 13, fontWeight: '600' },
  engineConfig: { gap: 10, marginTop: 4 },
  providerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  badge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  badgeFree: { color: '#0A7A2F', backgroundColor: '#D6F5DF' },
  badgeFreemium: { color: '#0059C9', backgroundColor: '#DCEBFF' },
  badgePaid: { color: '#8A4B00', backgroundColor: '#FFE2B0' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontSize: 15, color: '#222', flexShrink: 1, paddingRight: 12 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ECECF1',
  },
  chipActive: { backgroundColor: '#007AFF' },
  chipText: { fontSize: 14, color: '#333', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  testBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#34C759',
  },
  testText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E2E7',
    marginTop: 6,
  },
  voiceRowActive: { borderColor: '#007AFF', backgroundColor: '#EAF3FF' },
  voiceText: { fontSize: 14, color: '#333', flexShrink: 1, paddingRight: 8 },
  voiceTextActive: { color: '#0059C9', fontWeight: '700' },
  check: { color: '#007AFF', fontSize: 16, fontWeight: '800' },
});
