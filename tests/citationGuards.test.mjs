import assert from 'node:assert/strict';
import {
  buildPromptNewsItems,
  canonicalNewsUrl,
  inferAssetMentions,
  normalizedHeadlineKey,
  selectTopNewsItems,
  sanitizeNewsDescription,
  summarizeNewsSourceHealth,
} from '../src/news.js';
import {
  isRetryableGeminiStatus,
  parseGeminiBriefJson,
  normalizeCitationMarkers,
  resolveModelFallbacks,
  resolvePipelineVersion,
  validateBriefCitations,
} from '../src/gemini.js';

{
  assert.equal(
    canonicalNewsUrl('https://example.com/story?utm_source=rss&utm_medium=feed&id=7#section'),
    'https://example.com/story?id=7'
  );
  assert.equal(
    normalizedHeadlineKey('Bitcoin ETF Demand Rises - CoinDesk'),
    'bitcoin etf demand rises'
  );
}

{
  const now = Date.now();
  const selected = selectTopNewsItems([
    ...Array.from({ length: 7 }, (_, i) => ({
      title: `Bitcoin institutional item ${i}`,
      url: `https://coindesk.com/${i}?utm_source=rss`,
      description: 'Bitcoin BTC institutional demand increased.',
      pubDate: new Date(now - i * 1000).toUTCString(),
      source: 'CoinDesk',
      sourceId: 'coindesk',
      sourceTier: 'editorial',
      topic: 'general',
    })),
    ...Array.from({ length: 6 }, (_, i) => ({
      title: `Macro item ${i}`,
      url: `https://macro.example/${i}`,
      description: 'Stocks and rates moved.',
      pubDate: new Date(now - i * 1000).toUTCString(),
      source: `Macro ${i % 2}`,
      sourceId: `macro-${i % 2}`,
      sourceTier: 'macro',
      topic: 'macro',
    })),
  ], 20);

  assert.equal(selected.filter(item => item.sourceId === 'coindesk').length, 4);
  assert.equal(selected.filter(item => item.assetMentions.length === 0).length, 5);
}

{
  const now = Date.now();
  const selected = selectTopNewsItems([
    {
      title: 'Ethereum staking demand rises - Aggregator',
      url: 'https://aggregator.example/eth-story',
      description: 'Ethereum ETH staking demand increased.',
      pubDate: new Date(now).toUTCString(),
      source: 'Google News ETH',
      sourceId: 'google-news-eth',
      sourceTier: 'discovery',
      topic: 'eth',
    },
    {
      title: 'Ethereum staking demand rises - Direct Publisher',
      url: 'https://publisher.example/eth-story?utm_source=rss',
      description: 'Ethereum ETH staking demand increased.',
      pubDate: new Date(now - 60_000).toUTCString(),
      source: 'Direct Publisher',
      sourceId: 'direct-publisher',
      sourceTier: 'editorial',
      topic: 'general',
    },
    {
      title: 'Bitcoin ETF demand rises',
      url: 'https://publisher.example/btc?utm_source=rss',
      description: 'Bitcoin BTC ETF demand increased.',
      pubDate: new Date(now - 120_000).toUTCString(),
      source: 'Direct Publisher',
      sourceId: 'direct-publisher',
      sourceTier: 'editorial',
      topic: 'general',
    },
    {
      title: 'Bitcoin ETF demand rises',
      url: 'https://publisher.example/btc?utm_medium=feed',
      description: 'Bitcoin BTC ETF demand increased.',
      pubDate: new Date(now - 180_000).toUTCString(),
      source: 'Direct Publisher',
      sourceId: 'direct-publisher',
      sourceTier: 'editorial',
      topic: 'general',
    },
  ], 20);

  assert.equal(selected.some(item => item.sourceTier === 'editorial' && item.assetMentions.includes('eth')), true);
  assert.equal(selected.some(item => item.sourceTier === 'discovery' && item.assetMentions.includes('eth')), false);
  assert.equal(selected.filter(item => item.title === 'Bitcoin ETF demand rises').length, 1);
}

{
  assert.equal(
    sanitizeNewsDescription('<a href="https://news.google.com/rss/articles/abc" target="_blank">Amazon Web Services Marketplace Adds Chainlink Crypto Oracle Services - Decrypt</a>&nbsp;&nbsp;<font color="#6f6f6f">Decrypt</font>'),
    'Amazon Web Services Marketplace Adds Chainlink Crypto Oracle Services - Decrypt Decrypt'
  );
  assert.equal(
    sanitizeNewsDescription('&lt;a href=&quot;https://news.google.com/rss/articles/abc&quot; target=&quot;_blank&quot;&gt;Deloitte Gives Chainlink Top Security Certification - Bitget&lt;/a&gt;'),
    'Deloitte Gives Chainlink Top Security Certification - Bitget'
  );
  assert.equal(
    sanitizeNewsDescription('<font color="#6f6f6f">CoinDesk</font>&nbsp;&nbsp;<a href="https://news.google.com/rss/articles/abc">Bitcoin ETF demand rises</a>'),
    'CoinDesk Bitcoin ETF demand rises'
  );
}

{
  const selected = selectTopNewsItems([
    { title: 'Generic macro story', description: 'Stocks and oil moved.', pubDate: 'Sun, 26 Apr 2026 10:00:00 GMT', source: 'Macro', topic: 'macro' },
    { title: 'Ethereum staking demand rises', description: 'ETH staking inflows increased across liquid staking protocols.', pubDate: 'Sun, 26 Apr 2026 09:00:00 GMT', source: 'ETH Search', topic: 'eth' },
    { title: 'Chainlink CCIP adoption expands', description: 'Chainlink oracle infrastructure usage grew across tokenization pilots.', pubDate: 'Sun, 26 Apr 2026 08:00:00 GMT', source: 'LINK Search', topic: 'link' },
    { title: 'Bitcoin ETF options hit milestone', description: 'IBIT options open interest topped Deribit.', pubDate: 'Sun, 26 Apr 2026 07:00:00 GMT', source: 'BTC Search', topic: 'btc' },
    { title: 'Bitcoin liquidity moves to Monad', description: 'cbBTC liquidity expanded through a new bridge.', pubDate: 'Sun, 26 Apr 2026 06:00:00 GMT', source: 'Google News LINK', topic: 'link' },
    { title: 'AI agents get a coding plugin', description: 'The story discusses developer tooling without naming any tracked asset.', pubDate: 'Sun, 26 Apr 2026 05:00:00 GMT', source: 'Decrypt', topic: 'eth' },
  ], 3);

  assert.ok(selected.some(item => item.assetMentions.includes('eth')), 'ETH item should survive source selection');
  assert.ok(selected.some(item => item.assetMentions.includes('link')), 'LINK item should survive source selection');
  assert.ok(!selected.some(item => item.title.includes('Monad')), 'mismatched LINK-feed BTC item should be dropped');
  assert.ok(!selected.some(item => item.title.includes('coding plugin')), 'mismatched ETH-feed generic item should be dropped');
}

{
  assert.deepEqual(resolveModelFallbacks({}), ['gemini-3.5-flash', 'gemini-3.1-flash-lite']);
  assert.deepEqual(
    resolveModelFallbacks({ GEMINI_MODEL: 'custom-model', GEMINI_FALLBACK_MODEL: 'fallback-model' }),
    ['custom-model', 'fallback-model']
  );
  assert.equal(isRetryableGeminiStatus(404), true);
  assert.equal(isRetryableGeminiStatus(429), true);
  assert.equal(isRetryableGeminiStatus(503), true);
  assert.equal(isRetryableGeminiStatus(400), false);
  assert.equal(isRetryableGeminiStatus(401), false);
  assert.equal(resolvePipelineVersion({}), 'v2');
  assert.equal(resolvePipelineVersion({ BRIEF_PIPELINE_VERSION: 'v1' }), 'v1');
  assert.equal(resolvePipelineVersion({ BRIEF_PIPELINE_VERSION: 'unexpected' }), 'v2');
}

{
  assert.equal(
    normalizeCitationMarkers('IBIT options topped Deribit (Doc 8), while recovery uses Document 15.'),
    'IBIT options topped Deribit [8], while recovery uses [15].'
  );
}

{
  const brief = parseGeminiBriefJson('```json\n{"btc":{"bullets":[]},"eth":{"bullets":[]},"link":{"bullets":[]},}\n```');

  assert.deepEqual(brief.btc.bullets, []);
}

{
  const item = {
    title: 'Litecoin rewrites three hours of history',
    description: 'Attackers attempted double-spends against cross-chain swap protocols.',
    source: 'The Block',
    topic: 'eth',
  };

  assert.deepEqual(inferAssetMentions(item), [], 'feed topic must not create an ETH mention');
}

{
  const item = {
    title: 'Aave asks Arbitrum DAO to release frozen ETH',
    description: 'The recovery effort concerns rsETH users and governance timing.',
    source: 'The Block',
    topic: 'eth',
  };

  assert.deepEqual(inferAssetMentions(item), ['eth'], 'explicit ETH text should create an ETH mention');
}

{
  const items = [
    { title: 'Bitcoin ETF options hit milestone', description: 'IBIT options open interest topped Deribit.', source: 'CoinDesk', topic: 'general' },
    { title: 'Aave asks Arbitrum DAO to release frozen ETH', description: 'The recovery effort concerns rsETH users.', source: 'The Block', topic: 'eth' },
    { title: 'Crypto is built for AI agents', description: 'Alchemy says agent commerce will operate natively in crypto.', source: 'CoinDesk', topic: 'general' },
  ];

  const promptItems = buildPromptNewsItems(items);

  assert.deepEqual(promptItems[0].assetMentions, ['btc']);
  assert.deepEqual(promptItems[1].assetMentions, ['eth']);
  assert.deepEqual(promptItems[2].assetMentions, []);
}

{
  const newsItems = buildPromptNewsItems([
    { title: 'Bitcoin ETF options hit milestone', description: 'IBIT options open interest topped Deribit.', source: 'CoinDesk', topic: 'general' },
    { title: 'Aave asks Arbitrum DAO to release frozen ETH', description: 'The recovery effort concerns rsETH users.', source: 'The Block', topic: 'eth' },
  ]);
  const brief = {
    btc: { bullets: [{ label: 'ETF', text: 'IBIT options open interest topped Deribit [1].' }] },
    eth: { bullets: [{ label: 'Wrong Citation', text: 'Regulated derivatives growth supports Ethereum exposure [1].' }] },
    link: { bullets: [{ label: 'Live Volume', text: 'Live market data: LINK volume is below BTC and ETH, signaling thinner liquidity.' }] },
  };

  const result = validateBriefCitations(brief, newsItems);

  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].asset, 'eth');
  assert.equal(result.violations[0].docId, 1);
}

{
  const result = validateBriefCitations({
    btc: { bullets: [{ label: 'Live Volume', text: 'Live market data: BTC liquidity remains sensitive to 24h volume changes.' }] },
    eth: { bullets: [{ label: 'Unbacked', text: 'Ethereum liquidity remains sensitive to macro risk.' }] },
    link: { bullets: [] },
  }, []);

  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].asset, 'eth');
  assert.equal(result.violations[0].reason, 'missing_citation_or_live_data');
}

{
  const result = validateBriefCitations({
    btc: { bullets: [] },
    eth: { bullets: [
      { label: 'Relative Strength', text: 'Live market data: ETH is up 0.62% over 24h while down 0.18% over 7d, showing short-term bounce inside weak weekly momentum.' },
      { label: 'Liquidity', text: 'Live market data: ETH volume is $6.9B against $281.1B market cap, giving enough liquidity for positioning but not a breakout signal.' },
      { label: 'Invalidation', text: 'Live market data: A break below $2,200 would invalidate the current consolidation range.' },
      { label: 'Valuation', text: 'Live market data: ETH is priced at $2,329 with a $281.1B market cap.' },
    ] },
    link: { bullets: [] },
  }, []);

  assert.equal(result.ok, true);
}

{
  const result = validateBriefCitations({
    btc: { bullets: [] },
    eth: { bullets: [{ label: 'Filler', text: 'Model inference: ETH lacks a clear institutional narrative versus BTC.' }] },
    link: { bullets: [] },
  }, []);

  assert.equal(result.ok, false);
  assert.equal(result.violations[0].reason, 'unsupported_model_inference');
}

{
  const newsItems = buildPromptNewsItems([
    { title: 'Chainlink CCIP adoption expands', description: 'Chainlink infrastructure usage grew across DeFi.', source: 'Example', topic: 'general' },
  ]);
  const brief = {
    btc: { bullets: [] },
    eth: { bullets: [] },
    link: { bullets: [{ label: 'CCIP', text: 'Chainlink CCIP adoption expanded [1].' }] },
  };

  const result = validateBriefCitations(brief, newsItems);

  assert.equal(result.ok, true);
}

{
  const result = validateBriefCitations({
    btc: { bullets: [] },
    eth: { bullets: [] },
    link: { bullets: [
      { label: 'Price Action', text: 'Live market data: LINK is trading near support while liquidity remains thinner than BTC and ETH.' },
      { label: 'Invalidation', text: 'Live market data: A break below LINK support would weaken the current setup.' },
    ] },
  }, []);

  assert.equal(result.ok, true, 'LINK should be allowed to use explicit live-market fallback bullets when source coverage is zero');
}

{
  const newsItems = buildPromptNewsItems([
    { title: 'Bitcoin ETF options hit milestone', description: 'IBIT options open interest topped Deribit.', source: 'CoinDesk', topic: 'btc' },
  ]);
  const brief = {
    btc: { bullets: [] },
    eth: { bullets: [] },
    link: { bullets: [{ label: 'Wrong Citation', text: 'Chainlink adoption expanded [1].' }] },
  };

  const result = validateBriefCitations(brief, newsItems);

  assert.equal(result.ok, false);
  assert.equal(result.violations[0].asset, 'link');
  assert.equal(result.violations[0].reason, 'asset_not_mentioned');
}

{
  const summary = summarizeNewsSourceHealth(buildPromptNewsItems([
    { title: 'Bitcoin ETF demand rises', description: 'BTC ETF flows accelerated.', source: 'CoinDesk', topic: 'btc' },
    { title: 'Chainlink CCIP adoption expands', description: 'Chainlink oracle usage grew.', source: 'Example', topic: 'link' },
    { title: 'Macro liquidity shifts', description: 'Stocks and gold diverged.', source: 'Macro', topic: 'macro' },
  ]));

  assert.deepEqual(summary.assetMentionCounts, { btc: 1, eth: 0, link: 1, none: 1 });
  assert.equal(summary.count, 3);
  assert.equal(summary.avgContentChars > 0, true);
}

{
  const newsItems = buildPromptNewsItems([
    { title: 'Bitcoin ETF options hit milestone', description: 'IBIT options open interest topped Deribit.', source: 'CoinDesk', topic: 'general' },
  ]);
  const brief = {
    btc: { bullets: [{ label: 'ETF', text: 'IBIT options open interest topped Deribit (Doc 1).' }] },
    eth: { bullets: [] },
    link: { bullets: [] },
  };

  const result = validateBriefCitations(brief, newsItems);

  assert.equal(result.ok, true);
}

console.log('citation guard tests passed');
