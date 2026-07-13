import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);

assert.ok(scriptMatch, 'index.html should include one inline app script');
assert.doesNotThrow(() => new Function(scriptMatch[1]), 'inline app script should parse');
assert.ok(scriptMatch[1].includes('function parseBriefJson'), 'front-end JSON parser should stay centralized');
assert.ok(scriptMatch[1].includes('function setLoadStatus'), 'loading status updates should stay centralized');
assert.ok(scriptMatch[1].includes('function fetchWithTimeout'), 'network requests should use a shared timeout helper');
assert.ok(scriptMatch[1].includes('refreshInFlight'), 'refreshes should be single-flight');
assert.ok(scriptMatch[1].includes('/brief?allowStale=1'), 'startup should permit a stale cached fallback');
assert.ok(scriptMatch[1].includes('DATA_TIMEOUT_MS = 15000'), 'data requests should have a 15 second deadline');
assert.ok(scriptMatch[1].includes('GEMINI_TIMEOUT_MS = 105000'), 'Gemini requests should have a 105 second client deadline');
assert.ok(scriptMatch[1].includes('evidenceIds'), 'v2 prompts should request explicit evidence identifiers');
assert.ok(scriptMatch[1].includes('confidence'), 'v2 prompts should request evidence confidence');
assert.ok(scriptMatch[1].includes('marketSignals'), 'market evidence should be passed through the generation payload');
assert.equal(
  /const shouldForceRefresh = forceRefresh === true;\s*document\.getElementById\('brief'\)\.classList\.remove\('active'\)/.test(scriptMatch[1]),
  false,
  'refresh should not immediately hide an active brief'
);

console.log('frontend smoke tests passed');
