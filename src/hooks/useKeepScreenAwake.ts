import { useEffect } from 'react';
import { requireOptionalNativeModule } from 'expo-modules-core';

// The ExpoKeepAwake native module ships with `expo` and is already linked into
// the build (see ios/Podfile.lock: ExpoKeepAwake), so we call it directly here
// rather than adding the `expo-keep-awake` JS package as a dependency.
const KeepAwake = requireOptionalNativeModule('ExpoKeepAwake') as
  | { activate?: (tag: string) => Promise<void>; deactivate?: (tag: string) => Promise<void> }
  | null;

const TAG = 'bt-listening';

/**
 * Hold the device screen awake while `active` is true, releasing it when
 * `active` goes false or the component unmounts.
 *
 * Used for the hands-free Auto/Live modes: the user isn't touching the screen,
 * so iOS would otherwise dim and lock it after a few seconds — cutting the
 * always-listening loop short. Deliberately NOT enabled in Tap mode, where the
 * screen should sleep normally to save battery.
 */
export function useKeepScreenAwake(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    KeepAwake?.activate?.(TAG)?.catch?.(() => {});
    return () => {
      KeepAwake?.deactivate?.(TAG)?.catch?.(() => {});
    };
  }, [active]);
}
