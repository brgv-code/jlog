import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'jlog',
  version: '0.1.0',
  description:
    'Track job applications automatically from LinkedIn, Wellfound, Ashby, Greenhouse, Lever, and more.',
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: [
    'https://*.linkedin.com/*',
    'https://*.wellfound.com/*',
    'https://*.ashbyhq.com/*',
    'https://*.greenhouse.io/*',
    'https://*.lever.co/*',
    'https://*.workatastartup.com/*',
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
    {
      matches: ['https://*.wellfound.com/*'],
      js: ['src/content/wellfound.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://*.workatastartup.com/*'],
      js: ['src/content/ycombinator.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://*.ashbyhq.com/*'],
      js: ['src/content/ashby.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://*.greenhouse.io/*'],
      js: ['src/content/greenhouse.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://*.lever.co/*'],
      js: ['src/content/lever.ts'],
      run_at: 'document_idle',
    },
  ],
});
