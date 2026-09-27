---
layout: ../../../layouts/DocsLayout.astro
title: Self-hosting
description: Run jlog on your own Cloudflare account. What you get, what it runs on, and where to start.
---

## What you get

Everything in the Free plan: capture, Extract, autofill, tracking, Home and CV import, with your data in your own database. jlog is MIT licensed.

**The Pro features stay locked.** Tailored CVs, cover letters and drafted answers come from a private package that is not in the public repository. The open-source build carries a stub in its place, so those routes answer that Pro is required. Everything else works.

## What it runs on

| Part | Where it runs | In the repository |
|---|---|---|
| API | A Cloudflare Worker (Hono) | `apps/api` |
| Database | Cloudflare D1, with Drizzle | `packages/db` |
| Files | A Cloudflare R2 bucket, for CV files | bound as `CV_FILES` |
| Web app | Cloudflare Pages (Astro) | `apps/web` |
| Extension | Chrome, loaded from your own build | `apps/extension` |

It fits in Cloudflare's free tier for one person's job search.

## What you need

- **Node 22 or newer** and **pnpm 9**. Wrangler 4 needs Node 22, so an older runtime cannot run the Worker or apply migrations.
- **A Cloudflare account**, for deploying. Running locally needs none.
- **At least one sign-in method.** The quickest is a GitHub OAuth app. See [sign-in methods](/docs/self-hosting/sign-in).
- **An AI provider key**, if you want Extract and model-read CV imports. Optional. See [AI providers](/docs/ai-providers).

## Where to start

1. [Run it locally](/docs/self-hosting/local) to try it.
2. [Set up sign-in](/docs/self-hosting/sign-in).
3. [Deploy to Cloudflare](/docs/self-hosting/deploy).
4. Keep the [configuration reference](/docs/self-hosting/configuration) at hand.
