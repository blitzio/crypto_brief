# PDB v3 Analysis Quality Design

Date: 2026-07-13  
Status: Approved design direction; implementation not started

## Purpose

Crypto Daily Brief must become an eight-to-ten-minute decision brief for a sophisticated Singapore-based crypto investor. It should resemble the decision usefulness of a President's Daily Brief: prioritized analytic judgments, implications, uncertainty, scenarios, and observable indicators. It must not remain a market dashboard followed by short decorative bullets.

The product is not an actual government or classified publication. The PDB analogy describes the analytical standard and reading experience, not provenance or authority.

## Root Cause

The thin output is caused by the current contract, not merely by model choice:

- The local visual fixture contained roughly 250 analysis words across BTC, ETH, LINK, macro, threats, and watch.
- Pipeline v2 permits the minimum of three bullets per section and tells the model to use one or two sentences per bullet.
- The response schema supports only `label`, `text`, `evidenceIds`, and `confidence`; it cannot distinguish judgment, rationale, implication, invalidation, or information gaps.
- The current verdict is constrained to two or three sentences, and each bull or bear trigger to one sentence.
- The 20 live news items currently average about 116 characters of usable content each. They are headline teasers, not evidence dossiers.
- Threat and watch sections cannot use deterministic asset-market evidence even when that evidence is directly relevant.
- The renderer gives the 20-card source annex more visual space than the analytical product.
- Pipeline v2 improved grounding and rollback safety but reduced the asset minimum from four bullets to three, worsening perceived depth.

The fix must improve the evidence entering the model, the shape of the requested reasoning, validation of depth, and presentation. Increasing bullet count alone will not meet the goal.

## Goals

1. Produce 1,500–2,200 useful words, normally readable in eight to ten minutes.
2. Put the bottom line and key judgments before market-detail sections.
3. Explain what happened, why it matters, what is likely next, what could change the judgment, and how confident the analyst is.
4. Separate observed facts from analytical judgments and scenarios.
5. Preserve evidence alignment and reject unsupported claims.
6. Improve news context without storing or displaying publisher article bodies.
7. Keep loading bounded and preserve the most recent valid brief on any failure.
8. Introduce the work additively as pipeline v3 with v2 available as an immediate rollback.

## Non-Goals

- No full application rewrite.
- No autonomous trading, trade execution, personalized position sizing, or direct buy/sell instructions.
- No fabricated probabilities or precision unsupported by evidence.
- No scraping or republishing full copyrighted articles.
- No second AI pass in the initial v3 release.
- No expansion into additional assets in this phase.
- No production deployment until a genuine local Gemini v3 brief is reviewed.

## Approaches Considered

### Longer Existing Bullets

This would require the fewest changes but retain the flat `label + text` architecture. It would produce verbosity without reliably producing better judgments. Rejected.

### Structured Single-Pass PDB v3

One Gemini 3.5 Flash call receives richer bounded evidence and returns a structured intelligence product. The response explicitly separates bottom line, judgments, implications, scenarios, indicators, and gaps. This is the selected approach because it materially improves usefulness while preserving one-call latency and the existing caching architecture.

### Two-Pass Analyst and Editor

A first model would build an evidence dossier and a second would synthesize and edit the final brief. This may improve quality later, but it doubles model cost and increases latency, failure modes, and operational complexity. It is deferred until single-pass v3 is measured.

## Product Structure

The final brief uses the following reading order.

### 1. Bottom Line

A 100–140 word executive assessment answers:

- What market regime is in force?
- What changed or matters most today?
- What is the main implication for the next one to seven days?
- What single development would most likely overturn the assessment?

### 2. Key Judgments

Four or five prioritized judgments. Each judgment contains:

- a short title;
- a 60–90 word assessment;
- why it matters to the investor;
- two to five evidence identifiers;
- high, medium, or low confidence;
- a short confidence basis;
- one or two invalidating indicators.

Key judgments must be ordered by decision importance, not asset order or source recency.

### 3. Asset Assessments

BTC, ETH, and LINK each receive 180–220 words. Each section contains:

- a section-level assessment rather than a collection of facts;
- three or four drivers covering structure, liquidity or volume, momentum, catalysts, and relative strength where evidence exists;
- support and resistance as deterministic data, not model invention;
- the most important confirmation and invalidation condition;
- relevant confidence and evidence identifiers.

The model must not manufacture an asset catalyst when coverage is thin. It should explain what the deterministic evidence supports and explicitly identify the news gap.

### 4. Macro and Cross-Asset Regime

A 200–250 word assessment synthesizes rates, inflation, equities, gold, USD/SGD, stablecoin liquidity, and sentiment. It must explain transmission into crypto rather than repeat data cards. Three or four transmission channels identify confluence, divergence, and what would alter the regime.

### 5. Scenario Outlook

A 150–200 word section covers:

- base case;
- credible bullish case;
- credible bearish case.

Each scenario states the causal path, observable triggers, time horizon, evidence, and confidence. The initial release uses qualitative likelihood bands (`most likely`, `credible`, `lower probability`) rather than invented numeric probabilities.

### 6. Threats and Opportunities

Threats and opportunities each contain two to four items, with four to six items combined and 200–260 words across both categories. Each item includes impact, likelihood band, time horizon, evidence, and the indicator that would show it is materializing. Deterministic market evidence is allowed when relevant.

### 7. Forward Watch and Intelligence Gaps

The final 200–260 words contain:

- three to five observable items for the next 24 hours;
- three to five observable items for the next seven days;
- two to four intelligence gaps or unresolved contradictions;
- the evidence or event required to close each important gap.

## Evidence Enrichment

The Worker continues selecting a balanced top 20 news set for transparency and display. Before generation, it selects up to eight high-value, non-duplicate articles for bounded enrichment using these rules:

- preserve BTC, ETH, LINK, and macro coverage;
- prefer direct editorial or primary sources over discovery aggregators;
- cap repeated publishers and duplicate events;
- use a four-second per-page deadline and a bounded total enrichment budget;
- accept only public HTML responses with a safe content type and bounded response size;
- extract publisher-provided JSON-LD descriptions, Open Graph descriptions, meta descriptions, or a small article-summary excerpt;
- normalize and cap the model-only context at 1,200 characters per article;
- never persist or display enriched article text;
- fall back to the RSS description without failing the brief.

The health response reports safe enrichment counts and failure categories, never article text.

Deterministic market and macro evidence remains authoritative for numerical claims. Enrichment supports event interpretation, not replacement of price or macro data.

## PDB v3 Response Contract

Pipeline v3 adds a new schema rather than mutating the v2 shape in place. The conceptual structure is:

```text
briefVersion
executive
  bottomLine
  keyJudgments[]
assets
  btc | eth | link
    assessment
    support | resistance
    drivers[]
    confirmation
    invalidation
macro
  assessment
  transmissionChannels[]
scenarios
  base | bullish | bearish
threats[]
opportunities[]
watch
  next24Hours[]
  next7Days[]
intelligenceGaps[]
```

Every analytical object contains its relevant evidence identifiers and confidence. Items that express uncertainty also contain a confidence basis or information gap. Confidence must describe evidence quality, not tone or conviction.

The renderer retains compatibility with cached v1 and v2 briefs so rollback does not require clearing KV.

## Model and Prompt Behavior

- Primary model remains stable `gemini-3.5-flash`.
- Pipeline v3 uses medium reasoning through a v3-specific configuration variable; v1 and v2 retain their existing behavior.
- The response remains structured JSON with an 8,192-token output ceiling.
- The prompt defines the reader, decision horizon, analytical questions, evidence rules, and required distinction between facts and judgments.
- Major judgments must synthesize at least two evidence items when the evidence set permits.
- News claims must retain visible source markers.
- The model must identify contradictions and missing information instead of smoothing them away.
- Gemini 3.1 Flash-Lite remains an availability fallback, but its response must pass the identical depth and evidence validation before it can replace cache.
- A failed or thin generation never overwrites the last valid brief.

## Validation and Correction

The v3 validator checks structure, evidence, and minimum analytical depth before caching:

- required sections are present;
- total analysis is between 1,300 and 2,600 words, with 1,500–2,200 as the generation target;
- bottom line and section assessments meet their minimum word budgets;
- key judgments, drivers, scenarios, threats, opportunities, and watch items meet minimum item and text depth;
- every analytical item has valid confidence and known evidence identifiers;
- asset evidence remains asset-aligned;
- major judgments use at least two distinct evidence items whenever at least two aligned items exist for that subject;
- numerical values cited by the model correspond to supplied deterministic evidence;
- repeated or near-empty restatements do not satisfy depth requirements;
- no unsupported cross-asset or publisher claim is accepted.

One bounded correction attempt receives the original failed output and precise violations. If correction fails, the Worker returns an error and preserves the cached brief.

The validator enforces useful minimums, not a requirement to fill every maximum. Unsupported filler remains invalid.

## User Interface

The current visual identity can remain, but information hierarchy changes:

1. Bottom Line and Key Judgments appear immediately after the header.
2. Market cards remain a concise data strip.
3. BTC, ETH, LINK, macro, scenarios, threats, opportunities, watch items, and intelligence gaps follow in reading order.
4. Confidence appears as restrained text or chips beside judgments.
5. Evidence markers link to the corresponding source card where possible.
6. The source annex is collapsed by default with a source count and a short top-source preview.
7. Raw model evidence remains behind an explicit diagnostic control.
8. Cached-brief and refresh behavior remains unchanged: active content stays visible during loading or failure.

The layout must remain readable on desktop and mobile. Analysis is never hidden solely to make the page shorter.

## Failure Handling

- Source enrichment is optional and individually bounded; it cannot block all news.
- Missing enriched content is surfaced as an evidence limitation, not invented around.
- Model, validation, or timeout failures preserve the active browser brief and KV record.
- Pipeline rollback is controlled by `BRIEF_PIPELINE_VERSION=v2`.
- Cached v3 briefs include `briefVersion: "v3"` and generation metadata.
- The health endpoint identifies the active pipeline, source state, enrichment state, market provider, and cache age without calling Gemini.

## Phased Implementation

### Phase A: Contract and Quality Gates

Add the v3 schema, prompt, validator, fixtures, renderer compatibility, and rollback behavior. No source enrichment is enabled yet. Verify that deterministic evidence alone produces substantial, honest analysis.

### Phase B: Bounded Evidence Enrichment

Add the top-eight enrichment pipeline, safe diagnostics, and degradation handling. Compare output against Phase A to verify that added context improves event analysis rather than adding noise.

### Phase C: Local Real-Model Acceptance

Generate a genuine local Gemini 3.5 Flash v3 brief using live evidence. Review word count, judgment quality, citations, uncertainty, scenario logic, loading time, and visual hierarchy. No production push occurs until this review passes.

### Phase D: Controlled Production Rollout

Push only after all automated and local acceptance checks pass. Validate the live Worker, render one genuine production brief, inspect cache metadata, and keep v2 rollback immediately available.

## Testing

Automated tests cover:

- v3 schema item counts and required fields;
- under-depth output rejection;
- unknown, missing, and cross-asset evidence rejection;
- numerical evidence alignment;
- one correction attempt and no cache write on failure;
- v1 and v2 cached/render compatibility;
- enrichment extraction, bounds, timeouts, duplicate handling, and fallback;
- active brief preservation during refresh failure;
- desktop and mobile DOM structure for the new reading order;
- source annex collapsed by default;
- v2 rollback using the existing public envelope.

Read-only live checks cover market, macro, news, health, enrichment diagnostics, and the Worker build. A real Gemini acceptance run is explicit because it consumes an external model call.

## Acceptance Criteria

The v3 work is ready for production consideration only when:

- a genuine local brief contains roughly 1,500–2,200 useful words;
- the bottom line explains regime, significance, next implication, and invalidation;
- each asset assessment is substantial and evidence-aligned;
- macro analysis synthesizes rather than restates cards;
- scenarios are causal and tied to observable triggers;
- confidence and intelligence gaps are explicit;
- the source annex no longer dominates the reading experience;
- all automated tests and the Wrangler dry run pass;
- live data routes are healthy or degrade transparently;
- a failed refresh preserves the last valid brief;
- switching to v2 restores the previous contract without code rollback or cache deletion.

## Deferred Follow-Up

After v3 quality is measured in production, a separate design may consider a two-pass analyst/editor workflow and additional deterministic evidence such as derivatives, ETF flows, or on-chain indicators. Those changes are intentionally outside this implementation to protect scope and reliability.
