// Cloudflare Worker — Gemini API reverse proxy
// ------------------------------------------------------------------
// A clean pass-through to Google's Generative Language API. The Rails
// GeminiService points GEMINI_PROXY_URL at this Worker's URL; everything else
// (path, query, headers, JSON body) is forwarded verbatim so Google sees a
// normal request from an allowed region.
//
// Deploy:
//   1. npm i -g wrangler && wrangler login
//   2. wrangler deploy            (uses the wrangler.toml in this folder)
//   3. Set GEMINI_PROXY_URL=https://<your-worker>.workers.dev in the Rails env.

const UPSTREAM = "https://generativelanguage.googleapis.com";

export default {
  async fetch(request) {
    // Browser preflight — harmless to support even if Rails calls it server-side.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const incoming = new URL(request.url);
    const target = new URL(UPSTREAM);
    target.pathname = incoming.pathname; // e.g. /v1beta/models/gemini-1.5-flash:generateContent
    target.search = incoming.search;     // preserve ?key=... if ever used

    // Strip hop-by-hop / Cloudflare-specific headers; forward the rest, which
    // keeps the x-goog-api-key auth header and Content-Type intact.
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.set("host", target.host);

    const upstreamResponse = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    });

    // Re-emit the upstream response, adding permissive CORS for good measure.
    const responseHeaders = new Headers(upstreamResponse.headers);
    for (const [k, v] of Object.entries(corsHeaders())) responseHeaders.set(k, v);

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-goog-api-key, Authorization",
  };
}
