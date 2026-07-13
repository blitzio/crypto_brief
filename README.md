# Crypto Daily Brief

A self-hosted, single-page daily intelligence brief for BTC, ETH, and LINK built on Cloudflare Workers, GitHub Pages, and Gemini AI. No subscriptions, no backend server, no paid news APIs.

**Live:** https://blitzio.github.io/crypto_brief/

---

## What it does

Generates a formatted two-page crypto intelligence brief every morning or on demand covering:

- Live prices and 24h/7d performance for BTC, ETH, and LINK
- Deterministic support, resistance, range, momentum, volume, and volatility signals from 30-day market history
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
  `- Cloudflare Worker (worker.js)
       |- GET /market -> CoinGecko current prices + deterministic 30-day signals
       |                 (browser retains direct CoinGecko price fallback)
       |- GET /macro -> Yahoo Finance quote/chart fallback, NY Fed EFFR,
       |               BLS CPI, Alternative.me Fear & Greed,
       |               DefiLlama stablecoin levels and trends
       |- GET /news -> RSS/Atom feeds, freshness/diversity filters,
       |              balanced top 20 sanitized snippets
       |- GET /health -> read-only macro/news/source/cache diagnostics
       |- POST / -> Gemini 3.5 Flash evidence-validated generation
       |            + server-side KV save
       |- GET /brief -> serve fresh KV brief; opt-in stale fallback
       `- POST /brief/save -> admin-token-only manual KV write
```

Briefs are fresh for one hour and retained in Cloudflare KV for seven days as an outage fallback. Refreshes are single-flight, time-bounded, and do not hide an already-rendered brief.

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

To redeploy while explicitly forcing the stable primary model variable:

```bash
npm run cf:model:gemini35
```

### 3. Configure Worker secrets

In your Worker settings -> Variables and Secrets, add:

| Variable | Value |
|---|---|
| `GEMINI_API_KEY` | Your [Google AI Studio](https://aistudio.google.com/) API key |
| `GEMINI_MODEL` | `gemini-3.5-flash` |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.1-flash-lite` |
| `GEMINI_THINKING_LEVEL` | `low` (validated values: `minimal`, `low`, `medium`, `high`) |
| `BRIEF_PIPELINE_VERSION` | `v2`; temporarily set `v1` to roll back only the analysis contract |
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
| CoinGecko | BTC, ETH, LINK prices and 30-day history | Free, no key |
| NY Fed EFFR API | Federal Funds Rate | Free |
| BLS Public API | CPI inflation | Free |
| Alternative.me | Crypto Fear & Greed Index | Free |
| DefiLlama | USDT + USDC supply and stablecoin-market trends | Free |
| Yahoo Finance | S&P 500, Gold, USD/SGD | Free via Worker proxy |
| CoinDesk, The Block, Decrypt, Dow Jones Markets, FT Markets, Google News ETH/LINK discovery | News via RSS | Free |
| Gemini 3.5 Flash with Gemini 3.1 Flash-Lite fallback | AI analysis | Check current Google AI pricing and quotas |

---

## Gemini model and quota

The Worker defaults to stable `gemini-3.5-flash`, with stable `gemini-3.1-flash-lite` as a bounded fallback for model unavailability, rate limits, timeouts, and transient server failures. Authentication and malformed-request failures do not fan out to another model. Generation has a 90-second total Worker deadline and at most one evidence-correction response.

Pricing, free-tier quotas, and model availability can change. Check [Google AI Studio](https://aistudio.google.com/) rather than relying on hard-coded pricing in this repository. Keep `GEMINI_API_KEY` and `BRIEF_ADMIN_TOKEN` as Cloudflare secrets; do not commit them.

---

## Caching behaviour

- On page load: requests `/brief?allowStale=1`. A fresh brief returns immediately. A stale brief renders immediately while one automatic refresh continues.
- `Refresh Brief`: bypasses the brief cache, keeps the current brief visible, and disables duplicate refreshes until the request finishes.
- After generation: the Worker saves the generated brief to KV server-side.
- KV entries remain fresh for one hour and auto-expire after seven days, enabling a bounded stale fallback.
- The "Brief Generated" timestamp reflects when the brief was actually created, not when the page was loaded.
- `/market` and `/macro` are edge-cached for 5 minutes; `/news` is cached for 15 minutes.
- Add `?nocache=1` to `/market`, `/macro`, `/news`, or `/health` to bypass the read cache for diagnostics.
- `/health` reports each feed's safe status, format, timing, parsed/fresh/accepted counts, overall `degraded`, and macro/cache health without calling Gemini or exposing secrets.
- `/version` returns deployment identity metadata only, such as the deployed GitHub commit SHA when the Worker is deployed from GitHub Actions.
- `/brief/save` is admin-token-only and is not used by the browser app.
- Generated briefs are validated before caching; unknown, missing, or cross-asset evidence IDs are rejected instead of saved.

---

## AI analysis design

Gemini receives:

- Exact current prices plus deterministic range, momentum, volume, volatility, support, and resistance facts
- Exact macro values plus supported 5-day, 7-day, and 30-day trends
- Up to 20 balanced RSS/Atom snippets with deterministic asset tags and stable request-local evidence IDs

The model is instructed to:

- Attach known `evidenceIds` and `high`, `medium`, or `low` confidence to every bullet
- Use only matching news or deterministic market evidence in each asset section
- Preserve `[N]` inline when using `news:N` so the visible source list remains useful
- Prefer 3-5 high-value bullets instead of forcing filler when evidence is thin
- Synthesize macro signals instead of merely restating the cards
- Never hallucinate events, prices, or dates not present in the source docs

After Gemini returns JSON, the Worker validates every bullet against the request-local evidence index. Unknown IDs, cross-asset references, missing evidence, and invalid confidence values get one bounded correction opportunity; a second failure returns 422 and is never cached. Set `BRIEF_PIPELINE_VERSION=v1` for the legacy citation-only contract without reverting code.

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
src/feed-parser.js - RSS/Atom parsing and sanitization
src/news-sources.js - declarative feed manifest
src/news.js   - snippet cleanup, asset tagging, balanced selection, source health
src/market.js - deterministic market-signal calculations
src/macro.js  - deterministic macro-trend calculations
src/yahoo.js  - pure Yahoo previous-close / percentage helpers
scripts/check-live-sources.mjs - opt-in read-only feed diagnostics
docs/         - operational notes for health checks and deploys
.github/      - PR template and GitHub Actions test workflow
tests/marketSignals.test.mjs - deterministic market-signal tests
tests/macroSignals.test.mjs - deterministic macro-trend tests
tests/selectYahooPreviousClose.test.mjs - Yahoo previous-close / percent tests
tests/citationGuards.test.mjs - source cleanup and v1/v2 evidence validation
tests/workerRoutes.test.mjs - route-level Worker safety and health diagnostics tests
tests/frontendSmoke.test.mjs - front-end script parse and helper smoke tests
README.md    - this file
```

---

## Not financial advice

This tool is for informational purposes only. Nothing in the brief constitutes financial advice.

## License

MIT License. See [LICENSE](LICENSE).
