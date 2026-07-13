# Crypto Brief Reliability and Analysis Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely modernize Crypto Daily Brief in reversible phases so source failures are observable, refreshes terminate cleanly, and Gemini analysis is grounded in deterministic evidence.

**Architecture:** Preserve `worker.js`, `index.html`, every existing public route, and the cached brief envelope. Add small pure modules for syndication parsing, source configuration, and market calculations; keep network orchestration in the Worker; add v2 evidence fields without removing the renderer's existing `label` and `text` contract.

**Tech Stack:** Cloudflare Workers ES modules, browser JavaScript, Node.js 22 tests, Cloudflare KV/cache, CoinGecko, DefiLlama, Yahoo Finance, Gemini GenerateContent REST API.

## Global Constraints

- No full application rewrite, frontend framework migration, Gemini Interactions API migration, paid API, database, queue, Durable Object, or new hosted service.
- Existing routes and default response formats remain compatible; new fields and routes are additive.
- Existing cached briefs remain renderable, and a failed refresh never overwrites the last valid cache entry.
- `BRIEF_PIPELINE_VERSION=v1` remains the rollback path; `v2` is the evidence-first path.
- Current BTC, ETH, and LINK prices remain mandatory; unavailable history disables only the affected calculated signals.
- Every behavior change starts with a failing regression test and every phase ends with the full suite plus `git diff --check`.
- Production deploy, push, and pull-request creation are outside this plan.

**Design reference:** `docs/superpowers/specs/2026-07-13-crypto-brief-reliability-quality-design.md`

---

### Task 1: Normalize RSS and Atom feeds behind a source manifest

**Files:**
- Create: `src/feed-parser.js`
- Create: `src/news-sources.js`
- Create: `tests/feedParser.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: a raw XML string and one source definition.
- Produces: `detectFeedFormat(xml): 'rss' | 'atom' | 'unknown'`, `parseSyndicationFeed(xml, source): NewsItem[]`, and exported `NEWS_SOURCES` definitions.

- [ ] **Step 1: Write the failing feed parser tests**

Create fixtures inline in `tests/feedParser.test.mjs` and assert the public contract:

```js
import assert from 'node:assert/strict';
import { detectFeedFormat, parseSyndicationFeed } from '../src/feed-parser.js';
import { NEWS_SOURCES } from '../src/news-sources.js';

const source = {
  id: 'fixture', source: 'Fixture', url: 'https://example.com/feed',
  format: 'rss', topic: 'btc', sourceTier: 'editorial',
  maxItems: 8, maxAgeHours: 72, timeoutMs: 6500,
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
  source: 'Fixture', sourceId: 'fixture', sourceTier: 'editorial',
  topic: 'btc', maxAgeHours: 72,
});
assert.equal(parseSyndicationFeed(atom, { ...source, format: 'atom', topic: 'eth' })[0].url, 'https://example.com/atom-entry');
assert.equal(parseSyndicationFeed('<html>not a feed</html>', source).length, 0);
assert.equal(NEWS_SOURCES.some(entry => entry.id === 'dlnews'), false);
assert.equal(NEWS_SOURCES.some(entry => entry.url.includes('/category/markets/')), false);
assert.equal(NEWS_SOURCES.some(entry => entry.id === 'blockworks'), false);

console.log('feed parser tests passed');
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node tests/feedParser.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/feed-parser.js`.

- [ ] **Step 3: Implement the normalized parser and conservative manifest**

Implement `src/feed-parser.js` with focused helpers:

```js
import { decodeHtmlBasic, sanitizeNewsDescription } from './news.js';

export function detectFeedFormat(xml = '') {
  if (/<feed\b/i.test(xml) && /<entry\b/i.test(xml)) return 'atom';
  if (/<rss\b/i.test(xml) || /<item\b/i.test(xml)) return 'rss';
  return 'unknown';
}

function tagValue(block, tag) {
  const match = block.match(new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    'i'
  ));
  return (match?.[1] ?? match?.[2] ?? '').trim();
}

function atomLink(block) {
  const alternate = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  const any = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return decodeHtmlBasic(alternate?.[1] ?? any?.[1] ?? '');
}

export function parseSyndicationFeed(xml = '', source = {}) {
  const format = source.format === 'auto' || !source.format ? detectFeedFormat(xml) : source.format;
  const expression = format === 'atom' ? /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi : /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  const items = [];
  let match;
  while ((match = expression.exec(String(xml))) !== null) {
    const block = match[1];
    const title = decodeHtmlBasic(tagValue(block, 'title'));
    const url = format === 'atom'
      ? atomLink(block)
      : decodeHtmlBasic(tagValue(block, 'link') || tagValue(block, 'guid'));
    const description = sanitizeNewsDescription(tagValue(block, format === 'atom' ? 'summary' : 'description')).slice(0, 600);
    const content = sanitizeNewsDescription(tagValue(block, format === 'atom' ? 'content' : 'content:encoded') || description).slice(0, 1200);
    const pubDate = tagValue(block, format === 'atom' ? 'published' : 'pubDate') || tagValue(block, 'updated');
    if (!title || !url.startsWith('http')) continue;
    items.push({
      id: `${source.id}:${url}`, title, url, description, content, pubDate,
      source: source.source, sourceId: source.id, sourceTier: source.sourceTier,
      topic: source.topic, maxAgeHours: source.maxAgeHours ?? 72,
    });
  }
  return items.slice(0, source.maxItems ?? 8);
}
```

Implement `src/news-sources.js` with the approved CoinDesk, The Block, Decrypt, Google News ETH/LINK, Dow Jones, and FT definitions. Blockworks was removed after final live verification showed its old and migrated-domain feeds frozen in January 2026. Each active entry includes `id`, `url`, `source`, `format`, `topic`, `sourceTier`, `maxItems`, `maxAgeHours`, and `timeoutMs: 6500`.

- [ ] **Step 4: Add the test to the package script and verify GREEN**

Change `test` so `tests/feedParser.test.mjs` runs before the existing tests.

Run: `npm test`

Expected: all feed parser and existing tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add package.json src/feed-parser.js src/news-sources.js tests/feedParser.test.mjs
git commit -m "fix: support active RSS and Atom news feeds"
```

### Task 2: Expose per-source diagnostics and balanced evidence selection

**Files:**
- Modify: `src/news.js`
- Modify: `worker.js`
- Modify: `tests/citationGuards.test.mjs`
- Modify: `tests/workerRoutes.test.mjs`

**Interfaces:**
- Consumes: normalized feed items and `FeedHealth` records from Task 1.
- Produces: deterministic `selectTopNewsItems(items, limit)` and `/health.checks.news.sources` diagnostics while preserving `/news` as an array.

- [ ] **Step 1: Add failing selection tests**

Add cases proving canonical URL/title deduplication, no duplicate quota consumption, a four-item publisher cap, no more than five untagged items, and direct editorial preference over discovery items with equivalent tags.

```js
const selected = selectTopNewsItems([
  ...Array.from({ length: 7 }, (_, i) => ({
    title: `Bitcoin institutional item ${i}`, url: `https://coindesk.com/${i}?utm_source=rss`,
    description: 'Bitcoin BTC institutional demand.', pubDate: new Date(Date.now() - i * 1000).toUTCString(),
    source: 'CoinDesk', sourceId: 'coindesk', sourceTier: 'editorial', topic: 'general',
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    title: `Macro item ${i}`, url: `https://macro.example/${i}`,
    description: 'Stocks and rates moved.', pubDate: new Date(Date.now() - i * 1000).toUTCString(),
    source: 'Macro', sourceId: 'macro', sourceTier: 'macro', topic: 'macro',
  })),
], 20);
assert.equal(selected.filter(item => item.sourceId === 'coindesk').length, 4);
assert.equal(selected.filter(item => item.assetMentions.length === 0).length <= 5, true);
```

- [ ] **Step 2: Run selection tests and verify RED**

Run: `node tests/citationGuards.test.mjs`

Expected: FAIL because one source can currently occupy more than four slots and untagged items are not capped.

- [ ] **Step 3: Implement deterministic keys and balanced selection**

Add and export:

```js
export function canonicalNewsUrl(value = '') {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|output$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.toString();
  } catch { return String(value); }
}

export function normalizedHeadlineKey(value = '') {
  return decodeHtmlBasic(value).toLowerCase()
    .replace(/\s+-\s+[^-]+$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
```

Rework `selectTopNewsItems` to prepare once, deduplicate once, reserve up to four per tracked asset, enforce four per source, enforce five untagged total, and increment counters only after `add(item)` returns `true`.

- [ ] **Step 4: Add failing route diagnostics tests**

Change the route fixture so one URL returns Atom, one returns HTTP 404, and the remaining feeds return RSS. Assert:

```js
assert.equal(Array.isArray(newsBody), true);
assert.equal(body.checks.news.sources.some(source => source.format === 'atom' && source.acceptedCount > 0), true);
assert.equal(body.checks.news.sources.some(source => source.status === 404 && source.error === 'http'), true);
assert.equal(typeof body.checks.news.degraded, 'boolean');
```

- [ ] **Step 5: Run route tests and verify RED**

Run: `node tests/workerRoutes.test.mjs`

Expected: FAIL because `/health` has no per-source records.

- [ ] **Step 6: Integrate manifest/parser and diagnostics in `worker.js`**

Replace the nested source list and RSS parser with Task 1 imports. Make `fetchFeed(source)` always return `{ items, health }`; make `collectNewsItems()` return `{ items, sources }`; use `.items` for `/news` and Gemini cache payload; add `sources` and `degraded` to `/health`.

`news.ok` is `items.length >= 8`. `news.degraded` is true when any asset count is zero, fewer than two direct editorial sources are healthy, or any direct configured source is unhealthy.

- [ ] **Step 7: Verify Task 2 and commit**

Run: `npm test`

Expected: all tests pass and `/news` route tests still receive an array.

```bash
git add src/news.js worker.js tests/citationGuards.test.mjs tests/workerRoutes.test.mjs
git commit -m "fix: report source health and balance news evidence"
```

### Task 3: Preserve cached content and bound frontend loading

**Files:**
- Modify: `worker.js`
- Modify: `index.html`
- Modify: `tests/workerRoutes.test.mjs`
- Modify: `tests/frontendSmoke.test.mjs`

**Interfaces:**
- Consumes: existing KV `latest` records.
- Produces: additive `/brief?allowStale=1` behavior and a non-destructive, single-flight `run(forceRefresh)` UI.

- [ ] **Step 1: Add failing stale-cache route test**

For a two-hour-old valid record, assert default `/brief` remains `{cached:false, reason:'stale'}` and `/brief?allowStale=1` returns `{cached:true, fresh:false, reason:'stale', brief}`.

- [ ] **Step 2: Run route test and verify RED**

Run: `node tests/workerRoutes.test.mjs`

Expected: FAIL because stale records are currently discarded.

- [ ] **Step 3: Implement opt-in stale serving**

In `/brief`, read `allowStale` from the URL. For stale records return the record only when the flag is `1`; add `fresh: true` to normal hits and `fresh: false` to stale opt-in hits.

- [ ] **Step 4: Add failing frontend contract checks**

Assert the inline script contains `fetchWithTimeout`, `refreshInFlight`, `/brief?allowStale=1`, a 15,000 ms data timeout, a 105,000 ms Gemini timeout, and does not unconditionally remove `brief.active` at the start of every refresh.

- [ ] **Step 5: Run frontend test and verify RED**

Run: `node tests/frontendSmoke.test.mjs`

Expected: FAIL because the timeout/single-flight helpers do not exist.

- [ ] **Step 6: Implement bounded non-destructive refresh**

Add:

```js
let refreshInFlight = false;

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    throw error;
  } finally { clearTimeout(timeout); }
}
```

Use it for cache, market/macro/news, and Gemini requests. Preserve an active brief while refreshing; disable and restore the refresh button; on stale initial cache hit render immediately and continue one automatic refresh; on failure retain the active brief and show the error near the refresh control.

- [ ] **Step 7: Verify Task 3 and commit**

Run: `npm test`

Expected: all tests pass.

```bash
git add worker.js index.html tests/workerRoutes.test.mjs tests/frontendSmoke.test.mjs
git commit -m "fix: bound refreshes and preserve cached briefs"
```

### Task 4: Upgrade Gemini safely and make fallback behavior explicit

**Files:**
- Modify: `src/gemini.js`
- Modify: `worker.js`
- Modify: `tests/citationGuards.test.mjs`
- Modify: `tests/workerRoutes.test.mjs`
- Modify: `.env.example`
- Modify: `wrangler.jsonc`
- Modify: `package.json`

**Interfaces:**
- Produces: `resolveModelFallbacks`, `isRetryableGeminiStatus`, `resolvePipelineVersion`, and bounded Gemini fetch behavior.

- [ ] **Step 1: Add failing model-policy tests**

```js
assert.deepEqual(resolveModelFallbacks({}), ['gemini-3.5-flash', 'gemini-3.1-flash-lite']);
assert.deepEqual(resolveModelFallbacks({ GEMINI_MODEL: 'custom-model', GEMINI_FALLBACK_MODEL: 'fallback-model' }), ['custom-model', 'fallback-model']);
assert.equal(isRetryableGeminiStatus(404), true);
assert.equal(isRetryableGeminiStatus(429), true);
assert.equal(isRetryableGeminiStatus(503), true);
assert.equal(isRetryableGeminiStatus(400), false);
assert.equal(isRetryableGeminiStatus(401), false);
```

- [ ] **Step 2: Run and verify RED**

Run: `node tests/citationGuards.test.mjs`

Expected: FAIL on outdated defaults and missing retry classifier.

- [ ] **Step 3: Implement model policy and configuration**

Use primary `gemini-3.5-flash`, fallback `gemini-3.1-flash-lite`, `GEMINI_THINKING_LEVEL=low`, `BRIEF_PIPELINE_VERSION=v2`, and rename the deploy helper to `cf:model:gemini35`. Do not include `temperature` for Gemini 3 models. Set `maxOutputTokens` to 8,192 and `thinkingConfig.thinkingLevel` to the configured validated level.

- [ ] **Step 4: Add failing route fallback tests**

Mock primary 404 followed by fallback success; primary 401 with no fallback; and an aborted primary followed by fallback. Assert returned `meta.model`, `meta.attemptCount`, and absence of KV writes for terminal failures.

- [ ] **Step 5: Run and verify RED**

Run: `node tests/workerRoutes.test.mjs`

Expected: FAIL because 404 currently returns immediately and responses contain no metadata.

- [ ] **Step 6: Implement a 90-second total deadline**

Track `generationStartedAt` and `generationDeadline = started + 90000`. Each model fetch gets an AbortController timeout of `Math.min(55000, deadline - Date.now())`. Retry only statuses from the policy. Permit at most one correction response and never start a call with no remaining time. Add safe response/cache metadata: `model`, `attemptCount`, `durationMs`, and `pipelineVersion`.

- [ ] **Step 7: Verify Task 4 and commit**

Run: `npm test`

```bash
git add .env.example wrangler.jsonc package.json src/gemini.js worker.js tests/citationGuards.test.mjs tests/workerRoutes.test.mjs
git commit -m "feat: upgrade to stable Gemini with bounded fallback"
```

### Task 5: Calculate market evidence and expose `/market`

**Files:**
- Create: `src/market.js`
- Create: `tests/marketSignals.test.mjs`
- Modify: `worker.js`
- Modify: `tests/workerRoutes.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `deriveMarketSignals({ current, ohlc, marketChart })` and additive `GET /market` returning `{snapshotTime, prices, signals}`.

- [ ] **Step 1: Write failing pure market tests**

Use fixed 30-day fixtures and assert exact range position, momentum, volume trend, non-negative volatility, support below price, resistance above price, and unavailable fields for insufficient history.

```js
const signals = deriveMarketSignals({ current: 100, ohlc, marketChart });
assert.equal(signals.range30d.low, 80);
assert.equal(signals.range30d.high, 120);
assert.equal(signals.rangePosition30d, 0.5);
assert.equal(signals.support < 100, true);
assert.equal(signals.resistance > 100, true);
```

- [ ] **Step 2: Run and verify RED**

Run: `node tests/marketSignals.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `src/market.js`**

Implement `dailySeries`, `percentChange`, `sampleStandardDeviation`, `findSwingCandidates`, `clusterLevels`, and `deriveMarketSignals` exactly as specified in the design: five-bar pivots, 1.5% clusters, ranked by touches/recency/proximity, then 7-day and 30-day range fallbacks.

- [ ] **Step 4: Add failing `/market` route test**

Mock CoinGecko current, OHLC, and market-chart endpoints for all three assets. Assert the current `prices` object remains keyed by `bitcoin`, `ethereum`, and `chainlink`, and signals exist for `btc`, `eth`, and `link`. Mock one history failure and assert the current asset still exists with unavailable signals.

- [ ] **Step 5: Run and verify RED**

Run: `node tests/workerRoutes.test.mjs`

Expected: FAIL with the current fallback `OK` response.

- [ ] **Step 6: Implement cached `/market` orchestration**

Fetch current prices once and each asset's OHLC/market-chart data concurrently. Give each upstream request an eight-second deadline. Cache `/market-v1` for five minutes. A current-price failure blocks the route; a history failure only nulls that asset's affected signals.

- [ ] **Step 7: Verify Task 5 and commit**

Run: `npm test`

```bash
git add package.json src/market.js worker.js tests/marketSignals.test.mjs tests/workerRoutes.test.mjs
git commit -m "feat: add deterministic market evidence"
```

### Task 6: Add deterministic macro trend evidence

**Files:**
- Create: `src/macro.js`
- Create: `tests/macroSignals.test.mjs`
- Modify: `worker.js`
- Modify: `package.json`

**Interfaces:**
- Produces: pure helpers for stablecoin, CPI, rate, and Yahoo multi-day changes; adds trend fields without removing current macro fields.

- [ ] **Step 1: Write failing macro tests**

Test nearest historical point selection for 7/30 days, percentage change, prior EFFR change, previous comparable CPI YoY direction, and unavailable input.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/macroSignals.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement pure helpers and integrate upstream history**

Create `selectNearestPriorPoint`, `calculatePercentageChange`, `deriveStablecoinChanges`, `deriveRateChange`, and `deriveCpiTrend`. Fetch `stablecoincharts/all`, preserve the current USDT/USDC total, and add `change7dPct`/`change30dPct`. Preserve current Yahoo 1-day resolution and add `change5dPct` from chart closes. Add nullable `change`/`direction` fields to EFFR and CPI.

- [ ] **Step 4: Verify Task 6 and commit**

Run: `npm test`

```bash
git add package.json src/macro.js worker.js tests/macroSignals.test.mjs
git commit -m "feat: add deterministic macro trend evidence"
```

### Task 7: Enforce the v2 evidence contract without breaking the renderer

**Files:**
- Modify: `src/gemini.js`
- Modify: `worker.js`
- Modify: `index.html`
- Modify: `tests/citationGuards.test.mjs`
- Modify: `tests/workerRoutes.test.mjs`
- Modify: `tests/frontendSmoke.test.mjs`

**Interfaces:**
- Produces: `buildEvidenceIndex`, `validateBriefEvidence`, v1/v2 schemas, and compatible bullets containing `label`, `text`, `evidenceIds`, and `confidence`.

- [ ] **Step 1: Add failing evidence-validator tests**

Assert acceptance of matching `news:1`/`market:btc:*`, rejection of unknown IDs, rejection of `market:eth:*` in BTC, rejection of invalid confidence, and v1 compatibility through the existing citation validator.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/citationGuards.test.mjs`

Expected: FAIL because evidence helpers do not exist.

- [ ] **Step 3: Implement evidence index and validation**

`buildEvidenceIndex` maps news docs, asset market facts, and available macro trends to exact identifiers. `validateBriefEvidence` walks every section, requires at least one known ID per v2 bullet, enforces asset alignment, and requires confidence in `high|medium|low`. Preserve inline `[N]` citations for display and existing v1 validation.

- [ ] **Step 4: Add failing v2 route tests**

Mock a valid v2 response, an unknown evidence ID followed by a corrected response, and two invalid responses. Assert variable item counts are accepted, one correction is attempted, invalid responses return 422, and invalid results never write KV.

- [ ] **Step 5: Run and verify RED**

Run: `node tests/workerRoutes.test.mjs`

Expected: FAIL because the schema and route know only v1 citations.

- [ ] **Step 6: Implement v1/v2 prompt and schema selection**

For v2, use 3-5 asset bullets, 3-5 macro bullets, 3-5 threats, and 3-6 watch items. Require `evidenceIds` and `confidence`. Add exact market and macro fact lines to the frontend prompt and cache payload. The renderer continues reading only `label` and `text`; optional metadata is ignored.

- [ ] **Step 7: Verify Task 7 and commit**

Run: `npm test`

```bash
git add src/gemini.js worker.js index.html tests/citationGuards.test.mjs tests/workerRoutes.test.mjs tests/frontendSmoke.test.mjs
git commit -m "feat: enforce evidence-first brief analysis"
```

### Task 8: Use Worker market data with direct-price fallback

**Files:**
- Modify: `index.html`
- Modify: `tests/frontendSmoke.test.mjs`

**Interfaces:**
- Consumes: `GET /market` from Task 5.
- Produces: unchanged `prices` mapping for rendering plus `marketSignals` for the evidence prompt.

- [ ] **Step 1: Add failing frontend contract test**

Assert the script requests `WORKER_URL + '/market'`, returns `{ prices, marketSignals }`, and retains the direct CoinGecko URL inside the fallback path.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/frontendSmoke.test.mjs`

Expected: FAIL because current prices are direct only.

- [ ] **Step 3: Implement Worker-first market fetch**

Replace `fetchPrices()` with `fetchMarketData()`. Try `/market` first with 15-second timeout; require all three current assets; on failure call the existing direct CoinGecko request. Pass `marketSignals` into `callAI` and `cachePayload` without changing `renderBrief(prices, ...)`.

- [ ] **Step 4: Verify Task 8 and commit**

Run: `npm test`

```bash
git add index.html tests/frontendSmoke.test.mjs
git commit -m "feat: consume deterministic market signals safely"
```

### Task 9: Update tooling, operations, and live diagnostics

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/check-live-sources.mjs`
- Modify: `README.md`
- Modify: `docs/OPERATIONS.md`
- Modify: `.env.example`
- Modify: `wrangler.jsonc`

**Interfaces:**
- Produces: Wrangler 4.110.0 lockfile, `npm run check:sources`, and accurate operational guidance.

- [ ] **Step 1: Write the opt-in diagnostic script**

The script imports `NEWS_SOURCES`, fetches each source with its declared timeout, parses it, and prints one JSON line per source containing only `sourceId`, `status`, `durationMs`, `format`, `parsedCount`, `newestPubDate`, and `error`. It exits nonzero only when a direct editorial source fails; discovery/macro degradation is reported without failing.

- [ ] **Step 2: Add `check:sources` and update Wrangler**

Run: `npm install --save-dev wrangler@4.110.0`

Expected: `package.json` and `package-lock.json` contain 4.110.0.

- [ ] **Step 3: Update documentation and configuration**

Remove DL News, dead CoinDesk Markets, preview-model pricing claims, and the old deploy helper. Document per-source health, `degraded`, `/market`, stale cache, `GEMINI_THINKING_LEVEL`, `BRIEF_PIPELINE_VERSION`, v1 rollback, source checks, and the stable primary/fallback model IDs.

- [ ] **Step 4: Run final automated verification**

Run:

```bash
npm test
npx wrangler deploy --dry-run --outdir .wrangler-dry-run
git diff --check
git status --short
```

Expected: tests pass, Wrangler bundles successfully, diff check is clean, and only intended files are modified before commit.

- [ ] **Step 5: Run proportional live and browser verification**

Run `npm run check:sources`, read the deployed endpoints without mutation, serve the worktree locally, and verify in a browser that cached content renders, refresh does not blank it, and error/retry controls are visible when a request is deliberately pointed at a non-responsive local endpoint.

- [ ] **Step 6: Commit Task 9**

```bash
git add package.json package-lock.json scripts/check-live-sources.mjs README.md docs/OPERATIONS.md .env.example wrangler.jsonc
git commit -m "chore: refresh tooling and operations guidance"
```

### Task 10: Final compatibility and rollback audit

**Files:**
- Modify only files required by findings from this audit.

**Interfaces:**
- Confirms the design success criteria; introduces no new planned behavior.

- [ ] **Step 1: Compare every design requirement to an implementation/test**

Create a temporary checklist outside the repository, map each requirement to a test or verified code path, and fix only uncovered requirements.

- [ ] **Step 2: Run v1 and v2 route fixtures**

Run the route suite once with `BRIEF_PIPELINE_VERSION=v1` fixtures and once with v2 fixtures. Confirm both public envelopes render through the same frontend helpers.

- [ ] **Step 3: Run final verification from a clean process**

Run the complete suite, Wrangler dry-run, live-source diagnostics, and local browser smoke test again. Record exact results for handoff.

- [ ] **Step 4: Review commit boundaries and working tree**

Run `git log --oneline main..HEAD`, `git diff --check main...HEAD`, and `git status --short`. Every phase must be independently understandable and the worktree must be clean.
