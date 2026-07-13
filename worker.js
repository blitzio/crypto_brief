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
 *   GEMINI_MODEL    — model name e.g. "gemini-3.5-flash" (update the variable to upgrade)
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
  selectTopNewsItems,
  summarizeNewsSourceHealth,
} from './src/news.js';
import { detectFeedFormat, parseSyndicationFeed } from './src/feed-parser.js';
import { NEWS_SOURCES } from './src/news-sources.js';
import { deriveMarketSignals, percentChange } from './src/market.js';
import {
  deriveCpiTrend,
  deriveRateChange,
  deriveStablecoinChanges,
  deriveYahooChange5d,
} from './src/macro.js';
import {
  buildEvidenceIndex,
  isRetryableGeminiStatus,
  listUnavailableMacroFields,
  normalizeBriefCitationMarkers,
  parseGeminiBriefJson,
  resolveModelFallbacks,
  resolvePipelineVersion,
  validateBriefCitations,
  validateBriefEvidence,
} from './src/gemini.js';
import {
  PDB_V3_RESPONSE_SCHEMA,
  buildPdbV3Prompt,
  validatePdbV3Brief,
} from './src/pdb-v3.js';
export { selectYahooPreviousClose, resolveYahooPct, resolveYahooQuotePct } from './src/yahoo.js';
export {
  buildPromptNewsItems,
  inferAssetMentions,
  sanitizeNewsDescription,
  selectTopNewsItems,
  summarizeNewsSourceHealth,
} from './src/news.js';
export {
  buildEvidenceIndex,
  isRetryableGeminiStatus,
  listUnavailableMacroFields,
  normalizeCitationMarkers,
  parseGeminiBriefJson,
  resolveModelFallbacks,
  resolvePipelineVersion,
  validateBriefCitations,
  validateBriefEvidence,
} from './src/gemini.js';
export { deriveMarketSignals } from './src/market.js';
export {
  calculatePercentageChange,
  deriveCpiTrend,
  deriveRateChange,
  deriveStablecoinChanges,
  deriveYahooChange5d,
  selectNearestPriorPoint,
} from './src/macro.js';

const BRIEF_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

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
      const [quoteResult, chartResult] = await Promise.allSettled([
        fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`, { headers })
          .then(async response => ({ response, data: response.ok ? await response.json() : null })),
        fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`, { headers })
          .then(async response => ({ response, data: response.ok ? await response.json() : null })),
      ]);

      const quoteResponse = quoteResult.status === 'fulfilled' ? quoteResult.value : null;
      const quote = quoteResponse?.data?.quoteResponse?.result?.[0];
      const fromQuote = quoteResponse?.response?.ok ? resolveYahooQuotePct({ quote }) : null;
      const chartResponse = chartResult.status === 'fulfilled' ? chartResult.value : null;
      const chart = chartResponse?.response?.ok ? chartResponse.data?.chart?.result?.[0] : null;
      const rawCloses = chart?.indicators?.quote?.[0]?.close ?? [];
      const rawTimestamps = chart?.timestamp ?? [];

      if (fromQuote) {
        return {
          ...fromQuote,
          change5dPct: deriveYahooChange5d(rawCloses, fromQuote.price),
          source: 'Yahoo Finance',
        };
      }

      const meta = chart?.meta;
      if (!Number.isFinite(meta?.regularMarketPrice)) {
        const quoteStatus = quoteResponse?.response?.status ?? quoteResult.reason?.message ?? 'unavailable';
        const chartStatus = chartResponse?.response?.status ?? chartResult.reason?.message ?? 'unavailable';
        throw new Error(`Yahoo ${symbol} unavailable (quote=${quoteStatus}, chart=${chartStatus})`);
      }
      const price = meta.regularMarketPrice;
      const { pct, pctSource } = resolveYahooPct({ rawCloses, rawTimestamps, meta, price });
      return {
        price,
        pct,
        pctSource,
        change5dPct: deriveYahooChange5d(rawCloses, price),
        source: 'Yahoo Finance',
      };
    };

    const fetchFedRate = async () => {
      const res = await fetch(
        'https://markets.newyorkfed.org/read?productCode=50&eventCodes=500&limit=5&startPosition=0&sort=postDt:-1&format=json',
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) throw new Error(`NY Fed HTTP ${res.status}`);
      const data = await res.json();
      const rates = data?.refRates ?? [];
      const latest = rates[0];
      if (!latest) throw new Error('NY Fed: no rate data');
      const rate = parseFloat(latest.percentRate);
      const trend = deriveRateChange(rates);
      return {
        rate,
        rateStr: Number.isFinite(rate) ? `${rate.toFixed(2)}%` : 'N/A',
        date: latest.effectiveDt,
        ...trend,
        source: 'NY Fed EFFR',
      };
    };

    const fetchCPI = async () => {
      const res = await fetch('https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0', {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`BLS HTTP ${res.status}`);
      const data = await res.json();
      const series = data?.Results?.series?.[0]?.data;
      if (!series?.length) throw new Error('BLS: no CPI data');
      const latest = series.find(item => /^M(?:0[1-9]|1[0-2])$/.test(item.period));
      if (!latest) throw new Error('BLS: no monthly CPI observation');
      const current = parseFloat(latest.value);
      const trend = deriveCpiTrend(series);
      return {
        value: current,
        yoy: Number.isFinite(trend.yoyPct) ? `${trend.yoyPct.toFixed(1)}%` : 'N/A',
        period: `${latest.periodName} ${latest.year}`,
        previousYoyPct: trend.previousYoyPct,
        change: trend.change,
        direction: trend.direction,
        source: 'BLS CPI',
      };
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
      const headers = { Accept: 'application/json' };
      const [currentResult, chartResult] = await Promise.allSettled([
        fetch('https://stablecoins.llama.fi/stablecoins?includePrices=true', { headers }),
        fetch('https://stablecoins.llama.fi/stablecoincharts/all', { headers }),
      ]);
      if (currentResult.status !== 'fulfilled' || !currentResult.value.ok) {
        const status = currentResult.status === 'fulfilled' ? currentResult.value.status : currentResult.reason?.message;
        throw new Error(`DefiLlama HTTP ${status ?? 'unavailable'}`);
      }
      const data = await currentResult.value.json();
      const pegs = data?.peggedAssets ?? [];

      const usdt = pegs.find(p => p.symbol === 'USDT');
      const usdc = pegs.find(p => p.symbol === 'USDC');

      const circulating = (asset) => asset?.circulating?.peggedUSD ?? null;

      const usdtCirc  = circulating(usdt);
      const usdcCirc  = circulating(usdc);
      const totalCirc = Number.isFinite(usdtCirc) && Number.isFinite(usdcCirc) ? usdtCirc + usdcCirc : null;
      let changes = { change7dPct: null, change30dPct: null };
      if (chartResult.status === 'fulfilled' && chartResult.value.ok) {
        const chart = await chartResult.value.json().catch(() => []);
        changes = deriveStablecoinChanges(Array.isArray(chart) ? chart : []);
      }

      return {
        usdt:   usdtCirc  ? `$${(usdtCirc  / 1e9).toFixed(1)}B` : 'N/A',
        usdc:   usdcCirc  ? `$${(usdcCirc  / 1e9).toFixed(1)}B` : 'N/A',
        total:  totalCirc ? `$${(totalCirc / 1e9).toFixed(1)}B` : 'N/A',
        change7dPct: changes.change7dPct,
        change30dPct: changes.change30dPct,
        source: 'DefiLlama Stablecoins',
      };
    };

    // ─────────────────────────────────────────────────────────────────
    // RSS + SNIPPET CONTENT
    // ─────────────────────────────────────────────────────────────────

    async function fetchFeed(source) {
      const controller = new AbortController();
      const startedAt = Date.now();
      const timeout = setTimeout(() => controller.abort(), source.timeoutMs ?? 6500);
      const health = {
        sourceId: source.id,
        source: source.source,
        sourceTier: source.sourceTier,
        ok: false,
        status: null,
        format: source.format,
        durationMs: 0,
        parsedCount: 0,
        freshCount: 0,
        acceptedCount: 0,
        newestPubDate: null,
        error: null,
      };
      try {
        const res = await fetch(source.url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
        });
        health.status = res.status;
        if (!res.ok) {
          health.error = 'http';
          return { items: [], health };
        }

        const xml = await res.text();
        const detectedFormat = detectFeedFormat(xml);
        health.format = detectedFormat === 'unknown' ? source.format : detectedFormat;
        const items = parseSyndicationFeed(xml, source);
        health.parsedCount = items.length;
        health.newestPubDate = items
          .map(item => item.pubDate)
          .filter(Boolean)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
        health.ok = items.length > 0;
        health.error = items.length > 0 ? null : (detectedFormat === 'unknown' ? 'parse' : 'empty');
        return { items, health };
      } catch (error) {
        health.error = error?.name === 'AbortError' ? 'timeout' : 'unknown';
        return { items: [], health };
      } finally {
        clearTimeout(timeout);
        health.durationMs = Date.now() - startedAt;
      }
    }

    function getDescription(item) {
      return item.content || item.description || '';
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
      const unavailFallback = { price: null, pct: null, change5dPct: null, source: 'unavailable' };

      const gold        = settle(goldR,        unavailFallback);
      const sp500       = settle(sp500R,       unavailFallback);
      const usdsgd      = settle(usdsgdR,      unavailFallback);
      const stablecoins = settle(stablecoinsR, { usdt: 'N/A', usdc: 'N/A', total: 'N/A', change7dPct: null, change30dPct: null, source: 'unavailable' });
      const fedRate     = settle(fedRateR,     { rate: null, rateStr: 'UNAVAILABLE', date: null, previousRate: null, change: null, direction: null, source: 'unavailable' });
      const cpi         = settle(cpiR,         { value: null, yoy: 'N/A', period: 'Unavailable', previousYoyPct: null, change: null, direction: null, source: 'unavailable' });
      const sentiment   = settle(sentimentR,   { value: null, classification: 'Unavailable', dir: 'neu', source: 'unavailable' });

      if (sp500?.source === 'unavailable') {
        console.log(`[macro] SP500 unavailable: ${sp500?.error ?? 'unknown'}`);
      } else {
        console.log(`[macro] SP500 ok: source=${sp500?.source} pctSource=${sp500?.pctSource ?? 'none'} price=${sp500?.price ?? 'n/a'} pct=${sp500?.pct ?? 'n/a'}`);
      }

      return { snapshotTime: new Date().toISOString(), fedRate, usdsgd, sp500, gold, stablecoins, cryptoSentiment: sentiment, cpi };
    }

    async function collectNewsItems() {
      const feedResults = await Promise.all(NEWS_SOURCES.map(fetchFeed));
      const now = Date.now();
      const freshItems = [];

      for (const result of feedResults) {
        const freshForSource = result.items.filter(item => {
          const ts = item.pubDate ? new Date(item.pubDate).getTime() : 0;
          if (!ts || Number.isNaN(ts)) return false;
          const maxAgeHours = Number.isFinite(item.maxAgeHours) ? item.maxAgeHours : 72;
          if ((now - ts) > (maxAgeHours * 60 * 60 * 1000)) return false;
          if (item.source === 'Dow Jones Markets' && /market talk|roundup/i.test(item.title)) return false;
          return true;
        });
        result.health.freshCount = freshForSource.length;
        if (result.health.parsedCount > 0 && freshForSource.length === 0) {
          result.health.ok = false;
          result.health.error = 'stale';
        }
        freshItems.push(...freshForSource);
      }

      const selected = selectTopNewsItems(freshItems, 20).map(item => ({
        ...item,
        content: getDescription(item),
      }));
      const acceptedCounts = new Map();
      for (const item of selected) {
        if (item.sourceId) {
          acceptedCounts.set(item.sourceId, (acceptedCounts.get(item.sourceId) ?? 0) + 1);
        }
      }
      for (const result of feedResults) {
        result.health.acceptedCount = acceptedCounts.get(result.health.sourceId) ?? 0;
      }

      return { items: selected, sources: feedResults.map(result => result.health) };
    }

    async function fetchCoinGeckoJson(upstreamUrl, timeoutMs = 8000) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers = {
          Accept: 'application/json',
          'User-Agent': 'crypto-brief/1.0',
        };
        if (env.COINGECKO_DEMO_API_KEY) headers['x-cg-demo-api-key'] = env.COINGECKO_DEMO_API_KEY;
        const response = await fetch(upstreamUrl, {
          signal: controller.signal,
          headers,
        });
        if (!response.ok) throw new Error(`CoinGecko returned HTTP ${response.status}`);
        return await response.json();
      } finally {
        clearTimeout(timeout);
      }
    }

    const marketAssets = [
      { id: 'bitcoin', symbol: 'btc', yahooSymbol: 'BTC-USD', name: 'Bitcoin' },
      { id: 'ethereum', symbol: 'eth', yahooSymbol: 'ETH-USD', name: 'Ethereum' },
      { id: 'chainlink', symbol: 'link', yahooSymbol: 'LINK-USD', name: 'Chainlink' },
    ];

    async function collectCoinGeckoMarketData() {
      const baseUrl = 'https://api.coingecko.com/api/v3';
      const currentPromise = fetchCoinGeckoJson(
        `${baseUrl}/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,chainlink&order=market_cap_desc&per_page=3&page=1&sparkline=false&price_change_percentage=24h,7d`
      );
      const currentItems = await currentPromise;
      if (!Array.isArray(currentItems)) throw new Error('CoinGecko current prices returned an invalid response');
      const prices = Object.fromEntries(currentItems.filter(item => item?.id).map(item => [item.id, item]));
      const missingAssets = marketAssets.filter(asset => {
        const value = prices[asset.id]?.current_price;
        return value === null || value === undefined || value === '' || !Number.isFinite(Number(value));
      });
      if (missingAssets.length) {
        throw new Error(`CoinGecko current prices missing: ${missingAssets.map(asset => asset.id).join(', ')}`);
      }

      const histories = await Promise.all(marketAssets.map(async asset => {
        const [ohlcResult, chartResult] = await Promise.allSettled([
          fetchCoinGeckoJson(`${baseUrl}/coins/${asset.id}/ohlc?vs_currency=usd&days=30`),
          fetchCoinGeckoJson(`${baseUrl}/coins/${asset.id}/market_chart?vs_currency=usd&days=30`),
        ]);
        return {
          ...asset,
          ohlc: ohlcResult.status === 'fulfilled' && Array.isArray(ohlcResult.value) ? ohlcResult.value : [],
          marketChart: chartResult.status === 'fulfilled' && chartResult.value && typeof chartResult.value === 'object'
            ? chartResult.value
            : {},
        };
      }));

      const signalResults = await Promise.all(histories.map(async history => {
        let signal = deriveMarketSignals({
          current: prices[history.id].current_price,
          ohlc: history.ohlc,
          marketChart: history.marketChart,
        });
        let signalProvider = 'coingecko';
        if (signal.unavailableFields.length > 0) {
          try {
            const yahoo = await fetchYahooCryptoAsset(history);
            if (yahoo.signal.unavailableFields.length < signal.unavailableFields.length) {
              signal = yahoo.signal;
              signalProvider = 'yahoo-finance';
            }
          } catch (error) {
            console.log(`[market] Yahoo history fallback unavailable for ${history.symbol}: ${error?.message ?? 'unknown'}`);
          }
        }
        return { symbol: history.symbol, signal, signalProvider };
      }));
      const signals = Object.fromEntries(signalResults.map(result => [result.symbol, result.signal]));
      const signalProviders = Object.fromEntries(signalResults.map(result => [result.symbol, result.signalProvider]));
      const degraded = signalResults.some(result => result.signal.unavailableFields.includes('range30d'));

      return {
        snapshotTime: new Date().toISOString(),
        provider: 'coingecko',
        degraded,
        prices,
        signals,
        signalProviders,
      };
    }

    async function fetchYahooCryptoAsset(asset, timeoutMs = 8000) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.yahooSymbol)}?interval=1d&range=1mo`,
          {
            signal: controller.signal,
            headers: {
              Accept: 'application/json',
              'User-Agent': 'Mozilla/5.0',
              Referer: 'https://finance.yahoo.com/',
            },
          }
        );
        if (!response.ok) throw new Error(`Yahoo Finance ${asset.yahooSymbol} returned HTTP ${response.status}`);
        const data = await response.json();
        const chart = data?.chart?.result?.[0];
        const quote = chart?.indicators?.quote?.[0];
        const timestamps = Array.isArray(chart?.timestamp) ? chart.timestamp : [];
        const closes = Array.isArray(quote?.close) ? quote.close : [];
        const current = Number(chart?.meta?.regularMarketPrice ?? closes.at(-1));
        if (!Number.isFinite(current)) throw new Error(`Yahoo Finance ${asset.yahooSymbol} omitted current price`);

        const ohlc = [];
        const prices = [];
        const totalVolumes = [];
        for (let index = 0; index < timestamps.length; index += 1) {
          const timestamp = Number(timestamps[index]) * 1000;
          const close = Number(closes[index]);
          const open = Number(quote?.open?.[index]);
          const high = Number(quote?.high?.[index]);
          const low = Number(quote?.low?.[index]);
          const volume = Number(quote?.volume?.[index]);
          if (!Number.isFinite(timestamp) || !Number.isFinite(close)) continue;
          prices.push([timestamp, close]);
          if ([open, high, low].every(Number.isFinite)) ohlc.push([timestamp, open, high, low, close]);
          if (Number.isFinite(volume)) totalVolumes.push([timestamp, volume]);
        }

        const previousClose = Number(chart?.meta?.chartPreviousClose);
        const prior7dClose = prices.length >= 8 ? prices.at(-8)[1] : null;
        const price = {
          id: asset.id,
          symbol: asset.symbol,
          name: asset.name,
          current_price: current,
          price_change_percentage_24h: percentChange(current, previousClose),
          price_change_percentage_7d_in_currency: percentChange(current, prior7dClose),
        };
        return {
          asset,
          price,
          signal: deriveMarketSignals({
            current,
            ohlc,
            marketChart: { prices, total_volumes: totalVolumes },
          }),
        };
      } finally {
        clearTimeout(timeout);
      }
    }

    async function collectYahooMarketData() {
      const results = await Promise.all(marketAssets.map(asset => fetchYahooCryptoAsset(asset)));
      return {
        snapshotTime: new Date().toISOString(),
        provider: 'yahoo-finance',
        degraded: true,
        prices: Object.fromEntries(results.map(result => [result.asset.id, result.price])),
        signals: Object.fromEntries(results.map(result => [result.asset.symbol, result.signal])),
        signalProviders: Object.fromEntries(results.map(result => [result.asset.symbol, 'yahoo-finance'])),
      };
    }

    async function collectMarketData() {
      try {
        return await collectCoinGeckoMarketData();
      } catch (primaryError) {
        console.log(`[market] CoinGecko unavailable; using Yahoo Finance fallback: ${primaryError?.message ?? 'unknown'}`);
        try {
          return await collectYahooMarketData();
        } catch (fallbackError) {
          throw new Error(
            `Market providers unavailable (CoinGecko: ${primaryError?.message ?? 'unknown'}; Yahoo Finance: ${fallbackError?.message ?? 'unknown'})`
          );
        }
      }
    }

    // GET /market - current CoinGecko prices plus deterministic 30-day signals
    if (request.method === 'GET' && pathname === '/market') {
      const cache = caches.default;
      const cacheKey = new Request(new URL(request.url).origin + '/market-v1');
      const cached = debugNoCache ? null : await cache.match(cacheKey);
      if (cached) return cached;

      try {
        const marketData = await collectMarketData();
        const response = json(marketData, 200, { 'Cache-Control': 'public, max-age=300' });
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      } catch (error) {
        return json({ error: { message: error?.message ?? 'Market data unavailable' } }, 502, {
          'Cache-Control': 'no-store',
        });
      }
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
      const cacheKey = new Request(new URL(request.url).origin + '/news-rss-v5');
      const cached   = debugNoCache ? null : await cache.match(cacheKey);
      if (cached) return cached;

      const { items } = await collectNewsItems();
      const response = json(items, 200, { 'Cache-Control': 'public, max-age=900' });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }

    // GET /health - read-only source/cache diagnostics, no Gemini call
    if (request.method === 'GET' && pathname === '/health') {
      const cache = caches.default;
      const cacheKey = new Request(new URL(request.url).origin + '/health-v3');
      const cached = debugNoCache ? null : await cache.match(cacheKey);
      if (cached) return cached;

      let marketCheck = { ok: false, provider: null, degraded: true, error: null };
      try {
        const market = await collectMarketData();
        const requiredAssets = ['bitcoin', 'ethereum', 'chainlink'];
        const hasCurrentPrices = requiredAssets.every(id => Number.isFinite(Number(market?.prices?.[id]?.current_price)));
        marketCheck = {
          ok: hasCurrentPrices,
          provider: market?.provider ?? null,
          degraded: Boolean(market?.degraded),
          snapshotTime: market?.snapshotTime ?? null,
          error: hasCurrentPrices ? null : 'missing-current-price',
        };
      } catch (err) {
        marketCheck = { ok: false, provider: null, degraded: true, error: err?.message ?? 'unknown' };
      }

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
        degraded: true,
        count: 0,
        assetMentionCounts: { btc: 0, eth: 0, link: 0, none: 0 },
        avgContentChars: 0,
        sources: [],
        error: null,
      };
      try {
        const { items, sources } = await collectNewsItems();
        const newsSummary = summarizeNewsSourceHealth(items);
        const healthyEditorialSources = sources.filter(source => source.sourceTier === 'editorial' && source.ok).length;
        const failedEditorialSource = sources.some(source => source.sourceTier === 'editorial' && !source.ok);
        const missingAssetCoverage = Object.entries(newsSummary.assetMentionCounts)
          .some(([asset, count]) => asset !== 'none' && count === 0);
        newsCheck = {
          ok: newsSummary.count >= 8,
          degraded: missingAssetCoverage || healthyEditorialSources < 2 || failedEditorialSource,
          ...newsSummary,
          sources,
        };
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
        ok: marketCheck.ok && macroCheck.ok && newsCheck.ok,
        degraded: Boolean(marketCheck.degraded || newsCheck.degraded),
        timestamp: new Date().toISOString(),
        checks: { market: marketCheck, macro: macroCheck, news: newsCheck, briefCache },
      }, 200, { 'Cache-Control': 'public, max-age=60' });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }

    // ─────────────────────────────────────────────────────────────────
    // GET /brief — return cached brief if fresh (< 1 hour old)
    // ─────────────────────────────────────────────────────────────────

    if (request.method === 'GET' && pathname === '/brief') {
      const allowStale = url.searchParams.get('allowStale') === '1';
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
          if (allowStale) {
            console.log(`[cache] /brief stale fallback: serving KV entry (${Math.round(age / 1000)}s old)`);
            return json({ ...cached, cached: true, fresh: false, reason: 'stale' });
          }
          console.log(`[cache] /brief miss: stale entry (${Math.round(age / 1000)}s old)`);
          return json({ cached: false, reason: 'stale' });
        }
        console.log(`[cache] /brief hit: serving KV entry (${Math.round(age / 1000)}s old)`);
        return json({ ...cached, cached: true, fresh: true });
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
        }), { expirationTtl: BRIEF_CACHE_TTL_SECONDS });
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
      const generationStartedAt = Date.now();
      const generationDeadline = generationStartedAt + 90_000;
      const pipelineVersion = resolvePipelineVersion(env);
      let lastAttemptedModel = null;
      let totalAttemptCount = 0;
      try {
        const body     = await request.json();
        const messages = Array.isArray(body.messages) ? body.messages : [];

        const baseSystemText = messages
          .filter(m => m.role === 'system')
          .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
          .join('\n\n');
        const evidenceIndex = buildEvidenceIndex(body.cachePayload || {});
        const pipelineInstruction = pipelineVersion === 'v2'
          ? `EVIDENCE PIPELINE V2: Every btc, eth, link, macro, threats, and watch bullet must include evidenceIds (a non-empty array) and confidence (high, medium, or low). Use only these exact available IDs: ${[...evidenceIndex.keys()].join(', ') || 'none'}. Asset bullets may use only matching news IDs or market IDs for that asset. Macro, threats, and watch may use news or macro IDs. Keep [N] inline in text when using news:N so readers can match the visible source list. Produce 3-5 asset bullets, 3-5 macro bullets, 3-5 threats, and 3-6 watch items; do not add filler when evidence is thin.`
          : 'EVIDENCE PIPELINE V1 ROLLBACK: Use the legacy label/text bullet shape with no required evidenceIds or confidence. Produce 4-6 asset bullets, exactly 5 macro bullets, exactly 5 threats, and exactly 6 watch items. Preserve valid inline [N] news citations and Live market data labels.';
        const v3Prompt = pipelineVersion === 'v3' ? buildPdbV3Prompt(body.cachePayload || {}) : null;
        const systemText = pipelineVersion === 'v3'
          ? v3Prompt.systemInstruction
          : [baseSystemText, pipelineInstruction].filter(Boolean).join('\n\n');

        const contents = pipelineVersion === 'v3'
          ? [{ role: 'user', parts: [{ text: v3Prompt.userPrompt }] }]
          : messages
              .filter(m => m.role !== 'system')
              .map(m => ({
                role:  m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
              }));

        const bulletSchema = {
          type: 'object',
          properties: {
            label: { type: 'string' },
            text: { type: 'string' },
            ...(pipelineVersion === 'v2' ? {
              evidenceIds: { type: 'array', minItems: 1, items: { type: 'string' } },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            } : {}),
          },
          required: pipelineVersion === 'v2'
            ? ['label', 'text', 'evidenceIds', 'confidence']
            : ['label', 'text'],
        };
        const assetBulletRange = pipelineVersion === 'v2' ? { minItems: 3, maxItems: 5 } : { minItems: 4, maxItems: 6 };
        const macroBulletRange = pipelineVersion === 'v2' ? { minItems: 3, maxItems: 5 } : { minItems: 5, maxItems: 5 };
        const threatRange = pipelineVersion === 'v2' ? { minItems: 3, maxItems: 5 } : { minItems: 5, maxItems: 5 };
        const watchRange = pipelineVersion === 'v2' ? { minItems: 3, maxItems: 6 } : { minItems: 6, maxItems: 6 };

        const legacyResponseSchema = {
          type: 'object',
          required: ['btc','eth','link','macro','threats','watch','verdict','ranking','bullTrigger','bearTrigger'],
          properties: {
            btc:   { type: 'object', required: ['support','resist','bullets'], properties: { support: { type: 'string' }, resist: { type: 'string' }, bullets: { type: 'array', ...assetBulletRange, items: bulletSchema } } },
            eth:   { type: 'object', required: ['support','resist','bullets'], properties: { support: { type: 'string' }, resist: { type: 'string' }, bullets: { type: 'array', ...assetBulletRange, items: bulletSchema } } },
            link:  { type: 'object', required: ['support','resist','badge','bullets'], properties: { support: { type: 'string' }, resist: { type: 'string' }, badge: { type: 'string' }, bullets: { type: 'array', ...assetBulletRange, items: bulletSchema } } },
            macro: { type: 'object', required: ['bullets'], properties: { bullets: { type: 'array', ...macroBulletRange, items: bulletSchema } } },
            threats:     { type: 'array', ...threatRange, items: bulletSchema },
            watch:       { type: 'array', ...watchRange, items: bulletSchema },
            verdict:     { type: 'string' },
            ranking:     { type: 'string' },
            bullTrigger: { type: 'string' },
            bearTrigger: { type: 'string' },
          },
        };
        const responseSchema = pipelineVersion === 'v3' ? PDB_V3_RESPONSE_SCHEMA : legacyResponseSchema;

        const payload = {
          contents: contents.length
            ? contents
            : [{ role: 'user', parts: [{ text: 'Generate the brief.' }] }],
          generationConfig: {
            maxOutputTokens:  8192,
            responseMimeType: 'application/json',
            responseJsonSchema: responseSchema,
          },
        };

        if (systemText) {
          payload.systemInstruction = { parts: [{ text: systemText }] };
        }

        let contentText = '{}';
        let parsedBrief = null;
        let validationCheck = { ok: false, violations: [] };
        const validationType = pipelineVersion === 'v3'
          ? 'pdb-v3'
          : pipelineVersion === 'v2' ? 'evidence' : 'citation';
        const models = resolveModelFallbacks(env);
        const defaultThinkingLevel = pipelineVersion === 'v3' ? 'medium' : 'low';
        const configuredThinkingLevel = String(
          pipelineVersion === 'v3'
            ? env.GEMINI_V3_THINKING_LEVEL || defaultThinkingLevel
            : env.GEMINI_THINKING_LEVEL || defaultThinkingLevel
        ).toLowerCase();
        const thinkingLevel = ['minimal', 'low', 'medium', 'high'].includes(configuredThinkingLevel)
          ? configuredThinkingLevel
          : defaultThinkingLevel;
        let selectedModel = models[0] ?? null;
        let attemptCount = 0;

        const responseMeta = (model = selectedModel) => ({
          model,
          attemptCount,
          durationMs: Date.now() - generationStartedAt,
          pipelineVersion,
        });

        const requestGemini = async (candidateModels) => {
          let lastFailure = null;
          for (const model of candidateModels) {
            const remainingMs = generationDeadline - Date.now();
            if (remainingMs <= 0) {
              return {
                ok: false,
                model,
                status: 504,
                data: { error: { message: 'Gemini generation exceeded the 90 second deadline.' } },
              };
            }

            const controller = new AbortController();
            const timeoutMs = Math.min(55_000, remainingMs);
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            const generationConfig = { ...payload.generationConfig };
            if (/^gemini-3(?:[.-]|$)/i.test(model)) {
              generationConfig.thinkingConfig = { thinkingLevel };
            } else {
              generationConfig.temperature = typeof body.temperature === 'number' ? body.temperature : 0.3;
            }
            attemptCount += 1;
            totalAttemptCount = attemptCount;
            lastAttemptedModel = model;

            try {
              const geminiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...payload, generationConfig }),
                  signal: controller.signal,
                }
              );
              const data = await geminiRes.json().catch(() => ({
                error: { message: `Gemini returned HTTP ${geminiRes.status} without a JSON response.` },
              }));
              if (geminiRes.ok) return { ok: true, model, data };

              lastFailure = { ok: false, model, status: geminiRes.status, data };
              if (!isRetryableGeminiStatus(geminiRes.status)) return lastFailure;
            } catch (error) {
              if (error?.name !== 'AbortError') throw error;
              lastFailure = {
                ok: false,
                model,
                status: 504,
                data: { error: { message: `Gemini model ${model} timed out.` } },
              };
            } finally {
              clearTimeout(timeout);
            }
          }
          return lastFailure ?? {
            ok: false,
            model: candidateModels[0] ?? null,
            status: 503,
            data: { error: { message: 'No Gemini model is configured.' } },
          };
        };

        for (let correctionAttempt = 0; correctionAttempt < 2; correctionAttempt++) {
          const candidateModels = correctionAttempt === 0 ? models : [selectedModel];
          const modelResult = await requestGemini(candidateModels.filter(Boolean));
          if (!modelResult.ok) {
            return json({ ...modelResult.data, meta: responseMeta(modelResult.model) }, modelResult.status);
          }
          selectedModel = modelResult.model;
          const data = modelResult.data;

          contentText = (data?.candidates?.[0]?.content?.parts ?? [])
            .map(p => p.text ?? '')
            .join('')
            .trim() || '{}';

          try {
            parsedBrief = normalizeBriefCitationMarkers(parseGeminiBriefJson(contentText));
            contentText = JSON.stringify(parsedBrief);
          } catch (parseErr) {
            validationCheck = {
              ok: false,
              violations: [{ asset: 'json', bulletIndex: -1, reason: 'invalid_json', text: parseErr.message }],
            };
            payload.contents.push(
              { role: 'model', parts: [{ text: contentText }] },
              {
                role: 'user',
                parts: [{
                  text: `The previous response was invalid JSON (${parseErr.message}). Return the full corrected JSON object only, with no markdown and no commentary.`,
                }],
              }
            );
            continue;
          }
          validationCheck = pipelineVersion === 'v3'
            ? validatePdbV3Brief(parsedBrief, evidenceIndex)
            : pipelineVersion === 'v2'
              ? validateBriefEvidence(parsedBrief, evidenceIndex)
              : validateBriefCitations(parsedBrief, body.cachePayload?.newsItems || []);
          if (validationCheck.ok) break;

          const feedback = validationCheck.violations
            .slice(0, 10)
            .map(v => `${String(v.section || v.asset || 'json').toUpperCase()} bullet ${v.bulletIndex + 1}: ${v.reason}${v.evidenceId ? ` (${v.evidenceId})` : ''}${v.docId ? ` on doc [${v.docId}]` : ''}`)
            .join('; ');
          const correctionText = pipelineVersion === 'v3'
            ? `The previous PDB v3 JSON failed validation: ${feedback}. Return the full corrected JSON only, using known evidence IDs and the required analytical depth.`
            : pipelineVersion === 'v2'
              ? `The previous JSON failed evidence validation: ${feedback}. Return the full corrected JSON only. Every bullet must use known evidenceIds from the provided list, matching the asset where applicable, and confidence must be high, medium, or low.`
              : `The previous JSON failed citation validation: ${feedback}. Return the full corrected JSON only. Asset bullets may cite only docs whose ASSET_TAGS include that asset. If no matching source supports an asset point, use exact live market data from the prompt and label it "Live market data:"; cover price action, relative strength, liquidity/volume, and support/resistance. Do not write broad uncited model inference.`;
          payload.contents.push(
            { role: 'model', parts: [{ text: contentText }] },
            { role: 'user', parts: [{ text: correctionText }] }
          );
        }

        if (!validationCheck.ok) {
          const error = pipelineVersion === 'v3'
            ? {
                message: 'Generated PDB v3 brief failed quality validation. The previous valid brief was preserved.',
                qualityViolations: validationCheck.violations,
              }
            : pipelineVersion === 'v2'
              ? {
                  message: 'Generated brief failed evidence validation. Refresh to retry.',
                  evidenceViolations: validationCheck.violations,
                }
              : {
                  message: 'Generated brief failed citation validation. Refresh to retry with stricter source matching.',
                  citationViolations: validationCheck.violations,
                };
          return json({
            error,
            meta: {
              ...responseMeta(),
              validation: { type: validationType, ok: false, violationCount: validationCheck.violations.length },
              ...(pipelineVersion === 'v3' ? { quality: validationCheck.metrics } : {}),
            },
          }, 422);
        }

        const meta = {
          ...responseMeta(),
          validation: { type: validationType, ok: true, violationCount: 0 },
          ...(pipelineVersion === 'v3' ? { quality: validationCheck.metrics } : {}),
        };
        if (env.BRIEF_CACHE && body.cachePayload && typeof body.cachePayload === 'object') {
          try {
            await env.BRIEF_CACHE.put('latest', JSON.stringify({
              ...body.cachePayload,
              newsItems: buildPromptNewsItems(body.cachePayload.newsItems || []),
              brief: parsedBrief,
              generatedAt: new Date().toISOString(),
              meta,
            }), { expirationTtl: BRIEF_CACHE_TTL_SECONDS });
            console.log('[cache] generation saved server-side');
          } catch (cacheErr) {
            console.log(`[cache] generation save skipped: ${cacheErr.message}`);
          }
        }

        return json({ choices: [{ message: { content: contentText } }], meta });

      } catch (err) {
        return json({
          error: { message: err.message },
          meta: {
            model: lastAttemptedModel,
            attemptCount: totalAttemptCount,
            durationMs: Date.now() - generationStartedAt,
            pipelineVersion,
          },
        }, 500);
      }
    }

    return new Response('OK', { headers: cors });
  },
};
