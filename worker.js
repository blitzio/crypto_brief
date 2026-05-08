/**
 * Crypto Daily Brief — Cloudflare Worker
 *
 * Routes:
 *   GET  /macro       → live macro data (Yahoo Finance, NY Fed, BLS, Alternative.me)
 *   GET  /news        → RSS feeds with sanitized snippet content
 *   POST /            → Gemini AI brief generation with JSON schema enforcement
 *
 * Secrets required (Settings → Variables and Secrets):
 *   GEMINI_API_KEY  — Google AI Studio key
 *   GEMINI_MODEL    — model name e.g. "gemini-3-flash-preview" (update here to upgrade, no code change)
 *
 * KV Namespace required (for brief caching):
 *   BRIEF_CACHE — bind a KV namespace called BRIEF_CACHE in Worker settings
 *   Workers & Pages → your worker → Settings → Variables → KV Namespace Bindings
 *   Create namespace "BRIEF_CACHE" and bind it with variable name BRIEF_CACHE
 *
 * All news via free RSS feeds — no Tavily, no paid news API.
 */

import { resolveYahooPct, resolveYahooQuotePct } from './src/yahoo.js';
import {
  buildPromptNewsItems,
  decodeHtmlBasic,
  sanitizeNewsDescription,
  selectTopNewsItems,
  summarizeNewsSourceHealth,
} from './src/news.js';
import {
  listUnavailableMacroFields,
  normalizeBriefCitationMarkers,
  parseGeminiBriefJson,
  resolveModelFallbacks,
  validateBriefCitations,
} from './src/gemini.js';
export { selectYahooPreviousClose, resolveYahooPct, resolveYahooQuotePct } from './src/yahoo.js';
export {
  buildPromptNewsItems,
  inferAssetMentions,
  sanitizeNewsDescription,
  selectTopNewsItems,
  summarizeNewsSourceHealth,
} from './src/news.js';
export {
  listUnavailableMacroFields,
  normalizeCitationMarkers,
  parseGeminiBriefJson,
  resolveModelFallbacks,
  validateBriefCitations,
} from './src/gemini.js';

export default {
  async fetch(request, env, ctx) {
    const allowedOrigins = (env.ALLOWED_ORIGINS || 'https://blitzio.github.io')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean);
    const requestOrigin = request.headers.get('Origin') || '';
    const corsOrigin = requestOrigin && allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : allowedOrigins[0] || '*';
    const cors = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Brief-Admin-Token',
      'Vary': 'Origin',
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

    // GET /version - deployment identity only, no secrets
    if (request.method === 'GET' && pathname === '/version') {
      return json({
        ok: true,
        worker: 'crypto-brief-proxy',
        commit: env.DEPLOY_COMMIT_SHA || null,
        source: env.DEPLOY_SOURCE || 'manual',
        timestamp: new Date().toISOString(),
      }, 200, { 'Cache-Control': 'no-store' });
    }

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
    // RSS + SNIPPET CONTENT
    // ─────────────────────────────────────────────────────────────────

    const RSS_FEEDS = [
      { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/category/markets/', source: 'CoinDesk Markets', topic: 'btc' },
      { url: 'https://blockworks.co/feed/',                                       source: 'Blockworks',       topic: 'btc' },
      { url: 'https://theblock.co/rss.xml',                                       source: 'The Block',        topic: 'eth' },
      { url: 'https://decrypt.co/feed',                                           source: 'Decrypt',          topic: 'eth' },
      { url: 'https://news.google.com/rss/search?q=%28Ethereum%20OR%20ETH%20OR%20staking%20OR%20rsETH%29%20crypto%20when%3A7d&hl=en-US&gl=US&ceid=US:en', source: 'Google News ETH', topic: 'eth', maxItems: 12, maxAgeHours: 168 },
      { url: 'https://news.google.com/rss/search?q=%28Chainlink%20OR%20%22LINK%22%20OR%20CCIP%20OR%20oracle%29%20crypto%20when%3A7d&hl=en-US&gl=US&ceid=US:en', source: 'Google News LINK', topic: 'link', maxItems: 12, maxAgeHours: 168 },
      { url: 'https://www.dlnews.com/arc/outboundfeeds/rss/',                     source: 'DL News',          topic: 'general' },
      { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',                   source: 'CoinDesk',         topic: 'general' },
      { url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain',       source: 'Dow Jones Markets', topic: 'macro' },
      { url: 'https://www.ft.com/markets?format=rss',                             source: 'FT Markets',       topic: 'macro' },
    ];

    function parseRSS(xml, sourceName, topic, maxAgeHours) {
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
        const desc  = sanitizeNewsDescription(get('description'));
        const date  = get('pubDate');
        if (title && link && link.startsWith('http')) {
          items.push({ title: decodeHtmlBasic(title), url: link, description: desc.slice(0, 300), pubDate: date, source: sourceName, topic, maxAgeHours });
        }
      }
      return items;
    }

    async function fetchFeed(feedUrl, sourceName, topic, maxItems = 8, maxAgeHours = null) {
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
        return parseRSS(xml, sourceName, topic, maxAgeHours).slice(0, maxItems);
      } catch {
        clearTimeout(timeout);
        return [];
      }
    }

    function getDescription(item) {
      return item.description || '';
    }

    async function collectMacroData() {
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

      return { snapshotTime: new Date().toISOString(), fedRate, usdsgd, sp500, gold, stablecoins, cryptoSentiment: sentiment, cpi };
    }

    async function collectNewsItems() {
      const feedSettled = await Promise.allSettled(
        RSS_FEEDS.map(f => fetchFeed(f.url, f.source, f.topic, f.maxItems, f.maxAgeHours))
      );
      const feedResults = feedSettled.map(r => r.status === 'fulfilled' ? r.value : []);

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

      const now = Date.now();
      const filteredItems = items.filter(item => {
        const ts = item.pubDate ? new Date(item.pubDate).getTime() : 0;
        if (!ts || Number.isNaN(ts)) return false;
        const maxAgeHours = Number.isFinite(item.maxAgeHours) ? item.maxAgeHours : 72;
        if ((now - ts) > (maxAgeHours * 60 * 60 * 1000)) return false;

        if (
          item.source === 'Dow Jones Markets' &&
          /market talk|roundup/i.test(item.title)
        ) {
          return false;
        }

        return true;
      });

      return selectTopNewsItems(filteredItems, 20).map(item => ({
        ...item,
        content: getDescription(item),
      }));
    }

    // ─────────────────────────────────────────────────────────────────
    // GET /macro
    // ─────────────────────────────────────────────────────────────────

    if (request.method === 'GET' && pathname === '/macro') {
      const cache    = caches.default;
      const cacheKey = new Request(new URL(request.url).origin + '/macro-v5');
      const cached   = debugNoCache ? null : await cache.match(cacheKey);
      if (cached) return cached;

      const macroData = await collectMacroData();

      const response = json(
        macroData,
        200, { 'Cache-Control': 'public, max-age=300' }
      );
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }

    // ─────────────────────────────────────────────────────────────────
    // GET /news — fetch RSS snippets, filter freshness, sort by recency
    // ─────────────────────────────────────────────────────────────────

    if (request.method === 'GET' && pathname === '/news') {
      const cache    = caches.default;
      const cacheKey = new Request(new URL(request.url).origin + '/news-rss-v4');
      const cached   = debugNoCache ? null : await cache.match(cacheKey);
      if (cached) return cached;

      const response = json(await collectNewsItems(), 200, { 'Cache-Control': 'public, max-age=900' });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }

    // GET /health - read-only source/cache diagnostics, no Gemini call
    if (request.method === 'GET' && pathname === '/health') {
      const cache = caches.default;
      const cacheKey = new Request(new URL(request.url).origin + '/health-v1');
      const cached = debugNoCache ? null : await cache.match(cacheKey);
      if (cached) return cached;

      let macroCheck = { ok: false, unavailableFields: ['macro'], error: null };
      try {
        const macro = await collectMacroData();
        const unavailableFields = listUnavailableMacroFields(macro);
        macroCheck = { ok: unavailableFields.length === 0, unavailableFields };
      } catch (err) {
        macroCheck = { ok: false, unavailableFields: ['macro'], error: err?.message ?? 'unknown' };
      }

      let newsCheck = {
        ok: false,
        count: 0,
        assetMentionCounts: { btc: 0, eth: 0, link: 0, none: 0 },
        avgContentChars: 0,
        error: null,
      };
      try {
        const newsSummary = summarizeNewsSourceHealth(await collectNewsItems());
        newsCheck = { ok: newsSummary.count > 0, ...newsSummary };
      } catch (err) {
        newsCheck = { ...newsCheck, error: err?.message ?? 'unknown' };
      }

      let briefCache = { cached: false, ageSeconds: null };
      if (env.BRIEF_CACHE) {
        try {
          const cached = await env.BRIEF_CACHE.get('latest', { type: 'json' });
          if (cached?.generatedAt) {
            const ageMs = Date.now() - new Date(cached.generatedAt).getTime();
            briefCache = {
              cached: true,
              ageSeconds: Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 1000)) : null,
            };
          }
        } catch (err) {
          briefCache = { cached: false, ageSeconds: null, error: err?.message ?? 'unknown' };
        }
      }

      const response = json({
        ok: macroCheck.ok && newsCheck.ok,
        timestamp: new Date().toISOString(),
        checks: { macro: macroCheck, news: newsCheck, briefCache },
      }, 200, { 'Cache-Control': 'public, max-age=60' });
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
      const adminToken = env.BRIEF_ADMIN_TOKEN || '';
      const requestToken = request.headers.get('X-Brief-Admin-Token') || '';
      if (!adminToken || requestToken !== adminToken) {
        return json({ ok: false, reason: 'Unauthorized' }, 403);
      }
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
            btc:   { type: 'object', required: ['support','resist','bullets'], properties: { support: { type: 'string' }, resist: { type: 'string' }, bullets: { type: 'array', minItems: 4, maxItems: 6, items: bulletSchema } } },
            eth:   { type: 'object', required: ['support','resist','bullets'], properties: { support: { type: 'string' }, resist: { type: 'string' }, bullets: { type: 'array', minItems: 4, maxItems: 6, items: bulletSchema } } },
            link:  { type: 'object', required: ['support','resist','badge','bullets'], properties: { support: { type: 'string' }, resist: { type: 'string' }, badge: { type: 'string' }, bullets: { type: 'array', minItems: 4, maxItems: 6, items: bulletSchema } } },
            macro: { type: 'object', required: ['bullets'], properties: { bullets: { type: 'array', minItems: 5, maxItems: 5, items: bulletSchema } } },
            threats:     { type: 'array', minItems: 5, maxItems: 5, items: bulletSchema },
            watch:       { type: 'array', minItems: 6, maxItems: 6, items: bulletSchema },
            verdict:     { type: 'string' },
            ranking:     { type: 'string' },
            bullTrigger: { type: 'string' },
            bearTrigger: { type: 'string' },
          },
        };

        const payload = {
          contents: contents.length
            ? contents
            : [{ role: 'user', parts: [{ text: 'Generate the brief.' }] }],
          generationConfig: {
            temperature:      typeof body.temperature === 'number' ? body.temperature : 0.3,
            maxOutputTokens:  16384,
            responseMimeType: 'application/json',
            responseJsonSchema: responseSchema,
          },
        };

        if (systemText) {
          payload.systemInstruction = { parts: [{ text: systemText }] };
        }

        let contentText = '{}';
        let parsedBrief = null;
        let citationCheck = { ok: false, violations: [] };
        let lastGeminiError = null;
        const models = resolveModelFallbacks(env);

        for (let attempt = 0; attempt < 2; attempt++) {
          let data = null;
          for (const model of models) {
            const geminiRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
              { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
            );

            data = await geminiRes.json();
            if (geminiRes.ok) {
              lastGeminiError = null;
              break;
            }

            lastGeminiError = { data, status: geminiRes.status };
            const retryable = geminiRes.status === 429 || geminiRes.status === 503;
            if (!retryable || model === models[models.length - 1]) {
              return json(data, geminiRes.status);
            }
          }

          if (lastGeminiError) return json(lastGeminiError.data, lastGeminiError.status);

          contentText = (data?.candidates?.[0]?.content?.parts ?? [])
            .map(p => p.text ?? '')
            .join('')
            .trim() || '{}';

          try {
          parsedBrief = normalizeBriefCitationMarkers(parseGeminiBriefJson(contentText));
          contentText = JSON.stringify(parsedBrief);
          } catch (parseErr) {
            citationCheck = {
              ok: false,
              violations: [{ asset: 'json', bulletIndex: -1, reason: 'invalid_json', text: parseErr.message }],
            };
            payload.contents.push({
              role: 'user',
              parts: [{
                text: `The previous response was invalid JSON (${parseErr.message}). Return the full corrected JSON object only, with no markdown and no commentary.`,
              }],
            });
            continue;
          }
          citationCheck = validateBriefCitations(parsedBrief, body.cachePayload?.newsItems || []);
          if (citationCheck.ok) break;

          const feedback = citationCheck.violations
            .slice(0, 10)
            .map(v => `${v.asset.toUpperCase()} bullet ${v.bulletIndex + 1}: ${v.reason}${v.docId ? ` on doc [${v.docId}]` : ''}`)
            .join('; ');
          payload.contents.push({
            role: 'user',
            parts: [{
              text: `The previous JSON failed citation validation: ${feedback}. Return the full corrected JSON only. Asset bullets may cite only docs whose ASSET_TAGS include that asset. If no matching source supports an asset point, use exact live market data from the prompt and label it "Live market data:"; cover price action, relative strength, liquidity/volume, and support/resistance. Do not write broad uncited model inference.`,
            }],
          });
        }

        if (!citationCheck.ok) {
          return json({
            error: {
              message: 'Generated brief failed citation validation. Refresh to retry with stricter source matching.',
              citationViolations: citationCheck.violations,
            },
          }, 422);
        }

        if (env.BRIEF_CACHE && body.cachePayload && typeof body.cachePayload === 'object') {
          try {
            await env.BRIEF_CACHE.put('latest', JSON.stringify({
              ...body.cachePayload,
              newsItems: buildPromptNewsItems(body.cachePayload.newsItems || []),
              brief: parsedBrief,
              generatedAt: new Date().toISOString(),
            }), { expirationTtl: 3600 });
            console.log('[cache] generation saved server-side');
          } catch (cacheErr) {
            console.log(`[cache] generation save skipped: ${cacheErr.message}`);
          }
        }

        return json({ choices: [{ message: { content: contentText } }] });

      } catch (err) {
        return json({ error: { message: err.message } }, 500);
      }
    }

    return new Response('OK', { headers: cors });
  },
};
