// Central config for the key proxy.
//
// All translation traffic goes through our Vercel proxy, which holds the real
// Gemini / Groq / Mistral keys server-side and injects them. The app no longer
// ships any provider API keys — only a shared app token that gates the proxy
// (and can be rotated server-side without an app update).

const RAW_BASE = process.env.EXPO_PUBLIC_PROXY_URL || 'https://bavarian-api.vibecode.review/api/proxy';
const PROXY_BASE = RAW_BASE.replace(/\/+$/, '');

/** Shared app token sent on every proxy request (gate, not a user secret). */
export const PROXY_HEADERS: Record<string, string> = {
  'x-app-key': process.env.EXPO_PUBLIC_APP_KEY || '',
};

function qs(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * Build a proxy URL for a route, e.g. proxyUrl('groq/chat') or
 * proxyUrl('gemini', { model }). The route is passed as ?route= so the proxy
 * needs no catch-all routing.
 */
export function proxyUrl(route: string, extra?: Record<string, string>): string {
  return `${PROXY_BASE}?${qs({ route, ...(extra ?? {}) })}`;
}
