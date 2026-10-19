/*
 * The Chrome Web Store listing. Empty until the extension is published: the
 * store assigns the URL on first upload, and a button that 404s is worse than
 * none. Set it and every "Add to Chrome" button appears.
 */
export const STORE_URL = '';

/*
 * The setup guide. Also the tab the extension opens on a fresh install
 * (WELCOME_URL in apps/extension/src/lib/connection.ts), so the path cannot
 * move without an extension release.
 */
export const SETUP_GUIDE_URL = '/extension/welcome/';
