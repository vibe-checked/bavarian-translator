// App Attest enrollment + per-request assertions for the proxy.
//
// This is the real "only my app, on a real device, can call this" guarantee —
// unlike the static x-app-key (extractable from the bundle), each assertion
// is signed by a hardware-backed key that never leaves the Secure Enclave,
// tied to a strictly-increasing counter the proxy checks (see the proxy's
// api/proxy.js for the server side).
//
// IMPORTANT: App Attest only works on a real device — never the iOS
// Simulator (no Secure Enclave there) — so `isSupported` is false in the
// Simulator and everything here becomes a permanent, silent no-op. Test on
// the physical iPhone.
//
// Everything here is best-effort and never throws outward: on any failure
// (unsupported device, network error, an older/un-upgraded proxy) the app
// just keeps using the existing x-app-key-only path server-side already
// tolerates. This is a hardening layer, not a new point of failure.

import * as AppIntegrity from '@expo/app-integrity';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ORIGIN, APP_KEY, USING_PROXY } from './providers/proxy';

const KEY_ID_STORAGE_KEY = 'bavarian:attest:keyId:v1';
const ENROLLED_STORAGE_KEY = 'bavarian:attest:enrolled:v1';

let keyIdCache: string | null = null;
let enrolledCache = false;
let loaded = false;
let enrollPromise: Promise<void> | null = null;

async function loadCached() {
  if (loaded) return;
  loaded = true;
  try {
    keyIdCache = await AsyncStorage.getItem(KEY_ID_STORAGE_KEY);
    enrolledCache = (await AsyncStorage.getItem(ENROLLED_STORAGE_KEY)) === '1';
  } catch {
    keyIdCache = null;
    enrolledCache = false;
  }
}

async function postJson(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${API_ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-key': APP_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

/**
 * Best-effort, one-time App Attest enrollment. Safe to call on every app
 * start (e.g. from a top-level effect) — it's a no-op once already enrolled,
 * and de-dupes concurrent calls. Never rejects.
 */
export async function ensureEnrolled(): Promise<void> {
  if (!USING_PROXY) return; // direct mode has no proxy to attest to
  if (!AppIntegrity.isSupported) return; // Simulator, or App Attest unavailable here
  await loadCached();
  if (enrolledCache) return;
  if (enrollPromise) return enrollPromise;

  enrollPromise = (async () => {
    try {
      let keyId = keyIdCache;
      if (!keyId) {
        keyId = await AppIntegrity.generateKeyAsync();
        await AsyncStorage.setItem(KEY_ID_STORAGE_KEY, keyId);
        keyIdCache = keyId;
      }
      const { challenge } = await postJson('/api/challenge', {});
      const attestation = await AppIntegrity.attestKeyAsync(keyId, challenge);
      await postJson('/api/attest', { keyId, attestation, challenge });
      await AsyncStorage.setItem(ENROLLED_STORAGE_KEY, '1');
      enrolledCache = true;
    } catch {
      // Best-effort — silently keep using the x-app-key-only path. A later
      // app start will retry (enrolledCache/ENROLLED_STORAGE_KEY stays unset).
    } finally {
      enrollPromise = null;
    }
  })();
  return enrollPromise;
}

/**
 * Headers for one proxy-routed call, binding a fresh assertion to this exact
 * request's content. Pass whatever's actually being sent (the clip's base64
 * for an audio upload, the transcript for a text-completion call) so each
 * network call gets its own properly-scoped signature. Returns {} (no-op)
 * whenever enrollment hasn't completed — callers just merge this in
 * alongside the existing headers, so its absence never blocks a request.
 */
export async function attestHeaders(payload: string): Promise<Record<string, string>> {
  if (!USING_PROXY || !AppIntegrity.isSupported) return {};
  await loadCached();
  if (!enrolledCache || !keyIdCache) return {};

  try {
    const payloadHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payload, {
      encoding: Crypto.CryptoEncoding.HEX,
    });
    const assertion = await AppIntegrity.generateAssertionAsync(keyIdCache, payloadHash);
    return {
      'x-attest-key-id': keyIdCache,
      'x-attest-assertion': assertion,
      'x-attest-payload-hash': payloadHash,
    };
  } catch {
    return {}; // fall back silently — x-app-key + server-side rate limiting still apply
  }
}
