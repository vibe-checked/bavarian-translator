import React, { useEffect, useState } from 'react';
import {
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
import type { SettingsPatch } from '../hooks/useSettings';
import type { VoiceInfo } from '../services/tts';
import {
  PROVIDERS,
  getProvider,
  isCooled,
  cooldownUntil,
  cooldownKey,
  firstAvailable,
  type TranslationProvider,
  type ModelOption,
} from '../services/providers';

/** "47m" / "1h 5m" — how long until a parked model is retried. */
function fmtRemaining(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60000));
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${min}m`;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  settings: Settings;
  update: (patch: SettingsPatch) => void;
  voices: { german: VoiceInfo[]; english: VoiceInfo[] };
  onTestGerman: () => void;
  onTestEnglish: () => void;
}

const SLOW_PRESETS = [
  { label: 'Sehr langsam', rate: 0.1 },
  { label: 'Langsam', rate: 0.3 },
  { label: 'Mittel', rate: 0.6 },
];

const SENSITIVITY = [
  { label: 'Sensitive', db: -45 },
  { label: 'Normal', db: -35 },
  { label: 'Strict', db: -25 },
];

export function SettingsSheet(props: Props) {
  const { settings, update, voices } = props;

  // Re-render every 30s while open so the "resets in ~Xm" countdowns stay live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!props.visible) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [props.visible]);

  // What the app would actually use right now (skips cooled models). The ✓ stays
  // on the user's saved choice; a green "● using" dot follows this live pick so
  // they can see where failover landed — while the selection still self-heals.
  const active = firstAvailable(settings, now);

  // Manually lift a cooldown (e.g. the user knows the limit has actually reset).
  const clearCooldowns = (keys: string[]) =>
    update((prev) => {
      const next = { ...prev.cooldowns };
      keys.forEach((k) => delete next[k]);
      return { cooldowns: next };
    });

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <View style={styles.root}>
        <View style={styles.topBar}>
          <Text style={styles.h1}>Settings</Text>
          <Pressable onPress={props.onClose} style={styles.done}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.scrollFill} contentContainerStyle={styles.body}>
          {/* Translation engine */}
          <Section title="Translation engine">
            <Text style={styles.help}>
              Choose which AI transcribes and translates (this drives the Bavarian understanding).
              If one is busy, the app automatically falls back to another, so translation keeps
              working. The score is my estimate of dialect quality (0–100).
            </Text>
            {PROVIDERS.map((p) => (
              <ProviderRow
                key={p.id}
                provider={p}
                active={settings.engineId === p.id}
                nowUsing={!!active && active.engineId === p.id && p.id !== settings.engineId}
                settings={settings}
                now={now}
                onSelect={() => update({ engineId: p.id })}
                onRetryNow={() => {
                  clearCooldowns(p.models.map((m) => cooldownKey(p.id, m.id)));
                  update({ engineId: p.id });
                }}
              />
            ))}

            <EngineConfig settings={settings} update={update} now={now} />
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
              subtitle="Tap and Auto mode only — Live never speaks, to avoid it hearing itself."
              value={settings.autoSpeak}
              onValueChange={(v) => update({ autoSpeak: v })}
            />
            <ToggleRow
              label="Face-to-face mode"
              subtitle="Flips the top (German) half upside-down so Oma can read it sitting across the table from you."
              value={settings.faceToFace}
              onValueChange={(v) => update({ faceToFace: v })}
            />
            <ToggleRow
              label="German only (ignore English)"
              subtitle="One-way “listen to Oma” mode: only German speech is translated (shown up top, with the English translation below); the English side is ignored — no bubble, nothing spoken back."
              value={settings.germanOnly}
              onValueChange={(v) => update({ germanOnly: v })}
            />

            <View style={styles.rowLabelCol}>
              <Text style={styles.rowLabel}>Sensitivity (Auto + Live)</Text>
              <Text style={styles.rowSubtitle}>
                How loud counts as speech. If it cuts you off or misses a quiet talker, pick
                Sensitive; if it triggers on background noise, pick Strict.
              </Text>
            </View>
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

            <ToggleRow
              label="Keep listening in the background"
              subtitle="Off by default. When on, Auto & Live keep listening after you switch apps or lock the screen — handy for a long conversation, but uses more battery."
              value={settings.backgroundListening}
              onValueChange={(v) => update({ backgroundListening: v })}
            />
          </Section>

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

function scoreColor(s: number) {
  return s >= 85 ? '#0A7A2F' : s >= 70 ? '#0059C9' : '#B8860B';
}

/** Small horizontal gauge (meter) + number, colored by quality tier. */
function ScoreGauge({ score }: { score: number }) {
  const fill = Math.max(0.05, Math.min(1, score / 100));
  const tone = scoreColor(score);
  return (
    <View style={styles.gaugeWrap}>
      <View style={styles.gaugeTrack}>
        <View style={{ flex: fill, backgroundColor: tone }} />
        <View style={{ flex: 1 - fill }} />
      </View>
      <Text style={[styles.gaugeNum, { color: tone }]}>{score}</Text>
    </View>
  );
}

function ProviderRow({
  provider,
  active,
  nowUsing,
  onSelect,
  onRetryNow,
  settings,
  now,
}: {
  provider: TranslationProvider;
  active: boolean;
  nowUsing?: boolean;
  onSelect: () => void;
  onRetryNow: () => void;
  settings: Settings;
  now: number;
}) {
  // The whole engine is "cooled" only when every one of its models is parked.
  const cooled =
    provider.models.length > 0 &&
    provider.models.every((m) => isCooled(settings, provider.id, m.id, now));
  const remainingMs = cooled
    ? Math.min(...provider.models.map((m) => cooldownUntil(settings, provider.id, m.id))) - now
    : 0;
  return (
    <Pressable
      onPress={cooled ? onRetryNow : onSelect}
      style={[styles.voiceRow, active ? styles.voiceRowActive : null, cooled ? styles.rowDisabled : null]}
    >
      <Text style={[styles.voiceText, active ? styles.voiceTextActive : null]} numberOfLines={1}>
        {provider.label}
      </Text>
      <View style={styles.providerRight}>
        {nowUsing ? <Text style={styles.nowUsing}>● using</Text> : null}
        {cooled ? <Text style={styles.cooldownTag}>⏳ {fmtRemaining(remainingMs)} · tap to retry</Text> : null}
        <ScoreGauge score={Math.max(...provider.models.map((m) => m.score))} />
        {active ? <Text style={styles.check}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

function EngineConfig({
  settings,
  update,
  now,
}: {
  settings: Settings;
  update: (patch: SettingsPatch) => void;
  now: number;
}) {
  const provider = getProvider(settings.engineId);
  const curModel = settings.engineModels[settings.engineId] || provider.defaultModel;
  const isPreset = provider.models.some((m) => m.id === curModel);

  const setModel = (id: string) =>
    update({ engineModels: { ...settings.engineModels, [settings.engineId]: id } });
  const clearCooldownAndPick = (id: string) => {
    update((prev) => {
      const next = { ...prev.cooldowns };
      delete next[cooldownKey(settings.engineId, id)];
      return { cooldowns: next };
    });
    setModel(id);
  };

  // If the chosen model is parked, show what the app is auto-using instead.
  const selectedCooled = isCooled(settings, settings.engineId, curModel, now);
  const fb = firstAvailable(settings, now);
  const usingFallback =
    selectedCooled && !!fb && (fb.engineId !== settings.engineId || fb.model !== curModel);

  return (
    <View style={styles.engineConfig}>
      {usingFallback ? (
        <Text style={styles.fallbackBanner}>
          ⏳ {provider.label} is rate-limited — auto-using{' '}
          {fb!.engineId !== settings.engineId ? fb!.engineLabel : fb!.modelLabel} for now. It’ll
          switch back on its own once the limit resets.
        </Text>
      ) : null}
      <Text style={styles.subhead}>Model · {provider.label}</Text>
      <Text style={styles.help}>
        Score = my estimate of quality for Bavarian (0–100), comparable across providers.
      </Text>
      {provider.models.map((m) => (
        <ModelRow
          key={m.id}
          model={m}
          active={curModel === m.id}
          nowUsing={!!fb && fb.engineId === settings.engineId && fb.model === m.id && m.id !== curModel}
          cooled={isCooled(settings, settings.engineId, m.id, now)}
          remainingMs={cooldownUntil(settings, settings.engineId, m.id) - now}
          onPress={() => setModel(m.id)}
          onRetryNow={() => clearCooldownAndPick(m.id)}
        />
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
    </View>
  );
}

function ModelRow({
  model,
  active,
  nowUsing,
  onPress,
  onRetryNow,
  cooled,
  remainingMs,
}: {
  model: ModelOption;
  active: boolean;
  nowUsing?: boolean;
  onPress: () => void;
  onRetryNow?: () => void;
  cooled?: boolean;
  remainingMs?: number;
}) {
  return (
    <Pressable
      onPress={cooled ? onRetryNow : onPress}
      style={[styles.voiceRow, active ? styles.voiceRowActive : null, cooled ? styles.rowDisabled : null]}
    >
      <View style={styles.modelLeft}>
        <Text
          style={[styles.voiceText, active ? styles.voiceTextActive : null]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {model.label}
        </Text>
        {cooled ? (
          <Text style={[styles.modelQuota, styles.modelQuotaCooled]}>
            ⏳ Rate-limited · tap to retry now (auto in {fmtRemaining(remainingMs ?? 0)})
          </Text>
        ) : null}
      </View>
      <View style={styles.modelRight}>
        {nowUsing ? <Text style={styles.nowUsing}>● using</Text> : null}
        <ScoreGauge score={model.score} />
        {active ? <Text style={styles.check}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

function ToggleRow({
  label,
  subtitle,
  value,
  onValueChange,
}: {
  label: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={[styles.row, subtitle ? styles.rowAlignTop : null]}>
      <View style={styles.rowLabelCol}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
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
  scrollFill: { flex: 1 },
  // Tight, even bottom margin (was a redundant 40px spacer that left a big gap).
  body: { padding: 16, paddingBottom: 28, gap: 18 },
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
  providerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  topScore: { fontSize: 12, fontWeight: '800', color: '#888' },
  gaugeWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gaugeTrack: {
    width: 44,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#E2E2E7',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  gaugeNum: { fontSize: 13, fontWeight: '800', minWidth: 22, textAlign: 'right' },
  modelLeft: { flex: 1, paddingRight: 8 },
  modelQuota: { fontSize: 12, color: '#777', marginTop: 2 },
  modelQuotaCooled: { color: '#8A4B00', fontWeight: '700' },
  rowDisabled: { opacity: 0.5 },
  cooldownTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#8A4B00',
    backgroundColor: '#FFE2B0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  fallbackBanner: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8A4B00',
    backgroundColor: '#FFF1DA',
    padding: 8,
    borderRadius: 8,
    lineHeight: 18,
  },
  modelRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowAlignTop: { alignItems: 'flex-start' },
  rowLabelCol: { flexShrink: 1, paddingRight: 12 },
  rowLabel: { fontSize: 15, color: '#222' },
  rowSubtitle: { fontSize: 12, color: '#888', marginTop: 2, lineHeight: 16 },
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
  nowUsing: { color: '#0A7A2F', fontSize: 11, fontWeight: '800' },
});
