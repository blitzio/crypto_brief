import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);

assert.ok(scriptMatch, 'index.html should include one inline app script');
assert.doesNotThrow(() => new Function(scriptMatch[1]), 'inline app script should parse');
const levelFormatterMatch = scriptMatch[1].match(/function fmtBriefLevel\(value\) \{[\s\S]*?\n\}/);
assert.ok(levelFormatterMatch, 'brief level formatter should be defined');
const fmtBriefLevel = new Function(`${levelFormatterMatch[0]}; return fmtBriefLevel;`)();
assert.equal(fmtBriefLevel('58067'), '$58,067');
assert.equal(fmtBriefLevel('1810.7350000000001'), '$1,810.74');
assert.equal(fmtBriefLevel(8.145), '$8.145');
assert.equal(fmtBriefLevel('—'), '—');
const marketLevelSanitizerMatch = scriptMatch[1].match(/function sanitizeMarketLevels\(prices, rawSignals[\s\S]*?\n\}/);
assert.ok(marketLevelSanitizerMatch, 'market level sanitizer should be defined');
const sanitizeMarketLevels = new Function(`${marketLevelSanitizerMatch[0]}; return sanitizeMarketLevels;`)();
assert.deepEqual(
  sanitizeMarketLevels(
    { bitcoin: { current_price: 100 }, ethereum: { current_price: 50 }, chainlink: { current_price: 10 } },
    {
      btc: { support: 90, resistance: 110 },
      eth: { support: 45, resistance: 55 },
      link: { support: 9, resistance: 11 },
    }
  ),
  {
    btc: { support: 90, resistance: 110 },
    eth: { support: 45, resistance: 55 },
    link: { support: 9, resistance: 11 },
  },
  'valid deterministic support and resistance should remain visible'
);
assert.deepEqual(
  sanitizeMarketLevels(
    { bitcoin: { current_price: 100 }, ethereum: { current_price: 50 }, chainlink: { current_price: 10 } },
    {
      btc: { support: 0, resistance: 110 },
      eth: { support: 55, resistance: 45 },
      link: { support: 1, resistance: 100 },
    }
  ),
  {},
  'zero, inverted, or implausibly distant levels should be rejected'
);
const visibleEvidenceSanitizerMatch = scriptMatch[1].match(/function sanitizeVisibleEvidence\(text[\s\S]*?\n\}/);
assert.ok(visibleEvidenceSanitizerMatch, 'visible evidence sanitizer should be defined');
const sanitizeVisibleEvidence = new Function(`${visibleEvidenceSanitizerMatch[0]}; return sanitizeVisibleEvidence;`)();
assert.equal(sanitizeVisibleEvidence('Range [market:link:rangePosition].'), 'Range.');
assert.equal(
  sanitizeVisibleEvidence('Risk [macro:usdsgd:change5d, news:13].'),
  'Risk [13].',
  'mixed evidence should retain only reader-facing news references'
);
assert.equal(sanitizeVisibleEvidence('News-backed claim [4].'), 'News-backed claim [4].');
const renderEvidenceMatch = scriptMatch[1].match(/function renderEvidence\(evidenceIds = \[\]\) \{[\s\S]*?\n\}/);
assert.ok(renderEvidenceMatch, 'evidence renderer should be defined');
assert.equal(
  renderEvidenceMatch[0].includes('evidence-chip'),
  false,
  'internal market and macro evidence chips must never be rendered'
);
const sourceSummaryMatch = scriptMatch[1].match(/function summarizeSourceCollection\(items = \[\]\) \{[\s\S]*?\n\}/);
assert.ok(sourceSummaryMatch, 'source collection summary should be defined');
const summarizeSourceCollection = new Function(`${sourceSummaryMatch[0]}; return summarizeSourceCollection;`)();
assert.deepEqual(
  summarizeSourceCollection([
    { source: 'The Block' },
    { source: 'CoinDesk' },
    { source: 'CoinDesk' },
  ]),
  {
    articleLabel: '3 articles · 2 publishers',
    previewLabel: '· The Block · CoinDesk',
  },
  'source summary should distinguish articles from unique publishers'
);
const citationTextMatch = scriptMatch[1].match(/function renderCitationText\(text = ''\) \{[\s\S]*?\n\}/);
assert.ok(citationTextMatch, 'reader-facing citation renderer should be defined');
const renderCitationText = new Function(
  'escapeHtml',
  'sanitizeVisibleEvidence',
  `${citationTextMatch[0]}; return renderCitationText;`
)(
  value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  value => String(value)
);
const linkedCitation = renderCitationText('Evidence <claim> [4].');
assert.match(linkedCitation, /Evidence &lt;claim&gt;/, 'citation rendering must preserve HTML escaping');
assert.match(linkedCitation, /href="#source-4"/, 'numbered citations should link to their source cards');
assert.match(linkedCitation, /openEvidence\(event, 4\)/, 'citation links should open the collapsed source annex');
const missingEvidenceMatch = scriptMatch[1].match(/function missingNewsEvidenceIds\(text = '', evidenceIds = \[\]\) \{[\s\S]*?\n\}/);
assert.ok(missingEvidenceMatch, 'missing news evidence detector should be defined');
const missingNewsEvidenceIds = new Function(`${missingEvidenceMatch[0]}; return missingNewsEvidenceIds;`)();
assert.deepEqual(
  missingNewsEvidenceIds('Claim supported by source [1].', ['news:1', 'news:3', 'market:btc:current']),
  ['news:3'],
  'structured news evidence omitted by model prose should still receive a traceability link'
);
assert.ok(scriptMatch[1].includes('function parseBriefJson'), 'front-end JSON parser should stay centralized');
assert.ok(scriptMatch[1].includes('function setLoadStatus'), 'loading status updates should stay centralized');
assert.ok(scriptMatch[1].includes('function fetchWithTimeout'), 'network requests should use a shared timeout helper');
assert.ok(scriptMatch[1].includes('refreshInFlight'), 'refreshes should be single-flight');
assert.ok(
  scriptMatch[1].includes("WORKER_URL + '/brief'"),
  'startup should request the fresh-only brief route'
);
assert.equal(
  scriptMatch[1].includes('/brief?allowStale=1'),
  false,
  'the public page must never opt into stale cached analysis'
);
assert.ok(
  scriptMatch[1].includes('cacheData.cached && cacheData.fresh === true && cacheData.brief'),
  'cached analysis must render only when the Worker explicitly marks it fresh'
);
assert.equal(
  scriptMatch[1].includes("cacheData.fresh === false ? 'stale fallback'"),
  false,
  'startup must not retain the stale-render branch'
);
assert.match(
  html,
  /<button class="accent-btn load-retry" id="load-retry-btn" type="button" onclick="run\(true\)" hidden>↻ Retry Current Brief<\/button>/,
  'an empty or expired cache failure should expose a visible forced-refresh Retry control'
);
assert.ok(
  html.includes('#loading.error .spinner{display:none;}'),
  'a terminal loading error should stop the spinner'
);
assert.ok(
  scriptMatch[1].includes('function setLoadingErrorState(isError)'),
  'loading error state should be centralized'
);
assert.ok(
  scriptMatch[1].includes('setLoadingErrorState(false);'),
  'each retry should restore the normal loading state'
);
assert.ok(
  scriptMatch[1].includes('setLoadingErrorState(true);'),
  'a no-brief generation failure should enter terminal error state'
);
assert.ok(
  scriptMatch[1].includes('Could not generate a current brief.'),
  'the terminal error should clearly say that no current brief is available'
);
assert.ok(scriptMatch[1].includes('DATA_TIMEOUT_MS = 15000'), 'data requests should have a 15 second deadline');
assert.ok(scriptMatch[1].includes('GEMINI_TIMEOUT_MS = 165000'), 'Gemini requests should allow the 150 second PDB v3 deadline');
assert.ok(scriptMatch[1].includes('evidenceIds'), 'v2 prompts should request explicit evidence identifiers');
assert.ok(scriptMatch[1].includes('confidence'), 'v2 prompts should request evidence confidence');
assert.ok(scriptMatch[1].includes('marketSignals'), 'market evidence should be passed through the generation payload');
const marketFetcherMatch = scriptMatch[1].match(/async function fetchMarketData\(\) \{[\s\S]*?\n\}/);
assert.ok(marketFetcherMatch, 'market data fetcher should be defined');
assert.ok(
  marketFetcherMatch[0].includes('const prices = await fetchDirectPrices()'),
  'displayed spot prices must come directly from CoinGecko before optional Worker signals'
);
assert.equal(
  marketFetcherMatch[0].includes('const prices = data?.prices'),
  false,
  'Yahoo-degraded Worker prices must never overwrite direct CoinGecko spot prices'
);
assert.ok(scriptMatch[1].includes('return { prices, marketSignals }'), 'market fetch should preserve direct prices and expose signals');
assert.ok(
  scriptMatch[1].includes('async function refreshMarketSummary'),
  'cached briefs should have an independent live market-summary refresh path'
);
assert.ok(
  /if \(cacheData\.cached && cacheData\.fresh === true && cacheData\.brief\)[\s\S]*?await refreshMarketSummary\(cacheData\.brief\)/.test(scriptMatch[1]),
  'a fresh cached brief must refresh the market summary before startup returns'
);
assert.ok(
  scriptMatch[1].includes('renderMarketSummary(prices, marketSignals)'),
  'market cards should render deterministic levels from the current market response'
);
const runStart = scriptMatch[1].indexOf('async function run(forceRefresh = false)');
const immediateMarketRender = scriptMatch[1].indexOf('renderMarketSummary(prices, marketSignals);', runStart);
const generationStart = scriptMatch[1].indexOf("setRefreshStatus('Generating analysis via Gemini…')", runStart);
assert.ok(
  immediateMarketRender > runStart && immediateMarketRender < generationStart,
  'force refresh should visibly update market data before waiting for Gemini analysis'
);
assert.ok(scriptMatch[1].includes('https://api.coingecko.com/api/v3/coins/markets'), 'direct CoinGecko should remain as a fallback');
assert.ok(
  html.indexOf('class="market-summary"') < html.indexOf('id="bottom-line"'),
  'market summary should lead the v3 executive analysis'
);
assert.ok(
  html.indexOf('id="btc-price"') < html.indexOf('id="key-judgments"'),
  'live prices should appear before key judgments'
);
assert.ok(html.includes('id="scenario-outlook"'), 'v3 should render scenario outlook');
assert.ok(html.includes('id="opportunities"'), 'v3 should separate opportunities from threats');
assert.ok(html.includes('id="intelligence-gaps"'), 'v3 should render intelligence gaps');
assert.ok(html.includes('<details class="sources-section" id="sources-annex">'), 'source annex should be collapsed by default');
assert.ok(scriptMatch[1].includes("brief?.briefVersion === 'v3'"), 'renderer should dispatch v3 explicitly');
assert.ok(scriptMatch[1].includes('function renderLegacyBrief'), 'legacy cached briefs should retain a renderer');
assert.ok(scriptMatch[1].includes('function renderV3Brief'), 'v3 should have a dedicated renderer');
assert.ok(scriptMatch[1].includes('function renderConfidence'), 'v3 should display confidence safely');
assert.ok(html.includes('<details class="confidence-guide"'), 'v3 should explain confidence on demand');
assert.ok(html.includes('Confidence measures evidence strength, not market direction'), 'confidence guide should prevent directional interpretation');
assert.ok(html.includes('<strong>High:</strong> Multiple reliable and independent facts or signals align.'), 'confidence guide should define high');
assert.ok(html.includes('<strong>Medium:</strong> Credible evidence supports the assessment, but material uncertainty or mixed signals remain.'), 'confidence guide should define medium');
assert.ok(html.includes('<strong>Low:</strong> Evidence is limited, indirect, or conflicting.'), 'confidence guide should define low');
assert.ok(html.includes('.confidence-high{color:var(--blue)'), 'high confidence should use neutral blue rather than bullish green');
assert.ok(html.includes('.confidence-low{color:var(--muted)'), 'low confidence should use muted gray rather than bearish red');
assert.ok(scriptMatch[1].includes('renderAnalysisMeta(asset, { showConfidence: false })'), 'asset summaries should suppress repeated badges');
assert.ok(scriptMatch[1].includes('renderAnalysisMeta(driver, { showConfidence: false })'), 'asset drivers should suppress repeated badges');
assert.ok(scriptMatch[1].includes('renderAnalysisMeta(macro, { showConfidence: false })'), 'macro summary should suppress repeated badges');
assert.ok(scriptMatch[1].includes('evidence-link'), 'news evidence should link to source entries');
assert.ok(scriptMatch[1].includes('function openEvidence'), 'evidence links should reveal the collapsed source annex');
assert.ok(scriptMatch[1].includes('annex.open = true'), 'source evidence should become visible before navigation');
assert.ok(
  scriptMatch[1].includes('item.assessment || item.gap || item.whyItMatters'),
  'intelligence gaps should render the unresolved gap before its implication'
);
assert.ok(
  scriptMatch[1].includes('item.whyItMatters && (item.assessment || item.gap)'),
  'items with a primary assessment or gap should label the separate implication'
);
assert.equal(
  /const shouldForceRefresh = forceRefresh === true;\s*document\.getElementById\('brief'\)\.classList\.remove\('active'\)/.test(scriptMatch[1]),
  false,
  'refresh should not immediately hide an active brief'
);

console.log('frontend smoke tests passed');
