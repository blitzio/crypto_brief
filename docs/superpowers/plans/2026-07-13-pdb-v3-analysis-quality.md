# PDB v3 Analysis Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a reversible PDB v3 pipeline that produces a genuinely useful eight-to-ten-minute crypto intelligence brief, rejects thin or unsupported output, preserves v1/v2 compatibility, and cannot replace a good cached brief unless every quality gate passes.

**Architecture:** Add an opt-in `v3` path beside the unchanged v1/v2 generation paths. Put the v3 response schema, authoritative prompt builder, word-depth metrics, and evidence validator in a pure Worker-side module. Add bounded model-only news enrichment in a separate module. Render v3 through a version-aware browser path while retaining the current renderer for cached v1/v2 briefs. Keep production on v2 until a real local v3 brief passes human acceptance.

**Tech Stack:** Cloudflare Workers ES modules, browser JavaScript and HTML/CSS, Node.js tests, Cloudflare KV/cache, RSS/Atom feeds, Gemini GenerateContent REST API, Wrangler 4.110.0.

## Global Constraints

- No application rewrite, frontend framework migration, database, queue, Durable Object, second model pass, paid news API, new asset, or trading functionality.
- `BRIEF_PIPELINE_VERSION` accepts `v1`, `v2`, or `v3`; an absent or invalid value resolves to `v2` until the controlled rollout task.
- The existing v1/v2 schema, prompt path, public routes, cache envelope, and renderer remain compatible.
- The browser sends evidence data, but the Worker owns the v3 prompt and schema so browser and validator contracts cannot drift.
- A v3 response is cacheable only after JSON parsing, structural checks, evidence checks, numeric checks, and depth checks all pass.
- One bounded correction attempt is allowed. A second failure returns HTTP 422 and performs no KV write.
- The current valid brief remains visible in the browser and remains in KV on source, enrichment, model, validation, or timeout failure.
- Enriched publisher text is used only in the transient Gemini prompt. It is never returned to the browser, written to KV, logged, or shown in diagnostics.
- All article fetches use public HTTP(S) URLs, block local/private destinations, validate redirects, limit time and bytes, and fall back to RSS content independently.
- Gemini 3.5 Flash remains primary; Flash-Lite remains an availability fallback and must pass identical v3 validation.
- No real Gemini call, GitHub push, production variable change, or deployment occurs without its explicit gate in Tasks 8 and 9.
- Every behavior change begins with a failing test. Every task ends with its focused tests, the full suite where indicated, and `git diff --check`.

**Design reference:** `docs/superpowers/specs/2026-07-13-pdb-v3-analysis-quality-design.md`

---

### Task 1: Add the v3 response contract and deterministic depth metrics

**Files:**
- Create: `src/pdb-v3.js`
- Create: `tests/pdbV3.test.mjs`
- Modify: `package.json`

**Interfaces:**
- `PDB_V3_RESPONSE_SCHEMA`: Gemini-compatible JSON schema.
- `countBriefWords(brief): number`: counts analytical prose only.
- `measurePdbV3Depth(brief): { totalWords, sections }`: returns stable section metrics.
- `validatePdbV3StructureAndDepth(brief): { ok, violations, metrics }`: pure shape/depth gate without evidence lookup.

- [ ] **Step 1: Add the failing contract and depth tests**

Create `tests/pdbV3.test.mjs` with a `makeValidV3Brief()` fixture containing:

```js
import assert from 'node:assert/strict';
import {
  PDB_V3_RESPONSE_SCHEMA,
  countBriefWords,
  measurePdbV3Depth,
  validatePdbV3StructureAndDepth,
} from '../src/pdb-v3.js';

const prose = (count, prefix = 'analysis') =>
  Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(' ');
const evidence = ['market:btc:current', 'market:btc:rangePosition'];

export function makeValidV3Brief() {
  const judgment = (index) => ({
    title: `Judgment ${index}`,
    assessment: prose(66, 'assessment'),
    whyItMatters: prose(18, 'implication'),
    evidenceIds: evidence,
    confidence: 'medium',
    confidenceBasis: prose(12, 'basis'),
    invalidators: [prose(9, 'invalidator')],
  });
  const driver = (asset, index) => ({
    title: `Driver ${index}`,
    analysis: prose(42, `${asset}driver`),
    evidenceIds: [`market:${asset}:current`, `market:${asset}:rangePosition`],
    confidence: 'medium',
  });
  const asset = (symbol, support, resistance) => ({
    assessment: prose(72, `${symbol}assessment`),
    support,
    resistance,
    evidenceIds: [`market:${symbol}:current`, `market:${symbol}:rangePosition`],
    confidence: 'medium',
    confidenceBasis: prose(12, 'basis'),
    drivers: [1, 2, 3].map(index => driver(symbol, index)),
    confirmation: prose(18, 'confirmation'),
    invalidation: prose(18, 'invalidation'),
  });
  const scenario = (likelihood) => ({
    outlook: prose(28, 'outlook'),
    causalPath: prose(24, 'causal'),
    triggers: [prose(12, 'trigger')],
    horizon: 'next 1-7 days',
    likelihood,
    evidenceIds: ['macro:sp500:change1d', 'macro:sentiment:current'],
    confidence: 'medium',
  });
  const risk = (title) => ({
    title,
    assessment: prose(33, 'risk'),
    impact: 'high', likelihood: 'credible', horizon: 'next 7 days',
    indicator: prose(13, 'indicator'),
    evidenceIds: ['macro:sp500:change1d'], confidence: 'medium',
  });
  const watch = (title) => ({
    title, whyItMatters: prose(18, 'watch'), signal: prose(10, 'signal'),
    evidenceIds: ['macro:sp500:change1d'], confidence: 'medium',
  });
  return {
    briefVersion: 'v3',
    executive: {
      bottomLine: prose(112, 'bottom'),
      evidenceIds: ['market:btc:current', 'macro:sp500:change1d'],
      confidence: 'medium',
      confidenceBasis: prose(14, 'basis'),
      keyJudgments: [1, 2, 3, 4].map(judgment),
    },
    assets: {
      btc: asset('btc', '$95', '$105'),
      eth: asset('eth', '$45', '$55'),
      link: asset('link', '$9', '$11'),
    },
    macro: {
      assessment: prose(92, 'macro'),
      evidenceIds: ['macro:sp500:change1d', 'macro:sentiment:current'],
      confidence: 'medium', confidenceBasis: prose(12, 'basis'),
      transmissionChannels: [1, 2, 3].map(index => ({
        title: `Channel ${index}`, analysis: prose(38, 'channel'),
        evidenceIds: ['macro:sp500:change1d', 'macro:sentiment:current'], confidence: 'medium',
      })),
    },
    scenarios: {
      base: scenario('most likely'), bullish: scenario('credible'), bearish: scenario('lower probability'),
    },
    threats: [risk('Threat one'), risk('Threat two')],
    opportunities: [risk('Opportunity one'), risk('Opportunity two')],
    watch: {
      next24Hours: [watch('Watch 24A'), watch('Watch 24B'), watch('Watch 24C')],
      next7Days: [watch('Watch 7A'), watch('Watch 7B'), watch('Watch 7C')],
    },
    intelligenceGaps: [1, 2].map(index => ({
      title: `Gap ${index}`, gap: prose(16, 'gap'), whyItMatters: prose(12, 'meaning'),
      closureEvidence: prose(12, 'closure'), evidenceIds: ['macro:sp500:change1d'], confidence: 'low',
    })),
  };
}

const valid = makeValidV3Brief();
assert.equal(PDB_V3_RESPONSE_SCHEMA.properties.briefVersion.enum[0], 'v3');
assert.equal(validatePdbV3StructureAndDepth(valid).ok, true);
assert.equal(countBriefWords(valid), measurePdbV3Depth(valid).totalWords);

const thin = structuredClone(valid);
thin.executive.bottomLine = 'Markets are mixed.';
const thinResult = validatePdbV3StructureAndDepth(thin);
assert.equal(thinResult.ok, false);
assert.equal(thinResult.violations.some(v => v.reason === 'section_too_thin' && v.path === 'executive.bottomLine'), true);

const missing = structuredClone(valid);
delete missing.scenarios.bearish;
assert.equal(validatePdbV3StructureAndDepth(missing).violations.some(v => v.reason === 'missing_section'), true);

const shortOverall = structuredClone(valid);
shortOverall.assets.btc.assessment = prose(2);
shortOverall.assets.eth.assessment = prose(2);
shortOverall.assets.link.assessment = prose(2);
assert.equal(validatePdbV3StructureAndDepth(shortOverall).ok, false);

console.log('pdb v3 contract tests passed');
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/pdbV3.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/pdb-v3.js`.

- [ ] **Step 3: Implement the exact v3 schema**

In `src/pdb-v3.js`, define reusable schemas for:

- `confidence`: `high | medium | low`;
- `evidenceIds`: one to five strings;
- `keyJudgment`: title, assessment, whyItMatters, evidence IDs, confidence, confidence basis, and one or two invalidators;
- `asset`: assessment, deterministic support/resistance strings, section evidence/confidence, three or four drivers, confirmation, and invalidation;
- `macro`: assessment, section evidence/confidence, and three or four transmission channels;
- `scenario`: outlook, causal path, one to three triggers, horizon, qualitative likelihood, evidence, and confidence;
- `risk`: title, assessment, impact, likelihood, horizon, indicator, evidence, and confidence;
- `watchItem`: title, why it matters, observable signal, evidence, and confidence;
- `intelligenceGap`: title, gap, why it matters, closure evidence, related evidence, and confidence.

Set top-level `required` to every field in the design. Set these array bounds in the JSON schema: key judgments 4–5, drivers 3–4 per asset, threats 2–4, opportunities 2–4, combined enforcement deferred to the pure validator, next-24-hours 3–5, next-7-days 3–5, and intelligence gaps 2–4.

- [ ] **Step 4: Implement stable word metrics and depth violations**

Count words only from prose fields, not titles, labels, evidence IDs, confidence, likelihood, horizon, support, or resistance. Enforce:

```js
export const PDB_V3_DEPTH = Object.freeze({
  total: { min: 1300, max: 2600, targetMin: 1500, targetMax: 2200 },
  bottomLine: { min: 90, max: 170 },
  keyJudgmentAssessment: { min: 50, max: 110 },
  assetTotal: { min: 160, max: 260 },
  macroTotal: { min: 180, max: 300 },
  scenarioTotal: { min: 130, max: 240 },
  threatsAndOpportunities: { min: 180, max: 320 },
  watchAndGaps: { min: 180, max: 340 },
});
```

Return violations as `{ path, reason, actual, min?, max? }`. Reject missing arrays, wrong `briefVersion`, out-of-range item counts, a threats-plus-opportunities total outside 4–6, blank required prose, and total words outside 1,300–2,600. Upper bounds protect against runaway output but do not require exact target-length prose.

- [ ] **Step 5: Verify GREEN and add the test to the suite**

Run: `node tests/pdbV3.test.mjs`

Expected: PASS with `pdb v3 contract tests passed`.

Modify the start of `package.json`'s `test` script to run `node tests/pdbV3.test.mjs &&` before the existing tests.

- [ ] **Step 6: Commit Task 1**

```powershell
git add src/pdb-v3.js tests/pdbV3.test.mjs package.json
git commit -m "feat: define PDB v3 quality contract"
```

---

### Task 2: Enforce v3 evidence, synthesis, and numeric integrity

**Files:**
- Modify: `src/pdb-v3.js`
- Modify: `tests/pdbV3.test.mjs`
- Modify: `src/gemini.js`
- Modify: `tests/citationGuards.test.mjs`

**Interfaces:**
- `validatePdbV3Evidence(brief, evidenceIndex): { ok, violations }`.
- `validatePdbV3Brief(brief, evidenceIndex): { ok, violations, metrics }` combines all v3 gates.
- `resolvePipelineVersion(env)` accepts explicit v3 but defaults safely to v2.

- [ ] **Step 1: Write failing evidence and numeric tests**

Extend `tests/pdbV3.test.mjs` to construct a `Map` containing aligned BTC, ETH, LINK, macro, and news facts. Assert rejection for:

```js
const unknown = structuredClone(valid);
unknown.executive.keyJudgments[0].evidenceIds = ['news:999'];
assert.equal(validatePdbV3Evidence(unknown, evidenceIndex).violations.some(v => v.reason === 'unknown_evidence'), true);

const crossed = structuredClone(valid);
crossed.assets.eth.drivers[0].evidenceIds = ['market:btc:current'];
assert.equal(validatePdbV3Evidence(crossed, evidenceIndex).violations.some(v => v.reason === 'cross_asset_evidence'), true);

const weakSynthesis = structuredClone(valid);
weakSynthesis.executive.keyJudgments[0].evidenceIds = ['market:btc:current'];
assert.equal(validatePdbV3Evidence(weakSynthesis, evidenceIndex).violations.some(v => v.reason === 'insufficient_synthesis'), true);

const inventedNumber = structuredClone(valid);
inventedNumber.assets.btc.assessment += ' Bitcoin is trading at $999,999.';
assert.equal(validatePdbV3Evidence(inventedNumber, evidenceIndex).violations.some(v => v.reason === 'unsupported_numeric_claim'), true);

const badConfidence = structuredClone(valid);
badConfidence.scenarios.base.confidence = 'certain';
assert.equal(validatePdbV3Evidence(badConfidence, evidenceIndex).violations.some(v => v.reason === 'invalid_confidence'), true);
```

Extend `tests/citationGuards.test.mjs`:

```js
assert.equal(resolvePipelineVersion({ BRIEF_PIPELINE_VERSION: 'v3' }), 'v3');
assert.equal(resolvePipelineVersion({}), 'v2');
assert.equal(resolvePipelineVersion({ BRIEF_PIPELINE_VERSION: 'unexpected' }), 'v2');
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node tests/pdbV3.test.mjs
node tests/citationGuards.test.mjs
```

Expected: FAIL because the new validator is absent and v3 resolves to v2.

- [ ] **Step 3: Implement evidence traversal and section policies**

Represent every validated prose object internally as `{ path, asset, major, evidenceIds, confidence, text }`. Apply these policies:

- executive bottom line, key judgments, and scenarios may use market, macro, or news evidence;
- an asset section or driver may use only matching `market:<asset>:` IDs and news IDs tagged for that asset;
- macro transmission channels may use macro evidence and news; market evidence is allowed only when the prose explicitly compares crypto transmission and contains at least one macro ID;
- threats, opportunities, watch, and gaps may use any known evidence, because cross-asset market state can be the threat or opportunity;
- every object has one to five known IDs and a valid confidence;
- every key judgment has at least two distinct IDs whenever the complete evidence index has two usable facts;
- each macro transmission channel has at least two IDs when two macro facts exist;
- duplicate IDs do not count toward synthesis.

Use violation reasons `missing_evidence`, `unknown_evidence`, `cross_asset_evidence`, `disallowed_evidence`, `invalid_confidence`, and `insufficient_synthesis`.

- [ ] **Step 4: Implement scoped numeric-claim checking**

Strip source markers such as `[12]`, the fixed horizons `24 hours`, `7 days`, and ordinal list numbering before inspection. Treat only currency, percentage, ratio, and compact magnitude forms as claims: `$105`, `3.4%`, `1.0850`, `250B`, `65/100`. Flatten numeric values from cited evidence IDs and accept a claim when it matches a cited number within `max(0.01, abs(value) * 0.005)`. For `K/M/B/T` claims, normalize the suffix before comparison. Do not infer a numeric value from an uncited evidence item.

Validate asset `support` and `resistance` against the matching `market:<asset>:support` and `market:<asset>:resistance` evidence using the same tolerance. Return `unsupported_numeric_claim` with `{ path, claim }` when no cited value matches.

- [ ] **Step 5: Combine structural, depth, and evidence results**

`validatePdbV3Brief` must call both validators and concatenate violations without throwing:

```js
export function validatePdbV3Brief(brief, evidenceIndex) {
  const quality = validatePdbV3StructureAndDepth(brief);
  const evidence = validatePdbV3Evidence(brief, evidenceIndex);
  return {
    ok: quality.ok && evidence.ok,
    metrics: quality.metrics,
    violations: [...quality.violations, ...evidence.violations],
  };
}
```

- [ ] **Step 6: Make pipeline resolution additive and verify GREEN**

Change `resolvePipelineVersion` to:

```js
export function resolvePipelineVersion(env = {}) {
  const requested = String(env.BRIEF_PIPELINE_VERSION || '').toLowerCase();
  return ['v1', 'v2', 'v3'].includes(requested) ? requested : 'v2';
}
```

Run:

```powershell
node tests/pdbV3.test.mjs
node tests/citationGuards.test.mjs
```

Expected: both PASS.

- [ ] **Step 7: Commit Task 2**

```powershell
git add src/pdb-v3.js tests/pdbV3.test.mjs src/gemini.js tests/citationGuards.test.mjs
git commit -m "feat: validate PDB v3 analytical depth"
```

---

### Task 3: Build the authoritative v3 prompt and opt-in Worker generation path

**Files:**
- Modify: `src/pdb-v3.js`
- Modify: `tests/pdbV3.test.mjs`
- Modify: `worker.js`
- Modify: `tests/workerRoutes.test.mjs`
- Modify: `.env.example`
- Modify: `wrangler.jsonc`

**Interfaces:**
- `buildPdbV3Prompt(cachePayload, options?): { systemInstruction, userPrompt }`.
- POST `/` keeps its existing response envelope and adds v3 metadata when configured.

- [ ] **Step 1: Write failing prompt tests**

Assert that `buildPdbV3Prompt`:

- names the Singapore reader and one-to-seven-day decision horizon;
- includes every deterministic evidence ID and exact supplied value;
- includes at most 20 news documents;
- requests 1,500–2,200 words and every v3 section;
- distinguishes observed facts, judgments, scenarios, confidence, invalidators, and intelligence gaps;
- forbids buy/sell instructions, fabricated events, invented probabilities, and unsupported numbers;
- never includes browser-supplied system text.

Use literal assertions for `PDB v3`, `1,500-2,200`, `BOTTOM LINE`, `KEY JUDGMENTS`, `SCENARIOS`, `INTELLIGENCE GAPS`, and known fixture evidence IDs.

- [ ] **Step 2: Write failing Worker route tests**

Add a `validV3Brief()` fixture derived from `makeValidV3Brief()` directly in `tests/workerRoutes.test.mjs` so route tests do not import test files. Mock Gemini and POST with `BRIEF_PIPELINE_VERSION: 'v3'`. Assert:

```js
assert.equal(call.body.generationConfig.responseJsonSchema.properties.briefVersion.enum[0], 'v3');
assert.equal(call.body.generationConfig.thinkingConfig.thinkingLevel, 'medium');
assert.match(call.body.systemInstruction.parts[0].text, /PDB v3/);
assert.doesNotMatch(call.body.systemInstruction.parts[0].text, /browser override sentinel/);
assert.equal(responseBody.meta.pipelineVersion, 'v3');
assert.equal(responseBody.meta.validation.type, 'pdb-v3');
assert.equal(responseBody.meta.quality.totalWords >= 1300, true);
```

Also assert v2 still uses low thinking and its existing schema when the variable is absent.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
node tests/pdbV3.test.mjs
node tests/workerRoutes.test.mjs
```

Expected: prompt export and v3 Worker behavior tests FAIL.

- [ ] **Step 4: Implement the prompt builder**

Build evidence lines from the same `buildEvidenceIndex(cachePayload)` source used by validation. Serialize values deterministically with IDs. Serialize selected news as documents with ID, publisher, headline, asset tags, publication time, and bounded content. The system instruction must define the analyst role, evidence rules, fact-versus-judgment discipline, uncertainty language, output target, and prohibited behavior. The user prompt must contain only the evidence dossier and the required analytical questions.

Do not reuse the browser's v2 prompt for v3. Preserve the current messages path byte-for-byte for v1/v2.

- [ ] **Step 5: Integrate v3 without changing v1/v2 behavior**

Import `PDB_V3_RESPONSE_SCHEMA`, `buildPdbV3Prompt`, and `validatePdbV3Brief` into `worker.js`. In POST `/`:

1. resolve the pipeline;
2. build the evidence index;
3. when v3, replace model `contents` and `systemInstruction` with the authoritative v3 builder;
4. when v1/v2, execute the current path unchanged;
5. use `PDB_V3_RESPONSE_SCHEMA` for v3 and the current schema for v1/v2;
6. set v3 thinking from `GEMINI_V3_THINKING_LEVEL`, defaulting to `medium` and accepting only `minimal|low|medium|high`;
7. keep `GEMINI_THINKING_LEVEL` and its current `low` default for v1/v2;
8. keep max output at 8,192 tokens;
9. classify v3 validation metadata as `pdb-v3` and include only word metrics, never prompt text.

- [ ] **Step 6: Add safe local configuration**

Add these documented variables without switching the deployed default:

```dotenv
BRIEF_PIPELINE_VERSION=v2
GEMINI_THINKING_LEVEL=low
GEMINI_V3_THINKING_LEVEL=medium
NEWS_ENRICHMENT_ENABLED=false
```

In `wrangler.jsonc`, retain `BRIEF_PIPELINE_VERSION: "v2"` and add `GEMINI_V3_THINKING_LEVEL: "medium"` plus `NEWS_ENRICHMENT_ENABLED: "false"`. Do not add secrets.

- [ ] **Step 7: Verify GREEN and full regression**

Run:

```powershell
node tests/pdbV3.test.mjs
node tests/workerRoutes.test.mjs
npm test
git diff --check
```

Expected: all PASS; default route tests still identify v2.

- [ ] **Step 8: Commit Task 3**

```powershell
git add src/pdb-v3.js tests/pdbV3.test.mjs worker.js tests/workerRoutes.test.mjs .env.example wrangler.jsonc
git commit -m "feat: add opt-in PDB v3 generation"
```

---

### Task 4: Guarantee correction bounds and cache preservation for thin v3 output

**Files:**
- Modify: `worker.js`
- Modify: `tests/workerRoutes.test.mjs`

- [ ] **Step 1: Add failing route tests for quality failure**

Mock two Gemini responses: first valid JSON with a six-word bottom line, then another structurally valid but under-1,300-word response. Assert:

```js
assert.equal(geminiCalls.length, 2);
assert.match(geminiCalls[1].body.contents.at(-1).parts[0].text, /section_too_thin|brief_too_thin/);
assert.equal(response.status, 422);
assert.equal(body.error.qualityViolations.length > 0, true);
assert.equal(kv.calls.some(call => call.op === 'put'), false);
assert.equal(body.meta.validation.type, 'pdb-v3');
```

Add a successful correction test where call two returns `validV3Brief()`, then assert one KV write and v3 metadata. Add a fallback-model test proving a Flash-Lite response is validated identically before cache write.

- [ ] **Step 2: Run the route tests and verify RED**

Run: `node tests/workerRoutes.test.mjs`

Expected: FAIL because v3 correction feedback and cache rules are not yet specialized.

- [ ] **Step 3: Implement precise bounded correction feedback**

For v3, feed at most 15 violations into the one correction prompt. Format each as `path: reason (actual/min/max or evidence ID when present)`. State that the full corrected JSON must be returned and that unsupported filler is not acceptable. Keep the loop at exactly two total model generations.

Return HTTP 422 with:

```js
{
  error: {
    message: 'Generated PDB v3 brief failed quality validation. The previous valid brief was preserved.',
    qualityViolations: validationCheck.violations,
  },
  meta: {
    model, attemptCount, durationMs, pipelineVersion: 'v3',
    validation: { type: 'pdb-v3', ok: false, violationCount },
    quality: validationCheck.metrics,
  },
}
```

Do not call `BRIEF_CACHE.put` on any failed path. On success, cache `briefVersion: 'v3'` inside the brief and include `meta.quality`; retain original `cachePayload.newsItems` sanitized through `buildPromptNewsItems`.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
node tests/workerRoutes.test.mjs
npm test
git diff --check
```

Expected: all PASS.

- [ ] **Step 5: Commit Task 4**

```powershell
git add worker.js tests/workerRoutes.test.mjs
git commit -m "fix: preserve cache when PDB v3 is thin"
```

---

### Task 5: Add a backward-compatible, analysis-first v3 renderer

**Files:**
- Modify: `index.html`
- Modify: `tests/frontendSmoke.test.mjs`

**Interfaces:**
- `renderBrief` dispatches by `brief.briefVersion`.
- `renderLegacyBrief` renders v1/v2 with the current behavior.
- `renderV3Brief` renders the new reading order.

- [ ] **Step 1: Write failing frontend structure tests**

Extend `tests/frontendSmoke.test.mjs` to assert:

```js
assert.ok(html.indexOf('id="bottom-line"') < html.indexOf('class="market-summary"'));
assert.ok(html.indexOf('id="key-judgments"') < html.indexOf('id="btc-price"'));
assert.ok(html.includes('id="scenario-outlook"'));
assert.ok(html.includes('id="opportunities"'));
assert.ok(html.includes('id="intelligence-gaps"'));
assert.ok(html.includes('<details class="sources-section" id="sources-annex">'));
assert.ok(scriptMatch[1].includes("brief?.briefVersion === 'v3'"));
assert.ok(scriptMatch[1].includes('function renderLegacyBrief'));
assert.ok(scriptMatch[1].includes('function renderV3Brief'));
assert.ok(scriptMatch[1].includes('function renderConfidence'));
assert.ok(scriptMatch[1].includes('evidence-link'));
```

Keep every existing loading, timeout, single-flight, stale-cache, market fallback, and active-brief-preservation assertion.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/frontendSmoke.test.mjs`

Expected: FAIL on the missing v3 DOM and renderer functions.

- [ ] **Step 3: Add v3 DOM in decision order**

Place these elements after routing and before market cards:

```html
<section class="executive-section" aria-labelledby="bottom-line-heading">
  <div class="sec-head" id="bottom-line-heading">Bottom Line</div>
  <div id="bottom-line"></div>
  <div class="sec-head">Key Judgments</div>
  <ol class="judgments" id="key-judgments"></ol>
</section>
```

After asset/macro analysis add `scenario-outlook`, separate `threats` and `opportunities`, `watch-24h`, `watch-7d`, and `intelligence-gaps`. Convert the source area to a closed `<details>` with a `<summary>` that includes `source-count` and a three-source preview. Keep the raw-source diagnostic nested behind its existing explicit control.

- [ ] **Step 4: Implement safe render helpers**

All model text must pass through `escapeHtml`. Evidence markers become links only after matching `news:<integer>` and must target `#source-<integer>`; all other IDs render as restrained text labels. `renderConfidence(value, basis)` accepts only high/medium/low CSS classes. Unknown values display `Unrated` without becoming a class name.

Render each major object with assessment first, followed by implications, evidence, confidence basis, confirmation/invalidation, or observable signal as appropriate. Do not hide prose behind accordions. Only the source annex and raw diagnostic are collapsed.

- [ ] **Step 5: Preserve legacy rendering exactly**

Move the current v1/v2 body of `renderBrief` into `renderLegacyBrief`. Dispatch with:

```js
function renderBrief(brief, prices, macro, newsItems, generatedTime) {
  if (brief?.briefVersion === 'v3') {
    renderV3Brief(brief, prices, macro, newsItems, generatedTime);
  } else {
    renderLegacyBrief(brief, prices, macro, newsItems, generatedTime);
  }
}
```

Both branches must render market cards, source links, generated time, footer date, and activate the brief. The v3 containers remain hidden for legacy; legacy containers remain hidden for v3.

- [ ] **Step 6: Keep the browser request envelope version-neutral**

Keep the current browser prompt and `cachePayload` for v1/v2 compatibility. Do not add a client-selected pipeline field: the Worker environment is the sole version authority and ignores the browser prompt when it is configured for v3. Retain the current 105-second client deadline.

- [ ] **Step 7: Verify responsive behavior and regressions**

Run:

```powershell
node tests/frontendSmoke.test.mjs
npm test
npx wrangler deploy --dry-run
git diff --check
```

Then serve locally and inspect at 1440px desktop and 390px mobile widths. Confirm the bottom line is visible without scrolling past source cards, paragraphs do not overflow, evidence links reach source cards, sources start collapsed, and v1/v2 fixture rendering still works.

- [ ] **Step 8: Commit Task 5**

```powershell
git add index.html tests/frontendSmoke.test.mjs
git commit -m "feat: render PDB v3 analysis first"
```

---

### Task 6: Add bounded, private-network-safe news enrichment

**Files:**
- Create: `src/news-enrichment.js`
- Create: `tests/newsEnrichment.test.mjs`
- Modify: `package.json`

**Interfaces:**
- `selectEnrichmentCandidates(items, limit = 8): NewsItem[]`.
- `extractPublisherSummary(html): string`.
- `isPublicArticleUrl(url): boolean`.
- `enrichNewsItems(items, options): Promise<{ items, diagnostics }>`.

- [ ] **Step 1: Write failing extraction, selection, safety, and timeout tests**

Use only inline HTML and mocked fetch responses. Assert this priority order: JSON-LD `description`, Open Graph `og:description`, `<meta name="description">`, then a bounded article paragraph excerpt. Assert HTML entities and tags are removed and the result is at most 1,200 characters.

Assert candidate selection is capped at eight, deduplicates canonical URLs, includes BTC/ETH/LINK when available, caps any publisher at two, and prefers `primary` then `editorial` over `discovery`.

Assert rejection for `file:`, `ftp:`, credentials in URLs, `localhost`, `.local`, IPv4 private/link-local/loopback ranges, IPv6 loopback/link-local/unique-local ranges, and non-HTTP(S) protocols. Mock a redirect to `127.0.0.1` and assert it is blocked before the second fetch.

Mock one timeout, one non-HTML response, one over-byte-limit response, and one success. Assert the successful item gets a transient `enrichedContent`, failures retain RSS `content`, and diagnostics contain counts/categories but no article text.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/newsEnrichment.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement bounded extraction**

`extractPublisherSummary` must parse with conservative string matching suitable for a Worker: decode JSON-LD objects and arrays inside `application/ld+json` scripts, then metadata, then up to the first four meaningful article paragraphs. Normalize whitespace, remove scripts/styles/tags, and cap output to 1,200 characters. Invalid JSON-LD must fall through without throwing.

- [ ] **Step 4: Implement URL and redirect safety**

Allow only `http:` and `https:` with no username/password. Reject literal private IPs and local hostnames before fetch. Use `redirect: 'manual'`; follow at most two redirects, validating every destination. Treat an unresolvable or ambiguous literal-IP parse as blocked. Because Worker DNS resolution is not exposed, only URLs originating from selected feed items are eligible, and redirects to literal/private/local targets are always rejected.

- [ ] **Step 5: Implement time, byte, and content-type bounds**

Defaults:

```js
const DEFAULTS = Object.freeze({
  maxArticles: 8,
  perPageTimeoutMs: 4000,
  totalTimeoutMs: 9000,
  maxResponseBytes: 750_000,
  maxContentChars: 1200,
  maxRedirects: 2,
});
```

Read response streams incrementally and cancel after `maxResponseBytes`; do not call unbounded `response.text()` when a body stream exists. Launch selected candidates concurrently, but skip starting work once the total deadline is exhausted. Return original items in original order with optional transient `enrichedContent`. Diagnostics may contain `attempted`, `succeeded`, `timedOut`, `blocked`, `nonHtml`, `tooLarge`, `httpFailed`, and `durationMs` only.

- [ ] **Step 6: Verify GREEN and wire the suite**

Run: `node tests/newsEnrichment.test.mjs`

Expected: PASS.

Add it to `package.json` immediately after `feedParser.test.mjs`, then run:

```powershell
npm test
git diff --check
```

- [ ] **Step 7: Commit Task 6**

```powershell
git add src/news-enrichment.js tests/newsEnrichment.test.mjs package.json
git commit -m "feat: enrich selected news within strict bounds"
```

---

### Task 7: Integrate enrichment without persistence or availability coupling

**Files:**
- Modify: `worker.js`
- Modify: `src/pdb-v3.js`
- Modify: `tests/workerRoutes.test.mjs`
- Modify: `.env.example`
- Modify: `wrangler.jsonc`
- Modify: `docs/OPERATIONS.md`

- [ ] **Step 1: Write failing integration tests**

For v3 with `NEWS_ENRICHMENT_ENABLED: 'true'`, mock article fetches and Gemini. Assert the Gemini prompt contains the enriched summary, while the KV body and HTTP response do not. Assert `meta.enrichment` contains counts only.

Add a full enrichment-failure test: every page fetch times out or fails, Gemini still receives RSS content, valid output returns 200, and cache write succeeds. Add a v2 test proving no article enrichment fetch occurs even when the flag is true.

Extend the health test so cached v3 metadata yields:

```js
assert.deepEqual(body.checks.enrichment, {
  enabled: true,
  lastRun: cached.meta.enrichment,
});
assert.equal(JSON.stringify(body).includes('enriched article body sentinel'), false);
```

- [ ] **Step 2: Run and verify RED**

Run: `node tests/workerRoutes.test.mjs`

Expected: FAIL on absent enrichment integration and diagnostics.

- [ ] **Step 3: Integrate only in v3 generation**

When and only when pipeline is v3 and the flag is exactly `true`, call `enrichNewsItems(buildPromptNewsItems(cachePayload.newsItems))`. Pass the transient enriched array to `buildPdbV3Prompt` through an explicit option. Build `evidenceIndex` from the original sanitized items so IDs and browser source numbering remain stable.

After prompt construction, retain only diagnostics and let the enriched array fall out of scope. Cache original sanitized news items. Never attach `enrichedContent` to `cachePayload`, `meta`, logs, errors, or response JSON.

- [ ] **Step 4: Add safe health and operations visibility**

`GET /health` reports active pipeline and:

```js
checks: {
  enrichment: {
    enabled: env.NEWS_ENRICHMENT_ENABLED === 'true',
    lastRun: cachedBrief?.meta?.enrichment ?? null,
  }
}
```

Reading health must not fetch publisher pages or call Gemini. Document the feature flag, diagnostics, limits, and rollback in `docs/OPERATIONS.md`. Keep `wrangler.jsonc` on `NEWS_ENRICHMENT_ENABLED: "false"`; local Phase B testing opts in through `.dev.vars` only.

- [ ] **Step 5: Verify GREEN and non-persistence**

Run:

```powershell
node tests/workerRoutes.test.mjs
npm test
npx wrangler deploy --dry-run
git diff --check
```

Search the code to ensure there is no cache serialization of enriched text:

```powershell
rg -n "enrichedContent" worker.js src tests
```

Expected: the production references are confined to transient prompt construction and the enrichment module; tests include explicit non-persistence assertions.

- [ ] **Step 6: Commit Task 7**

```powershell
git add worker.js src/pdb-v3.js tests/workerRoutes.test.mjs .env.example wrangler.jsonc docs/OPERATIONS.md
git commit -m "feat: integrate private v3 evidence enrichment"
```

---

### Task 8: Perform local automated and real-model acceptance in two checkpoints

**Files:**
- Modify if results require a bounded fix: `src/pdb-v3.js`, `worker.js`, `index.html`, and their matching tests
- Record non-secret results: `docs/OPERATIONS.md`

- [ ] **Step 1: Run the zero-cost automated acceptance gate**

Run:

```powershell
npm test
npm run check:sources
npx wrangler deploy --dry-run
git diff --check
git status --short
```

Expected: tests and dry run pass; source check either passes or reports transparent per-source degradation; no unexplained working-tree changes exist.

- [ ] **Step 2: Start a local v3 Worker without production mutation**

Use a local `.dev.vars` containing the existing local Gemini secret and:

```dotenv
BRIEF_PIPELINE_VERSION=v3
GEMINI_V3_THINKING_LEVEL=medium
NEWS_ENRICHMENT_ENABLED=false
```

Run the Worker locally with local KV persistence and open the existing local preview. Confirm `/version`, `/market?nocache=1`, `/macro?nocache=1`, `/news?nocache=1`, and `/health?nocache=1` before any model call.

- [ ] **Step 3: Pause for explicit approval of one real Gemini call**

Report the healthy/degraded data state, confirm that this consumes one external Gemini request, and obtain user approval. Do not infer approval from earlier code-edit authorization.

- [ ] **Step 4: Generate one genuine v3 brief with enrichment disabled**

Measure and record:

- HTTP status, model selected, duration, attempt count, and correction count;
- total analysis words and each section metric;
- evidence violation count and enrichment state;
- whether the old cached brief remained visible during generation;
- whether a failed refresh, if simulated after the successful run, preserves the valid v3 brief.

Reject acceptance if total words are outside 1,300–2,600 or if any automated validation is bypassed.

- [ ] **Step 5: Review the actual reading experience**

At desktop and mobile widths, read the full result and score each as pass/fail:

- bottom line states regime, significance, horizon, and invalidator;
- four or five judgments are prioritized and decision-relevant;
- BTC, ETH, and LINK each provide substantial, asset-aligned analysis;
- macro explains transmission instead of repeating cards;
- scenarios have causal paths and observable triggers;
- threats and opportunities distinguish impact from likelihood;
- watch items and gaps identify what evidence changes the view;
- source annex is subordinate and collapsed;
- reading time is plausibly eight to ten minutes without obvious filler.

- [ ] **Step 6: Enable enrichment locally and approve one comparison call**

Set `NEWS_ENRICHMENT_ENABLED=true`, verify `/health` shows the feature enabled without exposing text, then obtain approval for one comparison Gemini call. Compare judgment specificity and event interpretation against the no-enrichment brief. Keep enrichment disabled if it adds noise, latency beyond the 105-second client budget, or unsupported detail.

- [ ] **Step 7: Apply only bounded corrections if acceptance fails**

Each correction must start with a failing fixture reproducing the observed defect. Allowed corrections in this phase are prompt wording, schema bounds, validator precision, rendering hierarchy, or enrichment selection/extraction. A second model pass, new data vendor, added asset, or architecture change requires a new design document.

- [ ] **Step 8: Re-run the complete gate and commit acceptance fixes**

Run the Step 1 commands again. If code changed, commit only after they pass:

```powershell
git add src/pdb-v3.js src/news-enrichment.js worker.js index.html tests/pdbV3.test.mjs tests/newsEnrichment.test.mjs tests/workerRoutes.test.mjs tests/frontendSmoke.test.mjs docs/OPERATIONS.md package.json .env.example wrangler.jsonc
git commit -m "fix: satisfy local PDB v3 acceptance"
```

Do not stage `.dev.vars`, local KV state, logs, or generated brief contents.

---

### Task 9: Controlled production rollout with immediate v2 rollback

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `docs/OPERATIONS.md`

- [ ] **Step 1: Present the local acceptance evidence and request production approval**

Summarize automated results, genuine brief metrics, visual review, source state, model duration, enrichment comparison, commit list, and exact rollback. Wait for explicit approval to push/deploy.

- [ ] **Step 2: Create and publish a dedicated branch**

Create a `codex/` branch from the verified local commit, push it, and open a draft pull request. Do not merge automatically. Ensure the diff contains no `.dev.vars`, secrets, local KV, or generated content.

- [ ] **Step 3: Deploy code while keeping production on v2**

Deploy the additive code with `BRIEF_PIPELINE_VERSION=v2` and `NEWS_ENRICHMENT_ENABLED=false`. Verify `/version`, `/health`, `/market`, `/macro`, `/news`, cached brief loading, and the unchanged v2 generation contract.

- [ ] **Step 4: Switch only the pipeline variable to v3**

After the v2-compatible deployment is healthy, set `BRIEF_PIPELINE_VERSION=v3` while keeping enrichment disabled. Generate one production brief, verify `meta.pipelineVersion === 'v3'`, quality metrics, cache age, browser rendering, and active-brief preservation.

- [ ] **Step 5: Enable enrichment only if Phase C proved material benefit**

If and only if the local comparison passed, set `NEWS_ENRICHMENT_ENABLED=true`, generate one controlled brief, and inspect safe health diagnostics plus latency. Otherwise leave it false; v3 analysis quality must not depend on enrichment availability.

- [ ] **Step 6: Roll back on any acceptance failure**

Set `BRIEF_PIPELINE_VERSION=v2` and `NEWS_ENRICHMENT_ENABLED=false`. Confirm the previous v2 contract renders without clearing KV or reverting code. If a v3 cached brief is still valid, it remains renderable; the next successful v2 generation replaces it normally.

- [ ] **Step 7: Close rollout documentation**

Record the deployed commit, UTC/SGT deployment time, pipeline state, enrichment state, model, observed duration, validation metrics, and whether rollback was exercised. Mark the pull request ready only after live verification passes.

---

## Final Verification Matrix

| Gate | Command or observation | Required result |
|---|---|---|
| Unit and route tests | `npm test` | All tests pass |
| Source availability | `npm run check:sources` | Healthy or explicitly degraded; no dead configured source |
| Worker build | `npx wrangler deploy --dry-run` | Exit 0 |
| Patch hygiene | `git diff --check` | No output |
| Default safety | no pipeline variable | Resolves to v2 |
| v3 depth | genuine local output | 1,300–2,600 accepted; 1,500–2,200 targeted |
| Evidence | v3 validation metadata | Zero violations |
| Cache safety | forced failed refresh | Previous valid brief remains visible and in KV |
| Legacy compatibility | v1/v2 fixtures | Both render successfully |
| Enrichment privacy | response, KV, logs, health | No enriched article text |
| Desktop/mobile | visual inspection | Analysis-first, readable, sources collapsed |
| Rollback | set pipeline to v2 | Previous contract restored without code revert |

## Completion Definition

The work is complete only after the user has reviewed a genuine v3 local brief, all automated and visual checks pass, production approval is explicit, the live brief passes the same quality gates, and the v2 rollback path has been verified. Passing tests alone does not establish that the analysis is useful.
