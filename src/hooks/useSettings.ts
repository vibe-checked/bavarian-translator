import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SETTINGS, type Settings } from '../types';

const KEY = 'bt.settings.v1';

export type SettingsPatch = Partial<Settings> | ((prev: Settings) => Partial<Settings>);

export interface SettingsStore {
  settings: Settings;
  ready: boolean;
  update: (patch: SettingsPatch) => void;
}

export function useSettings(): SettingsStore {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  // Load once on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (alive && raw) {
          const parsed = JSON.parse(raw);
          // Deep-merge the per-engine model map so a model default added after the
          // user's settings were first saved still appears. Drop any legacy
          // engineKeys/elevenLabs* fields from old saves — keys now live in the proxy.
          const { engineKeys: _ek, elevenLabsApiKey: _ek2, elevenLabsVoiceId: _ev, useElevenLabs: _ue, ...rest } =
            parsed;
          setSettings({
            ...DEFAULT_SETTINGS,
            ...rest,
            engineModels: { ...DEFAULT_SETTINGS.engineModels, ...(parsed.engineModels ?? {}) },
          });
        }
      } catch {
        /* fall back to defaults */
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((patch: SettingsPatch) => {
    setSettings((prev) => {
      const resolved = typeof patch === 'function' ? patch(prev) : patch;
      const next = { ...prev, ...resolved };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { settings, ready, update };
}
