---
layout: ../../layouts/DocsLayout.astro
title: The Chrome extension
description: What the extension does, how to install it, and how its key works.
---

## What it does

- **Records applications** on LinkedIn, Greenhouse, Lever, Ashby, Wellfound and YC's job board as you submit them.
- **Reads any other posting** when you press **Extract with AI** in its popup.
- **Fills application forms** on Greenhouse, Lever and Ashby with a **Fill with jlog** button. See [autofill](/docs/autofill).
- **Drafts answers** to open questions on those forms, on Pro. See [drafted answers](/docs/drafted-answers).

It never submits a form or presses a button on a page.

## Install it

The Chrome Web Store listing is on its way. Until it is live, build the extension from source and load it into Chrome:

```bash
git clone https://github.com/brgv-code/jlog
cd jlog
pnpm install
pnpm --filter @jlog/extension build
```

Then open `chrome://extensions`, turn on **Developer mode**, press **Load unpacked** and choose `apps/extension/dist`.

A build talks to the API named in `apps/extension/.env`. For the hosted jlog, set `VITE_API_BASE=https://api.jlog.ai` and `VITE_WEB_BASE=https://jlog.ai` there. If you self-host, see [deploy to Cloudflare](/docs/self-hosting/deploy#6-the-extension).

## Connect it

The extension signs in with a key, not with your password.

1. **Settings → Chrome extension → Generate key.** Name it if you like, and choose a lifetime: 1 day, 7 days, 30 days or no expiration.
2. Copy the key. It is shown once.
3. Paste it into the popup.

### When a key expires

The popup says so, and tells you when it expired, instead of failing quietly. When a key has less than three days left, the popup starts suggesting you renew it. Generate a new key in Settings and paste it in.

### Revoking a key

Every key is listed in **Settings → Chrome extension** with its name and expiry. Revoke one there and it stops working at once.

## Permissions

The extension asks for access to the six job boards it watches and to the jlog API, plus `storage` (to keep its key), `activeTab` and `scripting` (to read a posting when you press Extract). It does not read pages on other sites unless you open the popup there and ask it to.
