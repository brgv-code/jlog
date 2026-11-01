import type { APIRoute, GetStaticPaths } from 'astro';

/*
 * The IndexNow key file, served at /<key>.txt. IndexNow (Bing, Yandex, Seznam,
 * Naver; Bing's index also feeds ChatGPT search) only accepts a list of changed
 * URLs from someone who can put this file on the site, which is how
 * .github/workflows/notify-search-engines.yml proves it speaks for jlog.ai.
 *
 * Only written when the build has INDEXNOW_KEY (a Cloudflare Pages environment
 * variable), so a self-hosted copy publishes no key it does not use. The key is
 * public by design, since anyone can fetch this file; it is an environment
 * variable so that each deployment has its own, not so that it stays secret.
 */
const KEY = /^[a-zA-Z0-9-]{8,128}$/;

export const getStaticPaths = (() => {
  const key = import.meta.env.INDEXNOW_KEY;
  return key && KEY.test(key) ? [{ params: { indexnow: key } }] : [];
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) =>
  new Response(params.indexnow, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
