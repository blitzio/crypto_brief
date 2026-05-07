import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);

assert.ok(scriptMatch, 'index.html should include one inline app script');
assert.doesNotThrow(() => new Function(scriptMatch[1]), 'inline app script should parse');
assert.ok(scriptMatch[1].includes('function parseBriefJson'), 'front-end JSON parser should stay centralized');
assert.ok(scriptMatch[1].includes('function setLoadStatus'), 'loading status updates should stay centralized');

console.log('frontend smoke tests passed');
