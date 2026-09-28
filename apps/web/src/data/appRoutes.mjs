/*
 * Pages behind sign-in. They render an empty shell to a crawler and are no use
 * in search, so the sitemap leaves them out (astro.config.mjs) and robots.txt
 * disallows them (src/pages/robots.txt.ts). Plain .mjs so the Astro config can
 * import it too.
 */
export const APP_ROUTES = [
  '/applications',
  '/cv',
  '/dashboard',
  '/settings',
  '/login',
  '/designsystem',
];

/** True for a URL or path that is one of the routes above, or under one. */
export function isAppRoute(page) {
  const path = new URL(page, 'http://x').pathname.replace(/\/$/, '');
  return APP_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));
}
