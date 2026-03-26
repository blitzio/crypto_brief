/**
 * Crypto Daily Brief — Cloudflare Worker
 *
 * Routes:
 *   GET  /macro       → live macro data (Yahoo Finance, NY Fed, BLS, Alternative.me)
 *   GET  /news        → RSS feeds with full article content extraction
 *   POST /            → Gemini AI brief generation with JSON schema enforcement
 *
 * Secrets required (Settings → Variables and Secrets):
 *   GEMINI_API_KEY  — Google AI Studio key
 *   GEMINI_MODEL    — model name e.g. "gemini-2.5-flash" (update here to upgrade, no code change)
 *
 * KV Namespace required (for brief caching):
 *   BRIEF_CACHE — bind a KV namespace called BRIEF_CACHE in Worker settings
 *   Workers & Pages → your worker → Settings → Variables → KV Namespace Bindings
 *   Create namespace "BRIEF_CACHE" and bind it with variable name BRIEF_CACHE
 *
 * All news via free RSS feeds — no Tavily, no paid news API.
 */

export function selectYahooPreviousClose({ rawCloses = [], rawTimestamps = [], meta = {}, price }) {
  const lastCloseIdx = (() => {
    for (let i = rawCloses.length - 1; i >= 0; i--) {
      if (Number.isFinite(rawCloses[i])) return i;
    }
    return -1;
  })();
  const priorCloseIdx = (() => {
    for (let i = lastCloseIdx - 1; i >= 0; i--) {
      if (Number.isFinite(rawCloses[i])) return i;
    }
    return -1;
  })();

  const lastClose = lastCloseIdx >= 0 ? rawCloses[lastCloseIdx] : null;
  const priorClose = priorCloseIdx >= 0 ? rawCloses[priorCloseIdx] : null;
  const lastCloseTs = lastCloseIdx >= 0 ? rawTimestamps[lastCloseIdx] : null;
  const metaPrev = [meta.regularMarketPreviousClose, meta.previousClose, meta.chartPreviousClose]
    .find(v => Number.isFinite(v) && v > 0) ?? null;

  let prev = null;
  if (Number.isFinite(lastClose) && lastClose > 0) {
    const hasPrior = Number.isFinite(priorClose) && priorClose > 0;
    const marketTime = Number.isFinite(meta?.regularMarketTime) ? meta.regularMarketTime : null;
    const exchangeTz = meta?.exchangeTimezoneName || 'UTC';
    const dayKey = (ts) => new Intl.DateTimeFormat('en-CA', {
      timeZone: exchangeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(ts * 1000));

    // If the latest chart close is from the same exchange day as regularMarketTime,
    // treat it as current-session and use the prior close baseline when available.
    // Yahoo daily bars can be timestamped at period start (e.g. 00:00 UTC),
    // which may appear as a different local exchange day even for the current session.
    // In that case, matching UTC calendar day is a safer signal than local-day equality.
    if (marketTime && Number.isFinite(lastCloseTs)) {
      const sameTradingDay = dayKey(marketTime) === dayKey(lastCloseTs);
      const utcDay = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
      const sameUtcDay = utcDay(marketTime) === utcDay(lastCloseTs);
      const treatAsCurrentSession = sameTradingDay || sameUtcDay;
      if (treatAsCurrentSession && hasPrior) {
        prev = priorClose;
      } else if (treatAsCurrentSession && Number.isFinite(metaPrev)) {
        // Some Yahoo responses only include one finite close for the current session.
        // In that case, use metadata previous close instead of zeroing intraday change.
        prev = metaPrev;
      } else if (!treatAsCurrentSession) {
        prev = lastClose;
      }
    }

    // Fallback when timestamps are missing/ambiguous: infer via drift threshold.
    // Only allow prior-close drift fallback when the latest close has a usable timestamp.
    if (!Number.isFinite(prev)) {
      const drift = Math.abs(price - lastClose) / lastClose;
      const canUsePriorOnDrift = hasPrior && Number.isFinite(lastCloseTs);
      if (drift <= 0.002 && canUsePriorOnDrift) {
        prev = priorClose;
      } else if (drift <= 0.002 && Number.isFinite(metaPrev) && metaPrev > 0) {
        // When chart close is effectively equal to price and prior bar is unavailable,
        // prefer metadata previous close to avoid collapsing 1D change to ~0%.
        prev = metaPrev;
      } else {
        prev = lastClose;
      }
    }
  }

  if (!Number.isFinite(prev)) {
    prev = metaPrev;
  }

  if (!Number.isFinite(prev) && Number.isFinite(lastClose) && lastClose > 0) {
    prev = lastClose;
  }

  return { prev, lastClose, priorClose, lastCloseTs };
}

export function resolveYahooPct({ rawCloses = [], rawTimestamps = [], meta = {}, price }) {
  if (Number.isFinite(meta?.regularMarketChangePercent)) {
    return { pct: meta.regularMarketChangePercent, pctSource: 'regularMarketChangePercent' };
  }

  if (Number.isFinite(meta?.regularMarketPreviousClose) && meta.regularMarketPreviousClose > 0) {
    return {
      pct: ((price - meta.regularMarketPreviousClose) / meta.regularMarketPreviousClose) * 100,
      pctSource: 'derivedPreviousClose'
    };
  }

  const { prev } = selectYahooPreviousClose({ rawCloses, rawTimestamps, meta, price });
  if (!Number.isFinite(prev) || prev <= 0) throw new Error('No previous close baseline');
  return { pct: ((price - prev) / prev) * 100, pctSource: 'derivedPreviousClose' };
}

export function resolveYahooQuotePct({ quote = {} }) {
  const price = Number.isFinite(quote?.regularMarketPrice) ? quote.regularMarketPrice : null;
  if (!Number.isFinite(price)) return null;

  if (Number.isFinite(quote?.regularMarketChangePercent)) {
    return {
      price,
      pct: quote.regularMarketChangePercent,
      pctSource: 'quoteRegularMarketChangePercent'
    };
  }

  const prev = [quote.regularMarketPreviousClose, quote.previousClose]
    .find(v => Number.isFinite(v) && v > 0) ?? null;
  if (Number.isFinite(prev)) {
    return {
      price,
      pct: ((price - prev) / prev) * 100,
      pctSource: 'quoteDerivedPreviousClose'
    };
  }

  return null;
}

export default {
  async fetch(request, env, ctx) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const { pathname } = url;
    const debugNoCache = url.searchParams.get('nocache') === '1';

    const json = (data, status = 200, extra = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json', ...extra },
      });

    // ─────────────────────────────────────────────────────────────────
    // MACRO HELPERS
    // ─────────────────────────────────────────────────────────────────

    const fetchYahoo = async (symbol) => {
      const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com/' };
      let quoteErr = null;

      // Primary path: quote endpoint is the most direct source for 1D market change.
      try {
        const quoteRes = await fetch(
          `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`,
          { headers }
        );
        if (quoteRes.ok) {
          const quoteData = await quoteRes.json();
          const quote = quoteData?.quoteResponse?.result?.[0];
          const fromQuote = resolveYahooQuotePct({ quote });
          if (fromQuote) return { ...fromQuote, source: 'Yahoo Finance' };
          quoteErr = `quote-empty:${symbol}`;
        } else {
          quoteErr = `quote-http-${quoteRes.status}:${symbol}`;
        }
      } catch (err) {
        quoteErr = `quote-throw:${symbol}:${err?.message ?? 'unknown'}`;
      }

      // Fallback path: chart endpoint with baseline-selection logic.
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
        { headers }
      );
      if (!res.ok) throw new Error(`Yahoo ${symbol} chart HTTP ${res.status} (${quoteErr ?? 'quote-ok-no-data'})`);
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      const meta = result?.meta;
      if (!Number.isFinite(meta?.regularMarketPrice)) {
        throw new Error(`Yahoo ${symbol} chart missing regularMarketPrice (${quoteErr ?? 'quote-ok-no-data'})`);
      }
      const price = meta.regularMarketPrice;

      const rawCloses = result?.indicators?.quote?.[0]?.close ?? [];
      const rawTimestamps = result?.timestamp ?? [];
      const { pct, pctSource } = resolveYahooPct({ rawCloses, rawTimestamps, meta, price });
      return { price, pct, pctSource, source: 'Yahoo Finance' };
    };

    const fetchFedRate = async () => {
      const res = await fetch(
        'https://markets.newyorkfed.org/read?productCode=50&eventCodes=500&limit=5&startPosition=0&sort=postDt:-1&format=json',
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) throw new Error(`NY Fed HTTP ${res.status}`);
      const data = await res.json();
      const latest = data?.refRates?.[0];
      if (!latest) throw new Error('NY Fed: no rate data');
      const rate = parseFloat(latest.percentRate);
      return { rate, rateStr: Number.isFinite(rate) ? `${rate.toFixed(2)}%` : 'N/A', date: latest.effectiveDt, source: 'NY Fed EFFR' };
    };

    const fetchCPI = async () => {
      const res = await fetch('https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0', {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`BLS HTTP ${res.status}`);
      const data = await res.json();
      const series = data?.Results?.series?.[0]?.data;
      if (!series?.length) throw new Error('BLS: no CPI data');
      const latest = series[0];
      const yearAgo = series.find(s => s.year === String(parseInt(latest.year, 10) - 1) && s.period === latest.period);
      const current = parseFloat(latest.value);
      const prior   = yearAgo ? parseFloat(yearAgo.value) : null;
      const yoy     = prior ? ((current - prior) / prior) * 100 : null;
      return { value: current, yoy: Number.isFinite(yoy) ? `${yoy.toFixed(1)}%` : 'N/A', period: `${latest.periodName} ${latest.year}`, source: 'BLS CPI' };
    };

    const fetchSentiment = async () => {
      const res = await fetch('https://api.alternative.me/fng/?limit=1&format=json', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Alternative.me HTTP ${res.status}`);
      const data = await res.json();
      const item = data?.data?.[0];
      if (!item) throw new Error('No sentiment data');
      const value = parseInt(item.value, 10);
      return { value, classification: item.value_classification ?? 'Unknown', dir: value >= 60 ? 'pos' : value <= 40 ? 'neg' : 'neu', source: 'Alternative.me Fear & Greed' };
    };

    const fetchStablecoinFlows = async () => {
      const res = await fetch('https://stablecoins.llama.fi/stablecoins?includePrices=true', {
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) throw new Error(`DefiLlama HTTP ${res.status}`);
      const data = await res.json();
      const pegs = data?.peggedAssets ?? [];

      const usdt = pegs.find(p => p.symbol === 'USDT');
      const usdc = pegs.find(p => p.symbol === 'USDC');

      const circulating = (asset) => asset?.circulating?.peggedUSD ?? null;

      const usdtCirc  = circulating(usdt);
      const usdcCirc  = circulating(usdc);
      const totalCirc = (usdtCirc && usdcCirc) ? usdtCirc + usdcCirc : null;

      return {
        usdt:   usdtCirc  ? `$${(usdtCirc  / 1e9).toFixed(1)}B` : 'N/A',
        usdc:   usdcCirc  ? `$${(usdcCirc  / 1e9).toFixed(1)}B` : 'N/A',
        total:  totalCirc ? `$${(totalCirc / 1e9).toFixed(1)}B` : 'N/A',
        source: 'DefiLlama Stablecoins',
      };
    };

    // ─────────────────────────────────────────────────────────────────
    // RSS + ARTICLE CONTENT
    // ─────────────────────────────────────────────────────────────────

    const RSS_FEEDS = [
      { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/category/markets/', source: 'CoinDesk Markets', topic: 'btc' },
      { url: 'https://blockworks.co/feed/',                                       source: 'Blockworks',       topic: 'btc' },
      { url: 'https://theblock.co/rss.xml',                                       source: 'The Block',        topic: 'eth' },
      { url: 'https://decrypt.co/feed',                                           source: 'Decrypt',          topic: 'eth' },
      { url: 'https://www.dlnews.com/arc/outboundfeeds/rss/',                     source: 'DL News',          topic: 'general' },
      { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',                   source: 'CoinDesk',         topic: 'general' },
      { url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain',       source: 'Dow Jones Markets', topic: 'macro' },
      { url: 'https://www.ft.com/markets?format=rss',                             source: 'FT Markets',       topic: 'macro' },
    ];

    function parseRSS(xml, sourceName, topic) {
      const items = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      let match;
      while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];
        const get = (tag) => {
          const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
          return m ? (m[1] ?? m[2] ?? '').trim() : '';
        };
        const title = get('title').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        const link  = get('link') || get('guid');
        const desc  = get('description').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
        const date  = get('pubDate');
        if (title && link && link.startsWith('http')) {
          items.push({ title, url: link, description: desc.slice(0, 300), pubDate: date, source: sourceName, topic });
        }
      }
      return items;
    }

    async function fetchFeed(feedUrl, sourceName, topic) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(feedUrl, {
          signal:  controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
        });
        clearTimeout(timeout);
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRSS(xml, sourceName, topic).slice(0, 8);
      } catch {
        clearTimeout(timeout);
        return [];
      }
    }

    function getDescription(item) {
      return item.description || '';
    }

    // ─────────────────────────────────────────────────────────────────
    // GET /macro
    // ─────────────────────────────────────────────────────────────────

    if (request.method === 'GET' && pathname === '/macro') {
      const cache    = caches.default;
      const cacheKey = new Request(new URL(request.url).origin + '/macro-v4');
      const cached   = debugNoCache ? null : await cache.match(cacheKey);
      if (cached) return cached;

      const [goldR, sp500R, usdsgdR, stablecoinsR, fedRateR, cpiR, sentimentR] = await Promise.allSettled([
        fetchYahoo('GC=F'),
        fetchYahoo('^GSPC'),
        fetchYahoo('SGD=X'),
        fetchStablecoinFlows(),
        fetchFedRate(),
        fetchCPI(),
        fetchSentiment(),
      ]);

      const settle = (r, fallback) => r.status === 'fulfilled' ? r.value : { ...fallback, error: r.reason?.message };
      const unavailFallback = { price: null, pct: null, source: 'unavailable' };

      const gold        = settle(goldR,        unavailFallback);
      const sp500       = settle(sp500R,       unavailFallback);
      const usdsgd      = settle(usdsgdR,      unavailFallback);
      const stablecoins = settle(stablecoinsR, { usdt: 'N/A', usdc: 'N/A', total: 'N/A', source: 'unavailable' });
      const fedRate     = settle(fedRateR,     { rate: null, rateStr: 'UNAVAILABLE', date: null, source: 'unavailable' });
      const cpi         = settle(cpiR,         { value: null, yoy: 'N/A', period: 'Unavailable', source: 'unavailable' });
      const sentiment   = settle(sentimentR,   { value: null, classification: 'Unavailable', dir: 'neu', source: 'unavailable' });

      if (sp500?.source === 'unavailable') {
        console.log(`[macro] SP500 unavailable: ${sp500?.error ?? 'unknown'}`);
      } else {
        console.log(`[macro] SP500 ok: source=${sp500?.source} pctSource=${sp500?.pctSource ?? 'none'} price=${sp500?.price ?? 'n/a'} pct=${sp500?.pct ?? 'n/a'}`);
      }

      const response = json(
        { snapshotTime: new Date().toISOString(), fedRate, usdsgd, sp500, gold, stablecoins, cryptoSentiment: sentiment, cpi },
        200, { 'Cache-Control': 'public, max-age=300' }
      );
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }

    // ─────────────────────────────────────────────────────────────────
    // GET /news — fetch RSS + content, filter freshness, sort by recency
    // ─────────────────────────────────────────────────────────────────

    if (request.method === 'GET' && pathname === '/news') {
      const cache    = caches.default;
      const cacheKey = new Request(new URL(request.url).origin + '/news-rss-v4');
      const cached   = debugNoCache ? null : await cache.match(cacheKey);
      if (cached) return cached;

      const feedSettled = await Promise.allSettled(
        RSS_FEEDS.map(f => fetchFeed(f.url, f.source, f.topic))
      );
      const feedResults = feedSettled.map(r => r.status === 'fulfilled' ? r.value : []);

      // Flatten + deduplicate
      const seen  = new Set();
      const items = [];
      for (const feedItems of feedResults) {
        for (const item of feedItems) {
          if (!seen.has(item.url) && item.title) {
            seen.add(item.url);
            items.push(item);
          }
        }
      }

      // SAFE FIX:
      // 1) Keep only recent items from the last 72 hours
      // 2) Exclude obvious low-signal Dow Jones roundup items
      const now = Date.now();
      const MAX_AGE_MS = 72 * 60 * 60 * 1000;

      const filteredItems = items.filter(item => {
        const ts = item.pubDate ? new Date(item.pubDate).getTime() : 0;
        if (!ts || Number.isNaN(ts)) return false;
        if ((now - ts) > MAX_AGE_MS) return false;

        if (
          item.source === 'Dow Jones Markets' &&
          /market talk|roundup/i.test(item.title)
        ) {
          return false;
        }

        return true;
      });

      filteredItems.sort((a, b) => {
        const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
        const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
        return db - da;
      });

      const topItems = filteredItems.slice(0, 20);

      const withContent = topItems.map(item => ({
        ...item,
        content: getDescription(item),
      }));

      const response = json(withContent, 200, { 'Cache-Control': 'public, max-age=900' });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }

    // ─────────────────────────────────────────────────────────────────
    // GET /brief — return cached brief if fresh (< 1 hour old)
    // ─────────────────────────────────────────────────────────────────

    if (request.method === 'GET' && pathname === '/brief') {
      if (!env.BRIEF_CACHE) {
        console.log('[cache] /brief miss: KV not configured');
        return json({ cached: false, reason: 'KV not configured' });
      }
      try {
        const cached = await env.BRIEF_CACHE.get('latest', { type: 'json' });
        if (!cached) {
          console.log('[cache] /brief miss: no KV entry');
          return json({ cached: false });
        }
        const age = Date.now() - new Date(cached.generatedAt).getTime();
        if (age > 60 * 60 * 1000) {
          console.log(`[cache] /brief miss: stale entry (${Math.round(age / 1000)}s old)`);
          return json({ cached: false, reason: 'stale' });
        }
        console.log(`[cache] /brief hit: serving KV entry (${Math.round(age / 1000)}s old)`);
        return json({ cached: true, ...cached });
      } catch (e) {
        console.log(`[cache] /brief miss: KV read error (${e?.message ?? 'unknown'})`);
        return json({ cached: false });
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // POST /brief/save — save generated brief to KV cache
    // ─────────────────────────────────────────────────────────────────

    if (request.method === 'POST' && pathname === '/brief/save') {
      if (!env.BRIEF_CACHE) {
        console.log('[cache] /brief/save failed: KV not configured');
        return json({ ok: false, reason: 'KV not configured' });
      }
      try {
        const body = await request.json();
        await env.BRIEF_CACHE.put('latest', JSON.stringify({
          ...body,
          generatedAt: new Date().toISOString(),
        }), { expirationTtl: 3600 });
        console.log('[cache] /brief/save success: KV updated');
        return json({ ok: true });
      } catch (e) {
        console.log(`[cache] /brief/save failed: ${e.message}`);
        return json({ ok: false, error: e.message });
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // POST / — Gemini brief generation with JSON schema enforcement
    // ─────────────────────────────────────────────────────────────────

    if (request.method === 'POST' && pathname === '/') {
      try {
        const body     = await request.json();
        const messages = Array.isArray(body.messages) ? body.messages : [];

        const systemText = messages
          .filter(m => m.role === 'system')
          .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
          .join('\n\n');

        const contents = messages
          .filter(m => m.role !== 'system')
          .map(m => ({
            role:  m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
          }));

        const bulletSchema = {
          type: 'object',
          properties: { label: { type: 'string' }, text: { type: 'string' } },
          required: ['label', 'text'],
        };

        const responseSchema = {
          type: 'object',
          required: ['btc','eth','link','macro','threats','watch','verdict','ranking','bullTrigger','bearTrigger'],
          properties: {
            btc:   { type: 'object', required: ['support','resist','bullets'], properties: { support: { type: 'string' }, resist: { type: 'string' }, bullets: { type: 'array', items: bulletSchema } } },
            eth:   { type: 'object', required: ['support','resist','bullets'], properties: { support: { type: 'string' }, resist: { type: 'string' }, bullets: { type: 'array', items: bulletSchema } } },
            link:  { type: 'object', required: ['support','resist','badge','bullets'], properties: { support: { type: 'string' }, resist: { type: 'string' }, badge: { type: 'string' }, bullets: { type: 'array', items: bulletSchema } } },
            macro: { type: 'object', required: ['bullets'], properties: { bullets: { type: 'array', items: bulletSchema } } },
            threats:     { type: 'array', items: bulletSchema },
            watch:       { type: 'array', items: bulletSchema },
            verdict:     { type: 'string' },
            ranking:     { type: 'string' },
            bullTrigger: { type: 'string' },
            bearTrigger: { type: 'string' },
          },
        };

        const model   = env.GEMINI_MODEL || 'gemini-2.5-flash';
        const payload = {
          contents: contents.length
            ? contents
            : [{ role: 'user', parts: [{ text: 'Generate the brief.' }] }],
          generationConfig: {
            temperature:      typeof body.temperature === 'number' ? body.temperature : 0.3,
            maxOutputTokens:  8192,
            responseMimeType: 'application/json',
            responseJsonSchema: responseSchema,
          },
        };

        if (systemText) {
          payload.systemInstruction = { parts: [{ text: systemText }] };
        }

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );

        const data = await geminiRes.json();
        if (!geminiRes.ok) return json(data, geminiRes.status);

        const contentText = (data?.candidates?.[0]?.content?.parts ?? [])
          .map(p => p.text ?? '')
          .join('')
          .trim() || '{}';

        return json({ choices: [{ message: { content: contentText } }] });

      } catch (err) {
        return json({ error: { message: err.message } }, 500);
      }
    }

    return new Response('OK', { headers: cors });
  },
};
