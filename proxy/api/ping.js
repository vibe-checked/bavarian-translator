// Lightweight health/keep-warm endpoint. Returns 200 without calling any
// provider (zero quota cost). Hit by the GitHub Actions schedule as an uptime
// check; on Edge it also keeps an isolate warm, though Edge barely cold-starts.

export const config = { runtime: 'edge' };

export default function handler() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
