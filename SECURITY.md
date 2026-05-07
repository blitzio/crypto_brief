# Security

## Supported Scope

This project is a small Cloudflare Worker plus GitHub Pages app. The public repository should contain source code, tests, and example configuration only.

## Secrets

Do not commit real API keys, admin tokens, OAuth files, Cloudflare credentials, or local runtime folders.

Keep these values in Cloudflare Worker secrets or environment variables:

- `GEMINI_API_KEY`
- `BRIEF_ADMIN_TOKEN`

The repository includes `.env.example` only as a list of names. It must not contain real values.

## Public Repository Notes

The Worker name, public Worker URL, allowed GitHub Pages origin, and KV namespace binding metadata are not treated as passwords. They may reveal deployment structure, so forks should replace them with their own values.

## Reporting Issues

If you find a security issue, do not open a public proof-of-concept with secret values or exploit instructions. Open a GitHub issue with a short description and enough detail to reproduce safely, or contact the repository owner privately if the issue is sensitive.

## Local Checklist Before Sharing

- Run the tests.
- Confirm `git status` is clean.
- Search for accidental keys or tokens before pushing.
- Keep `.codex/`, `.wrangler/`, `node_modules/`, and `.env` files out of Git.
