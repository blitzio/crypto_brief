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
assert.ok(scriptMatch[1].includes('function parseBriefJson'), 'front-end JSON parser should stay centralized');
assert.ok(scriptMatch[1].includes('function setLoadStatus'), 'loading status updates should stay centralized');
assert.ok(scriptMatch[1].includes('function fetchWithTimeout'), 'network requests should use a shared timeout helper');
assert.ok(scriptMatch[1].includes('refreshInFlight'), 'refreshes should be single-flight');
assert.ok(scriptMatch[1].includes('/brief?allowStale=1'), 'startup should permit a stale cached fallback');
assert.ok(scriptMatch[1].includes('DATA_TIMEOUT_MS = 15000'), 'data requests should have a 15 second deadline');
assert.ok(scriptMatch[1].includes('GEMINI_TIMEOUT_MS = 165000'), 'Gemini requests should allow the 150 second PDB v3 deadline');
assert.ok(scriptMatch[1].includes('evidenceIds'), 'v2 prompts should request explicit evidence identifiers');
assert.ok(scriptMatch[1].includes('confidence'), 'v2 prompts should request evidence confidence');
assert.ok(scriptMatch[1].includes('marketSignals'), 'market evidence should be passed through the generation payload');
assert.ok(scriptMatch[1].includes("WORKER_URL + '/market'"), 'market data should come from the Worker first');
assert.ok(scriptMatch[1].includes('return { prices, marketSignals }'), 'market fetch should preserve prices and expose signals');
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
