# Gemini API reverse proxy (Cloudflare Worker)

A clean pass-through to Google's Generative Language API
(`https://generativelanguage.googleapis.com`). The Rails `GeminiService`
(`api/app/services/gemini_service.rb`) points `GEMINI_PROXY_URL` at this Worker's
URL so we can reach Gemini from regions where Google blocks direct access.

The Worker forwards the path, query, body, and headers **verbatim** — including
the `x-goog-api-key` auth header — so Google sees a normal request from an
allowed region. No secrets live in the Worker; the API key is supplied by Rails
on each request.

## Files

| File             | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| `worker.js`      | The proxy logic.                                     |
| `wrangler.toml`  | Wrangler deploy config (name, entrypoint, compat).   |

## Deploy

```bash
# One-time
npm install -g wrangler
wrangler login            # opens a browser to authorize your Cloudflare account

# From this folder
cd cloudflare-worker
wrangler deploy
```

Wrangler prints the live URL, e.g.
`https://healthino-gemini-proxy.<your-subdomain>.workers.dev`.

## Verify the proxy directly

Confirms the Worker forwards to Google and isn't geo-blocked at the edge:

```bash
curl -i -X POST \
  "https://healthino-gemini-proxy.<your-subdomain>.workers.dev/v1beta/models/gemini-1.5-flash:generateContent" \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Reply with the single word: ok"}]}]}'
```

- `200` + a `candidates` body → proxy and key both work.
- `403` → the API key is the problem, not the region (the Worker IP is what
  Google now sees).

## Wire up Rails

Set these where the API runs (and make sure `GEMINI_STUB` is unset/`0` for live):

```bash
GEMINI_PROXY_URL=https://healthino-gemini-proxy.<your-subdomain>.workers.dev
GEMINI_API_KEY=<your-real-gemini-key>
# GEMINI_MODEL=gemini-1.5-flash   # optional override (multimodal default)
```

Restart the Rails server to pick them up.

## Offline fail-safe

For frontend work without a deployed Worker or a reachable Gemini, run Rails
with `GEMINI_STUB=1`. The service then returns canned, localized
(`fa` / `ckb` / `en`) analysis data and makes no network call. It is opt-in
only — never on by default in any environment.
