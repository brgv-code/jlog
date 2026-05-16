import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'jlog — Job Tracker',
  version: '0.1.0',
  description: 'Auto-capture job applications from LinkedIn and more.',
  permissions: ['storage', 'activeTab'],
  host_permissions: ['https://*.linkedin.com/*'],
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://*.linkedin.com/*'],
      js: ['src/content/linkedin.ts'],
    },
  ],
});
