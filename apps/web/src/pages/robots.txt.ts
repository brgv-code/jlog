import type { APIRoute } from 'astro';
import { APP_ROUTES } from '../data/appRoutes.mjs';

/*
 * Generated rather than kept in public/ because the sitemap line has to be an
 * absolute URL on this deployment's own origin, and a self-hosted copy must not
 * point crawlers at jlog.ai's sitemap. Without `site` the line is left out.
 */
export const GET: APIRoute = ({ site }) => {
  const lines = ['User-agent: *', 'Allow: /', ...APP_ROUTES.map((route) => `Disallow: ${route}`)];
  if (site) lines.push('', `Sitemap: ${new URL('/sitemap-index.xml', site).href}`);
  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
