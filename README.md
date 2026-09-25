# jlog

> Self-hostable job application tracker with a Chrome extension that auto-captures from LinkedIn, Wellfound, Ashby, Greenhouse, Lever, and YC Jobs.

---

## What it is

jlog is an open-source job tracker built on Cloudflare's edge stack. Apply to a job on LinkedIn — it appears in your dashboard automatically. On any other job site, click the extension and let the LLM extract company, role, and location from the page.

**Stack**: Astro 4 + React islands · Hono on Cloudflare Workers · D1 + Drizzle · Better Auth (GitHub / Google / Apple / email) · Chrome MV3 · Anthropic / OpenAI / Gemini / Ollama

---

## Features

- **Auto-capture** from LinkedIn Easy Apply, Wellfound, Ashby, Greenhouse, Lever, and YC Jobs
- **LLM extraction fallback** — any job page, any site; extract and confirm in one click
- **Kanban-style status tracking**: saved → applied → interviewing → offer / rejected / withdrawn
- **Activity timeline** per application with status changes and notes
- **Markdown notes** with live preview
- **Dark / light theme**, keyboard navigation (j/k/Enter in the table)
- **Encrypted API key storage** at rest using AES-GCM-256

---

## Quick start (local)

### Prerequisites

- Node 22+, pnpm 9+ — Wrangler 4 requires Node 22, so an older runtime cannot
  run the worker or apply migrations
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm i -g wrangler`)
- At least one sign-in method. The quickest is a [GitHub OAuth App](https://github.com/settings/developers) with callback URL `http://localhost:8787/api/auth/callback/github`

### 1. Clone and install

```bash
git clone https://github.com/brgv/jlog
cd jlog
pnpm install
```

### 2. Configure the API

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Edit `apps/api/.dev.vars`. The minimum to get running:

```bash
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
SESSION_SECRET=any-32-char-random-string
WEB_ORIGIN=http://localhost:4321
COOKIE_DOMAIN=localhost
```

The file's comments cover the other sign-in methods — see **Signing in** below.

### 3. Create and migrate the local database

```bash
cd apps/api
wrangler d1 create jlog          # copy the database_id into wrangler.toml
wrangler d1 execute jlog --local --file=../../packages/db/migrations/0000_initial.sql
cd ../..
```

### 4. Configure the web app

```bash
echo "PUBLIC_API_URL=http://localhost:8787" > apps/web/.env
```

### 5. Start everything

```bash
pnpm dev          # starts web on :4321 and API on :8787 in parallel
```

### 6. Install the extension

```bash
pnpm --filter @jlog/extension build
```

Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `apps/extension/dist`.

> **Note on the published extension.** The build above talks to whatever `VITE_API_BASE`
> is set to in `apps/extension/.env`. The copy published to the Chrome Web Store is
> pinned to the hosted instance — `jlog-api.bhargav.dev` is in the manifest's
> `host_permissions`, and an extension cannot be repointed after installation. **If you
> self-host, build your own copy** with your own API URL and load it unpacked, as above.
>
> To produce an uploadable bundle: `pnpm --filter @jlog/extension package`, which writes
> `apps/extension/jlog-extension.zip`. See
> [`apps/extension/STORE_LISTING.md`](apps/extension/STORE_LISTING.md) for the listing
> copy and what is still outstanding before it can be submitted.

---

## Connecting the extension

1. Sign in at `http://localhost:4321`
2. Go to **Settings → Chrome Extension → Generate token**
3. Copy the token
4. Open the jlog extension popup and paste the token

The extension now auto-captures on LinkedIn. On any other job page, click **Extract with AI** (requires an LLM configured in Settings).

---

## Deploy to Cloudflare

The API is a Cloudflare Worker and the web app is a Cloudflare Pages site. You will need:

- A Cloudflare account, and `wrangler login`
- A D1 database (`wrangler d1 create jlog`), with its id in `apps/api/wrangler.toml`
- The migrations applied — **from `apps/api`**, because the path is relative to it:
  ```bash
  cd apps/api
  wrangler d1 execute jlog --remote --file=../../packages/db/migrations/0000_initial.sql
  ```
- Secrets set with `wrangler secret put` — the same names as `apps/api/.dev.vars.example`
- `PUBLIC_API_URL` set for the web build, pointing at the deployed Worker

**Publishing the API is done by CI, not by hand.** `.github/workflows/deploy-api.yml` is the
real procedure: it overlays a private implementation of the paid routes, verifies the overlay
landed, and then runs `wrangler deploy`.

Note that the root `pnpm deploy` script runs `wrangler versions upload`, which uploads a
version **without routing traffic to it** — useful for previewing, but it does not make
anything live. Use `wrangler deploy` for that. If you are self-hosting and do not have the
private overlay, `packages/pro` stays as its public stub and the paid routes remain locked;
everything else works.

---

## Signing in

Authentication is handled by [Better Auth](https://better-auth.com). Four methods
are supported, and **every one is optional** — the login page asks the API which
are configured and shows only those, so running with GitHub alone is a perfectly
ordinary setup.

| Method       | What you need                                                              |
| ------------ | -------------------------------------------------------------------------- |
| GitHub       | An OAuth App: client id and secret                                         |
| Google       | An OAuth 2.0 Web application client: client id and secret                  |
| Apple        | A paid Apple Developer membership, plus a Services ID, Team ID, Key ID and `.p8` key |
| Email        | A [Resend](https://resend.com) API key and a verified sending address      |

Every provider's callback lives at `/api/auth/callback/<provider>`. Register
exactly that URL with the provider — for local GitHub, that is
`http://localhost:8787/api/auth/callback/github`.

**Email sign-in is a magic link.** You type your address, we email a link, and
following it signs you in. The link works once and expires in 15 minutes. Only a
hash of it is stored, so the copy in your inbox is the only working one.

**Three caveats worth knowing:**

- **Sign in with Apple needs a paid Apple Developer Program membership**
  ($99/year). There is no free tier for it, so this is a cost decision before it
  is a configuration one. Leaving the four `APPLE_*` settings unset is a
  perfectly ordinary way to run jlog: the provider is never registered and the
  login page does not show the button.
  
  Note this is unrelated to accepting **Apple Pay**, which the hosted Stripe
  Checkout used for the paid plan supports with no Apple account at all — Stripe
  performs the Apple merchant validation on your behalf.
- **Apple cannot be tested against `http://localhost`.** It refuses localhost
  redirect URIs, and it answers the callback with a cross-site form POST, which
  browsers only accompany with a `Secure` cookie — so it needs real HTTPS.
  Configure it against your deployed origin.
- **`APPLE_CLIENT_ID` is the Services ID, not the app's bundle id.** Apple also
  issues no client secret: jlog signs a short-lived one per request from your
  `.p8` key.

### Using more than one method

Sign-in methods attach to accounts, not the other way round. If you signed up
with GitHub and later press **Continue with Google**, you land in your existing
account rather than an empty new one — provided the provider tells us the
address is verified. An unverified address never links, because trusting one
would be a way into someone else's account by claiming their address.

## LLM providers

Configure any of these in **Settings → LLM Provider**:

| Provider  | Default model             | Notes                  |
| --------- | ------------------------- | ---------------------- |
| Anthropic | claude-3-5-haiku-20241022 | Fastest, cheapest      |
| OpenAI    | gpt-4o-mini               | Good balance           |
| Gemini    | gemini-1.5-flash          | Google alternative     |
| Ollama    | llama3 (local)            | 100% local, no API key |

API keys are encrypted with AES-GCM-256 before being stored in D1.

---

## Site detectors

| Site                   | Detection method                                            |
| ---------------------- | ----------------------------------------------------------- |
| LinkedIn               | MutationObserver on Easy Apply modal + external apply click |
| Wellfound              | Apply button click + DOM confirmation                       |
| Ashby HQ               | Submit button click + thank-you page content                |
| Greenhouse             | Form submit + confirmation content                          |
| Lever                  | Submit button click + thank-you content                     |
| YC / Work at a Startup | Apply click + confirmation                                  |
| Any other site         | LLM extraction via popup ("Extract with AI")                |

---

## Project structure

```
jlog/
├── apps/
│   ├── web/          Astro 4 frontend (dashboard, settings, landing)
│   ├── api/          Hono on Cloudflare Workers (REST API + auth)
│   └── extension/    Chrome extension MV3
├── packages/
│   ├── db/           Drizzle schema, migrations
│   ├── llm/          LLM provider adapters
    └── shared/       Zod schemas, error classes
```

---

## Docs

- [Design system](apps/web/DESIGN.md) — the rules, the palette, and why primary is not accent.
  Rendered live, with every animation, at `/designsystem`.
- [Store listing](apps/extension/STORE_LISTING.md) — the Chrome Web Store copy, permission
  justifications, and what is still outstanding before the extension can ship.
- [Project spec](PROJECT_SPEC.md) — what this was built to be.

---

## License

MIT — see [LICENSE](LICENSE).
