---
layout: ../../../layouts/DocsLayout.astro
title: Configuration reference
description: Every setting, what it does, and where it is set.
---

Locally, the API reads `apps/api/.dev.vars`. On Cloudflare, anything secret is set with `wrangler secret put NAME`, and the rest goes in the `[vars]` block of `apps/api/wrangler.toml`.

## API: required

| Variable | What it is |
|---|---|
| `SESSION_SECRET` | Signs sessions and sign-in cookies. Generate with `openssl rand -hex 32`. Changing it signs everyone out. |
| `ENCRYPTION_SECRET` | Encrypts stored AI provider keys with AES-GCM. A different value from `SESSION_SECRET`. Changing it makes saved keys unreadable, so each user saves theirs again. |
| `WEB_ORIGIN` | The web app's origin, exactly, for example `https://jobs.example.com`. Sign-ins from anywhere else are refused. |
| `COOKIE_DOMAIN` | `localhost` when running locally. Any other value, such as `production`, turns on secure cookies that work across your web and API origins over HTTPS. |
| `EXTENSION_ID` | Your build of the extension's ID, from `chrome://extensions`. The API only accepts requests from this extension. |

Plus at least one sign-in method below.

## API: sign-in

All optional and independent. See [sign-in methods](/docs/self-hosting/sign-in).

| Variable | What it is |
|---|---|
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | A GitHub OAuth app. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | A Google OAuth client of type Web application. |
| `APPLE_CLIENT_ID` | The Services ID, not a bundle id. |
| `APPLE_TEAM_ID`, `APPLE_KEY_ID` | From your Apple Developer account. |
| `APPLE_PRIVATE_KEY` | The whole contents of the `.p8` file. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Emailed sign-in links through Resend. Both are needed. |
| `BETTER_AUTH_SECRET` | Optional separate signing secret for sign-in. Falls back to `SESSION_SECRET`. |
| `ALLOWED_EMAILS` | Invite-only sign-up: addresses, or `@domain` for a whole domain, separated by commas. Unset, anyone can create an account. People who already have one can always sign in. Set it as a secret, so the list stays out of the repository. |
| `API_ORIGIN` | Only when something in front of the Worker rewrites the Host header. Normally the origin is taken from the request. |

## API: optional services

| Variable | What it is |
|---|---|
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | A Cloudflare Access service token for an Ollama server you have put behind Access. |
| `CF_ACCESS_HOST` | The hostname of that Ollama server, for example `ollama.example.com`. The token is sent only to this host, over https. Without it the token is never sent, so a user's own Ollama URL can never receive it. |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | Tracing of model calls in [Langfuse](https://langfuse.com). Unset, tracing is skipped. |
| `LANGFUSE_BASE_URL` | Your Langfuse host, by default `https://cloud.langfuse.com`. |
| `LANGFUSE_TRACING_ENVIRONMENT` | Keeps one deployment's traces apart from another's in the same project. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | Billing. Unset, billing answers that it is not configured and everything else works, which is the ordinary self-hosted case. |

## API: bindings

Set in `apps/api/wrangler.toml`.

| Binding | What it is |
|---|---|
| `DB` | The D1 database. Migrations come from `packages/db/migrations`. |
| `CV_FILES` | The R2 bucket that keeps imported CV files. |

## Web app

| Variable | Where | What it is |
|---|---|---|
| `PUBLIC_API_URL` | `apps/web/.env`, or the Pages project | The API's URL. |
| `PUBLIC_SITE_URL` | The build environment only | The public origin, used for the canonical link and social cards. Left unset, those tags are omitted. |

`PUBLIC_SITE_URL` has to be in the environment of the build itself, for example `PUBLIC_SITE_URL=https://jobs.example.com pnpm --filter @jlog/web build`, or a Pages project variable. Putting it in `apps/web/.env` does not work, because the site's config is read before that file is loaded.

## Extension

In `apps/extension/.env`, read when the extension is built:

| Variable | What it is |
|---|---|
| `VITE_API_BASE` | The API's URL. Defaults to `http://localhost:8787`. |
| `VITE_WEB_BASE` | The web app's URL, for links from the popup. Defaults to `http://localhost:4321`. |

The API's origin also has to be listed in `host_permissions` in `apps/extension/manifest.config.ts`.
