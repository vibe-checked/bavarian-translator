import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SETTINGS, type Settings } from '../types';

const KEY = 'bt.settings.v1';

export interface SettingsStore {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Settings>) => void;
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
          // Deep-merge the per-engine maps so env-seeded keys/models added after the
          // user's settings were first saved still appear (a shallow merge would let
          // an old saved engineKeys object hide a newly-added key like OpenRouter).
          setSettings({
            ...DEFAULT_SETTINGS,
            ...parsed,
            engineKeys: { ...DEFAULT_SETTINGS.engineKeys, ...(parsed.engineKeys ?? {}) },
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

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { settings, ready, update };
}
