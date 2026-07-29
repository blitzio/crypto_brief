# Production Market Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the public brief working when the browser cannot reach CoinGecko directly.

**Architecture:** Run the direct CoinGecko request and Worker market request independently. Prefer complete direct prices, fall back to complete Worker prices, and fail only when neither source supplies BTC, ETH, and LINK.

**Tech Stack:** Static HTML/JavaScript, Node.js built-in test runner/assertions, GitHub Pages, Cloudflare Worker

## Global Constraints

- Do not change the v3 local-preview branch.
- Do not show expired cached briefs.
- Do not add billing or a new API key.
- Do not let degraded Worker quotes overwrite valid direct CoinGecko prices.

---

### Task 1: Protect market-source fallback behavior

**Files:**
- Modify: `tests/frontendSmoke.test.mjs`
- Modify: `index.html`

**Interfaces:**
- Consumes: `fetchDirectPrices()`, `fetchWithTimeout()`, `sanitizeMarketLevels()`
- Produces: `fetchMarketData(): Promise<{ prices: object, marketSignals: object }>`

- [ ] **Step 1: Write the failing fallback test**

Extract and execute the real `fetchMarketData()` function. Make `fetchDirectPrices()` reject, make the Worker return a complete payload with literal BTC, ETH, and LINK values, and assert that those exact Worker prices and signals are returned.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
& $node tests/frontendSmoke.test.mjs
```

Expected: failure because the current function exits as soon as the direct request rejects.

- [ ] **Step 3: Implement the minimal independent-source logic**

In `index.html`, request both sources without allowing one rejection to cancel the other. Validate Worker prices with the same three-asset completeness rule. Prefer direct prices when available; otherwise use Worker prices and signals; throw an explicit error if both are unusable.

- [ ] **Step 4: Add and pass the direct-precedence test**

Make direct prices succeed while the Worker supplies different degraded spot quotes. Assert the direct price literals remain in the result and only validated Worker levels are used.

- [ ] **Step 5: Run the full suite**

Run every test listed in `package.json`, then run:

```powershell
git diff --check
```

Expected: all tests pass and the diff check is clean.

- [ ] **Step 6: Publish and verify production**

Commit and push the isolated branch, merge through a pull request after checks pass, wait for GitHub Pages and Worker deployment checks, then open a cache-busted public URL. Confirm the page displays a current brief rather than the empty “Failed to fetch” state.
