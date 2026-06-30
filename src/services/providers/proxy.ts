// Central routing config: proxy vs. direct.
//
// By default all translation traffic goes through our Vercel proxy, which holds
// the real Gemini / Groq / Mistral keys server-side and injects them — so the
// app ships no provider keys, only a shared app token that gates the proxy.
//
// FEATURE FLAG — EXPO_PUBLIC_USE_PROXY:
//   '1' (default) → route through the proxy (keys stay server-side).
//   '0'           → talk to each provider DIRECTLY using keys baked into the
//                   build (EXPO_PUBLIC_*_API_KEY). Faster (no extra hop / no
//                   serverless cold start) but the keys are extractable from the
//                   app bundle. Use only for latency A/B testing or if you accept
//                   that the embedded free-tier keys can be abused.

const USE_PROXY = (process.env.EXPO_PUBLIC_USE_PROXY ?? '1') !== '0';
export const USING_PROXY = USE_PROXY;

const RAW_BASE = process.env.EXPO_PUBLIC_PROXY_URL || 'https://bavarian-api.vibecode.review/api/proxy';
const PROXY_BASE = RAW_BASE.replace(/\/+$/, '');
const APP_KEY = process.env.EXPO_PUBLIC_APP_KEY || '';

// Direct-mode keys — only present (and only baked into the bundle) when you
// build with EXPO_PUBLIC_USE_PROXY=0 and supply them in .env.
const DIRECT_KEYS: Record<string, string> = {
  gemini: process.env.EXPO_PUBLIC_GEMINI_API_KEY || '',
  groq: process.env.EXPO_PUBLIC_GROQ_API_KEY || '',
  mistral: process.env.EXPO_PUBLIC_MISTRAL_API_KEY || '',
};

/** Shared app token sent on every proxy request (gate, not a user secret). */
export const PROXY_HEADERS: Record<string, string> = { 'x-app-key': APP_KEY };

function qs(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/** Build a proxy URL for a route, e.g. proxyUrl('groq/chat'). */
export function proxyUrl(route: string, extra?: Record<string, string>): string {
  return `${PROXY_BASE}?${qs({ route, ...(extra ?? {}) })}`;
}

export interface Endpoint {
  url: string;
  /** Auth headers to merge into the request (x-app-key, or Authorization, or none). */
  headers: Record<string, string>;
}

/**
 * Resolve a call to either the proxy or the provider directly, based on the
 * USE_PROXY flag. Providers pass both shapes; this picks one.
 *
 * - proxyRoute / proxyParams: how the proxy addresses this call.
 * - directUrl: the provider's real endpoint.
 * - directKeyInUrl: true for Gemini (key goes in ?key=), false for Groq/Mistral
 *   (key goes in an Authorization: Bearer header).
 */
export function endpointFor(opts: {
  provider: 'gemini' | 'groq' | 'mistral';
  proxyRoute: string;
  proxyParams?: Record<string, string>;
  directUrl: string;
  directKeyInUrl?: boolean;
}): Endpoint {
  if (USE_PROXY) {
    return { url: proxyUrl(opts.proxyRoute, opts.proxyParams), headers: { 'x-app-key': APP_KEY } };
  }
  const key = DIRECT_KEYS[opts.provider] ?? '';
  if (opts.directKeyInUrl) {
    const sep = opts.directUrl.includes('?') ? '&' : '?';
    return { url: `${opts.directUrl}${sep}key=${encodeURIComponent(key)}`, headers: {} };
  }
  return { url: opts.directUrl, headers: { Authorization: `Bearer ${key}` } };
}
