import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'jlog',
  version: '0.1.0',
  description: 'Track job applications automatically from LinkedIn and more.',
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: [
    'https://*.linkedin.com/*',
    'https://*.wellfound.com/*',
    'https://*.ashbyhq.com/*',
    'https://*.greenhouse.io/*',
    'https://*.lever.co/*',
  ],
  action: {
    default_popup: 'src/popup/index.html',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://*.linkedin.com/*'],
      js: ['src/content/linkedin.ts'],
      run_at: 'document_idle',
    },
  ],
});
