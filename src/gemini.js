import { buildPromptNewsItems } from './news.js';

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

export function normalizeCitationMarkers(text = '') {
  return String(text)
    .replace(/\s*\((?:Doc|Document)\.?\s*(\d+)\)/gi, ' [$1]')
    .replace(/\b(?:Doc|Document)\.?\s*(\d+)\b/gi, '[$1]');
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
  const primary = env.GEMINI_MODEL || 'gemini-3-flash-preview';
  const configuredFallback = env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash';
  const models = [primary];
  if (/gemini-3/i.test(primary) && configuredFallback && configuredFallback !== primary) {
    models.push(configuredFallback);
  }
  return models;
}
