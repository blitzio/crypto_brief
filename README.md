# Crypto Daily Brief

A daily read on Bitcoin, Ethereum and Chainlink. Live prices, the macro backdrop, the news that matters, and a short written take where every claim points back to a source.

**Live:** https://blitzio.github.io/crypto_brief/

No server to run, no subscriptions, no paid news feeds. It is a static page, one Cloudflare Worker and Gemini.

---

## What you get

- Live prices for BTC, ETH and LINK, with 24 hour and 7 day moves.
- Support and resistance for each coin, shown as a range with the current price marked.
- A short version at the top: the market in a paragraph, a ranking, and what would turn it bullish or bearish.
- The macro backdrop: Fed rate, USD/SGD, S&P 500, gold, stablecoin supply, Fear & Greed.
- Risks and what to watch this week.
- Notes on each coin, with sources cited by number.
- Every news item used, linked, plus a raw view of exactly what the model was given.

The page works from RSS headlines and snippets, not full articles. Treat it as a briefing, not research.

---

## How it works

```text
GitHub Pages (index.html)
  `- Cloudflare Worker (worker.js)
       |- GET  /market      prices and 30 day signals (CoinGecko, Yahoo Finance fallback)
       |- GET  /macro       Fed rate, CPI, S&P 500, gold, USD/SGD, stablecoins, Fear & Greed
       |- GET  /news        RSS and Atom feeds, filtered and balanced, top 20
       |- GET  /health      read-only status of every source and the cache
       |- GET  /version     which commit is deployed
       |- POST /            generate a brief with Gemini, check it, save it
       |- GET  /brief       serve the saved brief
       `- POST /brief/save  admin only, manual write (the page never uses it)
```

The numbers are calculated by code, not by the model. Support, resistance, range, momentum, volume and volatility come from 30 days of price history. The model writes the words around them.

### How the analysis is checked

Gemini is handed exact prices, exact macro values and up to 20 news snippets, each with an ID. Every bullet it writes has to name the IDs it relies on and say how confident it is. The Worker then checks each bullet against what was actually supplied. An unknown ID, a source from the wrong asset or a missing citation gets one chance to be corrected. If it fails again, the brief is rejected and never saved.

`BRIEF_PIPELINE_VERSION` picks the format. `v2` is live. `v1` is the older, simpler format and works as a quick rollback. `v3` is a newer layout that is built in and switched off.

### Caching

- A brief is fresh for one hour and kept for seven days, so there is something to recover from.
- On load the page shows a fresh brief straight away. If the saved one is old, it generates a new one and says so. It never shows expired analysis as current.
- Refresh keeps the current brief on screen until the new one is ready, and ignores repeat clicks.
- `/market` and `/macro` cache for 5 minutes, `/news` for 15. Add `?nocache=1` to any of them, or to `/health`, when debugging.

---

## Setting it up again

Short version, for rebuilding it or forking it.

1. Turn on GitHub Pages for `main`, root folder.
2. Create a Cloudflare KV namespace called `BRIEF_CACHE` and put its ID in `wrangler.jsonc`.
3. Add the secrets `GEMINI_API_KEY` (required), plus `BRIEF_ADMIN_TOKEN` and `COINGECKO_DEMO_API_KEY` (both optional). Set `ALLOWED_ORIGINS` to your Pages address. The model and pipeline settings are already in `wrangler.jsonc`.
4. Deploy from the repo with `npm run cf:deploy`. Do not paste `worker.js` into the dashboard, it imports from `src/`.
5. Set `WORKER_URL` in `index.html` to your Worker's address.

`.env.example` lists the names only. Keep keys out of git. Health checks, deploys and rollback are in [docs/OPERATIONS.md](docs/OPERATIONS.md).

---

## Where the data comes from

| Source | What for | Cost |
|---|---|---|
| CoinGecko | BTC, ETH, LINK prices and 30 day history | Free, optional Demo key |
| Yahoo Finance | Market fallback, S&P 500, gold, USD/SGD | Free, through the Worker |
| NY Fed | Fed funds rate | Free |
| BLS | CPI | Free |
| Alternative.me | Fear & Greed | Free |
| DefiLlama | USDT and USDC supply and trends | Free |
| CoinDesk, The Block, Decrypt, Dow Jones Markets, FT Markets, Google News | News, by RSS | Free |
| Gemini | The written analysis | Check Google's current pricing and limits |

Gemini's free tier is sometimes busy. When it is, the page says so and you can try again a minute later.

---

## Design

The page follows the blitzio look: charcoal background, off-white type, one soft violet accent, and DM Sans, served from `fonts/` under the SIL Open Font License. Red and green are kept for market moves, always with an arrow so colour is never the only signal.

---

## What is in the repo

```text
index.html                page, styles, prompt and rendering
worker.js                 Worker routes and glue
src/gemini.js             model calls, fallback, evidence checks
src/pdb-v3.js             the v3 analysis format
src/feed-parser.js        RSS and Atom parsing
src/news-sources.js       the feed list
src/news.js               cleanup, asset tagging, balanced selection
src/market.js, macro.js   market and macro calculations
src/yahoo.js              Yahoo percentage and previous close helpers
scripts/                  opt-in read-only feed checks
tests/                    Worker, evidence, market, macro and page tests
docs/OPERATIONS.md        health checks, deploys, rollback
docs/superpowers/         older design notes and plans
```

Run the tests with `npm test`. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

---

## Not financial advice

For information only. Nothing here is a recommendation to buy or sell anything.

## License

MIT. See [LICENSE](LICENSE).
