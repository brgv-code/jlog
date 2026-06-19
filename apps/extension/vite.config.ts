import { crx } from '@crxjs/vite-plugin';
import { defineConfig, loadEnv } from 'vite';
import manifest from './manifest.config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [crx({ manifest })],
    define: {
      'import.meta.env.VITE_API_BASE': JSON.stringify(
        env.VITE_API_BASE ?? 'http://localhost:8787',
      ),
    },
  };
});
