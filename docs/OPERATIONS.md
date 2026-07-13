# Operations

This runbook covers read-only health checks, safe rollout, and rollback for Crypto Daily Brief.

## Live URLs

- Site: `https://blitzio.github.io/crypto_brief/`
- Worker: `https://crypto-brief-proxy.blitzio.workers.dev`
- Version: `https://crypto-brief-proxy.blitzio.workers.dev/version`
- Health: `https://crypto-brief-proxy.blitzio.workers.dev/health`

## Daily Health Check

Open `/health` and confirm:

- top-level `ok` is `true`;
- `checks.news.count` is at least 8 and normally close to 20;
- `checks.news.sources` shows which feed failed, timed out, parsed empty, or contributed no selected items;
- `degraded` is `false`, or its cause is understood (for example missing LINK coverage or one editorial feed outage);
- `checks.macro.ok` is `true`;
- `checks.briefCache.cached` is `true`, or the site can generate a fresh brief.

`degraded: true` does not necessarily mean the site is down. It means the evidence set is thinner than intended and should be inspected before trusting the analysis quality.

## Read-Only Endpoint Checks

```bash
curl "https://crypto-brief-proxy.blitzio.workers.dev/version"
curl "https://crypto-brief-proxy.blitzio.workers.dev/health?nocache=1"
curl "https://crypto-brief-proxy.blitzio.workers.dev/market?nocache=1"
curl "https://crypto-brief-proxy.blitzio.workers.dev/macro?nocache=1"
curl "https://crypto-brief-proxy.blitzio.workers.dev/news?nocache=1"
curl "https://crypto-brief-proxy.blitzio.workers.dev/brief"
curl "https://crypto-brief-proxy.blitzio.workers.dev/brief?allowStale=1"
```

`/brief` accepts only fresh records. `/brief?allowStale=1` may return a retained record with `fresh: false` and `reason: "stale"`; the browser renders it while refreshing.

## Direct Feed Diagnostics

Run the opt-in, read-only checker from a development machine:

```bash
npm run check:sources
```

It prints one JSON line per configured feed with status, timing, detected format, parsed count, newest publication time, and a short error category. It exits nonzero only when a direct editorial source fails. Discovery and macro feed degradation is still printed but does not fail the command. This is deliberately not a required CI gate because publishers can rate-limit or briefly fail.

The active direct editorial sources are CoinDesk, The Block, and Decrypt. DL News, the dead CoinDesk Markets URL, and Blockworks' frozen January 2026 feed are not configured. Atom parsing remains supported for a future viable source.

## Model and Pipeline Configuration

- `GEMINI_MODEL=gemini-3.5-flash`
- `GEMINI_FALLBACK_MODEL=gemini-3.1-flash-lite`
- `GEMINI_THINKING_LEVEL=low`
- `BRIEF_PIPELINE_VERSION=v2`

The Worker retries only model-not-found, timeout, rate-limit, and transient server failures. Authentication, permission, safety, and malformed-request failures return immediately. Generation has a 90-second total budget and at most one validation correction.

If v2 analysis quality or evidence validation causes a production problem, set `BRIEF_PIPELINE_VERSION=v1` and redeploy. This restores the legacy prompt/schema and citation validator while preserving the feed, caching, timeout, model, and market-data reliability fixes. Change it back to `v2` after the issue is understood.

## Cache Behavior

- Fresh window: one hour.
- KV retention: seven days.
- Initial load: fresh cache returns immediately; stale cache renders immediately and triggers one background refresh.
- Manual refresh: keeps the rendered brief visible, disables duplicate refreshes, and reports failure next to the button.
- Browser data deadline: 15 seconds per market/macro/news/cache request.
- Browser generation deadline: 105 seconds; Worker generation deadline: 90 seconds.

## Deploy

The Worker deploys automatically from GitHub Actions after changes land on `main` and tests pass. GitHub Pages serves `index.html` from `main`.

For a manual deploy from a clean branch after tests and a dry run pass:

```bash
npm test
npx wrangler deploy --dry-run
npm run cf:deploy
```

After deploy, compare `/version`, `/health?nocache=1`, `/market?nocache=1`, and the site. Do not use `/brief/save` for routine browser operation; it is protected by `X-Brief-Admin-Token` for explicit administrative writes only.

## If Something Looks Wrong

1. Keep the last rendered brief visible; do not repeatedly refresh.
2. Check `/health?nocache=1` and identify the exact source or macro field that degraded.
3. Run `npm run check:sources` to distinguish publisher failure from Worker parsing.
4. Check `/market?nocache=1` for all three current prices and signal availability.
5. Check `/macro?nocache=1` and `/news?nocache=1`.
6. Inspect generation response `meta.model`, `attemptCount`, `durationMs`, `pipelineVersion`, and `validation`.
7. If v2 validation is the only regression, roll back the pipeline variable to `v1`; do not revert unrelated reliability changes.
8. Run the complete tests and a Wrangler dry run before any code deploy.
