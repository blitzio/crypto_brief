export function decodeHtmlBasic(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export function sanitizeNewsDescription(value = '') {
  return decodeHtmlBasic(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function newsText(item = {}) {
  return decodeHtmlBasic([
    item.title,
    item.description,
    item.content,
  ].filter(Boolean).join(' '));
}

export function inferAssetMentions(item = {}) {
  const text = newsText(item);
  const mentions = [];

  if (/\bbitcoin\b|\bbtc\b|\$btc\b/i.test(text)) mentions.push('btc');
  if (/\bethereum\b|\bether\b|\beth\b|\$eth\b/i.test(text)) mentions.push('eth');
  if (/\bchainlink\b|\$link\b|\blink\b(?=\s+(token|price|holders|staking|ccip|oracle|oracles|feeds?))/i.test(text)) mentions.push('link');

  return mentions;
}

export function buildPromptNewsItems(items = []) {
  return items.map(item => ({
    ...item,
    title: decodeHtmlBasic(item.title),
    description: sanitizeNewsDescription(item.description),
    content: sanitizeNewsDescription(item.content || item.description || ''),
    assetMentions: inferAssetMentions(item),
  }));
}

function itemTime(item = {}) {
  const ts = item.pubDate ? new Date(item.pubDate).getTime() : 0;
  return Number.isFinite(ts) ? ts : 0;
}

function isLowSignalNews(item = {}) {
  const text = newsText(item);
  return /price prediction|price forecast|current price of|goes parabolic|be a millionaire|2026[, -]+2027|2028[- ]2032|best crypto to buy|could .* make you rich/i.test(text);
}

function isMismatchedAssetFeedItem(item = {}) {
  if (!['btc', 'eth', 'link'].includes(item.topic)) return false;
  return !item.assetMentions.includes(item.topic);
}

function isIrrelevantGeneralEditorial(item = {}) {
  if (item.topic !== 'general' || item.sourceTier !== 'editorial' || item.assetMentions.length > 0) return false;
  return !/\bcrypto(?:currency|currencies)?\b|\bdigital assets?\b|\bblockchain\b|\bstablecoins?\b|\btoken(?:s|ization|ized)?\b|\bdefi\b|\bweb3\b|\bmining\b|\bminers?\b/i.test(newsText(item));
}

export function canonicalNewsUrl(value = '') {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|ref|source|output)$/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.toString();
  } catch {
    return String(value);
  }
}

export function normalizedHeadlineKey(value = '') {
  return decodeHtmlBasic(value)
    .toLowerCase()
    .replace(/\s+-\s+[^-]+$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceTierRank(item = {}) {
  if (item.sourceTier === 'primary') return 0;
  if (item.sourceTier === 'editorial') return 1;
  if (item.sourceTier === 'macro') return 2;
  if (item.sourceTier === 'discovery') return 3;
  return 2;
}

function compareNewsQuality(a, b) {
  return sourceTierRank(a) - sourceTierRank(b) || itemTime(b) - itemTime(a);
}

function newsSelectionKey(item = {}) {
  return item.url || `${item.source || 'unknown'}:${item.headlineKey || normalizedHeadlineKey(item.title)}`;
}

export function selectTopNewsItems(items = [], limit = 20) {
  const prepared = buildPromptNewsItems(items)
    .filter(item => !isLowSignalNews(item))
    .filter(item => !isMismatchedAssetFeedItem(item))
    .filter(item => !isIrrelevantGeneralEditorial(item))
    .map(item => ({
      ...item,
      url: canonicalNewsUrl(item.url),
      headlineKey: normalizedHeadlineKey(item.title),
    }))
    .sort(compareNewsQuality);

  const deduplicated = [];
  const seenUrls = new Set();
  const seenHeadlines = new Set();
  for (const item of prepared) {
    if (!item.headlineKey) continue;
    if ((item.url && seenUrls.has(item.url)) || seenHeadlines.has(item.headlineKey)) continue;
    if (item.url) seenUrls.add(item.url);
    seenHeadlines.add(item.headlineKey);
    deduplicated.push(item);
  }

  const selected = [];
  const selectedKeys = new Set();
  const sourceCounts = new Map();
  let untaggedCount = 0;
  const add = (item) => {
    const key = newsSelectionKey(item);
    if (!key || selectedKeys.has(key) || selected.length >= limit) return false;
    const sourceKey = item.sourceId || item.source || 'unknown';
    if ((sourceCounts.get(sourceKey) ?? 0) >= 4) return false;
    const isUntagged = item.assetMentions.length === 0;
    if (isUntagged && untaggedCount >= 5) return false;

    selectedKeys.add(key);
    sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) ?? 0) + 1);
    if (isUntagged) untaggedCount += 1;
    selected.push(item);
    return true;
  };

  for (const tag of ['btc', 'eth', 'link']) {
    let count = selected.filter(item => item.assetMentions.includes(tag)).length;
    for (const item of deduplicated) {
      if (count >= 4) break;
      if (item.assetMentions.includes(tag)) {
        if (selectedKeys.has(newsSelectionKey(item))) continue;
        if (add(item)) {
          count += 1;
        }
      }
    }
  }

  for (const item of deduplicated.filter(item => item.assetMentions.length > 0)) add(item);
  for (const item of deduplicated.filter(item => item.assetMentions.length === 0)) add(item);

  return selected.map(({ headlineKey, ...item }) => item);
}

export function summarizeNewsSourceHealth(items = []) {
  const assetMentionCounts = { btc: 0, eth: 0, link: 0, none: 0 };
  let totalContentChars = 0;

  for (const item of items) {
    const mentions = Array.isArray(item.assetMentions) && item.assetMentions.length
      ? item.assetMentions
      : ['none'];
    for (const mention of mentions) {
      if (Object.hasOwn(assetMentionCounts, mention)) assetMentionCounts[mention] += 1;
    }
    totalContentChars += String(item.content || item.description || '').length;
  }

  return {
    count: items.length,
    assetMentionCounts,
    avgContentChars: items.length ? Math.round(totalContentChars / items.length) : 0,
  };
}
