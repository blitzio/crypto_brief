# CID-SGT — Crypto Daily Brief

A self-updating AI-powered crypto intelligence terminal. Pulls live prices, real macro data, and today's journalism from reputable sources — synthesizes everything into a classified-style daily brief, automatically, every time the page loads.

**Live site:** https://blitzio.github.io/crypto_brief/

---

## What It Does

Every time someone opens the page:

1. **CoinGecko** fetches live BTC, ETH, and LINK prices (price, 24h change, 7d change, market cap, volume)
2. **Cloudflare Worker** fetches live macro data from Yahoo Finance (Gold, VIX, S&P 500), NY Fed (EFFR federal funds rate), and BLS (CPI)
3. **Tavily** searches today's news from reputable crypto and financial journalism sources (CoinDesk, The Block, Decrypt, Reuters, Bloomberg, etc.)
4. All of this data is passed to an AI model via **OpenRouter** which synthesizes it into a full intelligence brief
5. The brief renders in a classified-document format with live SGT timestamp, cited sources, and clickable references

No manual updates required. No login. Works for anyone with the link.

---

## Architecture

```
Browser (GitHub Pages)
    │
    ├── CoinGecko API (free, no key) ──────────► Live crypto prices
    │
    ├── Tavily API (free tier) ─────────────────► Live news from reputable sources
    │
    └── Cloudflare Worker (crypto-brief-proxy)
            │
            ├── /macro route
            │       ├── Yahoo Finance ──────────► Gold, VIX, S&P 500
            │       ├── NY Fed EFFR API ─────────► Federal Funds Rate
            │       └── BLS Public API ──────────► CPI inflation data
            │
            └── POST / route
                    └── OpenRouter API ──────────► AI analysis (auto-selects best free model)
```

---

## Files

| File | Location | Purpose |
|------|----------|---------|
| `index.html` | GitHub repo (this repo) | Frontend — all UI, data fetching, rendering |
| `worker.js` | Cloudflare Workers (`crypto-brief-proxy`) | Backend proxy — macro data + AI API calls |

---

## APIs & Services

| Service | What it does | Key location | Cost |
|---------|-------------|--------------|------|
| **CoinGecko** | Live crypto prices (BTC/ETH/LINK) | No key needed | Free |
| **Tavily** | Live news search from reputable sources | Hardcoded in `index.html` | Free (1,000 req/mo) |
| **Yahoo Finance** | Gold (GC=F), VIX (^VIX), S&P 500 (^GSPC) | No key needed | Free |
| **NY Fed EFFR** | Federal funds rate (daily) | No key needed | Free |
| **BLS Public API** | CPI inflation data | No key needed | Free |
| **OpenRouter** | AI model routing — auto-selects best available free model | Stored as `OPENROUTER_API_KEY` secret in Cloudflare Worker | Free (200 req/day) |
| **Cloudflare Workers** | Proxy layer — keeps API keys off GitHub, fetches macro data | Cloudflare dashboard | Free (100k req/day) |
| **GitHub Pages** | Hosts the frontend | This repo | Free |

---

## News Sources (Tavily whitelist)

Tavily is configured to only pull from reputable journalism — not price aggregators:

- coindesk.com
- theblock.co
- decrypt.co
- reuters.com
- bloomberg.com
- ft.com / wsj.com
- cointelegraph.com
- axios.com / cnbc.com / forbes.com
- blockworks.co
- dlnews.com
- thedefiant.io
- protos.com

Price aggregators (CoinGecko, CoinMarketCap, Binance, Kraken etc.) are explicitly excluded.

---

## Cloudflare Worker Setup

Worker name: `crypto-brief-proxy`
Worker URL: `https://crypto-brief-proxy.blitzio.workers.dev`

**Secret variables (Settings → Variables and Secrets):**

| Name | Value |
|------|-------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key (sk-or-v1-...) |

**Routes handled by the Worker:**
- `GET /macro` — fetches Gold, VIX, S&P 500, Fed rate, CPI in parallel
- `POST /` — proxies AI completion requests to OpenRouter (key never exposed to browser)

---

## How to Update

**To update the frontend** (UI changes, prompt changes, Tavily config):
1. Edit `index.html` in this repo
2. Commit — GitHub Pages deploys automatically within ~60 seconds

**To update the Worker** (macro sources, AI model, routing):
1. Go to dash.cloudflare.com → Compute → Workers & Pages → `crypto-brief-proxy`
2. Click Edit code → paste updated worker.js → Deploy

**To rotate the OpenRouter API key:**
1. Generate new key at openrouter.ai
2. Go to Cloudflare Worker → Settings → Variables and Secrets
3. Update `OPENROUTER_API_KEY` → Deploy

---

## Features

- ✅ Live BTC / ETH / LINK prices with 24h and 7d changes
- ✅ Live macro gauges: Fed Rate (NY Fed), Gold, VIX, S&P 500, CPI
- ✅ Live news from reputable sources via Tavily
- ✅ AI synthesis of prices + macro + news into classified-style brief
- ✅ Inline citations [N] linking analysis to source articles
- ✅ Clickable source cards with article snippets
- ✅ "Show Raw Feed" debug panel — see exactly what was fed to the AI
- ✅ Live SGT timestamp (ticks every second)
- ✅ Issue number increments daily by day-of-year
- ✅ Refresh Brief button regenerates on demand
- ✅ Mobile responsive (tablet + phone breakpoints)
- ✅ No login required — works for anyone with the link
- ✅ Zero hardcoded data — everything pulled live

---

## Sections in the Brief

| Section | Content |
|---------|---------|
| Price Strip | BTC, ETH, LINK — live prices, deltas, market cap, volume, support/resist |
| § I Bitcoin | 6-bullet intel analysis grounded in today's news |
| § II Ethereum | 6-bullet intel analysis |
| § III Macro | Live gauges + 5-bullet macro threat analysis |
| § IV Chainlink | 6-bullet intel analysis |
| § V Assessment | Threat stack, forward watch, analyst verdict, conviction ranking, bull/bear triggers |
| § VI Sources | Clickable cards for every article used, with snippets + raw feed debug panel |

---

## Known Limitations

- **OpenRouter free tier**: 200 requests/day across all free models. Auto-selects best available model — if one goes down it tries others
- **Tavily free tier**: 1,000 searches/month. Each brief generation uses 4 searches
- **Yahoo Finance**: occasionally blocks Cloudflare server IPs — Worker falls back to recent known values if blocked
- **AI quality**: OpenRouter free models (currently auto-routing) produce decent but not Claude-quality analysis. Brief generation takes 15–45 seconds depending on model selected

---

## Built With

- Vanilla HTML/CSS/JS (no framework)
- Cloudflare Workers (serverless edge functions)
- GitHub Pages (static hosting)
