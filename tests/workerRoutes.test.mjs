import assert from 'node:assert/strict';
import worker from '../worker.js';

function makeCache() {
  const store = new Map();
  return {
    async match(request) {
      return store.get(request.url || String(request)) || null;
    },
    async put(request, response) {
      store.set(request.url || String(request), response);
    },
  };
}

function makeKv(initial = null) {
  const calls = [];
  let value = initial;
  return {
    calls,
    async get(key, options = {}) {
      calls.push({ op: 'get', key, options });
      if (options.type === 'json' && typeof value === 'string') return JSON.parse(value);
      return value;
    },
    async put(key, body, options = {}) {
      calls.push({ op: 'put', key, body, options });
      value = body;
    },
  };
}

async function withGlobals(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = globalThis[key];
    globalThis[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      globalThis[key] = value;
    }
  }
}

async function jsonResponse(response) {
  return response.json();
}

function v2CachePayload() {
  return {
    prices: {
      bitcoin: { current_price: 100 },
      ethereum: { current_price: 50 },
      chainlink: { current_price: 10 },
    },
    marketSignals: {
      btc: { rangePosition30d: 0.5 },
      eth: { rangePosition30d: 0.4 },
      link: { rangePosition30d: 0.3 },
    },
    macro: { sp500: { pct: 1.2 } },
    newsItems: [],
  };
}

function validV2Brief() {
  const assetSection = (asset, price) => ({
    support: `$${price - 1}`,
    resist: `$${price + 1}`,
    bullets: Array.from({ length: 3 }, (_, index) => ({
      label: `Market ${index + 1}`,
      text: `Deterministic ${asset.toUpperCase()} market observation.`,
      evidenceIds: [`market:${asset}:${index === 0 ? 'current' : 'rangePosition'}`],
      confidence: index === 2 ? 'medium' : 'high',
    })),
  });
  const supportedItems = (count, prefix) => Array.from({ length: count }, (_, index) => ({
    label: `${prefix} ${index + 1}`,
    text: 'Evidence-backed macro observation.',
    evidenceIds: ['macro:sp500:change1d'],
    confidence: 'medium',
  }));
  return {
    btc: assetSection('btc', 100),
    eth: assetSection('eth', 50),
    link: { ...assetSection('link', 10), badge: 'Neutral' },
    macro: { bullets: supportedItems(3, 'Macro') },
    threats: supportedItems(3, 'Threat'),
    watch: supportedItems(3, 'Watch'),
    verdict: 'A full verdict sentence. A second full verdict sentence.',
    ranking: 'BTC > ETH > LINK because liquidity leads.',
    bullTrigger: 'A break above resistance improves conditions.',
    bearTrigger: 'A break below support weakens conditions.',
  };
}

function validV1Brief() {
  const liveItems = (count, asset) => Array.from({ length: count }, (_, index) => ({
    label: `${asset} ${index + 1}`,
    text: `Live market data: ${asset} price remains above support.`,
  }));
  const plainItems = (count, label) => Array.from({ length: count }, (_, index) => ({
    label: `${label} ${index + 1}`,
    text: 'Legacy compatible observation.',
  }));
  return {
    btc: { support: '$99', resist: '$101', bullets: liveItems(4, 'BTC') },
    eth: { support: '$49', resist: '$51', bullets: liveItems(4, 'ETH') },
    link: { support: '$9', resist: '$11', badge: 'Neutral', bullets: liveItems(4, 'LINK') },
    macro: { bullets: plainItems(5, 'Macro') },
    threats: plainItems(5, 'Threat'),
    watch: plainItems(6, 'Watch'),
    verdict: 'A full verdict sentence. A second full verdict sentence.',
    ranking: 'BTC > ETH > LINK because liquidity leads.',
    bullTrigger: 'A break above resistance improves conditions.',
    bearTrigger: 'A break below support weakens conditions.',
  };
}

function marketHistory(base = 100) {
  const dayMs = 24 * 60 * 60 * 1000;
  const start = Date.UTC(2026, 5, 1);
  const closes = Array.from({ length: 30 }, (_, index) => base * (0.9 + index / 290));
  return {
    ohlc: closes.map((close, index) => [start + index * dayMs, close, close * 1.02, close * 0.98, close]),
    chart: {
      prices: closes.map((close, index) => [start + index * dayMs, close]),
      total_volumes: closes.map((_, index) => [start + index * dayMs, 1_000_000 + index * 10_000]),
    },
  };
}

function yahooCryptoChart(base = 100) {
  const history = marketHistory(base);
  return {
    chart: {
      result: [{
        meta: { regularMarketPrice: base, chartPreviousClose: base * 0.99 },
        timestamp: history.ohlc.map(bar => Math.floor(bar[0] / 1000)),
        indicators: {
          quote: [{
            open: history.ohlc.map(bar => bar[1]),
            high: history.ohlc.map(bar => bar[2]),
            low: history.ohlc.map(bar => bar[3]),
            close: history.ohlc.map(bar => bar[4]),
            volume: history.chart.total_volumes.map(point => point[1]),
          }],
        },
      }],
    },
  };
}

{
  const env = { ALLOWED_ORIGINS: 'https://blitzio.github.io' };
  const response = await worker.fetch(
    new Request('https://worker.test/brief/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief: {} }),
    }),
    env,
    { waitUntil() {} }
  );

  const body = await jsonResponse(response);
  assert.equal(response.status, 403);
  assert.equal(body.ok, false);
  assert.equal(body.reason, 'Unauthorized');
}

{
  const response = await worker.fetch(
    new Request('https://worker.test/version'),
    {
      ALLOWED_ORIGINS: 'https://blitzio.github.io',
      DEPLOY_COMMIT_SHA: 'abc123',
      DEPLOY_SOURCE: 'github-actions',
    },
    { waitUntil() {} }
  );

  const body = await jsonResponse(response);
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.worker, 'crypto-brief-proxy');
  assert.equal(body.commit, 'abc123');
  assert.equal(body.source, 'github-actions');
  assert.equal(typeof body.timestamp, 'string');
}

{
  const response = await worker.fetch(
    new Request('https://worker.test/brief'),
    { ALLOWED_ORIGINS: 'https://blitzio.github.io' },
    { waitUntil() {} }
  );

  const body = await jsonResponse(response);
  assert.equal(response.status, 200);
  assert.equal(body.cached, false);
  assert.equal(body.reason, 'KV not configured');
}

{
  const stale = {
    generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    brief: { btc: { bullets: [] } },
  };
  const env = { ALLOWED_ORIGINS: 'https://blitzio.github.io', BRIEF_CACHE: makeKv(stale) };
  const response = await worker.fetch(
    new Request('https://worker.test/brief'),
    env,
    { waitUntil() {} }
  );

  const body = await jsonResponse(response);
  assert.equal(response.status, 200);
  assert.equal(body.cached, false);
  assert.equal(body.reason, 'stale');

  const staleResponse = await worker.fetch(
    new Request('https://worker.test/brief?allowStale=1'),
    env,
    { waitUntil() {} }
  );
  const staleBody = await jsonResponse(staleResponse);
  assert.equal(staleResponse.status, 200);
  assert.equal(staleBody.cached, true);
  assert.equal(staleBody.fresh, false);
  assert.equal(staleBody.reason, 'stale');
  assert.deepEqual(staleBody.brief, stale.brief);
}

{
  const calls = [];
  await withGlobals({
    fetch: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(validV1Brief()) }] } }] });
    },
  }, async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Generate legacy brief' }], cachePayload: { newsItems: [] } }),
      }),
      {
        ALLOWED_ORIGINS: 'https://blitzio.github.io',
        GEMINI_API_KEY: 'test-key',
        GEMINI_MODEL: 'gemini-3.5-flash',
        GEMINI_FALLBACK_MODEL: 'gemini-3.5-flash',
        BRIEF_PIPELINE_VERSION: 'v1',
      },
      { waitUntil() {} }
    );
    const body = await jsonResponse(response);
    const renderedEnvelope = JSON.parse(body.choices[0].message.content);
    assert.equal(response.status, 200);
    assert.equal(body.meta.pipelineVersion, 'v1');
    assert.equal(body.meta.validation.type, 'citation');
    assert.equal(renderedEnvelope.btc.bullets[0].label, 'BTC 1');
    assert.equal(calls[0].generationConfig.responseJsonSchema.properties.btc.properties.bullets.minItems, 4);
    assert.equal(calls[0].generationConfig.responseJsonSchema.properties.btc.properties.bullets.items.required.includes('evidenceIds'), false);
    assert.match(calls[0].systemInstruction.parts[0].text, /PIPELINE V1 ROLLBACK/);
  });
}

{
  const histories = {
    bitcoin: marketHistory(100),
    ethereum: marketHistory(50),
    chainlink: marketHistory(10),
  };
  const current = [
    { id: 'bitcoin', current_price: 100, price_change_percentage_24h: 1, price_change_percentage_7d_in_currency: 2 },
    { id: 'ethereum', current_price: 50, price_change_percentage_24h: 2, price_change_percentage_7d_in_currency: 3 },
    { id: 'chainlink', current_price: 10, price_change_percentage_24h: 3, price_change_percentage_7d_in_currency: 4 },
  ];
  let fetchCount = 0;
  await withGlobals({
    caches: { default: makeCache() },
    fetch: async (url) => {
      fetchCount += 1;
      const value = String(url);
      if (value.includes('/coins/markets')) return Response.json(current);
      const id = ['bitcoin', 'ethereum', 'chainlink'].find(asset => value.includes(`/coins/${asset}/`));
      if (value.includes('/ohlc')) return Response.json(histories[id].ohlc);
      if (value.includes('/market_chart')) return Response.json(histories[id].chart);
      throw new Error(`unexpected URL ${value}`);
    },
  }, async () => {
    const env = { ALLOWED_ORIGINS: 'https://blitzio.github.io' };
    const ctx = { waitUntil() {} };
    const response = await worker.fetch(new Request('https://worker.test/market'), env, ctx);
    const body = await jsonResponse(response);
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(body.prices).sort(), ['bitcoin', 'chainlink', 'ethereum']);
    assert.deepEqual(Object.keys(body.signals).sort(), ['btc', 'eth', 'link']);
    assert.equal(body.signals.btc.current, 100);

    const firstFetchCount = fetchCount;
    const cachedResponse = await worker.fetch(new Request('https://worker.test/market'), env, ctx);
    assert.equal(cachedResponse.status, 200);
    assert.equal(fetchCount, firstFetchCount, 'second /market request should use edge cache');
  });
}

{
  const histories = { bitcoin: marketHistory(100), ethereum: marketHistory(50), chainlink: marketHistory(10) };
  const current = [
    { id: 'bitcoin', current_price: 100 },
    { id: 'ethereum', current_price: 50 },
    { id: 'chainlink', current_price: 10 },
  ];
  await withGlobals({
    caches: { default: makeCache() },
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('/coins/markets')) return Response.json(current);
      if (value.includes('query1.finance.yahoo.com') && value.includes('ETH-USD')) {
        return Response.json(yahooCryptoChart(50));
      }
      const id = ['bitcoin', 'ethereum', 'chainlink'].find(asset => value.includes(`/coins/${asset}/`));
      if (id === 'ethereum') return new Response('unavailable', { status: 502 });
      if (value.includes('/ohlc')) return Response.json(histories[id].ohlc);
      if (value.includes('/market_chart')) return Response.json(histories[id].chart);
      throw new Error(`unexpected URL ${value}`);
    },
  }, async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/market?nocache=1'),
      { ALLOWED_ORIGINS: 'https://blitzio.github.io' },
      { waitUntil() {} }
    );
    const body = await jsonResponse(response);
    assert.equal(response.status, 200);
    assert.equal(body.prices.ethereum.current_price, 50);
    assert.equal(body.signals.eth.current, 50);
    assert.notEqual(body.signals.eth.range30d, null);
    assert.equal(body.signals.eth.unavailableFields.includes('range30d'), false);
    assert.equal(body.signalProviders.eth, 'yahoo-finance');
  });
}

{
  const histories = { bitcoin: marketHistory(100), ethereum: marketHistory(50), chainlink: marketHistory(10) };
  await withGlobals({
    caches: { default: makeCache() },
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('api.coingecko.com')) return new Response('forbidden', { status: 403 });
      if (value.includes('query1.finance.yahoo.com')) {
        const base = value.includes('BTC-USD') ? 100 : value.includes('ETH-USD') ? 50 : 10;
        return Response.json(yahooCryptoChart(base));
      }
      throw new Error(`unexpected URL ${value}`);
    },
  }, async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/market?nocache=1'),
      { ALLOWED_ORIGINS: 'https://blitzio.github.io' },
      { waitUntil() {} }
    );
    const body = await jsonResponse(response);
    assert.equal(response.status, 200);
    assert.equal(body.provider, 'yahoo-finance');
    assert.equal(body.prices.bitcoin.current_price, 100);
    assert.equal(body.prices.ethereum.current_price, 50);
    assert.equal(body.prices.chainlink.current_price, 10);
    assert.equal(body.signals.btc.current, 100);
    assert.equal(body.degraded, true);
  });
}

{
  const histories = { bitcoin: marketHistory(100), ethereum: marketHistory(50), chainlink: marketHistory(10) };
  await withGlobals({
    caches: { default: makeCache() },
    fetch: async (url) => {
      const value = String(url);
      if (value.includes('/coins/markets')) return new Response('unavailable', { status: 502 });
      const id = ['bitcoin', 'ethereum', 'chainlink'].find(asset => value.includes(`/coins/${asset}/`));
      if (value.includes('/ohlc')) return Response.json(histories[id].ohlc);
      if (value.includes('/market_chart')) return Response.json(histories[id].chart);
      throw new Error(`unexpected URL ${value}`);
    },
  }, async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/market?nocache=1'),
      { ALLOWED_ORIGINS: 'https://blitzio.github.io' },
      { waitUntil() {} }
    );
    const body = await jsonResponse(response);
    assert.equal(response.status, 502);
    assert.match(body.error.message, /CoinGecko returned HTTP 502/);
  });
}

{
  const kv = makeKv();
  const calls = [];
  await withGlobals({
    fetch: async (url, options) => {
      calls.push({ url: String(url), body: JSON.parse(options.body) });
      if (String(url).includes('gemini-3.5-flash')) {
        return Response.json({ error: { message: 'model not found' } }, { status: 404 });
      }
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(validV2Brief()) }] } }] });
    },
  }, async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Generate brief' }], cachePayload: v2CachePayload() }),
      }),
      { ALLOWED_ORIGINS: 'https://blitzio.github.io', GEMINI_API_KEY: 'test-key', BRIEF_CACHE: kv },
      { waitUntil() {} }
    );
    const body = await jsonResponse(response);
    assert.equal(response.status, 200);
    assert.equal(body.meta.model, 'gemini-3.1-flash-lite');
    assert.equal(body.meta.attemptCount, 2);
    assert.equal(body.meta.pipelineVersion, 'v2');
    assert.equal(calls[1].body.generationConfig.maxOutputTokens, 8192);
    assert.equal(calls[1].body.generationConfig.thinkingConfig.thinkingLevel, 'low');
    assert.equal('temperature' in calls[1].body.generationConfig, false);
    assert.equal(calls[1].body.generationConfig.responseJsonSchema.properties.btc.properties.bullets.minItems, 3);
    assert.equal(calls[1].body.generationConfig.responseJsonSchema.properties.watch.minItems, 3);
  });
  const cacheWrite = kv.calls.find(call => call.op === 'put');
  assert.ok(cacheWrite);
  assert.equal(cacheWrite.options.expirationTtl, 7 * 24 * 60 * 60);
  assert.equal(JSON.parse(cacheWrite.body).meta.model, 'gemini-3.1-flash-lite');
}

{
  const kv = makeKv();
  let callCount = 0;
  await withGlobals({
    fetch: async () => {
      callCount += 1;
      return Response.json({ error: { message: 'bad key' } }, { status: 401 });
    },
  }, async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Generate brief' }], cachePayload: { newsItems: [] } }),
      }),
      { ALLOWED_ORIGINS: 'https://blitzio.github.io', GEMINI_API_KEY: 'test-key', BRIEF_CACHE: kv },
      { waitUntil() {} }
    );
    assert.equal(response.status, 401);
  });
  assert.equal(callCount, 1, 'authentication failures must not try another model');
  assert.equal(kv.calls.some(call => call.op === 'put'), false);
}

{
  const kv = makeKv();
  let callCount = 0;
  await withGlobals({
    fetch: async () => {
      callCount += 1;
      if (callCount === 1) throw new DOMException('timed out', 'AbortError');
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(validV2Brief()) }] } }] });
    },
  }, async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Generate brief' }], cachePayload: v2CachePayload() }),
      }),
      { ALLOWED_ORIGINS: 'https://blitzio.github.io', GEMINI_API_KEY: 'test-key', BRIEF_CACHE: kv },
      { waitUntil() {} }
    );
    const body = await jsonResponse(response);
    assert.equal(response.status, 200);
    assert.equal(body.meta.model, 'gemini-3.1-flash-lite');
    assert.equal(body.meta.attemptCount, 2);
  });
}

{
  const kv = makeKv();
  const invalid = validV2Brief();
  invalid.btc.bullets[0].evidenceIds = ['market:btc:unknown'];
  let callCount = 0;
  await withGlobals({
    fetch: async () => {
      callCount += 1;
      const brief = callCount === 1 ? invalid : validV2Brief();
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(brief) }] } }] });
    },
  }, async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Generate brief' }], cachePayload: v2CachePayload() }),
      }),
      { ALLOWED_ORIGINS: 'https://blitzio.github.io', GEMINI_API_KEY: 'test-key', BRIEF_CACHE: kv },
      { waitUntil() {} }
    );
    const body = await jsonResponse(response);
    assert.equal(response.status, 200);
    assert.equal(body.meta.attemptCount, 2);
    assert.equal(body.meta.validation.type, 'evidence');
    assert.equal(body.meta.validation.ok, true);
  });
  assert.equal(callCount, 2);
  assert.equal(kv.calls.some(call => call.op === 'put'), true);
}

{
  const kv = makeKv();
  const invalid = validV2Brief();
  invalid.eth.bullets[0].evidenceIds = ['market:btc:current'];
  let callCount = 0;
  await withGlobals({
    fetch: async () => {
      callCount += 1;
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(invalid) }] } }] });
    },
  }, async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Generate brief' }], cachePayload: v2CachePayload() }),
      }),
      { ALLOWED_ORIGINS: 'https://blitzio.github.io', GEMINI_API_KEY: 'test-key', BRIEF_CACHE: kv },
      { waitUntil() {} }
    );
    const body = await jsonResponse(response);
    assert.equal(response.status, 422);
    assert.equal(body.error.message, 'Generated brief failed evidence validation. Refresh to retry.');
    assert.equal(body.error.evidenceViolations.some(violation => violation.reason === 'cross_asset_evidence'), true);
  });
  assert.equal(callCount, 2);
  assert.equal(kv.calls.some(call => call.op === 'put'), false);
}

{
  const kv = makeKv();
  const fetchCalls = [];
  await withGlobals({
    fetch: async (url) => {
      fetchCalls.push(String(url));
      return Response.json({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                btc: { support: '$1', resist: '$2', bullets: [{ label: 'Live', text: 'Live market data: BTC price is above support.' }] },
                eth: { support: '$1', resist: '$2', bullets: [{ label: 'Wrong Citation', text: 'Ethereum staking rose [1].' }] },
                link: { support: '$1', resist: '$2', badge: 'Neutral', bullets: [{ label: 'Live', text: 'Live market data: LINK price is above support.' }] },
                macro: { bullets: Array.from({ length: 5 }, (_, i) => ({ label: `M${i}`, text: 'Macro synthesis.' })) },
                threats: Array.from({ length: 5 }, (_, i) => ({ label: `T${i}`, text: 'Threat.' })),
                watch: Array.from({ length: 6 }, (_, i) => ({ label: `W${i}`, text: 'Watch.' })),
                verdict: 'A full verdict sentence. A second full verdict sentence.',
                ranking: 'BTC > ETH > LINK because liquidity leads.',
                bullTrigger: 'A break above resistance improves conditions.',
                bearTrigger: 'A break below support weakens conditions.',
              }),
            }],
          },
        }],
      });
    },
  }, async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Generate brief' }],
          cachePayload: {
            prices: {},
            macro: {},
            newsItems: [
              { title: 'Bitcoin ETF options hit milestone', description: 'IBIT options open interest topped Deribit.', source: 'CoinDesk', topic: 'btc' },
            ],
          },
        }),
      }),
      {
        ALLOWED_ORIGINS: 'https://blitzio.github.io',
        GEMINI_API_KEY: 'test-key',
        GEMINI_MODEL: 'gemini-3.5-flash',
        GEMINI_FALLBACK_MODEL: 'gemini-3.5-flash',
        BRIEF_PIPELINE_VERSION: 'v1',
        BRIEF_CACHE: kv,
      },
      { waitUntil() {} }
    );

    const body = await jsonResponse(response);
    assert.equal(response.status, 422);
    assert.equal(body.error.message, 'Generated brief failed citation validation. Refresh to retry with stricter source matching.');
  });

  assert.equal(fetchCalls.length, 2, 'invalid generation should be retried once');
  assert.equal(kv.calls.some(call => call.op === 'put'), false, 'bad citations must not be cached');
}

{
  const kv = makeKv({
    generatedAt: new Date(Date.now() - 30 * 1000).toISOString(),
    brief: { btc: { bullets: [] } },
  });
  const fetchCalls = [];
  const recentPubDate = new Date().toUTCString();
  const pendingWork = [];
  await withGlobals({
    caches: { default: makeCache() },
    fetch: async (url) => {
      fetchCalls.push(String(url));
      if (String(url).includes('/v8/finance/chart/')) {
        return Response.json({
          chart: {
            result: [{
              timestamp: [1, 2, 3, 4, 5, 6],
              meta: { regularMarketPrice: 100, regularMarketPreviousClose: 99 },
              indicators: { quote: [{ close: [90, 92, 94, 96, 98, 100] }] },
            }],
          },
        });
      }
      if (String(url).includes('/v7/finance/quote')) {
        return Response.json({
          quoteResponse: {
            result: [{
              regularMarketPrice: 100,
              regularMarketChangePercent: 1.2,
            }],
          },
        });
      }
      if (String(url).includes('newyorkfed.org')) {
        return Response.json({ refRates: [
          { percentRate: '3.50', effectiveDt: '2026-05-01' },
          { percentRate: '3.75', effectiveDt: '2026-04-30' },
        ] });
      }
      if (String(url).includes('api.bls.gov')) {
        return Response.json({
          Results: {
            series: [{
              data: [
                { year: '2026', period: 'M04', periodName: 'April', value: '320' },
                { year: '2026', period: 'M03', periodName: 'March', value: '315' },
                { year: '2025', period: 'M04', periodName: 'April', value: '310' },
                { year: '2025', period: 'M03', periodName: 'March', value: '308' },
              ],
            }],
          },
        });
      }
      if (String(url).includes('alternative.me')) {
        return Response.json({ data: [{ value: '55', value_classification: 'Neutral' }] });
      }
      if (String(url).includes('stablecoincharts/all')) {
        const nowSeconds = Math.floor(Date.now() / 1000);
        return Response.json([
          { date: nowSeconds - 31 * 86400, totalCirculating: { peggedUSD: 100 } },
          { date: nowSeconds - 30 * 86400, totalCirculating: { peggedUSD: 100 } },
          { date: nowSeconds - 7 * 86400, totalCirculating: { peggedUSD: 110 } },
          { date: nowSeconds, totalCirculating: { peggedUSD: 121 } },
        ]);
      }
      if (String(url).includes('stablecoins?')) {
        return Response.json({
          peggedAssets: [
            { symbol: 'USDT', circulating: { peggedUSD: 100_000_000_000 } },
            { symbol: 'USDC', circulating: { peggedUSD: 50_000_000_000 } },
          ],
        });
      }
      if (String(url).includes('theblock.co')) {
        return new Response('not found', { status: 404 });
      }
      if (String(url).includes('decrypt.co')) {
        return new Response(`<?xml version="1.0"?><rss><channel>
          <item><title>Old Bitcoin story</title><link>https://example.com/old-btc</link><description>BTC old news.</description><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>
        </channel></rss>`, { headers: { 'Content-Type': 'application/xml' } });
      }
      if (String(url).includes('news.google.com') && String(url).includes('Ethereum')) {
        return new Response(`<?xml version="1.0"?><rss><channel>
          <item><title>Ethereum staking demand rises</title><link>https://example.com/eth/staking</link><description>ETH staking flows accelerated.</description><pubDate>${recentPubDate}</pubDate></item>
          <item><title>Ethereum scaling activity expands</title><link>https://example.com/eth/scaling</link><description>Ethereum rollup activity grew.</description><pubDate>${recentPubDate}</pubDate></item>
        </channel></rss>`, { headers: { 'Content-Type': 'application/xml' } });
      }
      if (String(url).includes('news.google.com') && String(url).includes('Chainlink')) {
        return new Response(`<?xml version="1.0"?><rss><channel>
          <item><title>Chainlink CCIP adoption expands</title><link>https://example.com/link/ccip</link><description>LINK oracle usage grew.</description><pubDate>${recentPubDate}</pubDate></item>
          <item><title>Chainlink data services expand</title><link>https://example.com/link/data</link><description>Chainlink integrations increased.</description><pubDate>${recentPubDate}</pubDate></item>
        </channel></rss>`, { headers: { 'Content-Type': 'application/xml' } });
      }
      const feedKey = encodeURIComponent(String(url).slice(0, 80));
      return new Response(`<?xml version="1.0"?><rss><channel>
        <item><title>Bitcoin ETF demand rises ${feedKey}</title><link>https://example.com/${feedKey}/btc</link><description>BTC ETF flows accelerated.</description><pubDate>${recentPubDate}</pubDate></item>
        <item><title>Chainlink CCIP adoption expands ${feedKey}</title><link>https://example.com/${feedKey}/link</link><description>Chainlink oracle usage grew.</description><pubDate>${recentPubDate}</pubDate></item>
      </channel></rss>`, { headers: { 'Content-Type': 'application/xml' } });
    },
  }, async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/health'),
      { ALLOWED_ORIGINS: 'https://blitzio.github.io', BRIEF_CACHE: kv },
      { waitUntil(promise) { pendingWork.push(promise); } }
    );

    const body = await jsonResponse(response);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=60');
    assert.equal(body.ok, true, JSON.stringify(body));
    assert.equal(typeof body.timestamp, 'string');
    assert.equal(body.checks.market.ok, true);
    assert.equal(body.checks.market.provider, 'yahoo-finance');
    assert.equal(body.checks.market.degraded, true);
    assert.equal(body.checks.macro.ok, true);
    assert.deepEqual(body.checks.macro.unavailableFields, []);
    assert.equal(body.checks.news.ok, true);
    assert.equal(body.checks.news.count > 0, true);
    assert.equal(body.checks.news.assetMentionCounts.btc > 0, true);
    assert.equal(body.checks.news.assetMentionCounts.link > 0, true);
    assert.equal(body.checks.news.avgContentChars > 0, true);
    assert.equal(body.checks.news.degraded, true);
    assert.equal(Array.isArray(body.checks.news.sources), true);
    assert.equal(
      body.checks.news.sources.some(source => source.sourceId === 'the-block' && source.status === 404 && source.error === 'http'),
      true
    );
    assert.equal(
      body.checks.news.sources.some(source => source.sourceId === 'decrypt' && source.parsedCount > 0 && source.freshCount === 0 && source.error === 'stale'),
      true
    );
    assert.equal(body.checks.briefCache.cached, true);
    assert.equal(typeof body.checks.briefCache.ageSeconds, 'number');

    const macroResponse = await worker.fetch(
      new Request('https://worker.test/macro?nocache=1'),
      { ALLOWED_ORIGINS: 'https://blitzio.github.io' },
      { waitUntil(promise) { pendingWork.push(promise); } }
    );
    const macroBody = await jsonResponse(macroResponse);
    assert.equal(macroBody.sp500.change5dPct, 11.111111111111);
    assert.equal(macroBody.fedRate.change, -0.25);
    assert.equal(macroBody.fedRate.direction, 'falling');
    assert.equal(macroBody.cpi.direction, 'rising');
    assert.equal(macroBody.stablecoins.change7dPct, 10);
    assert.equal(macroBody.stablecoins.change30dPct, 21);

    await Promise.all(pendingWork);
    const newsResponse = await worker.fetch(
      new Request('https://worker.test/news?nocache=1'),
      { ALLOWED_ORIGINS: 'https://blitzio.github.io', BRIEF_CACHE: kv },
      { waitUntil(promise) { pendingWork.push(promise); } }
    );
    assert.equal(newsResponse.status, 200);
    assert.equal(Array.isArray(await jsonResponse(newsResponse)), true, '/news must preserve its array response');

    const fetchCountAfterFirstHealth = fetchCalls.length;
    const cachedResponse = await worker.fetch(
      new Request('https://worker.test/health'),
      { ALLOWED_ORIGINS: 'https://blitzio.github.io', BRIEF_CACHE: kv },
      { waitUntil(promise) { pendingWork.push(promise); } }
    );
    assert.equal(cachedResponse.status, 200);
    assert.equal(fetchCalls.length, fetchCountAfterFirstHealth, '/health should serve the second request from cache');
  });

  assert.equal(fetchCalls.some(url => url.includes('generativelanguage.googleapis.com')), false, '/health must not call Gemini');
}

console.log('worker route tests passed');
