# Apptrack — Project Spec & Claude Code Build Prompt

> Hand this file to Claude Code as the initial prompt. Work through it phase by phase, stopping at each acceptance gate for human review.

---

## 0. Mission

Build **Apptrack** — an open-source, self-hostable job application tracker with a Chrome extension that auto-captures applications from LinkedIn, Wellfound, YC, Ashby, Greenhouse, and Lever. Aesthetic: Linear / Attio / Vercel. Stack: Cloudflare-native, TypeScript, Astro.

**Non-goals**
- No ATS replacement, no recruiter features, no team accounts in v1.
- No heavy frameworks. No Next.js, no tRPC, no Prisma, no NextAuth.
- No state libraries (Redux, Zustand, Jotai). React `useState` + URL state is enough.
- No CSS frameworks beyond Tailwind. No component libraries (shadcn is fine since it's source-copied, not a dependency).

**Success criteria**
- Deployed to Cloudflare (Pages + Workers) and ready for public use.
- Chrome extension packaged and submittable to the store.
- A new user can sign up, install the extension, apply to a job on LinkedIn, and see it appear in their dashboard without manual entry.
- Repo is documented well enough for a tech-blog series and a tweet thread per phase.

---

## 1. Stack (locked)

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Astro 4 + React islands | Fast, ships zero JS by default, escape hatch when needed |
| Styling | Tailwind CSS v3 | Single dependency, no runtime |
| Backend | Cloudflare Workers + Hono | Lightweight, edge-native, native to D1 |
| Database | Cloudflare D1 + Drizzle ORM | SQLite at edge, type-safe queries |
| Auth | GitHub OAuth, session cookies in D1 | One-click for devs, no third-party SaaS |
| Extension | Manifest V3, Vite + `@crxjs/vite-plugin` | Modern DX, hot reload |
| LLM | Custom adapter (Anthropic, OpenAI, Gemini, Ollama) | Provider-agnostic |
| Lint/Format | Biome | One tool, fast, replaces ESLint + Prettier |
| Tests | Vitest (unit) + Playwright (E2E, smoke only) | Standard, fast |
| Package mgr | pnpm workspaces | Monorepo with minimal config |
| CI | GitHub Actions | Free, standard |

---

## 2. Repo layout

```
apptrack/
├── apps/
│   ├── web/              Astro frontend (dashboard, landing, settings)
│   ├── api/              Hono on Workers (REST API + auth + LLM proxy)
│   └── extension/        Chrome extension (MV3)
├── packages/
│   ├── db/               Drizzle schema, migrations, generated types
│   ├── llm/              LLM provider adapters + shared prompt templates
│   └── shared/           Zod schemas, shared types, constants
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEPLOY.md
│   ├── BUILD_LOG.md      Chronological build log — used for blog posts
│   └── adrs/             Architecture decision records
├── .github/workflows/
├── biome.json
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

## 3. Database schema (Drizzle)

```ts
// packages/db/src/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  githubId: integer('github_id').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

export const applications = sqliteTable('applications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  company: text('company').notNull(),
  role: text('role').notNull(),
  location: text('location'),
  status: text('status', { enum: ['saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn'] })
    .notNull().default('applied'),
  sourceUrl: text('source_url'),
  sourceSite: text('source_site'),  // 'linkedin', 'wellfound', 'manual', etc.
  appliedAt: integer('applied_at', { mode: 'timestamp' }),
  notes: text('notes'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const llmConfigs = sqliteTable('llm_configs', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider', { enum: ['anthropic', 'openai', 'gemini', 'ollama'] }).notNull(),
  apiKeyEncrypted: text('api_key_encrypted'),  // null for ollama (local)
  model: text('model').notNull(),
  ollamaUrl: text('ollama_url'),  // for client-side ollama use
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  applicationId: text('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['status_change', 'note_added', 'created'] }).notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
```

API key encryption: AES-GCM via Web Crypto, key derived from `SESSION_SECRET` env var. Store `iv:ciphertext` base64-encoded.

---

## 4. API surface

All routes prefixed `/api`. JSON in, JSON out. Zod validation at every boundary.

```
POST   /api/auth/github/start              → 302 to GitHub OAuth
GET    /api/auth/github/callback?code=...  → sets session cookie, 302 to /dashboard
POST   /api/auth/logout                    → clears session
GET    /api/auth/me                        → { user } | 401

GET    /api/applications?status=&sort=&q=&cursor= → paginated list
POST   /api/applications                   → create
GET    /api/applications/:id               → single
PATCH  /api/applications/:id               → update (partial)
DELETE /api/applications/:id

GET    /api/stats                          → counts by status, applications/day for last 30d

POST   /api/extract                        → { html, url } → { company, role, location, confidence }
GET    /api/llm/config                     → current config (key redacted)
PUT    /api/llm/config                     → set/update config

GET    /api/extension/token                → short-lived token for extension auth (24h)
```

Cookie: `apptrack_session`, HttpOnly, Secure, SameSite=Lax, 30-day rolling.

Extension auth: web app generates a token via `/api/extension/token` shown in settings. Extension stores it in `chrome.storage.local`. Every request sends `Authorization: Bearer <token>`.

---

## 5. LLM adapter (`packages/llm`)

```ts
// packages/llm/src/index.ts
import { z } from 'zod';

export interface LLMProvider {
  name: 'anthropic' | 'openai' | 'gemini' | 'ollama';
  extractJSON<T>(prompt: string, schema: z.ZodSchema<T>, content: string): Promise<T>;
}

export const extractedJobSchema = z.object({
  company: z.string(),
  role: z.string(),
  location: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export function makeProvider(config: LLMConfig): LLMProvider { /* factory */ }
```

**Ollama caveat**: Workers cannot reach `localhost`. Ollama extraction runs client-side in the extension's background script, then POSTs the result to `/api/applications` directly — skipping `/api/extract`. The web app's settings page detects the local Ollama server with a healthcheck.

System prompt for extraction lives in `packages/llm/src/prompts/extract-job.ts`. One file, one export. Iterating on it is a single commit.

---

## 6. Frontend (`apps/web`)

**Pages**
- `/` — Landing (hero, screenshot, CTA, "open source on GitHub")
- `/login` — Single button: "Continue with GitHub"
- `/dashboard` — Table of applications, filters, stats strip on top
- `/applications/:id` — Detail view, edit fields, timeline, notes
- `/settings` — LLM provider config, extension token, account
- `/install` — Chrome extension install instructions + token

**Component library** (`apps/web/src/components/`)

Build these as plain React, no shadcn dependency. Source-copy where useful but keep total components <25 files.

```
ui/
  Button.tsx        // variants: primary, secondary, ghost, destructive; sizes: sm, md
  Input.tsx
  Select.tsx
  Textarea.tsx
  Dialog.tsx        // headless, portal-based
  Toast.tsx         // single global toaster
  Badge.tsx
  StatusPill.tsx    // colour per status
  Table.tsx         // generic, with sort headers
  EmptyState.tsx
  Spinner.tsx
  Avatar.tsx
layout/
  AppShell.tsx      // sidebar + main
  Sidebar.tsx
  TopBar.tsx
applications/
  ApplicationsTable.tsx
  ApplicationRow.tsx
  ApplicationDetail.tsx
  StatusSelect.tsx
  StatsStrip.tsx
  AddApplicationDialog.tsx
```

Each component <150 LOC. Split when it grows past that.

---

## 7. Design system

Aesthetic reference: Linear (depth, sharp type), Attio (clean tables, calm colour), Vercel (mono accents, restraint).

**Tokens** (`apps/web/src/styles/tokens.css`)

```css
:root {
  /* Dark is default, light mode is a toggle */
  --bg-0: #0A0A0A;
  --bg-1: #111111;
  --bg-2: #161616;
  --bg-elevated: #1A1A1A;
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.14);
  --border-focus: rgba(94, 106, 210, 0.5);
  --text-primary: #EDEDED;
  --text-secondary: #A1A1A1;
  --text-tertiary: #707070;
  --accent: #5E6AD2;          /* Linear-ish purple, used sparingly */
  --success: #4ADE80;
  --warning: #FACC15;
  --danger: #F87171;
  --info: #60A5FA;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;

  --font-sans: 'Geist', 'Inter', system-ui, sans-serif;
  --font-mono: 'Geist Mono', 'JetBrains Mono', ui-monospace, monospace;
}

[data-theme="light"] {
  --bg-0: #FFFFFF;
  --bg-1: #FAFAFA;
  --bg-2: #F4F4F5;
  --bg-elevated: #FFFFFF;
  --border: rgba(0, 0, 0, 0.08);
  --border-strong: rgba(0, 0, 0, 0.14);
  --text-primary: #0A0A0A;
  --text-secondary: #525252;
  --text-tertiary: #737373;
}
```

**Type scale**
- Display: 40px / 600 / -0.03em (landing hero only)
- H1: 28px / 600 / -0.02em
- H2: 20px / 600 / -0.015em
- H3: 16px / 500 / -0.01em
- Body: 14px / 400 / 1.5
- Small: 13px / 400 / 1.45
- Mono: 13px (numbers in tables, IDs, timestamps)
- Label: 11px / 500 / uppercase / 0.06em letter-spacing

**Rules**
- One accent colour total. Use neutral tones everywhere else.
- 1px borders, always solid, never dashed.
- No gradients, no drop shadows except focus rings (`0 0 0 3px var(--border-focus)`).
- Hover states change `background`, not `border` (unless interactive elements).
- Animations only on hover/focus (150ms ease-out) and modal enter (200ms).
- Tabular numerals in tables (`font-variant-numeric: tabular-nums`).
- Status pills: 11px text, 2px/8px padding, solid colour at 12% alpha + matching text at 100%.

---

## 8. Chrome extension (`apps/extension`)

**Manifest V3**, three surfaces:

1. **Background service worker** — listens for messages, calls API.
2. **Content scripts** — site-specific detectors.
3. **Popup** — shows recent applications, "track this page" button, settings link.

**Site detectors** — one file per site, all implement the same interface:

```ts
// apps/extension/src/detectors/types.ts
export interface SiteDetector {
  matches: string[];                     // URL patterns
  detect: () => DetectedJob | null;      // run on page change
  watchForApply: (cb: (job: DetectedJob) => void) => () => void;  // returns cleanup
}

export interface DetectedJob {
  company: string;
  role: string;
  location?: string;
  sourceUrl: string;
  sourceSite: string;
  appliedAt?: number;
}
```

**Detectors to build**:
- `linkedin.ts` — watch for Easy Apply success modal, watch for external Apply click
- `wellfound.ts` — Apply button click
- `ycombinator.ts` — YC jobs board apply
- `ashby.ts` — Ashby form submission (covers many startups)
- `greenhouse.ts` — Greenhouse form submission
- `lever.ts` — Lever form submission
- `generic.ts` — fallback: user clicks extension icon, popup shows LLM-extracted company/role from page content

**Generic fallback flow** (the killer feature):
1. User on any job page, clicks extension icon
2. Popup grabs `document.body.innerText` (clipped to 6000 chars)
3. Sends to `/api/extract` (or local Ollama)
4. Shows extracted `{ company, role, location }` for user to confirm or edit
5. User clicks "Track" → POST to `/api/applications`

**Auth flow**:
1. User signs up on web app, goes to `/install`
2. Web app generates token, displays it once
3. User pastes token into extension popup
4. Extension stores it in `chrome.storage.local`, never exposed to content scripts

---

## 9. Build phases

Work strictly phase by phase. **Stop after each phase, summarise what was built in `docs/BUILD_LOG.md`, and wait for human review before continuing.**

### Phase 0 — Foundations
- Init pnpm workspace, biome, tsconfig (strict), GitHub Actions CI
- Cloudflare setup notes in `docs/DEPLOY.md` (wrangler login, D1 create, Pages project)
- Empty Astro app, empty Workers API, empty extension scaffold
- Drizzle schema + first migration
- `docs/ARCHITECTURE.md` with system diagram
- **Acceptance**: `pnpm dev` boots web on `:4321`, API on `:8787`. Tests pass. Lint clean.

### Phase 1 — Auth & data layer
- GitHub OAuth on Workers
- Session middleware
- `/api/auth/*` endpoints
- `/login` page + `/dashboard` shell with auth guard
- D1 deployed locally and remotely
- **Acceptance**: Can log in with GitHub, see name on `/dashboard`, log out.

### Phase 2 — Applications CRUD
- All `/api/applications/*` endpoints
- Dashboard table with filters (status, search, sort)
- Detail view with edit
- Add application dialog
- Status pill + status select with optimistic updates
- Empty state when no applications
- **Acceptance**: Manual CRUD works end-to-end. Table loads <100ms for 500 rows. Keyboard navigation works (j/k to move, enter to open).

### Phase 3 — Stats & polish
- Stats strip on dashboard (total, applied this week, interview rate, offers)
- Application timeline on detail page
- Notes (markdown-rendered)
- Settings page with profile + theme toggle
- Landing page
- **Acceptance**: Visual review against Linear/Attio screenshots. All pages render <200ms.

### Phase 4 — LLM adapter
- `packages/llm` with all four providers
- `/api/extract` endpoint
- Settings page with provider selection + key input (encrypted at rest)
- Ollama healthcheck and client-side routing path documented
- **Acceptance**: Paste a LinkedIn job URL's HTML body into a test page, get back `{ company, role, location, confidence }` from each provider.

### Phase 5 — Chrome extension
- Manifest, background worker, popup
- LinkedIn detector (highest value)
- Generic LLM-fallback button
- Token-based auth
- Toast on capture
- **Acceptance**: Apply to a job on LinkedIn → it appears in dashboard within 5 seconds. Click extension on any random job page → LLM extracts → user confirms → appears in dashboard.

### Phase 6 — Remaining detectors + ship
- Wellfound, YC, Ashby, Greenhouse, Lever detectors
- Final QA pass: error states, loading states, 404, offline behaviour
- Deploy: Pages, Workers, custom domain notes
- README with screenshots, GIF demo
- Chrome Web Store submission checklist
- **Acceptance**: Live deployed app at chosen domain. Extension zip ready to upload. Six site detectors verified.

---

## 10. Coding standards

**Strict TypeScript everywhere**
- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- No `any`. Use `unknown` and narrow.
- No type assertions (`as Foo`) except for `as const` and DOM type narrowing with a comment.
- No `enum` — use `as const` objects or string literal unions.

**Functional, not OOP**
- Pure functions where possible. Side effects pushed to edges.
- No classes outside of Drizzle / Hono / SDK requirements.
- Composition over inheritance, always.

**Validation at every boundary**
- Every API request body, query param, env var, and LLM response goes through Zod.
- Shared schemas live in `packages/shared` so frontend and backend reuse them.

**File organisation**
- One default export per file. Named exports for utilities.
- Components <150 LOC. If bigger, extract.
- No barrel files except at package roots (`packages/*/src/index.ts`).
- Co-locate tests: `Foo.tsx` next to `Foo.test.tsx`.

**Naming**
- `camelCase` for variables, functions.
- `PascalCase` for components, types, classes.
- `SCREAMING_SNAKE` for constants and env vars.
- Files: components `PascalCase.tsx`, everything else `kebab-case.ts`.
- Boolean variables: `isX`, `hasX`, `shouldX`.

**Errors**
- Custom error classes in `packages/shared/errors.ts` (`HttpError`, `ValidationError`, `LLMError`).
- API returns `{ error: { code, message } }` shape — always.
- Never `throw new Error('...')` inline. Use typed errors.

**Comments**
- Comments explain *why*, never *what*.
- TODOs include a GitHub issue link or are removed.

**Commits**
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
- One concern per commit. PRs squash-merged.

---

## 11. Documentation requirements

These are non-negotiable. Every phase produces docs.

**`docs/BUILD_LOG.md`** — chronological narrative. After each phase, append a section like:

```md
## Phase N — <title> (YYYY-MM-DD)

### What was built
- ...

### Decisions made
- Chose X over Y because ...

### Gotchas
- ...

### Tweet-ready summary
"Just shipped phase N of @apptrack: <one line>. <one specific technical detail>. Open source: <link>"
```

This file IS the blog series. By the end, Bhargav copies sections into Medium/Substack/personal blog. The tweet summaries become a launch thread.

**`docs/ARCHITECTURE.md`** — system diagram (ASCII or mermaid), data flow, auth flow, why each tech choice.

**`docs/adrs/`** — one ADR per significant decision: auth approach, LLM abstraction, Ollama handling, extension token scheme, encryption scheme.

**`docs/DEPLOY.md`** — step-by-step from zero Cloudflare account to deployed app. Screenshots welcome.

**`README.md`** — hero screenshot, 30-second pitch, install instructions, link to deploy guide, link to architecture, link to build log.

---

## 12. Environment variables

```bash
# Workers (apps/api)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
SESSION_SECRET=                # 32-byte random, used for cookie signing AND key encryption
WEB_ORIGIN=https://apptrack.example.com
COOKIE_DOMAIN=.apptrack.example.com

# Bindings (wrangler.toml)
[[d1_databases]]
binding = "DB"
database_name = "apptrack"
database_id = "..."

# Web (apps/web)
PUBLIC_API_URL=https://api.apptrack.example.com
```

LLM keys are user-supplied, never in env.

---

## 13. Acceptance for "ready to ship"

- [ ] Live on Cloudflare with custom domain
- [ ] Chrome extension zipped, manifest validates, ready to submit
- [ ] All six detectors verified with a real application captured end-to-end
- [ ] `docs/BUILD_LOG.md` reads as a clean 6-phase narrative
- [ ] README has screenshot + GIF + one-paragraph pitch
- [ ] `pnpm lint && pnpm typecheck && pnpm test` all pass in CI
- [ ] Onboarding tested with a fresh browser profile: signup → install → first capture in <5 minutes
- [ ] Apache 2.0 or MIT license file at repo root

---

## 14. How to work with this prompt

When you start, do this:

1. Confirm understanding by listing the six phases and asking which one to start with.
2. Default to Phase 0 if no other instruction.
3. After completing a phase, append to `docs/BUILD_LOG.md`, summarise in chat, and **stop**. Wait for "continue" or feedback before starting the next phase.
4. If a decision isn't covered here, propose two options with tradeoffs and ask. Don't silently pick.
5. Run `pnpm lint && pnpm typecheck && pnpm test` before declaring a phase done.

Begin with Phase 0.
