---
layout: ../../../layouts/DocsLayout.astro
title: Run it locally
description: The API, the web app and the extension on your own machine, with a local database.
---

## 1. Clone and install

```bash
git clone https://github.com/brgv-code/jlog
cd jlog
pnpm install
```

## 2. Configure the API

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Edit `apps/api/.dev.vars`. The minimum:

```bash
SESSION_SECRET=      # openssl rand -hex 32
ENCRYPTION_SECRET=   # openssl rand -hex 32, a different value
WEB_ORIGIN=http://localhost:4321
COOKIE_DOMAIN=localhost
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
```

For GitHub, create an OAuth app with the callback URL `http://localhost:8787/api/auth/callback/github`. Other methods are in [sign-in methods](/docs/self-hosting/sign-in), and every variable is in the [configuration reference](/docs/self-hosting/configuration).

## 3. Create the local database

```bash
cd apps/api
pnpm exec wrangler d1 migrations apply jlog --local
cd ../..
```

This creates a local D1 database under `apps/api/.wrangler` and runs every migration in `packages/db/migrations`. Run it again after pulling new migrations.

## 4. Point the web app at the API

```bash
echo "PUBLIC_API_URL=http://localhost:8787" > apps/web/.env
```

## 5. Start everything

```bash
pnpm dev
```

The web app is on `http://localhost:4321` and the API on `http://localhost:8787`. Sign in at `http://localhost:4321/login`.

## 6. Load the extension

```bash
pnpm --filter @jlog/extension build
```

Open `chrome://extensions`, turn on **Developer mode**, press **Load unpacked** and choose `apps/extension/dist`. A build with no `apps/extension/.env` talks to `localhost:8787` and `localhost:4321`.

Copy the extension's ID from `chrome://extensions` into `EXTENSION_ID` in `apps/api/.dev.vars` and restart `pnpm dev`. The API only accepts requests from that one extension. The ID stays the same as long as you load it from the same folder.

Then [connect it](/docs/extension#connect-it) with a key from Settings.
