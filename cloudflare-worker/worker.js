// Cloudflare Worker — LLM API reverse proxy
// ------------------------------------------------------------------
// A clean pass-through to an upstream AI API. Path, query, headers and JSON body
// are forwarded verbatim, so the upstream sees a normal request from an allowed
// region (Cloudflare's edge) rather than a blocked one. No secrets live here —
// Rails supplies the auth header on every request.
//
// The upstream is set per-deployment via the UPSTREAM var in wrangler.toml, so
// one file serves both back ends:
//
//   OpenRouter (current):  wrangler deploy --env openrouter
//     → https://openrouter.ai            ... set OPENROUTER_BASE_URL=https://<worker>/api/v1
//   Gemini (legacy):       wrangler deploy
//     → https://generativelanguage.googleapis.com  ... set GEMINI_PROXY_URL=https://<worker>
//
// Deploy:
//   1. npm i -g wrangler && wrangler login
//   2. wrangler deploy --env openrouter
//   3. Put the printed URL in the Rails env (see above) and restart Rails.

// Used when no UPSTREAM var is bound, preserving the original Gemini behaviour
// for the existing default deployment.
const DEFAULT_UPSTREAM = "https://generativelanguage.googleapis.com";

// Hop-by-hop and Cloudflare-injected headers that must not be replayed upstream.
// Forwarding cf-connecting-ip / x-forwarded-for would hand the upstream the very
// client IP the proxy exists to stand in for, re-exposing the blocked region.
const STRIPPED_HEADERS = [
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-connection",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-worker",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-real-ip"
];

export default {
  async fetch(request, env) {
    // Browser preflight — harmless to support even if Rails calls it server-side.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const upstreamBase = (env && env.UPSTREAM) || DEFAULT_UPSTREAM;

    const incoming = new URL(request.url);
    const target = new URL(upstreamBase);
    // Join the configured base path with the incoming one, so an UPSTREAM that
    // already carries a prefix keeps it. e.g. base "https://openrouter.ai" +
    // "/api/v1/chat/completions" → "https://openrouter.ai/api/v1/chat/completions".
    const basePath = target.pathname.replace(/\/$/, "");
    target.pathname = basePath === "" ? incoming.pathname : basePath + incoming.pathname;
    target.search = incoming.search; // preserve ?key=... if ever used

    // Forward everything except hop-by-hop / IP-revealing headers. This keeps the
    // auth header intact for both back ends: `Authorization: Bearer` (OpenRouter)
    // and `x-goog-api-key` (Gemini), plus Content-Type and OpenRouter's
    // HTTP-Referer / X-Title attribution headers.
    const headers = new Headers(request.headers);
    for (const name of STRIPPED_HEADERS) headers.delete(name);

    const hasBody = request.method !== "GET" && request.method !== "HEAD";

    const upstreamResponse = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Required by the Workers runtime when streaming a request body through.
      ...(hasBody ? { duplex: "half" } : {}),
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
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, x-goog-api-key, HTTP-Referer, X-Title",
  };
}
