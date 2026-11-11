# Crypto Brief Reliability and Analysis Quality Design

**Status:** Approved for phased implementation on 2026-07-13

## Context

Crypto Daily Brief still deploys and its existing tests pass, but live investigation found several reliability and product-quality failures:

- A forced refresh completed successfully only after approximately 72 seconds. The browser and Worker have no end-to-end generation deadline, so a slow upstream request looks like a stuck page.
- The configured CoinDesk Markets feed returns HTTP 404.
- Blockworks initially appeared to be a viable Atom replacement, but final live verification found both its old and migrated-domain feeds frozen in January 2026. Atom parsing remains supported, while Blockworks is excluded from the active manifest.
- Publisher failures are silently converted into empty arrays. `/health` reports aggregate counts and can report healthy even when individual sources are broken and LINK coverage is zero.
- The live 20-item set observed during the audit contained 14 items with no BTC, ETH, or LINK tag, and no LINK item.
- RSS descriptions averaged about 120 characters, yet the prompt demanded roughly 30 analysis bullets. This forces repetitive filler and unsupported synthesis.
- Support, resistance, stablecoin trends, and some macro implications are requested without sufficient historical input, causing the model to infer facts the data does not establish.
- The configured `gemini-3-flash-preview` model has a stable recommended replacement, `gemini-3.5-flash`. The configured `gemini-2.5-flash` fallback is scheduled for shutdown on 2026-10-16.
- Wrangler is pinned at 4.85.0 while 4.110.0 is current at the time of this design.

## Goals

1. Preserve the working product while improving reliability in independently testable phases.
2. Make source failures observable and support both RSS and Atom.
3. Improve BTC, ETH, and LINK evidence coverage without filling the prompt with unrelated material.
4. Keep the last usable brief visible during slow or failed refreshes.
5. Generate shorter, stronger analysis grounded in deterministic market and macro facts.
6. Upgrade to a stable Gemini model with bounded latency and safe fallback behavior.
7. Preserve all existing public routes, the current brief shape, the KV binding, GitHub Pages hosting, and the GitHub Actions deployment workflow.
8. Provide an immediate rollback path for analysis-pipeline changes.

## Non-goals

- No full application rewrite.
- No framework migration for the static frontend.
- No migration to the Gemini Interactions API in this work. The existing `generateContent` endpoint remains supported and already provides structured output.
- No paid news API, database, queue, Durable Object, or new hosted service.
- No automated trading, portfolio management, or financial recommendations.
- No semantic claim-verification system that pretends to prove arbitrary natural-language claims. Validation will enforce evidence identity, asset alignment, required deterministic facts, and output structure.
- No production deployment, push, or pull request without a separate explicit publishing step.

## Global Safety Constraints

- Existing route response formats remain compatible. New diagnostics are additive.
- Existing cached briefs remain renderable.
- A failed refresh must never overwrite the last valid cached brief.
- The old analysis behavior remains selectable with `BRIEF_PIPELINE_VERSION=v1` until the new path is verified. The new path is `v2`.
- Every behavior change begins with a failing regression test.
- Each phase ends with the full test suite, a clean diff check, and a separate commit.
- Live-source checks are diagnostic and opt-in; CI tests use deterministic fixtures and never depend on publisher uptime.

## Architecture

The Cloudflare Worker remains the route and orchestration layer. Targeted modules are added only where they create a testable boundary:

- `src/feed-parser.js`: parse RSS and Atom into one normalized item shape.
- `src/news-sources.js`: source manifest, source policy, and public source metadata.
- `src/news.js`: sanitization, asset tagging, deduplication, quality scoring, and balanced selection.
- `src/market.js`: deterministic market-history calculations.
- `src/gemini.js`: model selection, retry/fallback classification, output normalization, and evidence validation.
- `worker.js`: network calls, caches, route compatibility, orchestration, and KV writes.
- `index.html`: existing UI plus bounded requests and non-destructive refresh behavior.

The data flow is:

1. Fetch market, macro, and news inputs concurrently within explicit deadlines.
2. Normalize and validate each upstream result independently.
3. Calculate market and macro facts in code.
4. Select a diverse evidence pack with deterministic identifiers.
5. Ask Gemini for structured synthesis only from that evidence pack.
6. Validate output structure and evidence references.
7. Cache only a valid brief; otherwise retain the previous cache entry.
8. Render the new brief or keep the previous brief visible with an actionable error.

## Phase 1: Source and Loading Reliability

### Source manifest

The initial source set is deliberately conservative:

- CoinDesk general RSS: editorial crypto coverage.
- The Block RSS: editorial crypto coverage.
- Decrypt RSS: editorial crypto coverage.
- Google News ETH and LINK searches: fallback discovery only.
- Dow Jones Markets and FT Markets RSS: macro context.

DL News and the dead CoinDesk Markets URL are removed. Additional sources are not added until their publisher-owned feed, freshness, and Worker accessibility are verified.

Every source definition specifies:

- stable source identifier and display name;
- URL;
- expected `rss` or `atom` format, with auto-detection as a safe fallback;
- topic and source tier (`editorial`, `primary`, `discovery`, or `macro`);
- maximum accepted items and freshness window;
- per-source request deadline, defaulting to 6,500 milliseconds.

### Feed parsing and diagnostics

RSS `<item>` and Atom `<entry>` are normalized to:

```js
{
  id,
  title,
  url,
  description,
  content,
  pubDate,
  source,
  sourceId,
  sourceTier,
  topic,
  maxAgeHours,
}
```

The parser handles CDATA, HTML entities, RSS `description`, RSS `content:encoded`, Atom `summary`, Atom `content`, Atom link attributes, RSS links, and GUID fallbacks. HTML and URLs are sanitized before prompt use. Normalized descriptions are limited to 600 characters and normalized content to 1,200 characters so a publisher cannot dominate the model context.

Each source reports:

```js
{
  sourceId,
  source,
  ok,
  status,
  format,
  durationMs,
  parsedCount,
  freshCount,
  acceptedCount,
  newestPubDate,
  error,
}
```

Errors are normalized to `timeout`, `http`, `parse`, `empty`, or `unknown`; no secret or response body is exposed. `/news` remains the existing array. `/health` gains additive per-source diagnostics and a `degraded` flag.

`news.ok` is true when at least eight usable selected items exist. `news.degraded` becomes true when any tracked asset has zero source coverage, fewer than two direct editorial sources are healthy, or a configured direct source fails. A missing LINK story does not take down the application, but it can no longer be hidden by unrelated macro articles.

### Balanced selection

Selection follows these rules in order:

1. Reject invalid dates, stale items, low-signal prediction/promotional content, and mismatched asset-search results.
2. Deduplicate canonical URLs and titles that become identical after lowercasing, removing punctuation, collapsing whitespace, and removing a trailing publisher suffix.
3. Prefer direct editorial sources over discovery aggregators for equivalent asset coverage.
4. Add up to four unique items for each of BTC, ETH, and LINK when available; an item that covers multiple assets can satisfy more than one asset target but appears only once.
5. Limit any one publisher to four selected items.
6. Add at most five items with no tracked-asset mention, including macro items.
7. Fill remaining capacity with asset-tagged items ordered by direct-source tier and freshness without incrementing quotas for duplicates.
8. Return fewer than the limit when the remaining items are unrelated or low quality.

The default limit remains 20 to preserve prompt size and UI expectations.

### Non-destructive loading

The existing cache and route remain authoritative. The frontend changes behavior as follows:

- Cached content renders immediately.
- `/brief?allowStale=1` may return an expired but structurally valid brief with `fresh: false`; default `/brief` behavior remains unchanged for compatibility.
- When stale content is shown on initial load, one automatic refresh runs without hiding the brief.
- Manual refresh disables the refresh button and shows progress without blanking the page.
- Browser market, macro, and news requests each have a 15-second deadline. The browser Gemini request has a 105-second deadline.
- If refresh fails and a prior brief is visible, that brief remains visible with a concise retry message.
- If no brief exists, the loading screen ends in an error state with a retry control rather than waiting indefinitely.
- Concurrent refresh attempts are ignored.

## Phase 2: Evidence-first Analysis

### Deterministic market data

A new additive `/market` route returns the same current CoinGecko fields used today plus computed signals from 30-day OHLC and market-chart data for BTC, ETH, and LINK. During rollout the frontend falls back to the existing direct CoinGecko request if `/market` fails.

`src/market.js` computes, without Gemini:

- current price and 24-hour/7-day return;
- 7-day and 30-day high/low range;
- position within the 30-day range;
- 7-day versus prior-7-day momentum;
- recent volume versus the trailing average;
- realized volatility from daily returns;
- support and resistance from recent swing-point clusters, with a deterministic recent-range fallback.

Range position is `(current - low30d) / (high30d - low30d)`. Momentum is the latest 7-day return minus the preceding 7-day return. Volume trend is the latest daily volume divided by the mean of the preceding seven daily volumes, minus one. Realized volatility is the sample standard deviation of daily log returns annualized by `sqrt(365)`.

Swing candidates use a five-bar window: a swing low is lower than the two bars on each side, and a swing high is higher than the two bars on each side. Candidates within 1.5% are clustered and ranked by touch count, then recency, then proximity to current price. Support is the highest-ranked cluster below current price and resistance the highest-ranked cluster above it. If either side has no cluster, use the corresponding 7-day low/high when it is on the correct side, followed by the 30-day low/high. Support is always below the current price and resistance is always above it. If a valid level still cannot be derived, the field is explicitly unavailable instead of guessed.

### Deterministic macro trends

The Worker adds trend fields only when source data supports them:

- Yahoo 1-day and multi-day moves from chart history;
- current versus prior NY Fed effective rate;
- current CPI year-over-year value and direction versus the prior comparable observation;
- DefiLlama stablecoin 7-day and 30-day circulating-supply changes;
- current Fear & Greed value and classification.

Gemini receives exact current values and exact computed deltas. It is not asked to describe a rise, fall, expansion, contraction, support, or resistance level that the deterministic fact pack does not contain.

### Evidence contract

Every fact receives a stable request-local identifier:

- news: `news:1`, `news:2`, and so on;
- market: `market:btc:rangePosition`, `market:eth:volumeTrend`, and so on;
- macro: `macro:stablecoins:change7d`, `macro:sp500:change1d`, and so on.

The v2 bullet shape remains compatible with the renderer because `label` and `text` are preserved:

```js
{
  label: "ETF Flows",
  text: "... [2]",
  evidenceIds: ["news:2"],
  confidence: "high"
}
```

Valid confidence values are `high`, `medium`, and `low`. Asset bullets may reference only evidence tagged for that asset or that asset's deterministic market facts. Macro, threat, and watch items may use macro and general-news evidence. Unknown or cross-asset evidence references reject the response.

The public brief retains `btc`, `eth`, `link`, `macro`, `threats`, `watch`, `verdict`, `ranking`, `bullTrigger`, and `bearTrigger`. New metadata is additive and ignored by the current renderer.

### Shorter output when evidence is thin

The v2 schema stops forcing filler:

- asset bullets: 3 to 5 each;
- macro bullets: 3 to 5;
- threats: 3 to 5;
- watch items: 3 to 6.

An asset section may consist mostly of deterministic market analysis when news evidence is absent. It must not imply that lack of selected news means lack of real-world activity.

### Gemini model and deadlines

- Primary: `gemini-3.5-flash`.
- Fallback: `gemini-3.1-flash-lite`.
- Endpoint: existing `v1beta/models/{model}:generateContent`.
- Thinking level: configurable with `GEMINI_THINKING_LEVEL`, default `low` to balance analysis and latency.
- Sampling: use Gemini 3 defaults rather than overriding temperature.
- Output token ceiling: 8,192, sufficient for the bounded schema.
- Total Worker generation deadline: 90 seconds across primary, fallback, and one correction attempt. An individual model call receives at most 55 seconds or the remaining total time, whichever is smaller.

Fallback is allowed for timeouts, rate limits, model unavailability, and transient server responses. Authentication, permission, malformed-request, and safety failures are returned immediately. The response adds non-sensitive metadata for the model used, attempt count, duration, pipeline version, and validation result.

`BRIEF_PIPELINE_VERSION=v1` preserves the old prompt/schema path. `v2` enables the evidence-first path. Both return the same public brief envelope.

## Phase 3: Tooling, Tests, and Operations

- Update Wrangler within major version 4 and regenerate the npm lockfile.
- Keep Node 22 in CI unless a dependency requires a supported change.
- Retain the existing GitHub Actions test-before-deploy sequence.
- Document source diagnostics, model variables, pipeline rollback, stale-cache behavior, and live verification commands.
- Add an opt-in live-source diagnostic script that never runs as a required CI gate.
- Perform only targeted module extraction. `index.html` remains a static single-page application and `worker.js` remains the entrypoint.

## Error Handling

- Upstream data failures are isolated; partial macro or news data may still produce a brief when minimum market data exists.
- Missing current BTC, ETH, or LINK price data blocks generation because the renderer and core analysis require all three assets.
- Missing history disables only the affected deterministic signals.
- A source failure records diagnostics and contributes no items.
- Invalid Gemini JSON gets one bounded correction opportunity.
- Invalid evidence references get one bounded correction opportunity.
- Exhausted generation attempts return a typed error and do not write KV.
- Unknown-route behavior remains unchanged in this work to avoid an unrelated compatibility risk.

## Test Strategy

### Unit tests

- RSS and Atom parsing fixtures, including CDATA, Atom link attributes, encoded HTML, invalid dates, and malformed feeds.
- Source selection for diversity, quotas, duplicates, discovery fallback, mismatched topics, and thin coverage.
- Source-health aggregation and degradation rules.
- Market calculations for swing levels, fallback levels, range position, momentum, volume, volatility, and insufficient data.
- Model list resolution, retry classification, deadline handling, response parsing, and evidence validation.

### Route tests

- Existing routes and response envelopes remain compatible.
- `/news` stays an array.
- `/health` exposes safe source diagnostics and degradation.
- `/brief?allowStale=1` can serve a stale valid brief without changing default `/brief` semantics.
- `/market` returns deterministic fixtures and degrades individual history fields safely.
- Model fallback and v1 rollback behavior.
- Failed validation never writes KV.

### Frontend tests

- Inline script still parses.
- Request timeout helper aborts with a useful error.
- Refresh preserves an already rendered brief.
- Empty-cache failure exposes retry instead of an infinite loader.
- Existing and v2 brief shapes render safely.

### Verification gates

Each phase must pass:

1. targeted new regression tests;
2. the complete existing and new test suite;
3. `git diff --check`;
4. Wrangler dry-run/bundle validation;
5. local static-page browser smoke test;
6. read-only live `/health`, `/news?nocache=1`, `/macro?nocache=1`, and publisher-feed checks where relevant.

No production deploy is part of these implementation phases.

## Rollback

- Set `BRIEF_PIPELINE_VERSION=v1` to restore the previous prompt/schema without reverting code.
- Existing cached v1 and v2 briefs remain renderer-compatible.
- If `/market` is unavailable, the frontend uses the existing direct CoinGecko current-price path.
- Source additions/removals are isolated in the manifest and can be reverted without touching selection or parsing code.
- Each phase has a separate commit, so a regression can be reverted without discarding later unrelated work.

## Success Criteria

- Existing tests continue to pass.
- Atom fixtures produce normalized articles, and Blockworks' frozen feed is not reported as an active source.
- DL News, the dead CoinDesk Markets URL, and Blockworks' frozen feed no longer appear in active configuration, UI copy, or source lists; operational documentation records why they were removed.
- `/health` identifies individual source failures and zero-coverage assets.
- One publisher cannot occupy more than four selected news slots.
- Refresh has a bounded terminal state and never hides an existing valid brief for the duration of generation.
- Stable Gemini 3.5 Flash is the default and stable Gemini 3.1 Flash-Lite is the fallback.
- Gemini cannot cache a brief containing unknown or asset-mismatched evidence identifiers.
- Support, resistance, market trends, and stablecoin trends displayed or discussed by the v2 pipeline originate from deterministic calculations.
- The v1 pipeline remains selectable until post-implementation verification is complete.
- The implementation introduces no new paid service or production infrastructure dependency.
