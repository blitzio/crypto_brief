# Operations

This is the lightweight runbook for keeping the live app healthy.

## Live URLs

- Site: `https://blitzio.github.io/crypto_brief/`
- Worker: `https://crypto-brief-proxy.blitzio.workers.dev`
- Health: `https://crypto-brief-proxy.blitzio.workers.dev/health`

## Daily Health Check

Open `/health` and confirm:

- `ok` is `true`
- `news.count` is close to 20
- `macro.ok` is `true`
- `briefCache.cached` is either `true` or a fresh brief can be generated from the site

## Manual Endpoint Checks

```bash
curl "https://crypto-brief-proxy.blitzio.workers.dev/health"
curl "https://crypto-brief-proxy.blitzio.workers.dev/macro?nocache=1"
curl "https://crypto-brief-proxy.blitzio.workers.dev/news?nocache=1"
curl "https://crypto-brief-proxy.blitzio.workers.dev/brief"
```

## Deploy

Deploy the Worker from a clean branch after tests pass:

```bash
npm run cf:deploy
```

GitHub Pages serves `index.html` from `main`.

## If Something Looks Wrong

1. Check `/health`.
2. Check `/news?nocache=1` for enough recent BTC, ETH, and LINK coverage.
3. Check `/macro?nocache=1` for missing macro fields.
4. Run the tests locally.
5. Avoid changing the model before confirming the source data is healthy.
