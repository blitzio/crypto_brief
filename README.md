# Crypto Daily Brief

A self-hosted, single-page daily intelligence brief for BTC, ETH, and LINK built on Cloudflare Workers, GitHub Pages, and Gemini AI. No subscriptions, no backend server, no paid news APIs.

**Live:** https://blitzio.github.io/crypto_brief/

---

## What it does

Generates a formatted two-page crypto intelligence brief every morning or on demand covering:

- Live prices and 24h/7d performance for BTC, ETH, and LINK
- Support and resistance levels derived from current price data
- Macro dashboard: Fed Rate, USD/SGD, S&P 500, Gold, Stablecoin supply, Fear & Greed Index, CPI
- Cross-asset macro analysis synthesising multiple signals into crypto implications
- News-grounded analysis for each asset, cited by source number
- Active threat stack and 7-day forward watch
- Analyst verdict with bull/bear triggers and conviction ranking
- Source grid linking to every RSS item used
- Raw-source debug view showing the exact RSS items fed into Gemini

---

## Architecture

```text
GitHub Pages (index.html)
  |- CoinGecko API -> live BTC / ETH / LINK prices (direct, no key)
  `- Cloudflare Worker (worker.js)
       |- GET /macro -> Yahoo Finance quote/chart fallback, NY Fed EFFR,
       |               BLS CPI, Alternative.me Fear & Greed,
       |               DefiLlama stablecoins
       |- GET /news -> RSS feeds, 72h freshness filter,
       |              sorted by recency, top 20 sanitized snippets
       |- GET /health -> read-only macro/news/cache diagnostics
       |- POST / -> Gemini 3 Flash Preview brief generation
       |            + server-side KV save
       |- GET /brief -> serve KV-cached brief (< 1 hour old)
       `- POST /brief/save -> admin-token-only manual KV write
```

The brief is cached in Cloudflare KV for 1 hour. On page load it serves the cache instantly; hitting `Refresh Brief` forces a fresh generation.

---

## Setup

### 1. Fork and enable GitHub Pages

Fork this repo. Go to Settings -> Pages -> Source: `main` branch, `/ (root)`. Your brief will be live at `https://<your-username>.github.io/crypto_brief/`.

### 2. Deploy the Cloudflare Worker

- Go to [Cloudflare Workers](https://workers.cloudflare.com/) and create a new worker
- Paste the contents of `worker.js`
- Note your worker URL, for example `https://your-worker.workers.dev`

This repo also includes `wrangler.jsonc` for command-line deploys to the existing `crypto-brief-proxy` Worker. After Cloudflare auth is active locally, deploy with:

```bash
npm run cf:deploy
```

To redeploy while explicitly forcing the current model variable:

```bash
npm run cf:model:gemini3
```

### 3. Configure Worker secrets

In your Worker settings -> Variables and Secrets, add:

| Variable | Value |
|---|---|
| `GEMINI_API_KEY` | Your [Google AI Studio](https://aistudio.google.com/) API key |
| `GEMINI_MODEL` | `gemini-3-flash-preview` |
| `GEMINI_FALLBACK_MODEL` | `gemini-2.5-flash` |
| `ALLOWED_ORIGINS` | `https://blitzio.github.io` |
| `BRIEF_ADMIN_TOKEN` | Optional shared token for manual `/brief/save` admin writes |

### 4. Create the KV namespace

- Workers & Pages -> KV -> Create namespace -> name it `BRIEF_CACHE`
- In your Worker settings -> Variables -> KV Namespace Bindings, add a binding with variable name `BRIEF_CACHE`

### 5. Update the Worker URL in index.html

At the top of the `<script>` block in `index.html`, set:

```js
const WORKER_URL = 'https://your-worker.workers.dev';
```

Push to GitHub and you are done.

---

## Data sources

| Source | Data | Cost |
|---|---|---|
| CoinGecko | BTC, ETH, LINK prices | Free, no key |
| NY Fed EFFR API | Federal Funds Rate | Free |
| BLS Public API | CPI inflation | Free |
| Alternative.me | Crypto Fear & Greed Index | Free |
| DefiLlama | USDT + USDC circulating supply | Free |
| Yahoo Finance | S&P 500, Gold, USD/SGD | Free via Worker proxy |
| CoinDesk, CoinDesk Markets, The Block, Blockworks, Decrypt, DL News, Dow Jones Markets, FT Markets | News via RSS | Free |
| Gemini 3 Flash Preview | AI analysis | Free tier available; paid standard usage is low-cost per token |

---

## Gemini model and quota

The Worker uses `GEMINI_MODEL`, currently documented as `gemini-3-flash-preview`. Google AI Studio currently lists Gemini 3 Flash Preview with free-tier standard input/output usage and paid standard pricing at $0.50 per 1M input tokens and $3.00 per 1M output tokens. For normal daily use, one morning generation plus occasional refreshes should stay very low cost if billing is enabled.

Preview model availability and free-tier rate limits can change. If generation fails with a model, quota, or API key error, confirm the model is still enabled in [Google AI Studio](https://aistudio.google.com/) and update the `GEMINI_API_KEY` or `GEMINI_MODEL` Worker variable as needed.

For command-line deploys, `wrangler.jsonc` sets `GEMINI_MODEL` to `gemini-3-flash-preview` and limits browser CORS to the GitHub Pages origin. Keep `GEMINI_API_KEY` and any `BRIEF_ADMIN_TOKEN` as Cloudflare secrets; do not commit them to the repo.

---

## Caching behaviour

- On page load: checks Cloudflare KV for a brief generated within the last hour. If found, renders it instantly with no Gemini call.
- `Refresh Brief`: bypasses the brief cache and generates a fully fresh brief.
- After generation: the Worker saves the generated brief to KV server-side.
- KV entries auto-expire after 1 hour via `expirationTtl`.
- The "Brief Generated" timestamp reflects when the brief was actually created, not when the page was loaded.
- `/macro` is edge-cached for 5 minutes and `/news` for 15 minutes.
- `/macro?nocache=1` and `/news?nocache=1` bypass the Worker edge cache for debugging.
- `/health` returns read-only macro/news/cache diagnostics without making a Gemini call or exposing secrets, and is lightly cached for 60 seconds.
- `/brief/save` is admin-token-only and is not used by the browser app.
- Generated briefs are validated before caching; bad asset citations are rejected instead of saved.

---

## AI analysis design

Gemini receives:

- Exact live prices
- Exact macro figures
- Up to 20 RSS snippets sorted by recency, formatted as numbered `<doc>` blocks with deterministic asset tags

The model is instructed to:

- Cite every BTC/ETH claim with a `[N]` doc reference
- Cite LINK claims when source support exists
- Cite asset sections only with docs whose tags match that asset
- Use only exact live market data for uncited asset bullets, labelled as `Live market data`
- Keep asset sections substantial with 4-6 grounded bullets, using live price, volume, relative strength, support, and resistance when source coverage is thin
- Never restate macro card values in the macro bullet section
- Never hallucinate events, prices, or dates not present in the source docs

After Gemini returns JSON, the Worker checks every BTC, ETH, and LINK citation. If an asset bullet cites a doc that does not mention that asset, or makes a broad uncited model-inference claim, the Worker returns an error and does not cache the brief.

---

## Macro percentage accuracy note

Yahoo Finance fields can disagree depending on session state, especially for indices like `^GSPC`. The Worker now resolves 1-day percentage moves in this order:

1. Try the Yahoo quote endpoint first and use `regularMarketChangePercent` when available.
2. If that is missing, derive the move from `regularMarketPreviousClose`.
3. If the quote endpoint is incomplete, fall back to the chart endpoint and inspect timestamped close history.
4. When the latest chart close belongs to the current session, use the prior close baseline instead of a duplicated same-day close.
5. If timestamps are ambiguous, use a small drift heuristic to decide whether the latest chart close is acting like a current-session value.

This prevents the old failure mode where the S&P 500 could show `0.00%` even though the index had clearly moved versus the real previous close.

---

## File structure

```text
index.html    - frontend: UI, data fetching, AI prompt, rendering
worker.js     - Cloudflare Worker entrypoint and route glue
src/gemini.js - Gemini JSON parsing, fallback model selection, citation validation
src/news.js   - RSS snippet cleanup, asset tagging, source selection, source health
src/yahoo.js  - pure Yahoo previous-close / percentage helpers
docs/         - operational notes for health checks and deploys
.github/      - PR template and GitHub Actions test workflow
tests/selectYahooPreviousClose.test.mjs - regression tests for Yahoo previous-close / percent logic
tests/citationGuards.test.mjs - regression tests for source cleanup and citation validation
tests/workerRoutes.test.mjs - route-level Worker safety and health diagnostics tests
tests/frontendSmoke.test.mjs - front-end script parse and helper smoke tests
README.md    - this file
```

---

## Not financial advice

This tool is for informational purposes only. Nothing in the brief constitutes financial advice.
