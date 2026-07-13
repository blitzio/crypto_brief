import assert from 'node:assert/strict';
import { detectFeedFormat, parseSyndicationFeed } from '../src/feed-parser.js';
import { NEWS_SOURCES } from '../src/news-sources.js';

const source = {
  id: 'fixture',
  source: 'Fixture',
  url: 'https://example.com/feed',
  format: 'rss',
  topic: 'btc',
  sourceTier: 'editorial',
  maxItems: 8,
  maxAgeHours: 72,
  timeoutMs: 6500,
};

const rss = `<?xml version="1.0"?><rss><channel><item>
  <title><![CDATA[Bitcoin &amp; markets]]></title>
  <link>https://example.com/rss-item</link>
  <description><![CDATA[<p>BTC liquidity improved.</p>]]></description>
  <content:encoded><![CDATA[<p>Longer BTC market context.</p>]]></content:encoded>
  <pubDate>Mon, 13 Jul 2026 01:00:00 GMT</pubDate>
</item></channel></rss>`;

const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
  <title>Ethereum roadmap update</title>
  <link rel="alternate" href="https://example.com/atom-entry" />
  <summary type="html">&lt;p&gt;ETH roadmap details.&lt;/p&gt;</summary>
  <content type="html">&lt;p&gt;Longer Ethereum roadmap context.&lt;/p&gt;</content>
  <published>2026-07-13T02:00:00Z</published>
</entry></feed>`;

assert.equal(detectFeedFormat(rss), 'rss');
assert.equal(detectFeedFormat(atom), 'atom');

assert.deepEqual(parseSyndicationFeed(rss, source)[0], {
  id: 'fixture:https://example.com/rss-item',
  title: 'Bitcoin & markets',
  url: 'https://example.com/rss-item',
  description: 'BTC liquidity improved.',
  content: 'Longer BTC market context.',
  pubDate: 'Mon, 13 Jul 2026 01:00:00 GMT',
  source: 'Fixture',
  sourceId: 'fixture',
  sourceTier: 'editorial',
  topic: 'btc',
  maxAgeHours: 72,
});

const atomItem = parseSyndicationFeed(atom, { ...source, format: 'atom', topic: 'eth' })[0];
assert.equal(atomItem.url, 'https://example.com/atom-entry');
assert.equal(atomItem.description, 'ETH roadmap details.');
assert.equal(atomItem.content, 'Longer Ethereum roadmap context.');
assert.equal(atomItem.pubDate, '2026-07-13T02:00:00Z');

assert.equal(parseSyndicationFeed('<html>not a feed</html>', source).length, 0);
assert.equal(NEWS_SOURCES.some(entry => entry.id === 'dlnews'), false);
assert.equal(NEWS_SOURCES.some(entry => entry.url.includes('/category/markets/')), false);
assert.equal(NEWS_SOURCES.find(entry => entry.id === 'blockworks')?.format, 'atom');

console.log('feed parser tests passed');
