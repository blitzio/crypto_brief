import { buildPromptNewsItems } from './news.js';

export function resolveGenerationDeadlineMs(pipelineVersion = 'v2') {
  return pipelineVersion === 'v3' ? 150_000 : 90_000;
}

export function parseGeminiBriefJson(raw = '') {
  let clean = String(raw)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/```json|```/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .trim();

  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object in Gemini response');
  }

  clean = clean.slice(start, end + 1);
  try {
    return JSON.parse(clean);
  } catch {
    return JSON.parse(clean.replace(/,\s*([}\]])/g, '$1'));
  }
}

export function sanitizeVisibleEvidenceMarkers(text = '') {
  return String(text)
    .replace(/\[([^\]]+)\]/g, (match, content) => {
      const tokens = content.split(',').map(token => token.trim()).filter(Boolean);
      const isEvidenceList = tokens.length > 0 && tokens.every(token => /^(?:market|macro|news):[a-z0-9._-]+(?::[a-z0-9._-]+)*$/i.test(token));
      if (!isEvidenceList) return match;
      const newsNumbers = [...new Set(tokens.flatMap(token => {
        const newsMatch = token.match(/^news:(\d+)$/i);
        return newsMatch ? [newsMatch[1]] : [];
      }))];
      return newsNumbers.length ? `[${newsNumbers.join(', ')}]` : '';
    })
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function normalizeCitationMarkers(text = '') {
  return sanitizeVisibleEvidenceMarkers(String(text)
    .replace(/\s*\((?:Doc|Document)\.?\s*(\d+)\)/gi, ' [$1]')
    .replace(/\b(?:Doc|Document)\.?\s*(\d+)\b/gi, '[$1]'));
}

export function normalizeBriefCitationMarkers(value) {
  if (Array.isArray(value)) return value.map(normalizeBriefCitationMarkers);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeBriefCitationMarkers(entry)])
    );
  }
  if (typeof value === 'string') return normalizeCitationMarkers(value);
  return value;
}

function extractCitationIds(text = '') {
  const raw = String(text);
  const ids = [
    ...[...raw.matchAll(/\[(\d+)\]/g)].map(match => Number(match[1])),
    ...[...raw.matchAll(/\bDoc(?:ument)?\.?\s*(\d+)\b/gi)].map(match => Number(match[1])),
  ].filter(Number.isInteger);
  return [...new Set(ids)];
}

function isLiveDataBullet(text = '') {
  return /live market data/i.test(text) &&
    /\b(current price|24h|7d|market cap|volume|support|resistance|trading at|priced at|price|relative strength|liquidity|momentum|level|invalidation|break below|break above|retest)\b/i.test(text);
}

export function validateBriefCitations(brief = {}, newsItems = []) {
  const promptItems = buildPromptNewsItems(newsItems);
  const violations = [];
  const sections = [
    ['btc', brief.btc?.bullets || []],
    ['eth', brief.eth?.bullets || []],
    ['link', brief.link?.bullets || []],
  ];

  for (const [asset, bullets] of sections) {
    for (const [bulletIndex, bullet] of bullets.entries()) {
      const text = `${bullet?.label || ''}: ${bullet?.text || ''}`;
      const citationIds = extractCitationIds(text);

      if (citationIds.length === 0 && /model inference/i.test(text) && !isLiveDataBullet(text)) {
        violations.push({ asset, bulletIndex, reason: 'unsupported_model_inference', text });
        continue;
      }

      if (citationIds.length === 0 && !isLiveDataBullet(text)) {
        violations.push({ asset, bulletIndex, reason: 'missing_citation_or_live_data', text });
        continue;
      }

      for (const docId of citationIds) {
        const item = promptItems[docId - 1];
        if (!item) {
          violations.push({ asset, bulletIndex, docId, reason: 'unknown_doc', text });
          continue;
        }
        if (!item.assetMentions?.includes(asset)) {
          violations.push({ asset, bulletIndex, docId, reason: 'asset_not_mentioned', text });
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

function hasEvidenceValue(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string' && /^(?:n\/?a|unavailable|—)$/i.test(value.trim())) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value).some(hasEvidenceValue);
  return true;
}

export function buildEvidenceIndex({ newsItems = [], prices = {}, marketSignals = {}, macro = {} } = {}) {
  const index = new Map();
  const add = (id, evidence) => {
    if (!id || !hasEvidenceValue(evidence?.value)) return;
    index.set(id, { id, ...evidence });
  };

  for (const [itemIndex, item] of buildPromptNewsItems(newsItems).entries()) {
    add(`news:${itemIndex + 1}`, {
      type: 'news',
      assetMentions: item.assetMentions || [],
      value: { title: item.title, source: item.source, content: item.content || item.description },
    });
  }

  const assets = [
    { asset: 'btc', priceId: 'bitcoin' },
    { asset: 'eth', priceId: 'ethereum' },
    { asset: 'link', priceId: 'chainlink' },
  ];
  const marketFields = [
    ['range7d', 'range7d'],
    ['range30d', 'range30d'],
    ['rangePosition', 'rangePosition30d'],
    ['momentum', 'momentum7dPctPoints'],
    ['volumeTrend', 'volumeTrend'],
    ['volatility', 'realizedVolatilityAnnualized'],
    ['support', 'support'],
    ['resistance', 'resistance'],
  ];

  for (const { asset, priceId } of assets) {
    const price = prices?.[priceId] || {};
    const signals = marketSignals?.[asset] || {};
    const priceFields = [
      ['current', price.current_price],
      ['change24h', price.price_change_percentage_24h],
      ['change7d', price.price_change_percentage_7d_in_currency],
      ['marketCap', price.market_cap],
      ['volume', price.total_volume],
    ];
    for (const [fact, value] of priceFields) add(`market:${asset}:${fact}`, { type: 'market', asset, value });
    for (const [fact, field] of marketFields) add(`market:${asset}:${fact}`, { type: 'market', asset, value: signals[field] });
  }

  const macroFacts = [
    ['fedRate:current', macro.fedRate?.rate],
    ['fedRate:change', macro.fedRate?.change],
    ['usdsgd:current', macro.usdsgd?.price],
    ['usdsgd:change1d', macro.usdsgd?.pct],
    ['usdsgd:change5d', macro.usdsgd?.change5dPct],
    ['sp500:current', macro.sp500?.price],
    ['sp500:change1d', macro.sp500?.pct],
    ['sp500:change5d', macro.sp500?.change5dPct],
    ['gold:current', macro.gold?.price],
    ['gold:change1d', macro.gold?.pct],
    ['gold:change5d', macro.gold?.change5dPct],
    ['stablecoins:total', macro.stablecoins?.total],
    ['stablecoins:change7d', macro.stablecoins?.change7dPct],
    ['stablecoins:change30d', macro.stablecoins?.change30dPct],
    ['sentiment:current', macro.cryptoSentiment?.value],
    ['cpi:current', macro.cpi?.yoy],
    ['cpi:change', macro.cpi?.change],
  ];
  for (const [fact, value] of macroFacts) add(`macro:${fact}`, { type: 'macro', value });

  return index;
}

export function validateBriefEvidence(brief = {}, evidenceIndex = new Map()) {
  const violations = [];
  const confidenceValues = new Set(['high', 'medium', 'low']);
  const sections = [
    { section: 'btc', asset: 'btc', bullets: brief.btc?.bullets || [] },
    { section: 'eth', asset: 'eth', bullets: brief.eth?.bullets || [] },
    { section: 'link', asset: 'link', bullets: brief.link?.bullets || [] },
    { section: 'macro', asset: null, bullets: brief.macro?.bullets || [] },
    { section: 'threats', asset: null, bullets: brief.threats || [] },
    { section: 'watch', asset: null, bullets: brief.watch || [] },
  ];

  for (const { section, asset, bullets } of sections) {
    for (const [bulletIndex, bullet] of (Array.isArray(bullets) ? bullets : []).entries()) {
      const evidenceIds = Array.isArray(bullet?.evidenceIds)
        ? [...new Set(bullet.evidenceIds.filter(id => typeof id === 'string' && id.trim()))]
        : [];
      if (!evidenceIds.length) {
        violations.push({ section, bulletIndex, reason: 'missing_evidence' });
      }
      if (!confidenceValues.has(bullet?.confidence)) {
        violations.push({ section, bulletIndex, reason: 'invalid_confidence', confidence: bullet?.confidence ?? null });
      }

      for (const evidenceId of evidenceIds) {
        const evidence = evidenceIndex.get(evidenceId);
        if (!evidence) {
          violations.push({ section, bulletIndex, evidenceId, reason: 'unknown_evidence' });
          continue;
        }
        if (asset) {
          const alignedNews = evidence.type === 'news' && evidence.assetMentions?.includes(asset);
          const alignedMarket = evidence.type === 'market' && evidence.asset === asset;
          if (evidence.type === 'market' && evidence.asset !== asset) {
            violations.push({ section, bulletIndex, evidenceId, reason: 'cross_asset_evidence' });
          } else if (evidence.type === 'news' && !alignedNews) {
            violations.push({ section, bulletIndex, evidenceId, reason: 'cross_asset_evidence' });
          } else if (!alignedNews && !alignedMarket) {
            violations.push({ section, bulletIndex, evidenceId, reason: 'disallowed_evidence' });
          }
        } else if (!['news', 'macro'].includes(evidence.type)) {
          violations.push({ section, bulletIndex, evidenceId, reason: 'disallowed_evidence' });
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

export function listUnavailableMacroFields(macro = {}) {
  const unavailableFields = [];
  if (!macro.fedRate?.rateStr || macro.fedRate.rateStr === 'UNAVAILABLE') unavailableFields.push('fedRate');
  if (!Number.isFinite(macro.usdsgd?.price)) unavailableFields.push('usdsgd');
  if (!Number.isFinite(macro.sp500?.price)) unavailableFields.push('sp500');
  if (!Number.isFinite(macro.gold?.price)) unavailableFields.push('gold');
  if (!macro.stablecoins?.total || macro.stablecoins.total === 'N/A') unavailableFields.push('stablecoins');
  if (!Number.isFinite(macro.cryptoSentiment?.value)) unavailableFields.push('cryptoSentiment');
  if (!macro.cpi?.yoy || macro.cpi.yoy === 'N/A') unavailableFields.push('cpi');
  return unavailableFields;
}

export function resolveModelFallbacks(env = {}) {
  const primary = String(env.GEMINI_MODEL || 'gemini-3.5-flash').trim();
  const fallback = String(env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite').trim();
  return [...new Set([primary, fallback].filter(Boolean))];
}

export function isRetryableGeminiStatus(status) {
  return [404, 408, 429, 500, 502, 503, 504].includes(Number(status));
}

export function resolvePipelineVersion(env = {}) {
  const requested = String(env.BRIEF_PIPELINE_VERSION || '').toLowerCase();
  return ['v1', 'v2', 'v3'].includes(requested) ? requested : 'v2';
}
