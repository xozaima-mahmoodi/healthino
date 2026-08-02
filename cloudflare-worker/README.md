# LLM API reverse proxy (Cloudflare Worker)

A clean pass-through to an upstream AI API, used to reach it from regions where
direct access is blocked. Cloudflare's edge makes the outbound request, so the
upstream sees an allowed region.

The Worker forwards path, query, body, and headers **verbatim** — including the
auth header — so no secrets live here; Rails supplies the key on every request.

## Why this exists (2026-07-29)

Requests from the app's region to `openrouter.ai` are answered by an intermediary
with:

```
HTTP 403  { "success": false, "error": "Access denied by security policy." }
```

This is **not** OpenRouter's error shape. Reproduce it with an unauthenticated
GET — no key, no payload — which proves the block sits upstream of OpenRouter
entirely and is unrelated to the request body:

```bash
curl -i https://openrouter.ai/api/v1/models
```

Routing through this Worker is the fix. `OpenRouterService` raises a distinct
`UpstreamBlockedError` for that signature and skips its remaining fallback models
(they share the blocked host, so retrying them cannot help).

## Files

| File             | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| `worker.js`      | The proxy logic. Upstream comes from the `UPSTREAM` var. |
| `wrangler.toml`  | Deploy config: a default (Gemini) env and an `openrouter` env. |

## Deploy

One file serves both back ends; the `UPSTREAM` var differs per environment.

```bash
# One-time
npm install -g wrangler
wrangler login            # opens a browser to authorize your Cloudflare account

cd cloudflare-worker

# OpenRouter (current) → publishes healthino-openrouter-proxy
wrangler deploy --env openrouter

# Gemini (legacy)      → publishes healthino-gemini-proxy, unchanged behaviour
wrangler deploy
```

These are **separate** Workers, so deploying the OpenRouter one leaves the
existing Gemini proxy untouched.

## Verify the proxy directly

Note the `/api/v1` path suffix — the Worker preserves the incoming path, so
OpenRouter's own API prefix must be part of the request.

```bash
curl -i https://healthino-openrouter-proxy.<your-subdomain>.workers.dev/api/v1/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

- `200` + a `data` array → proxy and key both work.
- `401`/`403` **with OpenRouter's nested `{"error":{"message":...}}` shape** → the
  key is the problem, not the region.
- `403` with `"Access denied by security policy"` → still being intercepted; the
  request is not going through the Worker.

## Wire up Rails

`OPENROUTER_BASE_URL` replaces the default `https://openrouter.ai/api/v1`, so it
must include the `/api/v1` suffix:

```bash
OPENROUTER_BASE_URL=https://healthino-openrouter-proxy.<your-subdomain>.workers.dev/api/v1
OPENROUTER_API_KEY=<your-real-openrouter-key>
```

Restart Rails to pick them up, then confirm the configured models are still live
upstream (slugs get retired — two of ours had been, silently):

```bash
cd ../api && bin/rails openrouter:verify_models
```

## Offline fail-safe

For frontend work without a deployed Worker or a reachable upstream, run Rails
with `AI_STUB=1`. `OpenRouterService` then returns canned, localized
(`fa` / `ckb` / `en`) analysis data — summary, questions, vital badges and
medical terms — and makes no network call. It is opt-in only, never on by default
in any environment.
