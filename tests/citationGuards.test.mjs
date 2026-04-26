import assert from 'node:assert/strict';
import {
  buildPromptNewsItems,
  inferAssetMentions,
  parseGeminiBriefJson,
  normalizeCitationMarkers,
  validateBriefCitations,
} from '../worker.js';

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
    link: { bullets: [{ label: 'Inference', text: 'Model inference: LINK may benefit from oracle demand.' }] },
  };

  const result = validateBriefCitations(brief, newsItems);

  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].asset, 'eth');
  assert.equal(result.violations[0].docId, 1);
}

{
  const result = validateBriefCitations({
    btc: { bullets: [{ label: 'Unbacked', text: 'Model inference: BTC liquidity remains sensitive to macro risk.' }] },
    eth: { bullets: [{ label: 'Unbacked', text: 'Ethereum liquidity remains sensitive to macro risk.' }] },
    link: { bullets: [] },
  }, []);

  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].asset, 'eth');
  assert.equal(result.violations[0].reason, 'missing_citation');
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
