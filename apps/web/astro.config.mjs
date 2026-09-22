import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';

export default defineConfig({
  // Absolute URLs for canonical links and social cards (Layout.astro).
  site: 'https://jlog.bhargav.dev',
  integrations: [react(), tailwind()],
  output: 'static',
  server: { port: 4321 },
});
