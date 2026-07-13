import { detectFeedFormat, parseSyndicationFeed } from '../src/feed-parser.js';
import { NEWS_SOURCES } from '../src/news-sources.js';

async function checkSource(source) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), source.timeoutMs ?? 6500);
  const result = {
    sourceId: source.id,
    status: null,
    durationMs: 0,
    format: source.format,
    parsedCount: 0,
    newestPubDate: null,
    error: null,
  };

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        'User-Agent': 'crypto-brief-source-check/1.0',
      },
    });
    result.status = response.status;
    if (!response.ok) {
      result.error = 'http';
      return result;
    }

    const xml = await response.text();
    const detectedFormat = detectFeedFormat(xml);
    result.format = detectedFormat === 'unknown' ? source.format : detectedFormat;
    const items = parseSyndicationFeed(xml, source);
    result.parsedCount = items.length;
    result.newestPubDate = items
      .map(item => item.pubDate)
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
    if (!items.length) {
      result.error = detectedFormat === 'unknown' ? 'parse' : 'empty';
    } else {
      const freshnessLimitMs = (source.maxAgeHours ?? 72) * 60 * 60 * 1000;
      const hasFreshItem = items.some(item => {
        const publishedAt = new Date(item.pubDate).getTime();
        return Number.isFinite(publishedAt) && Date.now() - publishedAt <= freshnessLimitMs;
      });
      if (!hasFreshItem) result.error = 'stale';
    }
    return result;
  } catch (error) {
    result.error = error?.name === 'AbortError' ? 'timeout' : 'unknown';
    return result;
  } finally {
    clearTimeout(timeout);
    result.durationMs = Date.now() - startedAt;
  }
}

const results = await Promise.all(NEWS_SOURCES.map(checkSource));
for (const result of results) console.log(JSON.stringify(result));

const directEditorialFailures = results.filter((result, index) =>
  NEWS_SOURCES[index].sourceTier === 'editorial' && result.error !== null
);
if (directEditorialFailures.length) process.exitCode = 1;
