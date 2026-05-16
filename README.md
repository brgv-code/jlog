# jlog

> Self-hostable job application tracker with a Chrome extension that auto-captures from LinkedIn, Wellfound, Ashby, Greenhouse, Lever, and YC Jobs.

---

## What it is

jlog is an open-source job tracker built on Cloudflare's edge stack. Apply to a job on LinkedIn — it appears in your dashboard automatically. On any other job site, click the extension and let the LLM extract company, role, and location from the page.

**Stack**: Astro 4 + React islands · Hono on Cloudflare Workers · D1 + Drizzle · GitHub OAuth · Chrome MV3 · Anthropic / OpenAI / Gemini / Ollama

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

- Node 20+, pnpm 9+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm i -g wrangler`)
- A [GitHub OAuth App](https://github.com/settings/developers) with callback URL `http://localhost:8787/api/auth/github/callback`

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

Edit `apps/api/.dev.vars`:

```bash
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
SESSION_SECRET=any-32-char-random-string
WEB_ORIGIN=http://localhost:4321
COOKIE_DOMAIN=localhost
```

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

---

## Connecting the extension

1. Sign in at `http://localhost:4321`
2. Go to **Settings → Chrome Extension → Generate token**
3. Copy the token
4. Open the jlog extension popup and paste the token

The extension now auto-captures on LinkedIn. On any other job page, click **Extract with AI** (requires an LLM configured in Settings).

---

## Deploy to Cloudflare

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for a step-by-step guide covering:

- Cloudflare Workers setup and D1 database creation
- Cloudflare Pages for the web frontend
- Custom domain configuration
- Environment variables and secrets

---

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
│   └── shared/       Zod schemas, error classes
└── docs/
    ├── BUILD_LOG.md  Phase-by-phase build narrative
    ├── ARCHITECTURE.md
    ├── DEPLOY.md
    └── adrs/
```

---

## Docs

- [Architecture](docs/ARCHITECTURE.md) — system diagram, auth flow, data model
- [Deploy guide](docs/DEPLOY.md) — step-by-step Cloudflare deployment
- [Build log](docs/BUILD_LOG.md) — phase-by-phase narrative (the blog series)

---

## License

MIT — see [LICENSE](LICENSE).
