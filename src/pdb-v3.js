import { buildEvidenceIndex } from './gemini.js';
import { buildPromptNewsItems } from './news.js';

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
  keyJudgmentAssessment: { min: 35, max: 110 },
  assetAssessment: { min: 35, max: 120 },
  assetTotal: { min: 160, max: 260 },
  macroAssessment: { min: 50, max: 140 },
  macroTotal: { min: 180, max: 300 },
  scenarioTotal: { min: 130, max: 240 },
  threatsAndOpportunities: { min: 130, max: 320 },
  watchAndGaps: { min: 180, max: 340 },
});

function formatEvidenceValue(value) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function buildPdbV3Prompt(cachePayload = {}, options = {}) {
  const evidenceIndex = buildEvidenceIndex(cachePayload);
  const newsItems = buildPromptNewsItems(options.newsItems ?? cachePayload.newsItems ?? []).slice(0, 20);
  const deterministicEvidence = [...evidenceIndex.values()]
    .filter(evidence => evidence.type !== 'news')
    .map(evidence => `${evidence.id} | ${formatEvidenceValue(evidence.value)}`)
    .join('\n');
  const newsDocuments = newsItems.length
    ? newsItems.map((item, index) => [
        `<doc id="${index + 1}">`,
        `EVIDENCE_ID: news:${index + 1}`,
        `PUBLISHER: ${item.source || 'Unknown'}`,
        `PUBLISHED: ${item.pubDate || 'Unknown'}`,
        `ASSET_TAGS: ${(item.assetMentions || []).join(', ') || 'none'}`,
        `HEADLINE: ${item.title || 'Untitled'}`,
        `CONTENT: ${item.enrichedContent || item.content || item.description || 'No additional context available.'}`,
        '</doc>',
      ].join('\n')).join('\n\n')
    : 'No news documents were available. Use deterministic evidence and state the resulting intelligence gaps.';

  const systemInstruction = `You are the senior crypto intelligence analyst responsible for PDB v3, an eight-to-ten-minute decision brief for a sophisticated investor in Singapore.

Produce 1,500-2,200 useful words of analysis. Separate observed facts from analytical judgments and scenarios. Explain what matters, why it matters, what is likely next over the next 1-7 days, what would invalidate the view, and why confidence is high, medium, or low.

Use only supplied evidence IDs. Preserve [N] markers for claims supported by news:N. Never fabricate an event, publisher claim, date, probability, price, percentage, or level. Deterministic market and macro evidence is authoritative for numbers. Major judgments should synthesize at least two facts when the dossier permits it. Identify contradictions and missing information instead of smoothing them away.

Do not give direct instructions to buy or sell, personalized position sizes, or invented numeric probabilities. Return only JSON matching the supplied schema.`;

  const userPrompt = `PDB v3 EVIDENCE DOSSIER

DETERMINISTIC MARKET AND MACRO EVIDENCE
${deterministicEvidence || 'No deterministic evidence available.'}

NEWS DOCUMENTS
${newsDocuments}

REQUIRED ANALYTICAL PRODUCT

1. BOTTOM LINE: State the regime, the most important development, the 1-7 day implication, and the principal invalidator.
2. KEY JUDGMENTS: Prioritize four or five decision-relevant judgments by importance, not by asset order.
3. ASSET ASSESSMENTS: Give substantial BTC, ETH, and LINK assessments with drivers, deterministic support/resistance, confirmation, and invalidation.
4. MACRO AND CROSS-ASSET REGIME: Explain transmission, confluence, divergence, and what would change the regime; do not merely repeat data.
5. SCENARIOS: Provide base, bullish, and bearish causal paths with qualitative likelihoods and observable triggers.
6. THREATS AND OPPORTUNITIES: Separate impact, likelihood, horizon, and the indicator showing each is materializing.
7. FORWARD WATCH: Identify observable signals for the next 24 hours and next 7 days.
8. INTELLIGENCE GAPS: State unresolved contradictions or missing evidence and what would close each gap.

FIELD DEPTH BUDGETS
- Bottom line: 100-140 words.
- Each key-judgment assessment: 40-70 words; why-it-matters: 15-25; confidence basis: 8-15; each invalidator: 6-12.
- Each asset assessment: 45-75 words. Each asset driver: 30-50 words. Confidence basis: 8-15; confirmation and invalidation: 15-25 each; each complete asset section: 180-240 words.
- Macro assessment: 60-100 words. Each macro transmission channel: 30-50 words. Confidence basis: 8-15; complete macro section: 190-280 words.
- Each scenario: 45-70 words; all scenarios combined: 150-220 words.
- Each threat or opportunity: 35-50 words; all threats and opportunities combined: 150-280 words.
- Each watch item: 25-40 words; each intelligence gap: 30-50 words; watch items and gaps combined: 200-320 words.

Every analytical object must include known evidenceIds and confidence. Keep claims within the evidence dossier.`;

  return { systemInstruction, userPrompt };
}

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

function checkItemMinimum(violations, path, actual, min) {
  if (actual < min) {
    violations.push({ path, reason: 'item_too_thin', actual, min });
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
    checkItemMinimum(
      violations,
      `executive.keyJudgments.${index}.whyItMatters`,
      wordCount(judgment?.whyItMatters),
      12
    );
    checkItemMinimum(
      violations,
      `executive.keyJudgments.${index}.confidenceBasis`,
      wordCount(judgment?.confidenceBasis),
      8
    );
    for (const [invalidatorIndex, invalidator] of (judgment?.invalidators || []).entries()) {
      checkItemMinimum(
        violations,
        `executive.keyJudgments.${index}.invalidators.${invalidatorIndex}`,
        wordCount(invalidator),
        6
      );
    }
  }

  checkRange(violations, 'executive.bottomLine', metrics.sections.bottomLine, PDB_V3_DEPTH.bottomLine);
  for (const asset of ['btc', 'eth', 'link']) {
    const section = brief.assets?.[asset] || {};
    checkRange(
      violations,
      `assets.${asset}.assessment`,
      metrics.sections.assetAssessments[asset],
      PDB_V3_DEPTH.assetAssessment
    );
    checkRange(violations, `assets.${asset}`, metrics.sections.assets[asset], PDB_V3_DEPTH.assetTotal);
    checkItemMinimum(violations, `assets.${asset}.confidenceBasis`, wordCount(section.confidenceBasis), 8);
    checkItemMinimum(violations, `assets.${asset}.confirmation`, wordCount(section.confirmation), 12);
    checkItemMinimum(violations, `assets.${asset}.invalidation`, wordCount(section.invalidation), 12);
    for (const [index, driver] of (section.drivers || []).entries()) {
      requireText(violations, `assets.${asset}.drivers.${index}.title`, driver?.title);
      checkItemMinimum(
        violations,
        `assets.${asset}.drivers.${index}.analysis`,
        wordCount(driver?.analysis),
        25
      );
    }
  }
  checkRange(violations, 'macro.assessment', metrics.sections.macroAssessment, PDB_V3_DEPTH.macroAssessment);
  checkRange(violations, 'macro', metrics.sections.macro, PDB_V3_DEPTH.macroTotal);
  checkItemMinimum(violations, 'macro.confidenceBasis', wordCount(brief.macro?.confidenceBasis), 8);
  for (const [index, channel] of (brief.macro?.transmissionChannels || []).entries()) {
    requireText(violations, `macro.transmissionChannels.${index}.title`, channel?.title);
    checkItemMinimum(
      violations,
      `macro.transmissionChannels.${index}.analysis`,
      wordCount(channel?.analysis),
      25
    );
  }
  checkRange(violations, 'scenarios', metrics.sections.scenarios, PDB_V3_DEPTH.scenarioTotal);
  for (const scenarioName of ['base', 'bullish', 'bearish']) {
    const scenario = brief.scenarios?.[scenarioName];
    checkArrayCount(violations, `scenarios.${scenarioName}.triggers`, scenario?.triggers, 1, 3);
    checkItemMinimum(
      violations,
      `scenarios.${scenarioName}`,
      wordsIn(scenarioProse(scenario)),
      35
    );
  }
  checkRange(
    violations,
    'threats+opportunities',
    metrics.sections.threatsAndOpportunities,
    PDB_V3_DEPTH.threatsAndOpportunities
  );
  for (const sectionName of ['threats', 'opportunities']) {
    for (const [index, item] of (brief[sectionName] || []).entries()) {
      requireText(violations, `${sectionName}.${index}.title`, item?.title);
      requireText(violations, `${sectionName}.${index}.horizon`, item?.horizon);
      checkItemMinimum(violations, `${sectionName}.${index}`, wordsIn(riskProse(item)), 30);
    }
  }
  checkRange(violations, 'watch+intelligenceGaps', metrics.sections.watchAndGaps, PDB_V3_DEPTH.watchAndGaps);
  for (const period of ['next24Hours', 'next7Days']) {
    for (const [index, item] of (brief.watch?.[period] || []).entries()) {
      requireText(violations, `watch.${period}.${index}.title`, item?.title);
      checkItemMinimum(violations, `watch.${period}.${index}`, wordsIn(watchProse(item)), 20);
    }
  }
  for (const [index, gap] of (brief.intelligenceGaps || []).entries()) {
    requireText(violations, `intelligenceGaps.${index}.title`, gap?.title);
    checkItemMinimum(violations, `intelligenceGaps.${index}`, wordsIn(gapProse(gap)), 25);
  }
  checkRange(violations, 'brief', metrics.totalWords, PDB_V3_DEPTH.total);

  return { ok: violations.length === 0, violations, metrics };
}

const VALID_CONFIDENCE = new Set(['high', 'medium', 'low']);

function analyticalEntries(brief = {}) {
  const entries = [];
  const add = (path, value, options = {}) => {
    entries.push({
      path,
      text: options.text ?? '',
      evidenceIds: value?.evidenceIds,
      confidence: value?.confidence,
      asset: options.asset ?? null,
      policy: options.policy ?? 'broad',
      requiresSynthesis: options.requiresSynthesis ?? false,
    });
  };

  add('executive', brief.executive, {
    text: [brief.executive?.bottomLine, brief.executive?.confidenceBasis].filter(Boolean).join(' '),
  });
  for (const [index, judgment] of (brief.executive?.keyJudgments || []).entries()) {
    add(`executive.keyJudgments.${index}`, judgment, {
      text: [
        judgment?.assessment,
        judgment?.whyItMatters,
        judgment?.confidenceBasis,
        ...(judgment?.invalidators || []),
      ].filter(Boolean).join(' '),
      requiresSynthesis: true,
    });
  }

  for (const asset of ['btc', 'eth', 'link']) {
    const section = brief.assets?.[asset];
    add(`assets.${asset}`, section, {
      asset,
      text: [section?.assessment, section?.confidenceBasis, section?.confirmation, section?.invalidation]
        .filter(Boolean)
        .join(' '),
    });
    for (const [index, driver] of (section?.drivers || []).entries()) {
      add(`assets.${asset}.drivers.${index}`, driver, { asset, text: driver?.analysis });
    }
  }

  add('macro', brief.macro, {
    policy: 'macro',
    text: [brief.macro?.assessment, brief.macro?.confidenceBasis].filter(Boolean).join(' '),
  });
  for (const [index, channel] of (brief.macro?.transmissionChannels || []).entries()) {
    add(`macro.transmissionChannels.${index}`, channel, {
      policy: 'macro',
      text: channel?.analysis,
      requiresSynthesis: true,
    });
  }

  for (const scenarioName of ['base', 'bullish', 'bearish']) {
    const scenario = brief.scenarios?.[scenarioName];
    add(`scenarios.${scenarioName}`, scenario, {
      text: [scenario?.outlook, scenario?.causalPath, ...(scenario?.triggers || [])].filter(Boolean).join(' '),
    });
  }
  for (const sectionName of ['threats', 'opportunities']) {
    for (const [index, item] of (brief[sectionName] || []).entries()) {
      add(`${sectionName}.${index}`, item, {
        text: [item?.assessment, item?.indicator].filter(Boolean).join(' '),
      });
    }
  }
  for (const period of ['next24Hours', 'next7Days']) {
    for (const [index, item] of (brief.watch?.[period] || []).entries()) {
      add(`watch.${period}.${index}`, item, {
        text: [item?.whyItMatters, item?.signal].filter(Boolean).join(' '),
      });
    }
  }
  for (const [index, gap] of (brief.intelligenceGaps || []).entries()) {
    add(`intelligenceGaps.${index}`, gap, {
      text: [gap?.gap, gap?.whyItMatters, gap?.closureEvidence].filter(Boolean).join(' '),
    });
  }

  return entries;
}

function normalizedEvidenceIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(id => typeof id === 'string').map(id => id.trim()).filter(Boolean))];
}

function evidenceAllowed(entry, evidence, evidenceIds, evidenceIndex) {
  if (entry.asset) {
    if (evidence.type === 'market') return evidence.asset === entry.asset;
    if (evidence.type === 'news') return Boolean(evidence.assetMentions?.includes(entry.asset));
    return false;
  }
  if (entry.policy !== 'macro') return true;
  if (['macro', 'news'].includes(evidence.type)) return true;
  if (evidence.type !== 'market' || !/\bcrypto|bitcoin|ethereum|chainlink|btc|eth|link\b/i.test(entry.text)) {
    return false;
  }
  return evidenceIds.some(id => evidenceIndex.get(id)?.type === 'macro');
}

function compactNumber(value, suffix = '') {
  const parsed = Number(String(value).replaceAll(',', ''));
  if (!Number.isFinite(parsed)) return null;
  const multiplier = {
    k: 1e3,
    thousand: 1e3,
    m: 1e6,
    million: 1e6,
    b: 1e9,
    billion: 1e9,
    t: 1e12,
    trillion: 1e12,
  }[String(suffix).toLowerCase()] || 1;
  return parsed * multiplier;
}

function numericClaims(text = '') {
  const source = String(text)
    .replace(/\[\d+\]/g, ' ')
    .replace(/\b24\s*hours?\b/gi, ' ')
    .replace(/\b7\s*days?\b/gi, ' ');
  const suffix = '(K|M|B|T|thousand|million|billion|trillion)';
  const pattern = new RegExp(
    `\\$(-?[\\d,]+(?:\\.\\d+)?)\\s*${suffix}?\\b|` +
    '(-?\\d+(?:\\.\\d+)?)%|' +
    `(-?\\d+(?:\\.\\d+)?)\\s*${suffix}\\b|` +
    '\\b(-?\\d+(?:\\.\\d+)?)\\s*\\/\\s*100\\b|' +
    '\\b(-?\\d+\\.\\d{2,})\\b',
    'gi'
  );
  const claims = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const value = match[1] ?? match[3] ?? match[4] ?? match[6] ?? match[7];
    const normalized = compactNumber(value, match[2] ?? match[5]);
    if (normalized !== null) claims.push({ raw: match[0], value: normalized });
  }
  return claims;
}

function evidenceNumbers(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? [value] : [];
  if (typeof value === 'string') return numericClaims(value).map(claim => claim.value);
  if (Array.isArray(value)) return value.flatMap(evidenceNumbers);
  if (value && typeof value === 'object') return Object.values(value).flatMap(evidenceNumbers);
  return [];
}

function numbersMatch(claim, evidenceValue) {
  const tolerance = Math.max(0.01, Math.abs(evidenceValue) * 0.005);
  return Math.abs(claim - evidenceValue) <= tolerance;
}

function checkNumericClaims(violations, entry, evidenceIds, evidenceIndex) {
  const knownNumbers = entry.asset
    ? [...evidenceIndex.values()]
        .filter(evidence => evidence?.type === 'market' && evidence.asset === entry.asset)
        .flatMap(evidence => evidenceNumbers(evidence.value))
    : entry.path.startsWith('scenarios.')
      ? [...evidenceIndex.values()].flatMap(evidence => evidenceNumbers(evidence?.value))
      : evidenceIds.flatMap(id => evidenceNumbers(evidenceIndex.get(id)?.value));
  for (const claim of numericClaims(entry.text)) {
    if (!knownNumbers.some(value => numbersMatch(claim.value, value))) {
      violations.push({ path: entry.path, reason: 'unsupported_numeric_claim', claim: claim.raw });
    }
  }
}

function checkDeterministicLevel(violations, brief, evidenceIndex, asset, field) {
  const rendered = brief.assets?.[asset]?.[field];
  const claims = numericClaims(rendered);
  if (!claims.length) return;
  const evidence = evidenceIndex.get(`market:${asset}:${field}`);
  const knownNumbers = evidenceNumbers(evidence?.value);
  for (const claim of claims) {
    if (!knownNumbers.some(value => numbersMatch(claim.value, value))) {
      violations.push({ path: `assets.${asset}.${field}`, reason: 'unsupported_numeric_claim', claim: claim.raw });
    }
  }
}

export function validatePdbV3Evidence(brief = {}, evidenceIndex = new Map()) {
  const violations = [];
  const availableEvidenceCount = evidenceIndex.size;
  const availableMacroCount = [...evidenceIndex.values()].filter(evidence => evidence?.type === 'macro').length;

  for (const entry of analyticalEntries(brief)) {
    const evidenceIds = normalizedEvidenceIds(entry.evidenceIds);
    if (!evidenceIds.length) {
      violations.push({ path: entry.path, reason: 'missing_evidence' });
    }
    if (!VALID_CONFIDENCE.has(entry.confidence)) {
      violations.push({ path: entry.path, reason: 'invalid_confidence', confidence: entry.confidence ?? null });
    }

    const requiredEvidenceCount = entry.requiresSynthesis
      ? Math.min(2, entry.policy === 'macro' ? availableMacroCount : availableEvidenceCount)
      : 1;
    if (requiredEvidenceCount > 1 && evidenceIds.length < requiredEvidenceCount) {
      violations.push({
        path: entry.path,
        reason: 'insufficient_synthesis',
        actual: evidenceIds.length,
        min: requiredEvidenceCount,
      });
    }

    for (const evidenceId of evidenceIds) {
      const evidence = evidenceIndex.get(evidenceId);
      if (!evidence) {
        violations.push({ path: entry.path, evidenceId, reason: 'unknown_evidence' });
        continue;
      }
      if (!evidenceAllowed(entry, evidence, evidenceIds, evidenceIndex)) {
        const crossAsset = entry.asset && ['market', 'news'].includes(evidence.type);
        violations.push({
          path: entry.path,
          evidenceId,
          reason: crossAsset ? 'cross_asset_evidence' : 'disallowed_evidence',
        });
      }
    }
    checkNumericClaims(violations, entry, evidenceIds, evidenceIndex);
  }

  for (const asset of ['btc', 'eth', 'link']) {
    checkDeterministicLevel(violations, brief, evidenceIndex, asset, 'support');
    checkDeterministicLevel(violations, brief, evidenceIndex, asset, 'resistance');
  }

  return { ok: violations.length === 0, violations };
}

export function validatePdbV3Brief(brief = {}, evidenceIndex = new Map()) {
  const quality = validatePdbV3StructureAndDepth(brief);
  const evidence = validatePdbV3Evidence(brief, evidenceIndex);
  return {
    ok: quality.ok && evidence.ok,
    metrics: quality.metrics,
    violations: [...quality.violations, ...evidence.violations],
  };
}
