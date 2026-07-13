import { decodeHtmlBasic, sanitizeNewsDescription } from './news.js';

export function detectFeedFormat(xml = '') {
  const value = String(xml);
  if (/<feed\b/i.test(value) && /<entry\b/i.test(value)) return 'atom';
  if (/<rss\b/i.test(value) || /<item\b/i.test(value)) return 'rss';
  return 'unknown';
}

function tagValue(block, tag) {
  const match = String(block).match(new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    'i'
  ));
  return (match?.[1] ?? match?.[2] ?? '').trim();
}

function attributeValue(tag, attribute) {
  const match = String(tag).match(new RegExp(`\\b${attribute}=["']([^"']+)["']`, 'i'));
  return decodeHtmlBasic(match?.[1] ?? '');
}

function atomLink(block) {
  const tags = [...String(block).matchAll(/<link\b[^>]*\/?>/gi)].map(match => match[0]);
  const alternate = tags.find(tag => !attributeValue(tag, 'rel') || attributeValue(tag, 'rel') === 'alternate');
  return attributeValue(alternate ?? tags[0] ?? '', 'href');
}

export function parseSyndicationFeed(xml = '', source = {}) {
  const detectedFormat = detectFeedFormat(xml);
  const format = detectedFormat === 'unknown' ? source.format : detectedFormat;
  if (!['rss', 'atom'].includes(format)) return [];

  const expression = format === 'atom'
    ? /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi
    : /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  const items = [];
  let match;

  while ((match = expression.exec(String(xml))) !== null) {
    const block = match[1];
    const title = decodeHtmlBasic(tagValue(block, 'title'));
    const url = format === 'atom'
      ? atomLink(block)
      : decodeHtmlBasic(tagValue(block, 'link') || tagValue(block, 'guid'));
    const descriptionTag = format === 'atom' ? 'summary' : 'description';
    const contentTag = format === 'atom' ? 'content' : 'content:encoded';
    const description = sanitizeNewsDescription(tagValue(block, descriptionTag)).slice(0, 600);
    const content = sanitizeNewsDescription(tagValue(block, contentTag) || description).slice(0, 1200);
    const pubDate = format === 'atom'
      ? tagValue(block, 'published') || tagValue(block, 'updated')
      : tagValue(block, 'pubDate') || tagValue(block, 'dc:date');

    if (!title || !url.startsWith('http')) continue;
    items.push({
      id: `${source.id}:${url}`,
      title,
      url,
      description,
      content,
      pubDate,
      source: source.source,
      sourceId: source.id,
      sourceTier: source.sourceTier,
      topic: source.topic,
      maxAgeHours: source.maxAgeHours ?? 72,
    });
  }

  return items.slice(0, source.maxItems ?? 8);
}
