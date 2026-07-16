# Fresh-Only Expired Brief Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the public page never renders a brief older than one hour and provides an unambiguous terminal error with Retry when a current brief cannot be generated.

**Architecture:** Keep the Worker cache contract unchanged and correct the browser boundary. Startup will use the Worker’s fresh-only `/brief` route and require `fresh === true` before rendering; the retained stale route remains operator-only. A small loading-state helper will stop the spinner and reveal Retry only when generation fails without an active fresh brief.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-in test runner/assertions, Cloudflare Worker/Wrangler.

## Global Constraints

- Preserve the existing one-hour freshness threshold and seven-day KV retention.
- Never request or render stale analysis from the public page.
- Keep `GET /brief?allowStale=1` available for explicit diagnostics and recovery.
- Do not change Gemini models, prompts, timeouts, validation, news, market, macro, or support/resistance behavior.
- Keep manual refresh non-destructive when an already visible brief is still current.
- Do not modify `worker.js` unless a failing test proves the existing Worker contract is insufficient.
- Execute inline because this workspace does not authorize subagent delegation.

---

### Task 1: Enforce fresh-only startup rendering

**Files:**
- Modify: `tests/frontendSmoke.test.mjs:101-130`
- Modify: `index.html:1241-1276`

**Interfaces:**
- Consumes: `GET /brief`, which returns `{ cached: true, fresh: true, brief, ... }` only for records younger than one hour and `{ cached: false, reason: "stale" }` for expired records.
- Produces: a startup path that renders only when `cacheData.cached && cacheData.fresh === true && cacheData.brief`.

- [ ] **Step 1: Replace the stale-startup assertion with the fresh-only contract**

In `tests/frontendSmoke.test.mjs`, replace the existing positive `/brief?allowStale=1` assertion with:

```js
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& 'C:\Users\Mike\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests/frontendSmoke.test.mjs
```

Expected: FAIL at `startup should request the fresh-only brief route` because production still requests `/brief?allowStale=1`.

- [ ] **Step 3: Implement the fresh-only cache branch**

In `index.html`, replace the startup cache request and stale branch with:

```js
const cacheRes  = await fetchWithTimeout(WORKER_URL + '/brief', { cache: 'no-store' }, DATA_TIMEOUT_MS);
const cacheData = await cacheRes.json();
if (cacheData.cached && cacheData.fresh === true && cacheData.brief) {
  console.log('[cache] fresh hit: rendering cached brief');
  setRefreshStatus('Loading cached brief…');
  try {
    renderBrief(
      cacheData.brief,
      cacheData.prices,
      cacheData.marketSignals || {},
      cacheData.macro,
      cacheData.newsItems || [],
      new Date(cacheData.generatedAt)
    );
  } catch (renderErr) {
    console.error('[cache] render failed for cached brief:', renderErr);
    throw renderErr;
  }
  setRefreshStatus('Refreshing live market data…');
  try {
    await refreshMarketSummary(cacheData.brief);
  } catch (marketError) {
    console.warn('[market] live summary refresh failed; retaining cached values', marketError);
  }
  setRefreshStatus();
  return;
}
console.log(`[cache] miss: ${cacheData.reason || 'no usable fresh cached brief'}`);
```

Delete the stale-only status `Showing the last brief while refreshing live data…` and all `fresh !== false` branching.

- [ ] **Step 4: Run focused frontend and Worker cache tests and verify GREEN**

Run:

```powershell
& 'C:\Users\Mike\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests/frontendSmoke.test.mjs
& 'C:\Users\Mike\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests/workerRoutes.test.mjs
```

Expected: both programs exit 0; Worker output still shows a default stale miss and an explicit opt-in stale fallback.

- [ ] **Step 5: Commit the fresh-only startup change**

```powershell
git add -- index.html tests/frontendSmoke.test.mjs
git commit -m "fix: reject stale briefs on startup"
```

---

### Task 2: Add an unmistakable terminal error and Retry state

**Files:**
- Modify: `tests/frontendSmoke.test.mjs:101-150`
- Modify: `index.html:49-68`
- Modify: `index.html:320-324`
- Modify: `index.html:604-612`
- Modify: `index.html:1230-1304`

**Interfaces:**
- Consumes: the existing `run(true)` forced-refresh entry point and `hadActiveBrief` state captured at the start of a run.
- Produces: `setLoadingErrorState(isError)`, which toggles `#loading.error` and `#load-retry-btn[hidden]` without altering an already active fresh brief.

- [ ] **Step 1: Add failing terminal-error contract checks**

Add these assertions to `tests/frontendSmoke.test.mjs` after the fresh-only assertions:

```js
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& 'C:\Users\Mike\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests/frontendSmoke.test.mjs
```

Expected: FAIL at `an empty or expired cache failure should expose a visible forced-refresh Retry control` because the loading view has no Retry button.

- [ ] **Step 3: Add the loading error presentation**

Add to the loading CSS in `index.html`:

```css
#loading.error .spinner{display:none;}
.load-retry{margin-top:4px;}
```

Add after `#load-sub`:

```html
<button class="accent-btn load-retry" id="load-retry-btn" type="button" onclick="run(true)" hidden>↻ Retry Current Brief</button>
```

Add after `setLoadStatus`:

```js
function setLoadingErrorState(isError) {
  const loading = document.getElementById('loading');
  const retryButton = document.getElementById('load-retry-btn');
  if (loading) loading.classList.toggle('error', isError);
  if (retryButton) retryButton.hidden = !isError;
}
```

At the beginning of `run`, after loading the DOM references and before starting requests, add:

```js
setLoadingErrorState(false);
```

Replace the catch body with:

```js
} catch (err) {
  console.error(err);
  const detail = err?.message || 'Unknown error';
  if (hadActiveBrief) {
    setRefreshStatus('❌ ' + detail + ' — refresh to retry.');
  } else {
    setRefreshStatus('❌ Could not generate a current brief. ' + detail);
    setLoadingErrorState(true);
  }
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
& 'C:\Users\Mike\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests/frontendSmoke.test.mjs
```

Expected: `frontend smoke tests passed` and exit 0.

- [ ] **Step 5: Commit the terminal Retry state**

```powershell
git add -- index.html tests/frontendSmoke.test.mjs
git commit -m "fix: expose retry when current brief fails"
```

---

### Task 3: Correct public and operator documentation

**Files:**
- Modify: `README.md:40-44`
- Modify: `README.md:127-133`
- Modify: `docs/OPERATIONS.md:34-38`

**Interfaces:**
- Consumes: the corrected fresh-only browser behavior from Tasks 1 and 2.
- Produces: documentation that distinguishes the public fresh-only path from the operator-only stale recovery endpoint.

- [ ] **Step 1: Update README caching behavior**

Replace the page-load and retention bullets with:

```markdown
- On page load: requests `/brief`. A fresh brief returns immediately. If the cache is missing or older than one hour, analysis remains hidden while one automatic refresh generates a current brief; failure shows a Retry control instead of expired analysis.
- `Refresh Brief`: bypasses the brief cache, keeps a currently valid brief visible, and disables duplicate refreshes until the request finishes.
- After generation: the Worker saves the generated brief to KV server-side.
- KV entries remain fresh for one hour and auto-expire after seven days for bounded operator recovery. The public page never requests or renders an expired entry.
```

Keep the architecture line describing `/brief` as fresh-only with an opt-in stale fallback because that route remains valid for operators. Update the nearby overview sentence to state that an expired startup cache keeps analysis hidden rather than rendering stale content.

- [ ] **Step 2: Update operations guidance**

Replace the sentence after the endpoint examples with:

```markdown
`/brief` accepts only fresh records and is the only cache route used by the public browser. `/brief?allowStale=1` is an operator-only recovery diagnostic that may return a retained record with `fresh: false` and `reason: "stale"`; the public page never requests or renders that expired record.
```

- [ ] **Step 3: Verify documentation and formatting**

Run:

```powershell
rg -n "allowStale|On page load|expired" README.md docs/OPERATIONS.md
git diff --check
```

Expected: stale access is described only as operator recovery; no public stale-render instruction remains; `git diff --check` exits 0.

- [ ] **Step 4: Commit documentation corrections**

```powershell
git add -- README.md docs/OPERATIONS.md
git commit -m "docs: document fresh-only brief loading"
```

---

## Final Verification

- [ ] Run all eight test programs with the bundled Node runtime:

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

Expected: all eight test programs exit 0.

- [ ] Run the production-equivalent Worker dry build:

```powershell
& 'C:\Users\Mike\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'C:\dev\crypto_brief\node_modules\wrangler\bin\wrangler.js' deploy --dry-run
```

Expected: Wrangler reports a successful dry run and no deployment occurs.

- [ ] Verify scope and branch cleanliness:

```powershell
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git status --short --branch
```

Expected: no whitespace errors; behavior changes are limited to `index.html`, `tests/frontendSmoke.test.mjs`, `README.md`, and `docs/OPERATIONS.md`, plus the approved design and plan documents; the worktree is clean.
