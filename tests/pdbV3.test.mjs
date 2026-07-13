import assert from 'node:assert/strict';
import {
  PDB_V3_RESPONSE_SCHEMA,
  countBriefWords,
  measurePdbV3Depth,
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

console.log('pdb v3 contract tests passed');
