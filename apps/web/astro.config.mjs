import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';

/*
 * The public origin, used for canonical links and absolute social-card URLs
 * (Layout.astro).
 *
 * Configured rather than hardcoded, because jlog is meant to be self-hosted: a
 * build that publishes someone else's origin as its canonical does not merely
 * mislabel itself, it asks search engines to treat that other domain as the
 * real copy of every page.
 *
 * Read from the build environment, not from `.env` — Astro loads `.env` for the
 * app through Vite, but this file is evaluated before that and sees only
 * `process.env`. On Cloudflare Pages it is a project environment variable; from
 * a shell it is `PUBLIC_SITE_URL=https://example.com pnpm build`.
 *
 * Deliberately without a fallback. Defaulting to this project's own origin
 * meant a self-hoster who never heard of the variable published metadata
 * naming someone else's deployment as the authoritative copy of their pages.
 * Left unset, Layout.astro emits no canonical and no absolute image URL, and a
 * missing canonical is harmless where a wrong one is not.
 *
 * Which does mean every deployment that wants social cards has to set it,
 * jlog.bhargav.dev included.
 */
const site = process.env.PUBLIC_SITE_URL;

export default defineConfig({
  site,
  integrations: [react(), tailwind()],
  output: 'static',
  server: { port: 4321 },
});
