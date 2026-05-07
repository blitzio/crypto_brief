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

export function selectTopNewsItems(items = [], limit = 20) {
  const prepared = buildPromptNewsItems(items)
    .filter(item => !isLowSignalNews(item))
    .filter(item => !isMismatchedAssetFeedItem(item))
    .sort((a, b) => itemTime(b) - itemTime(a));

  const selected = [];
  const seen = new Set();
  const add = (item) => {
    const key = item.url || `${item.source}:${item.title}`;
    if (!key || seen.has(key) || selected.length >= limit) return;
    seen.add(key);
    selected.push(item);
  };

  const buckets = [
    { tag: 'btc', quota: 5 },
    { tag: 'eth', quota: 5 },
    { tag: 'link', quota: 5 },
  ];

  for (const { tag, quota } of buckets) {
    let count = 0;
    for (const item of prepared) {
      if (count >= quota) break;
      if (item.assetMentions.includes(tag)) {
        add(item);
        count++;
      }
    }
  }

  for (const item of prepared) add(item);
  return selected;
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
