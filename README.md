# jlog

> Open-source, self-hostable job application tracker with a Chrome extension that auto-captures applications from LinkedIn, Wellfound, YC, Ashby, Greenhouse, and Lever.

## Status

Under active development — see [Build Log](docs/BUILD_LOG.md) for progress.

## Stack

- **Frontend**: Astro 4 + React islands + Tailwind CSS
- **Backend**: Cloudflare Workers + Hono
- **Database**: Cloudflare D1 + Drizzle ORM
- **Auth**: GitHub OAuth + session cookies
- **Extension**: Chrome MV3 + Vite + @crxjs

## Getting started

```bash
pnpm install
pnpm dev
```

Web: http://localhost:4321 · API: http://localhost:8787

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md).

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

MIT
