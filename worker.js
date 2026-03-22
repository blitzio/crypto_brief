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

export default {
  async fetch(request, env, ctx) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const { pathname } = new URL(request.url);

    const json = (data, status = 200, extra = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json', ...extra },
      });

    // ─────────────────────────────────────────────────────────────────
    // MACRO HELPERS
    // ─────────────────────────────────────────────────────────────────

    const fetchYahoo = async (symbol) => {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
        { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com/' } }
      );
      if (!res.ok) throw new Error(`Yahoo ${symbol} HTTP ${res.status}`);
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      const meta = result?.meta;
      if (!meta?.regularMarketPrice) throw new Error(`No price for ${symbol}`);

      const price = meta.regularMarketPrice;

      // FIX: Use last two actual closes from the indicators array instead of
      // chartPreviousClose — avoids weekend/non-trading day bug where Yahoo
      // returns a stale reference price, causing wildly wrong % changes (e.g. gold -8.52%).
      const closes = result?.indicators?.quote?.[0]?.close?.filter(v => v != null) ?? [];
      const prev = closes.length >= 2
        ? closes[closes.length - 2]
        : (meta.chartPreviousClose ?? meta.previousClose ?? price);

      return { price, pct: ((price - prev) / prev) * 100, source: 'Yahoo Finance' };
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
    // RSS + FULL ARTICLE CONTENT
    // ─────────────────────────────────────────────────────────────────

    const RSS_FEEDS = [
      { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/category/markets/', source: 'CoinDesk Markets', topic: 'btc' },
      { url: 'https://blockworks.co/feed/',                                       source: 'Blockworks',       topic: 'btc' },
      { url: 'https://theblock.co/rss.xml',                                       source: 'The Block',        topic: 'eth' },
      { url: 'https://decrypt.co/feed',                                           source: 'Decrypt',          topic: 'eth' },
      { url: 'https://dlnews.com/feed/',                                          source: 'DL News',          topic: 'general' },
      { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',                   source: 'CoinDesk',         topic: 'general' },
      { url: 'https://feeds.reuters.com/reuters/businessNews',                    source: 'Reuters Business', topic: 'macro' },
      { url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',                    source: 'WSJ Markets',      topic: 'macro' },
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
      const timeout = setTimeout(() => controller.abort(), 4000); // 4s timeout
      try {
        const res = await fetch(feedUrl, {
          signal:  controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
        });
        clearTimeout(timeout);
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRSS(xml, sourceName, topic).slice(0, 4); // top 4 per feed
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
      const cached   = await cache.match(cacheKey);
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

      const settle       = (r, fallback) => r.status === 'fulfilled' ? r.value : { ...fallback, error: r.reason?.message };
      const unavailFallback = { price: null, pct: null, source: 'unavailable' };

      const gold       = settle(goldR,       unavailFallback);
      const sp500      = settle(sp500R,      unavailFallback);
      const usdsgd     = settle(usdsgdR,     unavailFallback);
      const stablecoins = settle(stablecoinsR, { usdt: 'N/A', usdc: 'N/A', total: 'N/A', source: 'unavailable' });
      const fedRate    = settle(fedRateR,    { rate: null, rateStr: 'UNAVAILABLE', date: null, source: 'unavailable' });
      const cpi        = settle(cpiR,        { value: null, yoy: 'N/A', period: 'Unavailable', source: 'unavailable' });
      const sentiment  = settle(sentimentR,  { value: null, classification: 'Unavailable', dir: 'neu', source: 'unavailable' });

      const response = json(
        { snapshotTime: new Date().toISOString(), fedRate, usdsgd, sp500, gold, stablecoins, cryptoSentiment: sentiment, cpi },
        200, { 'Cache-Control': 'public, max-age=300' }
      );
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }

    // ─────────────────────────────────────────────────────────────────
    // GET /news — fetch RSS + content, sort by recency, cache 15 min
    // ─────────────────────────────────────────────────────────────────

    if (request.method === 'GET' && pathname === '/news') {
      const cache    = caches.default;
      const cacheKey = new Request(new URL(request.url).origin + '/news-rss-v3');
      const cached   = await cache.match(cacheKey);
      if (cached) return cached;

      // Fetch all feeds in parallel
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

      // FIX: Sort by recency before slicing so macro/LINK feeds aren't starved
      // by earlier feeds filling all 10 slots first
      items.sort((a, b) => {
        const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
        const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
        return db - da;
      });

      const topItems = items.slice(0, 20); // give Gemini more to work with

      const withContent = topItems.map(item => ({
        ...item,
        content: getDescription(item),
      }));

      const response = json(withContent, 200, { 'Cache-Control': 'public, max-age=900' }); // 15 min
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }

    // ─────────────────────────────────────────────────────────────────
    // GET /brief — return cached brief if fresh (< 1 hour old)
    // ─────────────────────────────────────────────────────────────────

    if (request.method === 'GET' && pathname === '/brief') {
      if (!env.BRIEF_CACHE) return json({ cached: false, reason: 'KV not configured' });
      try {
        const cached = await env.BRIEF_CACHE.get('latest', { type: 'json' });
        if (!cached) return json({ cached: false });
        const age = Date.now() - new Date(cached.generatedAt).getTime();
        if (age > 60 * 60 * 1000) return json({ cached: false, reason: 'stale' }); // > 1 hour
        return json({ cached: true, ...cached });
      } catch {
        return json({ cached: false });
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // POST /brief/save — save generated brief to KV cache
    // ─────────────────────────────────────────────────────────────────

    if (request.method === 'POST' && pathname === '/brief/save') {
      if (!env.BRIEF_CACHE) return json({ ok: false, reason: 'KV not configured' });
      try {
        const body = await request.json();
        await env.BRIEF_CACHE.put('latest', JSON.stringify({
          ...body,
          generatedAt: new Date().toISOString(),
        }), { expirationTtl: 3600 }); // auto-expire after 1 hour
        return json({ ok: true });
      } catch (e) {
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

        // Structured output schema
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
