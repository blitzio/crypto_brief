# Market-First Brief Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the full BTC/ETH/LINK market strip directly below the header, format analytical levels cleanly, and make confidence labels understandable without changing generation, evidence, caching, or validation.

**Architecture:** Keep the single-file frontend and existing render dispatch. Change document order and CSS order for hierarchy, add one display-only formatter for analytical levels, and make supporting confidence badges optional while retaining confidence in the brief data. All behavior changes are protected by the existing frontend smoke test and verified against the cached real PDB v3 brief.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js assertion tests, Cloudflare Worker local development, in-app browser verification.

## Global Constraints

- Reading order is masthead, Market Summary, Bottom Line, Key Judgments, detailed analysis, and sources.
- BTC levels use whole dollars, ETH-level values use cents, and sub-$10 LINK levels use three decimals.
- Confidence remains in the PDB data and validator but is prominent only for the Bottom Line, Key Judgments, and scenarios.
- Confidence means evidence strength, not market direction, certainty, or a buy/sell signal.
- The validated 1,500–2,200-word generation target remains unchanged.
- Do not change Worker routes, API payloads, cache keys, model configuration, source fetching, schemas, or validation rules.
- Do not push or deploy before local desktop and mobile approval.

## File Structure

- Modify: `index.html` — document order, level formatting, confidence disclosure, confidence badge presentation, and styling.
- Modify: `tests/frontendSmoke.test.mjs` — DOM-order, formatter, confidence-copy, and rendering regression coverage.
- Modify: `docs/superpowers/specs/2026-07-14-market-first-brief-hierarchy-design.md` — clarify the approved level-formatting rule.

---

### Task 1: Restore the Market-First Reading Order

**Files:**
- Modify: `tests/frontendSmoke.test.mjs:22-23`
- Modify: `index.html:82-108`
- Modify: `index.html:359-404`

**Interfaces:**
- Consumes: Existing `.brief-top` flex container, `.market-summary`, `#v3-executive`, and the three price card IDs.
- Produces: Stable DOM order with `.market-summary` before `#bottom-line` and `#key-judgments`.

- [ ] **Step 1: Write the failing document-order assertions**

Replace the two existing analysis-first assertions with:

```js
assert.ok(
  html.indexOf('class="market-summary"') < html.indexOf('id="bottom-line"'),
  'market summary should lead the v3 executive analysis'
);
assert.ok(
  html.indexOf('id="btc-price"') < html.indexOf('id="key-judgments"'),
  'live prices should appear before key judgments'
);
```

- [ ] **Step 2: Run the smoke test and confirm RED**

Run:

```powershell
& 'C:\Users\Mike\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests/frontendSmoke.test.mjs
```

Expected: FAIL with `market summary should lead the v3 executive analysis`.

- [ ] **Step 3: Move the existing Market Summary before the executive section**

Within `.brief-top`, keep the existing market block unchanged but place it before `#v3-executive`:

```html
  <div class="market-summary">
    <div class="market-summary-kicker">Market Summary</div>
    <div class="price-strip">
      <section class="pcard btc">
        <div class="p-head"><div class="p-sym">BTC / USD</div></div>
        <div class="p-main">
          <div class="p-price" id="btc-price">—</div>
          <div class="p-deltas" id="btc-deltas"></div>
        </div>
        <dl class="p-stats" id="btc-stats"></dl>
      </section>
      <section class="pcard eth">
        <div class="p-head"><div class="p-sym">ETH / USD</div></div>
        <div class="p-main">
          <div class="p-price" id="eth-price">—</div>
          <div class="p-deltas" id="eth-deltas"></div>
        </div>
        <dl class="p-stats" id="eth-stats"></dl>
      </section>
      <section class="pcard link">
        <div class="p-head"><div class="p-sym">LINK / USD</div></div>
        <div class="p-main">
          <div class="p-price" id="link-price">—</div>
          <div class="p-deltas" id="link-deltas"></div>
        </div>
        <dl class="p-stats" id="link-stats"></dl>
      </section>
    </div>
  </div>

  <section class="executive-section" id="v3-executive" aria-labelledby="bottom-line-heading" hidden>
    <div class="executive-label" id="bottom-line-heading">Bottom Line</div>
    <div id="bottom-line"></div>
    <div class="executive-label" style="margin-top:30px;">Key Judgments</div>
    <ol class="judgments" id="key-judgments"></ol>
  </section>
```

Update the flex orders:

```css
.market-summary{margin:18px calc(var(--space-xl) * -1) 0;border-top:1px solid var(--border);background:rgba(255,255,255,.015);order:4;}
.executive-section{margin:24px calc(var(--space-xl) * -1) 0;padding:28px var(--space-xl) 30px;border-top:1px solid var(--border2);background:linear-gradient(180deg,rgba(195,171,118,.07),rgba(255,255,255,.012));order:5;}
```

- [ ] **Step 4: Run the smoke test and confirm GREEN**

Run the command from Step 2.

Expected: `frontend smoke tests passed`.

- [ ] **Step 5: Commit the hierarchy change**

```powershell
git add -- index.html tests/frontendSmoke.test.mjs
git commit -m "fix: restore market-first brief hierarchy"
```

---

### Task 2: Format Support and Resistance for Readers

**Files:**
- Modify: `tests/frontendSmoke.test.mjs`
- Modify: `index.html:518-523`
- Modify: `index.html:805-835`
- Modify: `index.html:980-990`

**Interfaces:**
- Produces: `fmtBriefLevel(value: unknown): string`.
- Consumes: Numeric values or numeric strings from legacy and PDB v3 support/resistance fields.

- [ ] **Step 1: Add failing formatter behavior tests**

Add after the inline-script parse assertion:

```js
const levelFormatterMatch = scriptMatch[1].match(/function fmtBriefLevel\(value\) \{[\s\S]*?\n\}/);
assert.ok(levelFormatterMatch, 'brief level formatter should be defined');
const fmtBriefLevel = new Function(`${levelFormatterMatch[0]}; return fmtBriefLevel;`)();
assert.equal(fmtBriefLevel('58067'), '$58,067');
assert.equal(fmtBriefLevel('1810.7350000000001'), '$1,810.74');
assert.equal(fmtBriefLevel(8.145), '$8.145');
assert.equal(fmtBriefLevel('—'), '—');
```

- [ ] **Step 2: Run the smoke test and confirm RED**

Run the frontend smoke test command from Task 1.

Expected: FAIL with `brief level formatter should be defined`.

- [ ] **Step 3: Implement the display-only formatter**

Add after `fmtPrice`:

```js
function fmtBriefLevel(value) {
  const numeric = typeof value === 'number'
    ? value
    : Number(String(value ?? '').replace(/[$,\s]/g, ''));
  if (!Number.isFinite(numeric)) return '—';
  if (Math.abs(numeric) >= 10000) {
    return '$' + numeric.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  if (Math.abs(numeric) >= 1000) {
    return '$' + numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (Math.abs(numeric) >= 10) return '$' + numeric.toFixed(2);
  return '$' + numeric.toFixed(3);
}
```

Use it in `renderCard`:

```js
<dd class="p-stat-value">${fmtBriefLevel(support)}</dd>
<dd class="p-stat-value">${fmtBriefLevel(resist)}</dd>
```

Use it in `renderAssetAssessment`:

```js
<div class="level-strip">Support ${escapeHtml(fmtBriefLevel(asset.support))} · Resistance ${escapeHtml(fmtBriefLevel(asset.resistance))}</div>
```

- [ ] **Step 4: Run the smoke test and confirm GREEN**

Expected: `frontend smoke tests passed`.

- [ ] **Step 5: Commit the formatter**

```powershell
git add -- index.html tests/frontendSmoke.test.mjs
git commit -m "fix: format analytical price levels"
```

---

### Task 3: Explain Confidence and Reduce Badge Noise

**Files:**
- Modify: `tests/frontendSmoke.test.mjs`
- Modify: `index.html:87-93`
- Modify: `index.html:359-365`
- Modify: `index.html:923-1030`

**Interfaces:**
- Consumes: Existing `confidence`, `confidenceBasis`, and `evidenceIds` fields.
- Produces: `renderAnalysisMeta(item, { showConfidence }): string` with confidence display optional and evidence unchanged.

- [ ] **Step 1: Add failing confidence presentation assertions**

Add:

```js
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
```

- [ ] **Step 2: Run the smoke test and confirm RED**

Expected: FAIL with `v3 should explain confidence on demand`.

- [ ] **Step 3: Add the accessible confidence disclosure**

Insert after `#bottom-line`:

```html
    <details class="confidence-guide">
      <summary>How to read confidence</summary>
      <div class="confidence-guide-copy">
        <p>Confidence measures evidence strength, not market direction, certainty, or a buy/sell signal.</p>
        <ul>
          <li><strong>High:</strong> Multiple reliable and independent facts or signals align.</li>
          <li><strong>Medium:</strong> Credible evidence supports the assessment, but material uncertainty or mixed signals remain.</li>
          <li><strong>Low:</strong> Evidence is limited, indirect, or conflicting.</li>
        </ul>
      </div>
    </details>
```

Add restrained disclosure styling and neutral confidence colors:

```css
.confidence-high{color:var(--blue);border-color:rgba(126,165,220,.3);background:var(--blue-bg);}
.confidence-medium{color:#dcc187;border-color:rgba(195,171,118,.3);background:var(--gold-bg);}
.confidence-low{color:var(--muted);border-color:var(--border);background:rgba(255,255,255,.025);}
.confidence-guide{margin-top:16px;max-width:760px;color:var(--muted);font-size:.82rem;}
.confidence-guide summary{width:max-content;cursor:pointer;color:var(--blue);font-weight:600;list-style-position:outside;}
.confidence-guide-copy{margin-top:10px;padding:12px 14px;border-left:2px solid rgba(126,165,220,.35);background:rgba(126,165,220,.045);line-height:1.65;}
.confidence-guide-copy ul{margin-top:7px;padding-left:18px;}
```

- [ ] **Step 4: Make confidence optional in supporting metadata**

Replace `renderAnalysisMeta` with:

```js
function renderAnalysisMeta(item = {}, { showConfidence = true } = {}) {
  const confidenceMarkup = showConfidence ? renderConfidence(item.confidence) : '';
  const basisMarkup = item.confidenceBasis
    ? `<span class="confidence-basis">${escapeHtml(item.confidenceBasis)}</span>`
    : '';
  return `<div class="analysis-meta">${confidenceMarkup}${basisMarkup}${renderEvidence(item.evidenceIds)}</div>`;
}
```

Suppress badges on supporting analysis while retaining basis text and evidence:

```js
${renderAnalysisMeta(asset, { showConfidence: false })}
${renderAnalysisMeta(driver, { showConfidence: false })}
${renderAnalysisMeta(macro, { showConfidence: false })}
```

In `renderAnalysisItems`, remove `${renderConfidence(item.confidence)}` from `.analysis-item-head`. In macro transmission channels, replace the badge call with evidence-only metadata:

```js
<div class="analysis-meta">${renderEvidence(channel.evidenceIds)}</div>
```

Keep the existing Bottom Line, Key Judgment, and scenario confidence calls unchanged.

- [ ] **Step 5: Run the smoke test and confirm GREEN**

Expected: `frontend smoke tests passed`.

- [ ] **Step 6: Commit the confidence presentation**

```powershell
git add -- index.html tests/frontendSmoke.test.mjs
git commit -m "feat: clarify intelligence confidence"
```

---

### Task 4: Full Regression and Real-Brief Visual Verification

**Files:**
- Verify: `index.html`
- Verify: `tests/*.test.mjs`
- Verify: `docs/superpowers/specs/2026-07-14-market-first-brief-hierarchy-design.md`

**Interfaces:**
- Consumes: Existing local Worker on `http://127.0.0.1:8788` and local frontend on `http://127.0.0.1:8765`.
- Produces: Verified desktop and mobile presentation with no new Gemini generation required.

- [ ] **Step 1: Run all automated tests**

```powershell
$node = 'C:\Users\Mike\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$tests = @(
  'tests/pdbV3.test.mjs',
  'tests/feedParser.test.mjs',
  'tests/marketSignals.test.mjs',
  'tests/macroSignals.test.mjs',
  'tests/selectYahooPreviousClose.test.mjs',
  'tests/citationGuards.test.mjs',
  'tests/workerRoutes.test.mjs',
  'tests/frontendSmoke.test.mjs'
)
foreach ($test in $tests) {
  & $node $test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

Expected: Every test program prints its `passed` message and exits 0.

- [ ] **Step 2: Run the deployment dry build**

```powershell
& 'C:\Users\Mike\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir 'C:\Users\Mike\AppData\Local\Temp\crypto-brief-market-first-dryrun'
```

Expected: `--dry-run: exiting now.` with no build error.

- [ ] **Step 3: Verify the cached brief in the browser**

Open `http://127.0.0.1:8765/` and verify:

- Market Summary is the first content section after the routing/header area.
- Bottom Line and Key Judgments follow the market strip.
- BTC displays whole-dollar levels, ETH displays cents, and LINK displays three decimals.
- The confidence disclosure opens and explains all three levels.
- Supporting items no longer repeat confidence badges.
- Source evidence links still open the source annex.
- Browser console has no warnings or errors.
- There is no horizontal overflow at desktop width or a 390-pixel mobile width.
- The page uses the already-cached PDB v3 brief and does not issue a generation POST.

- [ ] **Step 4: Confirm branch state**

```powershell
git diff --check
git status --short
git log --oneline -6
```

Expected: no whitespace errors and a clean working tree after the task commits.
