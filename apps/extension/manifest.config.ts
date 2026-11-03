import { defineManifest } from '@crxjs/vite-plugin';
import { loadEnv } from 'vite';

/** Only jlog's own site may message the extension; a pattern takes no port, so localhost covers the dev server. */
function websitePattern(mode: string): string {
  const web = new URL(loadEnv(mode, process.cwd(), '').VITE_WEB_BASE ?? 'http://localhost:4321');
  return `${web.protocol}//${web.hostname}/*`;
}

export default defineManifest(({ mode }) => ({
  manifest_version: 3,
  name: 'jlog',
  version: '1.1.1',
  homepage_url: 'https://jlog.ai',
  description:
    'Track job applications from LinkedIn, Greenhouse, Lever and more, and fill in application forms from your profile.',
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: [
    'https://api.jlog.ai/*',
    'https://*.linkedin.com/*',
    'https://*.wellfound.com/*',
    'https://*.ashbyhq.com/*',
    'https://*.greenhouse.io/*',
    'https://*.lever.co/*',
    'https://*.workatastartup.com/*',
  ],
  // Without these Chrome shows the grey jigsaw piece everywhere the extension
  // appears — toolbar, puzzle menu, chrome://extensions and the store listing.
  // The files live in public/, so Vite copies them to the bundle root untouched.
  icons: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'jlog — track this job',
    default_icon: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
  },
  // How jlog.ai tells the extension which account is signed in (lib/accountSync.ts). No permission warning.
  externally_connectable: { matches: [websitePattern(mode)] },
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
    // Autofill (ADR-012). Same hosts as capture, so no new permission and no
    // new warning for installed users. All frames, because company career
    // sites embed these boards' forms in an iframe.
    {
      matches: ['https://*.greenhouse.io/*', 'https://*.lever.co/*', 'https://*.ashbyhq.com/*'],
      js: ['src/content/autofill.ts'],
      run_at: 'document_idle',
      all_frames: true,
    },
  ],
}));
