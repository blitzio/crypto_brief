import assert from 'node:assert/strict';
import {
  PDB_V3_RESPONSE_SCHEMA,
  buildPdbV3Prompt,
  countBriefWords,
  measurePdbV3Depth,
  validatePdbV3Brief,
  validatePdbV3Evidence,
  validatePdbV3StructureAndDepth,
} from '../src/pdb-v3.js';

const prose = (count, prefix = 'analysis') =>
  Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(' ');

export function makeValidV3Brief() {
  const judgment = index => ({
    title: `Judgment ${index}`,
    assessment: prose(66, 'assessment'),
    whyItMatters: prose(18, 'implication'),
    evidenceIds: ['market:btc:current', 'market:btc:rangePosition'],
    confidence: 'medium',
    confidenceBasis: prose(12, 'basis'),
    invalidators: [prose(9, 'invalidator')],
  });
  const driver = (asset, index) => ({
    title: `Driver ${index}`,
    analysis: prose(42, `${asset}driver`),
    evidenceIds: [`market:${asset}:current`, `market:${asset}:rangePosition`],
    confidence: 'medium',
  });
  const asset = (symbol, support, resistance) => ({
    assessment: prose(72, `${symbol}assessment`),
    support,
    resistance,
    evidenceIds: [`market:${symbol}:current`, `market:${symbol}:rangePosition`],
    confidence: 'medium',
    confidenceBasis: prose(12, 'basis'),
    drivers: [1, 2, 3].map(index => driver(symbol, index)),
    confirmation: prose(18, 'confirmation'),
    invalidation: prose(18, 'invalidation'),
  });
  const scenario = likelihood => ({
    outlook: prose(28, 'outlook'),
    causalPath: prose(24, 'causal'),
    triggers: [prose(12, 'trigger')],
    horizon: 'next 1-7 days',
    likelihood,
    evidenceIds: ['macro:sp500:change1d', 'macro:sentiment:current'],
    confidence: 'medium',
  });
  const risk = title => ({
    title,
    assessment: prose(33, 'risk'),
    impact: 'high',
    likelihood: 'credible',
    horizon: 'next 7 days',
    indicator: prose(13, 'indicator'),
    evidenceIds: ['macro:sp500:change1d'],
    confidence: 'medium',
  });
  const watch = title => ({
    title,
    whyItMatters: prose(18, 'watch'),
    signal: prose(10, 'signal'),
    evidenceIds: ['macro:sp500:change1d'],
    confidence: 'medium',
  });

  return {
    briefVersion: 'v3',
    executive: {
      bottomLine: prose(112, 'bottom'),
      evidenceIds: ['market:btc:current', 'macro:sp500:change1d'],
      confidence: 'medium',
      confidenceBasis: prose(14, 'basis'),
      keyJudgments: [1, 2, 3, 4].map(judgment),
    },
    assets: {
      btc: asset('btc', '$95', '$105'),
      eth: asset('eth', '$45', '$55'),
      link: asset('link', '$9', '$11'),
    },
    macro: {
      assessment: prose(92, 'macro'),
      evidenceIds: ['macro:sp500:change1d', 'macro:sentiment:current'],
      confidence: 'medium',
      confidenceBasis: prose(12, 'basis'),
      transmissionChannels: [1, 2, 3].map(index => ({
        title: `Channel ${index}`,
        analysis: prose(38, 'channel'),
        evidenceIds: ['macro:sp500:change1d', 'macro:sentiment:current'],
        confidence: 'medium',
      })),
    },
    scenarios: {
      base: scenario('most likely'),
      bullish: scenario('credible'),
      bearish: scenario('lower probability'),
    },
    threats: [risk('Threat one'), risk('Threat two')],
    opportunities: [risk('Opportunity one'), risk('Opportunity two')],
    watch: {
      next24Hours: [watch('Watch 24A'), watch('Watch 24B'), watch('Watch 24C')],
      next7Days: [watch('Watch 7A'), watch('Watch 7B'), watch('Watch 7C')],
    },
    intelligenceGaps: [1, 2].map(index => ({
      title: `Gap ${index}`,
      gap: prose(16, 'gap'),
      whyItMatters: prose(12, 'meaning'),
      closureEvidence: prose(12, 'closure'),
      evidenceIds: ['macro:sp500:change1d'],
      confidence: 'low',
    })),
  };
}

const valid = makeValidV3Brief();
assert.equal(PDB_V3_RESPONSE_SCHEMA.properties.briefVersion.enum[0], 'v3');
assert.equal(validatePdbV3StructureAndDepth(valid).ok, true);
assert.equal(countBriefWords(valid), measurePdbV3Depth(valid).totalWords);

const thin = structuredClone(valid);
thin.executive.bottomLine = 'Markets are mixed.';
const thinResult = validatePdbV3StructureAndDepth(thin);
assert.equal(thinResult.ok, false);
assert.equal(
  thinResult.violations.some(violation =>
    violation.reason === 'section_too_thin' && violation.path === 'executive.bottomLine'
  ),
  true
);

const missing = structuredClone(valid);
delete missing.scenarios.bearish;
assert.equal(
  validatePdbV3StructureAndDepth(missing).violations.some(violation => violation.reason === 'missing_section'),
  true
);

const shortOverall = structuredClone(valid);
shortOverall.assets.btc.assessment = prose(2);
shortOverall.assets.eth.assessment = prose(2);
shortOverall.assets.link.assessment = prose(2);
assert.equal(validatePdbV3StructureAndDepth(shortOverall).ok, false);

const perItemDepthCases = [
  {
    path: 'assets.btc.drivers.0.analysis',
    mutate: brief => { brief.assets.btc.drivers[0].analysis = ''; },
  },
  {
    path: 'macro.transmissionChannels.0.analysis',
    mutate: brief => { brief.macro.transmissionChannels[0].analysis = 'Thin.'; },
  },
  {
    path: 'scenarios.base',
    mutate: brief => {
      brief.scenarios.base.outlook = 'Thin.';
      brief.scenarios.base.causalPath = 'Thin.';
      brief.scenarios.base.triggers = ['Thin.'];
    },
  },
  {
    path: 'threats.0',
    mutate: brief => {
      brief.threats[0].assessment = 'Thin.';
      brief.threats[0].indicator = 'Thin.';
    },
  },
  {
    path: 'watch.next24Hours.0',
    mutate: brief => {
      brief.watch.next24Hours[0].whyItMatters = 'Thin.';
      brief.watch.next24Hours[0].signal = 'Thin.';
    },
  },
  {
    path: 'intelligenceGaps.0',
    mutate: brief => {
      brief.intelligenceGaps[0].gap = 'Thin.';
      brief.intelligenceGaps[0].whyItMatters = 'Thin.';
      brief.intelligenceGaps[0].closureEvidence = 'Thin.';
    },
  },
];
for (const itemCase of perItemDepthCases) {
  const itemBrief = structuredClone(valid);
  itemCase.mutate(itemBrief);
  const result = validatePdbV3StructureAndDepth(itemBrief);
  assert.equal(
    result.violations.some(violation => violation.path === itemCase.path && violation.reason === 'item_too_thin'),
    true,
    `${itemCase.path} should enforce its own minimum depth`
  );
}

const evidenceIndex = new Map([
  ['market:btc:current', { id: 'market:btc:current', type: 'market', asset: 'btc', value: 100 }],
  ['market:btc:rangePosition', { id: 'market:btc:rangePosition', type: 'market', asset: 'btc', value: 0.5 }],
  ['market:btc:support', { id: 'market:btc:support', type: 'market', asset: 'btc', value: 95 }],
  ['market:btc:resistance', { id: 'market:btc:resistance', type: 'market', asset: 'btc', value: 105 }],
  ['market:eth:current', { id: 'market:eth:current', type: 'market', asset: 'eth', value: 50 }],
  ['market:eth:rangePosition', { id: 'market:eth:rangePosition', type: 'market', asset: 'eth', value: 0.4 }],
  ['market:eth:support', { id: 'market:eth:support', type: 'market', asset: 'eth', value: 45 }],
  ['market:eth:resistance', { id: 'market:eth:resistance', type: 'market', asset: 'eth', value: 55 }],
  ['market:link:current', { id: 'market:link:current', type: 'market', asset: 'link', value: 10 }],
  ['market:link:rangePosition', { id: 'market:link:rangePosition', type: 'market', asset: 'link', value: 0.3 }],
  ['market:link:support', { id: 'market:link:support', type: 'market', asset: 'link', value: 9 }],
  ['market:link:resistance', { id: 'market:link:resistance', type: 'market', asset: 'link', value: 11 }],
  ['macro:sp500:change1d', { id: 'macro:sp500:change1d', type: 'macro', value: 1.2 }],
  ['macro:sentiment:current', { id: 'macro:sentiment:current', type: 'macro', value: 50 }],
  ['news:1', { id: 'news:1', type: 'news', assetMentions: ['btc'], value: { title: 'BTC event' } }],
]);

assert.equal(validatePdbV3Evidence(valid, evidenceIndex).ok, true);
assert.equal(validatePdbV3Brief(valid, evidenceIndex).ok, true);

const prompt = buildPdbV3Prompt({
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
  newsItems: [{
    title: 'Bitcoin liquidity improves',
    source: 'Fixture News',
    description: 'BTC liquidity conditions improved.',
    topic: 'btc',
    pubDate: '2026-07-13T00:00:00Z',
    url: 'https://example.com/btc',
  }],
});
assert.match(prompt.systemInstruction, /PDB v3/);
assert.match(prompt.systemInstruction, /Singapore/);
assert.match(prompt.systemInstruction, /1,500-2,200/);
assert.match(prompt.systemInstruction, /observed facts/i);
assert.match(prompt.systemInstruction, /buy or sell/i);
assert.match(prompt.userPrompt, /BOTTOM LINE/);
assert.match(prompt.userPrompt, /KEY JUDGMENTS/);
assert.match(prompt.userPrompt, /SCENARIOS/);
assert.match(prompt.userPrompt, /INTELLIGENCE GAPS/);
assert.match(prompt.userPrompt, /market:btc:current/);
assert.match(prompt.userPrompt, /news:1/);
assert.equal((prompt.userPrompt.match(/<doc id=/g) || []).length, 1);

const unknown = structuredClone(valid);
unknown.executive.keyJudgments[0].evidenceIds = ['news:999'];
assert.equal(
  validatePdbV3Evidence(unknown, evidenceIndex).violations.some(violation => violation.reason === 'unknown_evidence'),
  true
);

const crossed = structuredClone(valid);
crossed.assets.eth.drivers[0].evidenceIds = ['market:btc:current'];
assert.equal(
  validatePdbV3Evidence(crossed, evidenceIndex).violations.some(violation => violation.reason === 'cross_asset_evidence'),
  true
);

const weakSynthesis = structuredClone(valid);
weakSynthesis.executive.keyJudgments[0].evidenceIds = ['market:btc:current'];
assert.equal(
  validatePdbV3Evidence(weakSynthesis, evidenceIndex).violations.some(violation => violation.reason === 'insufficient_synthesis'),
  true
);

const inventedNumber = structuredClone(valid);
inventedNumber.assets.btc.assessment += ' Bitcoin is trading at $999,999.';
assert.equal(
  validatePdbV3Evidence(inventedNumber, evidenceIndex).violations.some(
    violation => violation.reason === 'unsupported_numeric_claim'
  ),
  true
);

const scenarioLevelEvidence = new Map(evidenceIndex);
scenarioLevelEvidence.set('market:btc:current', {
  id: 'market:btc:current',
  type: 'market',
  asset: 'btc',
  value: 58_067,
});
const roundedScenarioLevel = structuredClone(valid);
roundedScenarioLevel.scenarios.base.outlook += ' Bitcoin holding $58K would preserve the base case.';
assert.equal(
  validatePdbV3Evidence(roundedScenarioLevel, scenarioLevelEvidence).violations.some(
    violation => violation.reason === 'unsupported_numeric_claim' && violation.path === 'scenarios.base'
  ),
  false
);

const sameAssetLevel = structuredClone(valid);
sameAssetLevel.assets.btc.assessment += ' The supplied support level is $95.00.';
assert.equal(
  validatePdbV3Evidence(sameAssetLevel, evidenceIndex).violations.some(
    violation => violation.reason === 'unsupported_numeric_claim' && violation.path === 'assets.btc'
  ),
  false
);

const balancedDepth = structuredClone(valid);
balancedDepth.executive.keyJudgments[0].assessment = prose(35, 'assessment');
balancedDepth.assets.link.assessment = prose(35, 'linkassessment');
balancedDepth.macro.assessment = prose(50, 'macroassessment');
for (const item of [...balancedDepth.threats, ...balancedDepth.opportunities]) {
  item.assessment = prose(22, 'risk');
}
const balancedDepthViolations = validatePdbV3StructureAndDepth(balancedDepth).violations;
assert.equal(
  balancedDepthViolations.some(
    violation => violation.path === 'executive.keyJudgments.0.assessment' && violation.reason === 'section_too_thin'
  ),
  false
);
assert.equal(
  balancedDepthViolations.some(
    violation => violation.path === 'assets.link.assessment' && violation.reason === 'section_too_thin'
  ),
  false
);
assert.equal(
  balancedDepthViolations.some(
    violation => violation.path === 'macro.assessment' && violation.reason === 'section_too_thin'
  ),
  false
);
assert.equal(
  balancedDepthViolations.some(
    violation => violation.path === 'threats+opportunities' && violation.reason === 'section_too_thin'
  ),
  false
);

const badConfidence = structuredClone(valid);
badConfidence.scenarios.base.confidence = 'certain';
assert.equal(
  validatePdbV3Evidence(badConfidence, evidenceIndex).violations.some(
    violation => violation.reason === 'invalid_confidence'
  ),
  true
);

console.log('pdb v3 contract tests passed');
