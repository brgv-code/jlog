import { crx } from '@crxjs/vite-plugin';
import { defineConfig, loadEnv } from 'vite';
import manifest from './manifest.config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [crx({ manifest })],
    define: {
      'import.meta.env.VITE_API_BASE': JSON.stringify(env.VITE_API_BASE ?? 'http://localhost:8787'),
      // Where "get a new key" sends people. The popup cannot guess this from
      // the API URL, and a dead link is what the settings hint used to be.
      'import.meta.env.VITE_WEB_BASE': JSON.stringify(env.VITE_WEB_BASE ?? 'http://localhost:4321'),
    },
  };
});
