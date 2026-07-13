const confidenceSchema = { type: 'string', enum: ['high', 'medium', 'low'] };
const evidenceIdsSchema = {
  type: 'array',
  minItems: 1,
  maxItems: 5,
  items: { type: 'string' },
};
const stringSchema = { type: 'string' };

const judgmentSchema = {
  type: 'object',
  required: [
    'title',
    'assessment',
    'whyItMatters',
    'evidenceIds',
    'confidence',
    'confidenceBasis',
    'invalidators',
  ],
  properties: {
    title: stringSchema,
    assessment: stringSchema,
    whyItMatters: stringSchema,
    evidenceIds: evidenceIdsSchema,
    confidence: confidenceSchema,
    confidenceBasis: stringSchema,
    invalidators: { type: 'array', minItems: 1, maxItems: 2, items: stringSchema },
  },
};

const driverSchema = {
  type: 'object',
  required: ['title', 'analysis', 'evidenceIds', 'confidence'],
  properties: {
    title: stringSchema,
    analysis: stringSchema,
    evidenceIds: evidenceIdsSchema,
    confidence: confidenceSchema,
  },
};

const assetSchema = {
  type: 'object',
  required: [
    'assessment',
    'support',
    'resistance',
    'evidenceIds',
    'confidence',
    'confidenceBasis',
    'drivers',
    'confirmation',
    'invalidation',
  ],
  properties: {
    assessment: stringSchema,
    support: stringSchema,
    resistance: stringSchema,
    evidenceIds: evidenceIdsSchema,
    confidence: confidenceSchema,
    confidenceBasis: stringSchema,
    drivers: { type: 'array', minItems: 3, maxItems: 4, items: driverSchema },
    confirmation: stringSchema,
    invalidation: stringSchema,
  },
};

const transmissionSchema = {
  type: 'object',
  required: ['title', 'analysis', 'evidenceIds', 'confidence'],
  properties: {
    title: stringSchema,
    analysis: stringSchema,
    evidenceIds: evidenceIdsSchema,
    confidence: confidenceSchema,
  },
};

const scenarioSchema = {
  type: 'object',
  required: ['outlook', 'causalPath', 'triggers', 'horizon', 'likelihood', 'evidenceIds', 'confidence'],
  properties: {
    outlook: stringSchema,
    causalPath: stringSchema,
    triggers: { type: 'array', minItems: 1, maxItems: 3, items: stringSchema },
    horizon: stringSchema,
    likelihood: { type: 'string', enum: ['most likely', 'credible', 'lower probability'] },
    evidenceIds: evidenceIdsSchema,
    confidence: confidenceSchema,
  },
};

const riskSchema = {
  type: 'object',
  required: ['title', 'assessment', 'impact', 'likelihood', 'horizon', 'indicator', 'evidenceIds', 'confidence'],
  properties: {
    title: stringSchema,
    assessment: stringSchema,
    impact: { type: 'string', enum: ['high', 'medium', 'low'] },
    likelihood: { type: 'string', enum: ['most likely', 'credible', 'lower probability'] },
    horizon: stringSchema,
    indicator: stringSchema,
    evidenceIds: evidenceIdsSchema,
    confidence: confidenceSchema,
  },
};

const watchSchema = {
  type: 'object',
  required: ['title', 'whyItMatters', 'signal', 'evidenceIds', 'confidence'],
  properties: {
    title: stringSchema,
    whyItMatters: stringSchema,
    signal: stringSchema,
    evidenceIds: evidenceIdsSchema,
    confidence: confidenceSchema,
  },
};

const intelligenceGapSchema = {
  type: 'object',
  required: ['title', 'gap', 'whyItMatters', 'closureEvidence', 'evidenceIds', 'confidence'],
  properties: {
    title: stringSchema,
    gap: stringSchema,
    whyItMatters: stringSchema,
    closureEvidence: stringSchema,
    evidenceIds: evidenceIdsSchema,
    confidence: confidenceSchema,
  },
};

export const PDB_V3_RESPONSE_SCHEMA = {
  type: 'object',
  required: [
    'briefVersion',
    'executive',
    'assets',
    'macro',
    'scenarios',
    'threats',
    'opportunities',
    'watch',
    'intelligenceGaps',
  ],
  properties: {
    briefVersion: { type: 'string', enum: ['v3'] },
    executive: {
      type: 'object',
      required: ['bottomLine', 'evidenceIds', 'confidence', 'confidenceBasis', 'keyJudgments'],
      properties: {
        bottomLine: stringSchema,
        evidenceIds: evidenceIdsSchema,
        confidence: confidenceSchema,
        confidenceBasis: stringSchema,
        keyJudgments: { type: 'array', minItems: 4, maxItems: 5, items: judgmentSchema },
      },
    },
    assets: {
      type: 'object',
      required: ['btc', 'eth', 'link'],
      properties: { btc: assetSchema, eth: assetSchema, link: assetSchema },
    },
    macro: {
      type: 'object',
      required: ['assessment', 'evidenceIds', 'confidence', 'confidenceBasis', 'transmissionChannels'],
      properties: {
        assessment: stringSchema,
        evidenceIds: evidenceIdsSchema,
        confidence: confidenceSchema,
        confidenceBasis: stringSchema,
        transmissionChannels: { type: 'array', minItems: 3, maxItems: 4, items: transmissionSchema },
      },
    },
    scenarios: {
      type: 'object',
      required: ['base', 'bullish', 'bearish'],
      properties: { base: scenarioSchema, bullish: scenarioSchema, bearish: scenarioSchema },
    },
    threats: { type: 'array', minItems: 2, maxItems: 4, items: riskSchema },
    opportunities: { type: 'array', minItems: 2, maxItems: 4, items: riskSchema },
    watch: {
      type: 'object',
      required: ['next24Hours', 'next7Days'],
      properties: {
        next24Hours: { type: 'array', minItems: 3, maxItems: 5, items: watchSchema },
        next7Days: { type: 'array', minItems: 3, maxItems: 5, items: watchSchema },
      },
    },
    intelligenceGaps: { type: 'array', minItems: 2, maxItems: 4, items: intelligenceGapSchema },
  },
};

export const PDB_V3_DEPTH = Object.freeze({
  total: { min: 1300, max: 2600, targetMin: 1500, targetMax: 2200 },
  bottomLine: { min: 90, max: 170 },
  keyJudgmentAssessment: { min: 50, max: 110 },
  assetAssessment: { min: 60, max: 120 },
  assetTotal: { min: 160, max: 260 },
  macroAssessment: { min: 70, max: 140 },
  macroTotal: { min: 180, max: 300 },
  scenarioTotal: { min: 130, max: 240 },
  threatsAndOpportunities: { min: 180, max: 320 },
  watchAndGaps: { min: 180, max: 340 },
});

function wordCount(value) {
  const normalized = String(value || '').trim();
  return normalized ? normalized.split(/\s+/).length : 0;
}

function wordsIn(values) {
  return values.flat(Infinity).reduce((total, value) => total + wordCount(value), 0);
}

function judgmentProse(judgment = {}) {
  return [judgment.assessment, judgment.whyItMatters, judgment.confidenceBasis, judgment.invalidators || []];
}

function assetProse(asset = {}) {
  return [
    asset.assessment,
    asset.confidenceBasis,
    (asset.drivers || []).map(driver => driver?.analysis),
    asset.confirmation,
    asset.invalidation,
  ];
}

function macroProse(macro = {}) {
  return [
    macro.assessment,
    macro.confidenceBasis,
    (macro.transmissionChannels || []).map(channel => channel?.analysis),
  ];
}

function scenarioProse(scenario = {}) {
  return [scenario.outlook, scenario.causalPath, scenario.triggers || []];
}

function riskProse(item = {}) {
  return [item.assessment, item.indicator];
}

function watchProse(item = {}) {
  return [item.whyItMatters, item.signal];
}

function gapProse(item = {}) {
  return [item.gap, item.whyItMatters, item.closureEvidence];
}

export function measurePdbV3Depth(brief = {}) {
  const judgments = brief.executive?.keyJudgments || [];
  const assets = brief.assets || {};
  const scenarios = brief.scenarios || {};
  const threats = brief.threats || [];
  const opportunities = brief.opportunities || [];
  const next24Hours = brief.watch?.next24Hours || [];
  const next7Days = brief.watch?.next7Days || [];
  const gaps = brief.intelligenceGaps || [];

  const sections = {
    bottomLine: wordCount(brief.executive?.bottomLine),
    executive: wordsIn([
      brief.executive?.bottomLine,
      brief.executive?.confidenceBasis,
      judgments.map(judgmentProse),
    ]),
    keyJudgmentAssessments: judgments.map(judgment => wordCount(judgment?.assessment)),
    assetAssessments: {
      btc: wordCount(assets.btc?.assessment),
      eth: wordCount(assets.eth?.assessment),
      link: wordCount(assets.link?.assessment),
    },
    assets: {
      btc: wordsIn(assetProse(assets.btc)),
      eth: wordsIn(assetProse(assets.eth)),
      link: wordsIn(assetProse(assets.link)),
    },
    macroAssessment: wordCount(brief.macro?.assessment),
    macro: wordsIn(macroProse(brief.macro)),
    scenarios: wordsIn([
      scenarioProse(scenarios.base),
      scenarioProse(scenarios.bullish),
      scenarioProse(scenarios.bearish),
    ]),
    threatsAndOpportunities: wordsIn([
      threats.map(riskProse),
      opportunities.map(riskProse),
    ]),
    watchAndGaps: wordsIn([
      next24Hours.map(watchProse),
      next7Days.map(watchProse),
      gaps.map(gapProse),
    ]),
  };

  return {
    totalWords:
      sections.executive +
      sections.assets.btc +
      sections.assets.eth +
      sections.assets.link +
      sections.macro +
      sections.scenarios +
      sections.threatsAndOpportunities +
      sections.watchAndGaps,
    sections,
  };
}

export function countBriefWords(brief = {}) {
  return measurePdbV3Depth(brief).totalWords;
}

function valueAt(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

function checkRange(violations, path, actual, range) {
  if (actual < range.min) {
    violations.push({ path, reason: 'section_too_thin', actual, min: range.min });
  } else if (actual > range.max) {
    violations.push({ path, reason: 'section_too_long', actual, max: range.max });
  }
}

function checkArrayCount(violations, path, value, min, max) {
  if (!Array.isArray(value)) {
    violations.push({ path, reason: 'missing_section', actual: 0, min, max });
    return;
  }
  if (value.length < min || value.length > max) {
    violations.push({ path, reason: 'item_count', actual: value.length, min, max });
  }
}

function requireText(violations, path, value) {
  if (typeof value !== 'string' || !value.trim()) {
    violations.push({ path, reason: 'missing_text', actual: 0, min: 1 });
  }
}

export function validatePdbV3StructureAndDepth(brief = {}) {
  const violations = [];
  const metrics = measurePdbV3Depth(brief);
  const requiredSections = [
    'executive',
    'assets',
    'assets.btc',
    'assets.eth',
    'assets.link',
    'macro',
    'scenarios',
    'scenarios.base',
    'scenarios.bullish',
    'scenarios.bearish',
    'watch',
  ];

  if (brief.briefVersion !== 'v3') {
    violations.push({ path: 'briefVersion', reason: 'invalid_version', actual: brief.briefVersion ?? null });
  }
  for (const path of requiredSections) {
    const value = valueAt(brief, path);
    if (!value || typeof value !== 'object') {
      violations.push({ path, reason: 'missing_section' });
    }
  }

  checkArrayCount(violations, 'executive.keyJudgments', brief.executive?.keyJudgments, 4, 5);
  for (const asset of ['btc', 'eth', 'link']) {
    checkArrayCount(violations, `assets.${asset}.drivers`, brief.assets?.[asset]?.drivers, 3, 4);
  }
  checkArrayCount(violations, 'macro.transmissionChannels', brief.macro?.transmissionChannels, 3, 4);
  checkArrayCount(violations, 'threats', brief.threats, 2, 4);
  checkArrayCount(violations, 'opportunities', brief.opportunities, 2, 4);
  const combinedRisks = (Array.isArray(brief.threats) ? brief.threats.length : 0) +
    (Array.isArray(brief.opportunities) ? brief.opportunities.length : 0);
  if (combinedRisks < 4 || combinedRisks > 6) {
    violations.push({ path: 'threats+opportunities', reason: 'item_count', actual: combinedRisks, min: 4, max: 6 });
  }
  checkArrayCount(violations, 'watch.next24Hours', brief.watch?.next24Hours, 3, 5);
  checkArrayCount(violations, 'watch.next7Days', brief.watch?.next7Days, 3, 5);
  checkArrayCount(violations, 'intelligenceGaps', brief.intelligenceGaps, 2, 4);

  const requiredTextPaths = [
    'executive.bottomLine',
    'executive.confidenceBasis',
    'assets.btc.assessment',
    'assets.btc.confirmation',
    'assets.btc.invalidation',
    'assets.eth.assessment',
    'assets.eth.confirmation',
    'assets.eth.invalidation',
    'assets.link.assessment',
    'assets.link.confirmation',
    'assets.link.invalidation',
    'macro.assessment',
    'macro.confidenceBasis',
    'scenarios.base.outlook',
    'scenarios.base.causalPath',
    'scenarios.bullish.outlook',
    'scenarios.bullish.causalPath',
    'scenarios.bearish.outlook',
    'scenarios.bearish.causalPath',
  ];
  for (const path of requiredTextPaths) requireText(violations, path, valueAt(brief, path));

  for (const [index, judgment] of (brief.executive?.keyJudgments || []).entries()) {
    for (const field of ['title', 'assessment', 'whyItMatters', 'confidenceBasis']) {
      requireText(violations, `executive.keyJudgments.${index}.${field}`, judgment?.[field]);
    }
    checkArrayCount(violations, `executive.keyJudgments.${index}.invalidators`, judgment?.invalidators, 1, 2);
    checkRange(
      violations,
      `executive.keyJudgments.${index}.assessment`,
      metrics.sections.keyJudgmentAssessments[index] || 0,
      PDB_V3_DEPTH.keyJudgmentAssessment
    );
  }

  checkRange(violations, 'executive.bottomLine', metrics.sections.bottomLine, PDB_V3_DEPTH.bottomLine);
  for (const asset of ['btc', 'eth', 'link']) {
    checkRange(
      violations,
      `assets.${asset}.assessment`,
      metrics.sections.assetAssessments[asset],
      PDB_V3_DEPTH.assetAssessment
    );
    checkRange(violations, `assets.${asset}`, metrics.sections.assets[asset], PDB_V3_DEPTH.assetTotal);
  }
  checkRange(violations, 'macro.assessment', metrics.sections.macroAssessment, PDB_V3_DEPTH.macroAssessment);
  checkRange(violations, 'macro', metrics.sections.macro, PDB_V3_DEPTH.macroTotal);
  checkRange(violations, 'scenarios', metrics.sections.scenarios, PDB_V3_DEPTH.scenarioTotal);
  checkRange(
    violations,
    'threats+opportunities',
    metrics.sections.threatsAndOpportunities,
    PDB_V3_DEPTH.threatsAndOpportunities
  );
  checkRange(violations, 'watch+intelligenceGaps', metrics.sections.watchAndGaps, PDB_V3_DEPTH.watchAndGaps);
  checkRange(violations, 'brief', metrics.totalWords, PDB_V3_DEPTH.total);

  return { ok: violations.length === 0, violations, metrics };
}
