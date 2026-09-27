---
layout: ../../../layouts/DocsLayout.astro
title: Deploy to Cloudflare
description: The database, the storage, the Worker, the web app and your own build of the extension.
---

Run the Wrangler commands from `apps/api`, after `pnpm exec wrangler login`.

## 1. Create the database and the bucket

```bash
cd apps/api
pnpm exec wrangler d1 create jlog
pnpm exec wrangler r2 bucket create jlog-cv-files
```

Put the new database's id in `apps/api/wrangler.toml`, replacing the `database_id` under `[[d1_databases]]`. Keep `bucket_name = "jlog-cv-files"` under `[[r2_buckets]]`, or change both to your own name.

## 2. Apply the migrations

```bash
pnpm exec wrangler d1 migrations apply jlog --remote
```

This runs every migration in `packages/db/migrations` that the database has not recorded yet. Run the same command whenever you pull new ones, before deploying the new Worker.

## 3. Set your variables

Edit the `[vars]` block in `apps/api/wrangler.toml`. The values there are the hosted instance's:

```toml
[vars]
WEB_ORIGIN = "https://jobs.example.com"      # your web app's origin, exactly
COOKIE_DOMAIN = "production"                 # anything but "localhost"
EXTENSION_ID = "your-extension-id"           # from step 6
```

Then set the secrets, one at a time:

```bash
pnpm exec wrangler secret put SESSION_SECRET
pnpm exec wrangler secret put ENCRYPTION_SECRET
pnpm exec wrangler secret put GITHUB_CLIENT_ID
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET
```

Add the variables for any other [sign-in method](/docs/self-hosting/sign-in) the same way. The full list is in the [configuration reference](/docs/self-hosting/configuration).

## 4. Deploy the API

```bash
pnpm exec wrangler deploy
```

This creates the Worker version and routes traffic to it. Two things that look similar and are not:

- **The root `pnpm deploy` script** runs `wrangler versions upload`, which uploads a version **without** routing traffic to it. It is for previews.
- **`.github/workflows/deploy-api.yml`** is the hosted instance's pipeline. It overlays the private Pro package before deploying, so it will not run on a fork without that package. Deploy by hand, or write your own workflow around `wrangler d1 migrations apply` and `wrangler deploy`.

The Worker also runs a small job at 03:00 UTC every day that clears expired sign-in links, sessions and old extension keys. It is set up by the `[triggers]` block and needs nothing from you.

## 5. Deploy the web app

Create a Cloudflare Pages project from your repository with:

| Setting | Value |
|---|---|
| Build command | `pnpm --filter @jlog/web build` |
| Output directory | `apps/web/dist` |
| `PUBLIC_API_URL` | your Worker's URL |
| `PUBLIC_SITE_URL` | the origin you serve the web app from |

`PUBLIC_SITE_URL` is read when the site is built, and becomes its canonical link and the URL in its social cards. Left unset, those tags are left out; set it for anything public.

The web app's origin must match `WEB_ORIGIN` on the Worker exactly, or sign-in will be refused.

## 6. The extension

The copy of the extension published for the hosted jlog is pinned to the hosted API and cannot be pointed elsewhere after installing. Build your own:

1. Create `apps/extension/.env`:
   ```bash
   VITE_API_BASE=https://your-api.example.com
   VITE_WEB_BASE=https://jobs.example.com
   ```
2. In `apps/extension/manifest.config.ts`, replace `https://jlog-api.bhargav.dev/*` in `host_permissions` with your API's origin.
3. Build it with `pnpm --filter @jlog/extension build` and load `apps/extension/dist` unpacked, as in [run it locally](/docs/self-hosting/local#6-load-the-extension).
4. Copy its ID from `chrome://extensions` into `EXTENSION_ID` in `wrangler.toml`, and deploy the Worker again.

`pnpm --filter @jlog/extension package` writes a zip of the build, if you want to publish your own copy.
