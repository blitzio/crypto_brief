# Security

This is a small project: a static page on GitHub Pages and one Cloudflare Worker. The repo holds source code, tests and example configuration only.

## Secrets

Keys and tokens live in Cloudflare, never in git:

- `GEMINI_API_KEY`
- `BRIEF_ADMIN_TOKEN`
- `COINGECKO_DEMO_API_KEY` (optional)

`.env.example` lists the names with no values. Do not commit API keys, tokens, OAuth files, Cloudflare credentials or local runtime folders (`.wrangler/`, `node_modules/`, `.env*`, `.dev.vars*`).

The Worker's name and address, the allowed Pages origin and the KV binding are not secrets, but they do show how the project is deployed. If you fork it, replace them with your own.

`POST /brief/save` is the route for manual writes to the cache. It needs the `X-Brief-Admin-Token` header, and the page never calls it.

## Reporting a problem

If you find a security issue, please report it privately: use **Report a vulnerability** on this repo's Security tab. Please do not post exploit details or real secret values in a public issue.

## Before you push

- Run `npm test`.
- Check `git status` and `git diff` for anything you did not mean to include.
- Search for stray keys or tokens.
