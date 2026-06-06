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
          // Merge so new settings fields added in updates still get defaults.
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
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
