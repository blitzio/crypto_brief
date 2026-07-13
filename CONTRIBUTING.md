# Contributing

Thanks for improving Crypto Daily Brief. Keep changes small and easy to verify.

## Development Rules

- Preserve the existing public routes unless a change explicitly documents a new route.
- Keep production safety ahead of broad refactors.
- Add or update tests when changing Worker behavior, citation validation, caching, or data parsing.
- Do not commit secrets or local machine state.
- Prefer small pull requests over large mixed cleanups.

## Local Checks

Use the test script when `npm` is available:

```bash
npm test
```

If `npm` is not available, run the tests directly with Node:

```bash
node tests/feedParser.test.mjs
node tests/marketSignals.test.mjs
node tests/macroSignals.test.mjs
node tests/selectYahooPreviousClose.test.mjs
node tests/citationGuards.test.mjs
node tests/workerRoutes.test.mjs
node tests/frontendSmoke.test.mjs
```

## Pull Request Checklist

- Tests pass.
- Public route payloads are unchanged unless intentionally documented.
- Generated briefs with bad citations do not write to KV.
- `/brief/save` remains protected by `X-Brief-Admin-Token`.
- README or docs are updated when setup or behavior changes.
