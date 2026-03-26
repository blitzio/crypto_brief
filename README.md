# Crypto Daily Brief

A self-hosted, single-page daily intelligence brief for BTC, ETH, and LINK — built on Cloudflare Workers, GitHub Pages, and Gemini AI. No subscriptions, no backend server, no paid news APIs.

**Live:** https://blitzio.github.io/crypto_brief/

---

## What it does

Generates a formatted two-page crypto intelligence brief every morning (or on demand) covering:

- Live prices and 24h/7d performance for BTC, ETH, and LINK
- Support and resistance levels derived from current price data
- Macro dashboard: Fed Rate, USD/SGD, S&P 500, Gold, Stablecoin supply, Fear & Greed Index, CPI
- Cross-asset macro analysis synthesising multiple signals into crypto implications
- News-grounded analysis for each asset, cited by source number
- Active threat stack and 7-day forward watch
- Analyst verdict with bull/bear triggers and conviction ranking
- Full source grid linking to every article used

---

## Architecture

```
GitHub Pages (index.html)
    │
    ├── CoinGecko API          → live BTC / ETH / LINK prices (direct, no key)
    │
    └── Cloudflare Worker (worker.js)
            ├── GET /macro     → Yahoo Finance, NY Fed EFFR, BLS CPI,
            │                    Alternative.me Fear & Greed, DefiLlama stablecoins
            ├── GET /news      → 8 RSS feeds, 72h freshness filter, sorted by recency, top 20 articles
            ├── POST /         → Gemini 2.5 Flash brief generation
            ├── GET /brief     → serve KV-cached brief (< 1 hour old)
            └── POST /brief/save → persist brief to Cloudflare KV
```

The brief is cached in Cloudflare KV for 1 hour. On page load it serves the cache instantly; hitting "Refresh Brief" forces a fresh generation.

---

## Setup

### 1. Fork and enable GitHub Pages

Fork this repo. Go to Settings → Pages → Source: `main` branch, `/ (root)`. Your brief will be live at `https://<your-username>.github.io/crypto_brief/`.

### 2. Deploy the Cloudflare Worker

- Go to [Cloudflare Workers](https://workers.cloudflare.com/) and create a new worker
- Paste the contents of `worker.js`
- Note your worker URL (e.g. `https://your-worker.workers.dev`)

### 3. Configure Worker secrets

In your Worker settings → Variables and Secrets, add:

| Variable | Value |
|---|---|
| `GEMINI_API_KEY` | Your [Google AI Studio](https://aistudio.google.com/) API key |
| `GEMINI_MODEL` | `gemini-2.5-flash` |

### 4. Create the KV namespace

- Workers & Pages → KV → Create namespace → name it `BRIEF_CACHE`
- In your Worker settings → Variables → KV Namespace Bindings → add binding with variable name `BRIEF_CACHE`

### 5. Update the Worker URL in index.html

At the top of the `<script>` block in `index.html`, set:

```js
const WORKER_URL = 'https://your-worker.workers.dev';
```

Push to GitHub — done.

---

## Data sources

| Source | Data | Cost |
|---|---|---|
| CoinGecko | BTC, ETH, LINK prices | Free, no key |
| NY Fed EFFR API | Federal Funds Rate | Free |
| BLS Public API | CPI inflation | Free |
| Alternative.me | Crypto Fear & Greed Index | Free |
| DefiLlama | USDT + USDC circulating supply | Free |
| Yahoo Finance | S&P 500, Gold, USD/SGD | Free (via Worker proxy) |
| CoinDesk, CoinDesk Markets, The Block, Blockworks, Decrypt, DL News, Dow Jones Markets, FT Markets | News via RSS | Free |
| Gemini 2.5 Flash | AI analysis | Free tier: 20 RPD — add billing for 1,000 RPD |

---

## Gemini quota

The free tier allows **20 requests per day**, which resets at midnight Pacific time (UTC-7/8). For normal daily use (one morning generation + occasional refreshes) the free tier is usually sufficient. If you hit the limit during development/testing, add a billing account in Google AI Studio to move to Tier 1 (1,000 RPD). Actual cost at normal usage volume is near zero.

---

## Caching behaviour

- On page load: checks Cloudflare KV for a brief generated within the last hour. If found, renders it instantly (no Gemini call).
- "Refresh Brief" button: bypasses the cache and generates a fully fresh brief.
- After generation: saves to KV in the background (fire-and-forget, does not block render).
- KV entries auto-expire after 1 hour via `expirationTtl`.
- The "Brief Generated" timestamp reflects when the brief was actually created, not when the page was loaded.

---

## AI analysis design

Gemini receives:
- Exact live prices (not substitutable)
- Exact macro figures (not substitutable)
- Up to 20 RSS articles sorted by recency, formatted as numbered `<doc>` blocks

The model is instructed to:
- Cite every BTC/ETH claim with a `[N]` doc reference
- Fill LINK bullets from market knowledge when news coverage is thin (no citation)
- Never restate macro card values in the macro bullet section — synthesise cross-asset implications only
- Never hallucinate events, prices, or dates not present in the source docs

---

## Macro percentage accuracy note

Yahoo Finance fields can disagree depending on session state. The worker now requires a finite `regularMarketPrice` and uses close-history first: it compares `regularMarketPrice` vs latest close and, when drift is within 0.2%, treats that latest close as current-session noise and uses the prior close baseline; otherwise it uses the latest close baseline. If close-history is unavailable, it falls back to `regularMarketPreviousClose`, then `chartPreviousClose`, then `previousClose`, and finally latest close when valid. It throws if no valid positive previous baseline exists.

---

## File structure

```
index.html   — frontend: UI, data fetching, AI prompt, rendering
worker.js    — Cloudflare Worker: macro data, RSS news, Gemini proxy, KV caching
README.md    — this file
```

---

## Not financial advice

This tool is for informational purposes only. Nothing in the brief constitutes financial advice.
