# CID-SGT — Crypto Daily Brief

> A self-updating AI-powered crypto intelligence terminal that pulls live prices, real macro data, and today's journalism — then synthesises everything into a classified-style daily brief, automatically, every time the page loads.

**Live site:** https://blitzio.github.io/crypto_brief/

---

## Vision

The brief works like a proper intelligence analyst: read today's real journalism from reputable sources, cross-reference with live market data, and produce a tight classified-document-style report. Every number is live. Every analysis bullet is grounded in real news with a citation. Sources at the bottom are clickable articles you can verify yourself. Runs entirely free with zero manual effort after setup.

---

## How It Works — Full Pipeline

Every time the page loads, this sequence runs automatically:

```
1. CoinGecko (free, no key)
   └── Live BTC, ETH, LINK — price, 24h%, 7d%, market cap, volume

2. Cloudflare Worker /macro
   ├── Yahoo Finance  → Gold (GC=F), S&P 500, USD/SGD, DXY
   ├── NY Fed EFFR    → Federal Funds Rate (official, updates daily)
   ├── BLS Public API → CPI inflation (official US government)
   └── Alternative.me → Crypto Fear & Greed Index (0–100)

3. Cloudflare Worker /news
   ├── Fetches 8 RSS feeds in parallel
   │   (CoinDesk, The Block, Decrypt, CoinTelegraph, Blockworks,
   │    Reuters Business, WSJ Markets)
   ├── Parses headlines + descriptions from XML
   └── Fetches full article text from each URL (~800 chars per article)
       ↳ KEY: Gemini reads real journalism substance, not just headlines
         This is the primary anti-hallucination mechanism

4. Cloudflare Worker POST /
   ├── All data formatted into a structured prompt
   ├── Sent to Gemini 2.5 Flash (Google AI API)
   ├── JSON schema enforcement → guaranteed valid structured output
   └── Gemini writes analysis grounded in the real articles
       ↳ Citations [1][2][3] map to actual clickable source articles

5. Frontend renders the brief
   ├── Live price strip (CoinGecko)
   ├── Live macro gauges (6 indicators)
   ├── Analysis: BTC, ETH, LINK, Macro, Assessment
   ├── Sources section (clickable cards with article snippets)
   └── Debug panel → "Show Raw Sources" reveals exact content fed to AI

6. Cloudflare KV caching
   └── Brief saved to KV for 1 hour
       ↳ Repeat visitors get instant load (no 20s wait)
       ↳ ↻ Refresh Brief button bypasses cache → forces fresh generation
```

---

## Architecture

```
Browser (GitHub Pages — index.html)
        │
        ├── CoinGecko API ─────────────────────────► Live crypto prices
        │   (direct from browser, no proxy needed)
        │
        └── Cloudflare Worker (crypto-brief-proxy.blitzio.workers.dev)
                │
                ├── GET /macro ─────────────────────► Yahoo Finance (Gold, S&P, USD/SGD, DXY)
                │                                      NY Fed EFFR (Fed rate)
                │                                      BLS API (CPI)
                │                                      Alternative.me (Fear & Greed)
                │
                ├── GET /news ──────────────────────► 8 RSS feeds → full article content
                │
                ├── POST / ─────────────────────────► Gemini 2.5 Flash (AI analysis)
                │
                ├── GET /brief ─────────────────────► Cloudflare KV (read cache)
                └── POST /brief/save ───────────────► Cloudflare KV (write cache)
```

---

## Repository Files

```
crypto_brief/
├── index.html    ← Complete frontend (HTML + CSS + JS, single file, no build step)
├── worker.js     ← Cloudflare Worker backend — deploy manually via Cloudflare dashboard
└── README.md     ← This file
```

**Why is `worker.js` safe in a public repo?**
All secrets (API keys) live in Cloudflare environment variables — `env.GEMINI_API_KEY`, `env.GEMINI_MODEL`. The code itself contains zero sensitive data. It is best practice to version-control your Worker code.

**Why single-file frontend?**
GitHub Pages serves static files. One `index.html` = zero build toolchain, zero dependencies, instant deploy on every commit.

---

## Data Sources — Full Reference

| Source | Data provided | Key required | Cost |
|--------|--------------|--------------|------|
| CoinGecko `/coins/markets` | BTC/ETH/LINK price, 24h%, 7d%, mcap, vol | No | Free |
| Yahoo Finance (via Worker) | Gold, S&P 500, USD/SGD, DXY | No | Free |
| NY Fed EFFR | Federal Funds Rate (official) | No | Free |
| BLS Public API | CPI YoY inflation (official) | No | Free |
| Alternative.me | Crypto Fear & Greed 0–100 | No | Free |
| RSS (8 feeds below) | Today's journalism + full article text | No | Free |
| Gemini 2.5 Flash | AI analysis and synthesis | `GEMINI_API_KEY` | Free (250 req/day) |

### RSS News Sources
| Feed | Source | Topic focus |
|------|--------|-------------|
| coindesk.com/arc/outboundfeeds/rss/category/markets/ | CoinDesk Markets | BTC price action |
| blockworks.co/feed/ | Blockworks | Institutional crypto |
| theblock.co/rss.xml | The Block | Research-grade crypto |
| decrypt.co/feed | Decrypt | Broad crypto |
| cointelegraph.com/rss | CoinTelegraph | General crypto |
| coindesk.com/arc/outboundfeeds/rss/ | CoinDesk | Full coverage |
| feeds.reuters.com/reuters/businessNews | Reuters Business | Macro/finance |
| feeds.a.dj.com/rss/RSSMarketsMain.xml | WSJ Markets | Macro/finance |

---

## Cloudflare Worker Configuration

**Worker name:** `crypto-brief-proxy`
**URL:** `https://crypto-brief-proxy.blitzio.workers.dev`

### Secrets (Settings → Variables and Secrets)

| Name | Value | Notes |
|------|-------|-------|
| `GEMINI_API_KEY` | `AIza...` from aistudio.google.com | Never put this in code |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Change this secret to upgrade model — no code change needed |

### KV Namespace Binding (Settings → Bindings)

| Variable name | Namespace | Purpose |
|---------------|-----------|---------|
| `BRIEF_CACHE` | BRIEF_CACHE | 1-hour brief cache — instant load for repeat visitors |

### Worker Routes

| Method | Route | Purpose | Cache |
|--------|-------|---------|-------|
| GET | `/macro` | Gold, S&P, USD/SGD, DXY, Fed rate, CPI, Fear & Greed | 5 min edge |
| GET | `/news` | 8 RSS feeds + full article content extraction | 15 min edge |
| POST | `/` | Gemini AI call — returns structured JSON brief | None |
| GET | `/brief` | Read cached brief from KV | 1 hour KV |
| POST | `/brief/save` | Write brief to KV after generation | 1 hour TTL |

---

## Brief Sections

| Section | Content |
|---------|---------|
| Price Strip | BTC / ETH / LINK — live price, 24h/7d delta, mcap, volume, support/resist |
| § I Bitcoin | 6 intel bullets grounded in today's news with [N] citations |
| § II Ethereum | 6 intel bullets with citations |
| § III Macro | 6 live gauges + 5 analysis bullets |
| § IV Chainlink | 6 intel bullets with citations |
| § V Assessment | Threat stack · Forward watch · Verdict · Conviction ranking · Bull/Bear triggers |
| § VI Sources | Clickable article cards from today's RSS — title, snippet, domain, link |
| Debug Panel | "Show Raw Sources" — exact article content passed to Gemini |

---

## Caching Reference

| What | Cache duration | Storage |
|------|---------------|---------|
| Macro data (Gold, S&P etc.) | 5 minutes | Cloudflare edge |
| News articles (RSS + content) | 15 minutes | Cloudflare edge |
| Full generated brief | 1 hour | Cloudflare KV |

**↻ Refresh Brief** — calls `run(true)`, bypasses KV cache, forces full regeneration including fresh prices, news and AI analysis.

---

## Upgrading the AI Model

The model name is stored as a Cloudflare secret — not hardcoded. To upgrade:

1. Go to Cloudflare → Worker → Settings → Variables and Secrets
2. Edit `GEMINI_MODEL`
3. Change value to new model name (e.g. `gemini-3.0-flash` when available)
4. Deploy — done. No code changes ever needed.

---

## Anti-Hallucination Design

Three layers prevent the AI from inventing events:

**Layer 1 — Full article content**
Worker fetches the first 5 paragraphs (~800 chars) of each article, not just the headline. Gemini reads real substance before writing any bullet.

**Layer 2 — JSON schema enforcement**
`responseMimeType: application/json` + `responseJsonSchema` forces Gemini to return a valid structured object matching the exact schema. No freeform text generation.

**Layer 3 — Hard prompt constraints**
- Every claim must cite a source `[N]`
- Claims without a citation must be omitted
- Macro gauge values must use only the exact live numbers provided
- Substituting or inventing figures is explicitly prohibited

---

## How to Update

**Frontend change** (UI, layout, prompt wording):
→ Edit `index.html` → commit → auto-deploys in ~60 seconds

**Worker change** (data sources, caching, AI routing):
→ Edit `worker.js` → Cloudflare dashboard → Edit code → paste → Deploy

**Upgrade AI model:**
→ Cloudflare → Worker → Settings → edit `GEMINI_MODEL` secret → Deploy

**Rotate a key:**
→ Cloudflare → Worker → Settings → edit the relevant secret → Deploy
→ Key is never in GitHub — nothing to change there

---

## Known Limitations

| Limitation | Impact | Notes |
|------------|--------|-------|
| Gemini 2.5 Flash quality | Below Claude Sonnet / GPT-4o | Free tier constraint. Claude API costs ~$0.001/brief (~$0.37/year) |
| Google grounding incompatibility | Can't use web search + JSON schema together | Google API hard limitation. RSS pipeline is the workaround |
| RSS article scraping | ~20% of sites block content extraction | Falls back to RSS description automatically |
| Yahoo Finance blocking | Occasional macro data gaps | Handled gracefully — shows "Unavailable" not a crash |
| Gemini free tier limit | 250 req/day | Covers ~250 briefs/day — more than sufficient |

---

## Total Monthly Cost: $0.00

| Service | Free tier | Daily usage |
|---------|-----------|-------------|
| GitHub Pages | Unlimited static hosting | 1 file |
| Cloudflare Workers | 100,000 req/day | ~10 req/brief |
| Cloudflare KV | 100,000 reads + 1,000 writes/day | ~2/brief |
| CoinGecko | Unlimited (public endpoint) | 1 call |
| Yahoo Finance | Unlimited | 4 calls |
| NY Fed / BLS | Unlimited | 2 calls |
| Alternative.me | Unlimited | 1 call |
| RSS feeds | Unlimited | 8 feeds |
| Gemini 2.5 Flash | 250 req/day free | 1 call |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML + CSS + JS (no framework, no build step) |
| Backend | Cloudflare Workers (serverless, V8 isolates, edge-deployed) |
| Cache | Cloudflare Workers KV |
| Hosting | GitHub Pages |
| AI | Google Gemini 2.5 Flash (Google AI Studio API) |
| Fonts | Inter + JetBrains Mono (Google Fonts) |

---

*Built with Claude + Chatgpt 2026*
