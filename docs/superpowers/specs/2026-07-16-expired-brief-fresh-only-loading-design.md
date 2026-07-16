# Fresh-Only Expired Brief Loading Design

## Context

The Worker already defines a one-hour freshness boundary for cached briefs. Its default `GET /brief` route rejects older records with `{ cached: false, reason: "stale" }`, while the opt-in `GET /brief?allowStale=1` route can return the retained record for operational recovery.

PR #44 changed the public page to call the opt-in stale route during startup. That change was intended to avoid a blank page during a slow Gemini refresh, but it also caused an expired brief to render immediately and made the real refresh status easy to miss. If generation then failed, the expired brief remained visible.

The product requirement is now explicit: an expired brief must never be shown on the public page.

## Goals

1. Preserve the existing one-hour freshness threshold.
2. Render a cached brief on startup only when the Worker reports it as fresh.
3. Keep expired analysis hidden while a replacement is generated.
4. If generation fails and no fresh brief is visible, stop the loading animation and show a clear error with a visible Retry control.
5. Preserve the existing cache record and stale-recovery route without exposing stale content in the public UI.
6. Keep the change narrow, reversible, and covered by a regression test.

## Non-goals

- No Gemini model, prompt, timeout, validation, or pipeline changes.
- No news, market, macro, support/resistance, or source-selection changes.
- No layout redesign beyond the loading-state Retry control.
- No change to the Worker cache retention period or KV data shape.
- No removal of the opt-in stale route used for diagnostics and recovery.
- No scheduled background generation or new infrastructure.

## Startup Data Flow

The public startup path will request `GET /brief` without `allowStale=1`.

### Fresh cache hit

1. The Worker returns the cached envelope with `cached: true` and `fresh: true`.
2. The browser requires `fresh === true` before rendering the brief, providing a second guard against stale analysis.
3. The browser refreshes the live market summary through the existing independent path.
4. No Gemini generation is started.

### Missing or expired cache

1. The Worker returns `cached: false`; an expired record is reported as `reason: "stale"` but its content is not sent to the public page.
2. The browser keeps `#brief` inactive and the loading state visible.
3. The browser fetches current market, macro, and news data.
4. The browser requests a new Gemini brief.
5. Only a successful, validated response is rendered and cached.

### Generation failure

1. No expired payload is fetched or rendered as a fallback.
2. The loading state stops its spinner and displays `Could not generate a current brief` together with the existing error detail where available.
3. A visible Retry button calls the existing forced-refresh path and restores the normal loading state for the new attempt.
4. The page continues to show no analysis until a current brief succeeds.

## Manual Refresh

Manual refresh keeps an already visible, still-current brief on screen while its replacement is generated. This preserves the existing non-destructive manual-refresh behavior. The expired-startup path remains different: because no current brief is available, analysis stays hidden until generation succeeds.

## Worker Compatibility

The Worker behavior remains unchanged:

- `GET /brief` serves only records younger than one hour.
- `GET /brief?allowStale=1` remains available for explicit operational use.
- Failed generation never overwrites the retained valid KV record.
- KV retention remains seven days.

The public browser is the corrected boundary: it no longer opts into stale content.

## Testing

The frontend regression test will first prove the current production script fails the new contract because it contains `/brief?allowStale=1`.

The completed change must prove:

1. Startup requests the fresh-only `/brief` route.
2. The public script contains no stale opt-in request.
3. Cached content renders only when `fresh === true`.
4. The loading state contains a Retry control for empty/stale-cache generation failures.
5. A terminal error stops the spinner, while Retry restores the normal loading state and uses the existing forced-refresh path.
6. Existing Worker route tests still prove the default route rejects stale records while the opt-in route remains compatible.
7. The complete test suite and Cloudflare dry build pass.

## Delivery Safety

Implementation will start from the currently deployed `origin/main` commit on an isolated branch. The fix will be limited to `index.html` and `tests/frontendSmoke.test.mjs` unless a failing test demonstrates that another file is required. Publishing and production deployment remain separate from local implementation and verification.
