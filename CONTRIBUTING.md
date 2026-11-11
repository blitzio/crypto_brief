# Contributing

Small, easy-to-check changes are the goal.

## Ground rules

- Production safety comes before cleanup. Anything merged to `main` deploys.
- Keep public routes and their payloads as they are, unless the change says otherwise and the docs are updated.
- Add or update tests when you change Worker behaviour, evidence checks, caching or data parsing.
- No secrets, keys or local machine state in git. See [SECURITY.md](SECURITY.md).
- Prefer a few small pull requests over one large one.

## Run the checks

```bash
npm test
```

That runs every test file under `tests/`. To check live news feeds without changing anything, run `npm run check:sources`.

## Before you open a pull request

- `npm test` passes.
- Briefs with bad citations still never reach the cache.
- `/brief/save` is still protected by `X-Brief-Admin-Token`.
- The README or `docs/` match any change to setup or behaviour.

Health checks, deploys and rollback are in [docs/OPERATIONS.md](docs/OPERATIONS.md).
