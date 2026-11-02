#!/usr/bin/env node
/*
 * Tells search engines the public site changed. Run by
 * .github/workflows/notify-search-engines.yml once Cloudflare Pages has
 * deployed a push to main.
 *
 * - Google: resubmits the sitemap index through the Search Console API. Google
 *   retired its anonymous sitemap ping in 2023; an authenticated resubmit is
 *   what is left. It asks Google to read the sitemap again soon. It does not
 *   make Google index anything.
 * - IndexNow (Bing and others): sends the URLs of the pages this push changed.
 *
 * Built-ins only, so the workflow installs nothing and runs no third-party
 * code with these credentials in scope.
 *
 * Environment:
 *   SITE_URL             https://jlog.ai
 *   CHANGED_FILES        repo-relative paths changed by the push, one per line,
 *                        or `ALL` to send every URL in the sitemap
 *   GSC_PROPERTY         the Search Console property, `sc-domain:jlog.ai` or
 *                        `https://jlog.ai/`; Google is skipped without it
 *   GSC_SERVICE_ACCOUNT  a service account's JSON key; it must be a Full user
 *                        or owner on that property
 *   INDEXNOW_KEY         the key the site serves at /<key>.txt; IndexNow is
 *                        skipped without it
 */
import { createSign } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const PAGES_DIR = 'apps/web/src/pages/';
const PAGE_EXTENSION = /\.(astro|md|mdx)$/;

/** The public URL a source file under src/pages builds to, or undefined. */
export function pageUrl(file, site) {
  if (!file.startsWith(PAGES_DIR) || !PAGE_EXTENSION.test(file) || file.includes('[')) {
    return undefined;
  }
  const path = file
    .slice(PAGES_DIR.length)
    .replace(PAGE_EXTENSION, '')
    .replace(/(^|\/)index$/, '');
  return new URL(path ? `/${path}/` : '/', site).href;
}

/** Every <loc> in a sitemap or sitemap index. */
export function locs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1] ?? '');
}

/**
 * The URLs to send to IndexNow: pages the push changed that the live sitemap
 * lists. Going through the sitemap keeps out everything it leaves out on
 * purpose (sign-in pages, the 404) without a second list of them here.
 */
export function changedUrls(changedFiles, sitemapUrls, site) {
  if (changedFiles.trim() === 'ALL') return [...sitemapUrls];
  const listed = new Set(sitemapUrls);
  const urls = changedFiles
    .split('\n')
    .map((file) => pageUrl(file.trim(), site))
    .filter((url) => url !== undefined && listed.has(url));
  return [...new Set(urls)];
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`);
  return response.text();
}

async function sitemapUrls(indexUrl) {
  const children = locs(await fetchText(indexUrl));
  const pages = await Promise.all(children.map(async (child) => locs(await fetchText(child))));
  return pages.flat();
}

const base64url = (value) => Buffer.from(value).toString('base64url');

/** An OAuth access token for a service account, from a signed JWT (RFC 7523). */
async function googleAccessToken(serviceAccount) {
  const { client_email, private_key, token_uri } = JSON.parse(serviceAccount);
  const audience = token_uri ?? 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify({
      iss: client_email,
      scope: 'https://www.googleapis.com/auth/webmasters',
      aud: audience,
      iat: now,
      exp: now + 600,
    }),
  )}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(private_key, 'base64url');
  const response = await fetch(audience, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Google token request failed: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function resubmitToGoogle({ property, serviceAccount, sitemap }) {
  const token = await googleAccessToken(serviceAccount);
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    property,
  )}/sitemaps/${encodeURIComponent(sitemap)}`;
  const headers = { Authorization: `Bearer ${token}` };

  const submitted = await fetch(endpoint, { method: 'PUT', headers });
  if (!submitted.ok) {
    throw new Error(
      [
        `Search Console refused the sitemap (${submitted.status}): ${await submitted.text()}`,
        'A 403 means the service account is not a Full user or owner on the property,',
        'or GSC_PROPERTY does not name the property exactly as Search Console does.',
      ].join('\n'),
    );
  }

  // What Search Console now holds for it, so the run log shows the counts.
  const status = await (await fetch(endpoint, { headers })).json();
  const discovered = (status.contents ?? []).map((c) => `${c.submitted} ${c.type}`).join(', ');
  const lastRead = discovered ? `, ${discovered} from the last read` : '';
  console.log(
    `Google: resubmitted ${sitemap}. Last downloaded ${status.lastDownloaded ?? 'never'}${lastRead}.`,
  );
}

async function sendToIndexNow({ site, key, urls }) {
  // IndexNow fetches this file to check the key. A missing one means the
  // INDEXNOW_KEY Pages variable was not set for the build that is live.
  const keyLocation = new URL(`/${key}.txt`, site).href;
  const served = await fetch(keyLocation);
  if (!served.ok || (await served.text()).trim() !== key) {
    throw new Error(
      `${keyLocation} does not serve the key. Set INDEXNOW_KEY on the Cloudflare Pages project to the same value as the workflow secret, and redeploy.`,
    );
  }

  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(site).host, key, keyLocation, urlList: urls }),
  });
  // 200 and 202 both mean accepted; 202 is "key not yet verified", normal on a first send.
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`IndexNow answered ${response.status}: ${await response.text()}`);
  }
  console.log(`IndexNow: sent ${urls.length} URL(s), answered ${response.status}.`);
  for (const url of urls) console.log(`  ${url}`);
}

async function main(env) {
  const site = env.SITE_URL;
  if (!site) throw new Error('SITE_URL is not set.');
  const sitemap = new URL('/sitemap-index.xml', site).href;
  const failures = [];

  if (env.GSC_PROPERTY && env.GSC_SERVICE_ACCOUNT) {
    await resubmitToGoogle({
      property: env.GSC_PROPERTY,
      serviceAccount: env.GSC_SERVICE_ACCOUNT,
      sitemap,
    }).catch((error) => failures.push(error));
  } else {
    console.log('::notice::Google skipped: GSC_PROPERTY or GSC_SERVICE_ACCOUNT is not set.');
  }

  if (env.INDEXNOW_KEY) {
    const urls = changedUrls(env.CHANGED_FILES ?? '', await sitemapUrls(sitemap), site);
    if (urls.length === 0) {
      console.log('IndexNow: no page in the sitemap changed, nothing to send.');
    } else {
      await sendToIndexNow({ site, key: env.INDEXNOW_KEY, urls }).catch((error) =>
        failures.push(error),
      );
    }
  } else {
    console.log('::notice::IndexNow skipped: INDEXNOW_KEY is not set.');
  }

  // Both run even if one fails, and both failures are reported.
  for (const error of failures) console.log(`::error::${error.message}`);
  if (failures.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.env).catch((error) => {
    console.log(`::error::${error.message}`);
    process.exitCode = 1;
  });
}
