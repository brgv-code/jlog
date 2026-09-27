---
layout: ../../../layouts/DocsLayout.astro
title: Sign-in methods
description: GitHub, Google, Apple and emailed links. Each is optional; configure any one.
---

## How it works

Sign-in is handled by [Better Auth](https://better-auth.com). Four methods are supported and **each one is optional and independent**. The login page asks the API which are configured and shows only those, so running with GitHub alone is an ordinary setup.

Every provider's callback is at `/api/auth/callback/<provider>` on your API's origin. Register exactly that URL with the provider.

| Method | What you need | Variables |
|---|---|---|
| GitHub | An OAuth app | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Google | An OAuth client of type Web application | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Apple | A paid Apple Developer membership, a Services ID, Team ID, Key ID and a `.p8` key | `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` |
| Email link | A [Resend](https://resend.com) API key and a sending address on a verified domain | `RESEND_API_KEY`, `EMAIL_FROM` |

## GitHub

Create an OAuth app at [github.com/settings/developers](https://github.com/settings/developers). For local use, the callback URL is `http://localhost:8787/api/auth/callback/github`; for a deployment, use your API's origin.

## Google

In the Google Cloud console, create an **OAuth client ID** of type **Web application**, with the authorised redirect URI `https://<your-api>/api/auth/callback/google` (or the `localhost:8787` one for local use).

## Apple

- It needs a **paid Apple Developer Program membership**. There is no free tier for Sign in with Apple. Leaving the four `APPLE_*` variables unset is an ordinary way to run jlog.
- **It cannot be tested on `http://localhost`.** Apple refuses localhost redirect URIs and answers with a cross-site form POST, which needs a secure cookie and so HTTPS. Set it up on your deployed origin.
- **`APPLE_CLIENT_ID` is the Services ID**, not an app's bundle id.
- **`APPLE_PRIVATE_KEY` is the whole `.p8` file**, newlines included. Apple issues no client secret; jlog signs a short-lived one from this key for each request.

## Email links

You type your address, jlog emails a link, and following it signs you in. The link works once and expires after 15 minutes. Only a hash of it is stored, so the copy in your inbox is the only working one.

`EMAIL_FROM` must be on a domain you have verified in Resend, for example `jlog <login@yourdomain.com>`. Leave either variable unset and the login page does not offer email.

## More than one method

Methods attach to accounts. Someone who signed up with GitHub and later uses Google lands in the same account, provided Google reports the address as verified. An unverified address never links, because trusting one would let anyone claim someone else's account.
