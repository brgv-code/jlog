---
layout: ../layouts/AnswerLayout.astro
title: Open source job application tracker you can self-host · jlog
description: jlog is an MIT-licensed job application tracker with a Chrome extension. Run it on your own Cloudflare account, free tier included, or use the hosted version at jlog.ai.
question: Is there an open source job application tracker I can self-host?
answer: Yes. jlog is an MIT-licensed job application tracker with a Chrome extension that records applications as you submit them. You can run the whole thing on your own Cloudflare account, where one person's job search fits in the free tier, or use the hosted version at jlog.ai.
updated: 2026-10-30
faqs:
  - q: Is jlog really open source?
    a: Yes. The tracker, the API, the web app and the Chrome extension are in a public GitHub repository under the MIT licence. Tailored CVs, cover letters and drafted answers come from a separate private package, so a self-hosted copy has everything except those three.
  - q: What do I need to self-host jlog?
    a: Node 22 or newer, pnpm 9, a Cloudflare account for deploying, and at least one sign-in method, such as a GitHub OAuth app. An AI provider key is optional.
  - q: Does a self-hosted jlog send my data anywhere?
    a: Your applications and CV stay in your own Cloudflare D1 database and R2 bucket. The only outside services involved are the sign-in provider you configure and, if you add one, your AI provider. Billing, email and tracing are off unless you set them up.
  - q: Can I try it before deploying?
    a: Yes. It runs locally with a local database and needs no Cloudflare account for that. The hosted version at jlog.ai is also free, with your own AI key.
  - q: Does the Chrome extension work with a self-hosted jlog?
    a: Yes, from your own build. The store copy is pinned to jlog.ai, so a self-hosted jlog uses an extension you build from the same repository and load into Chrome.
related:
  - href: /docs/self-hosting
    label: Self-hosting guide
  - href: /docs/self-hosting/local
    label: Run it locally
  - href: /bring-your-own-ai-key
    label: Use your own AI key, or Ollama
  - href: /features/job-capture
    label: How capture works on six job boards
---

## What jlog does

jlog keeps a job search in one list. Its Chrome extension records an application when you submit it on LinkedIn, Greenhouse, Lever, Ashby, Wellfound or Y Combinator's job board, and with your AI key reads any other careers page in one click. It fills the standard fields of Greenhouse, Lever and Ashby forms from your profile, and never presses submit. Every application moves from saved to applied, interviewing and offer, with notes and a timeline.

## What the open-source version includes

| | Self-hosted | Hosted at jlog.ai |
|---|---|---|
| Licence | MIT | The MIT code plus the private package, run by jlog |
| Capture on six job boards | Yes | Yes |
| Extract on any page, with your AI key | Yes | Yes |
| Autofill on Greenhouse, Lever and Ashby | Yes | Yes |
| Tracking, notes, timeline and Home | Yes | Yes |
| CV import | Yes | Yes |
| Tailored CVs, cover letters, drafted answers | No: a private package | Yes, free with your own AI key |
| Where your data lives | Your Cloudflare account | jlog's Cloudflare account |
| Cost | Cloudflare's free tier, for one person | Free |

The three features that are not in the repository come from a private package. In the open-source build a stub stands in for it, so those routes answer that the feature is not available and everything else works. See [plans](/docs/plans).

## What it runs on

Everything runs on Cloudflare:

- **API:** a Cloudflare Worker, written with Hono.
- **Database:** Cloudflare D1, with Drizzle and versioned migrations.
- **Files:** a Cloudflare R2 bucket for imported CVs.
- **Web app:** Cloudflare Pages, built with Astro.
- **Extension:** Chrome, from your own build.

The [deploy guide](/docs/self-hosting/deploy) walks through each part, and the [configuration reference](/docs/self-hosting/configuration) lists every setting.

## Signing in

There are no passwords. Configure any one of GitHub, Google, Apple or emailed sign-in links; each is optional. You can also limit sign-up to a list of addresses or a whole domain. See [sign-in methods](/docs/self-hosting/sign-in).

## AI is optional

Capture on the six boards, tracking and autofill never call a model. Add a key from Anthropic, OpenAI or Gemini, or point jlog at your own Ollama server, to read postings on other pages and to read CVs with a model. Keys are encrypted with AES-GCM before they are stored. See [using your own AI key](/bring-your-own-ai-key).

## Where to start

1. [Run it locally](/docs/self-hosting/local) to try it, with no Cloudflare account.
2. [Set up sign-in](/docs/self-hosting/sign-in).
3. [Deploy to Cloudflare](/docs/self-hosting/deploy).

The source is at [github.com/brgv-code/jlog](https://github.com/brgv-code/jlog).
