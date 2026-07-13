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

function validBrief() {
  const liveBullet = asset => ({ label: 'Live', text: `Live market data: ${asset} price is above support.` });
  return {
    btc: { support: '$1', resist: '$2', bullets: [liveBullet('BTC')] },
    eth: { support: '$1', resist: '$2', bullets: [liveBullet('ETH')] },
    link: { support: '$1', resist: '$2', badge: 'Neutral', bullets: [liveBullet('LINK')] },
    macro: { bullets: Array.from({ length: 5 }, (_, i) => ({ label: `M${i}`, text: 'Macro synthesis.' })) },
    threats: Array.from({ length: 5 }, (_, i) => ({ label: `T${i}`, text: 'Threat.' })),
    watch: Array.from({ length: 6 }, (_, i) => ({ label: `W${i}`, text: 'Watch.' })),
    verdict: 'A full verdict sentence. A second full verdict sentence.',
    ranking: 'BTC > ETH > LINK because liquidity leads.',
    bullTrigger: 'A break above resistance improves conditions.',
    bearTrigger: 'A break below support weakens conditions.',
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
  const kv = makeKv();
  const calls = [];
  await withGlobals({
    fetch: async (url, options) => {
      calls.push({ url: String(url), body: JSON.parse(options.body) });
      if (String(url).includes('gemini-3.5-flash')) {
        return Response.json({ error: { message: 'model not found' } }, { status: 404 });
      }
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(validBrief()) }] } }] });
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
    const body = await jsonResponse(response);
    assert.equal(response.status, 200);
    assert.equal(body.meta.model, 'gemini-3.1-flash-lite');
    assert.equal(body.meta.attemptCount, 2);
    assert.equal(body.meta.pipelineVersion, 'v2');
    assert.equal(calls[1].body.generationConfig.maxOutputTokens, 8192);
    assert.equal(calls[1].body.generationConfig.thinkingConfig.thinkingLevel, 'low');
    assert.equal('temperature' in calls[1].body.generationConfig, false);
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
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(validBrief()) }] } }] });
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
    const body = await jsonResponse(response);
    assert.equal(response.status, 200);
    assert.equal(body.meta.model, 'gemini-3.1-flash-lite');
    assert.equal(body.meta.attemptCount, 2);
  });
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
        GEMINI_MODEL: 'gemini-3-flash-preview',
        GEMINI_FALLBACK_MODEL: 'gemini-3-flash-preview',
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
      if (String(url).includes('query1.finance.yahoo.com')) {
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
        return Response.json({ refRates: [{ percentRate: '3.50', effectiveDt: '2026-05-01' }] });
      }
      if (String(url).includes('api.bls.gov')) {
        return Response.json({
          Results: {
            series: [{
              data: [
                { year: '2026', period: 'M04', periodName: 'April', value: '320' },
                { year: '2025', period: 'M04', periodName: 'April', value: '310' },
              ],
            }],
          },
        });
      }
      if (String(url).includes('alternative.me')) {
        return Response.json({ data: [{ value: '55', value_classification: 'Neutral' }] });
      }
      if (String(url).includes('stablecoins.llama.fi')) {
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
      const feedKey = encodeURIComponent(String(url).slice(0, 80));
      if (String(url).includes('blockworks.co')) {
        return new Response(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
          <entry><title>Bitcoin ETF demand rises ${feedKey}</title><link rel="alternate" href="https://example.com/${feedKey}/btc"/><summary>BTC ETF flows accelerated.</summary><published>${new Date().toISOString()}</published></entry>
          <entry><title>Chainlink CCIP adoption expands ${feedKey}</title><link rel="alternate" href="https://example.com/${feedKey}/link"/><summary>Chainlink oracle usage grew.</summary><published>${new Date().toISOString()}</published></entry>
        </feed>`, { headers: { 'Content-Type': 'application/atom+xml' } });
      }
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
    assert.equal(body.ok, true);
    assert.equal(typeof body.timestamp, 'string');
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
      body.checks.news.sources.some(source => source.sourceId === 'blockworks' && source.format === 'atom' && source.acceptedCount > 0),
      true
    );
    assert.equal(
      body.checks.news.sources.some(source => source.sourceId === 'the-block' && source.status === 404 && source.error === 'http'),
      true
    );
    assert.equal(body.checks.briefCache.cached, true);
    assert.equal(typeof body.checks.briefCache.ageSeconds, 'number');

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
