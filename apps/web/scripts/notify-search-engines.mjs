#!/usr/bin/env node
/*
 * Tells search engines which public pages changed. Run once a day by
 * .github/workflows/notify-search-engines.yml.
 *
 * Compares the live sitemap with the snapshot from the last successful run
 * and sends only URLs that are new or whose <lastmod> moved. Once a day, not
 * on every push: IndexNow asks sites not to resend a URL many times a day,
 * and Google says repeat requests do not get anything crawled faster.
 *
 * - Google: resubmits the sitemap index through the Search Console API, when
 *   anything changed. Google retired its anonymous sitemap ping in 2023; an
 *   authenticated resubmit is what is left. It asks Google to read the sitemap
 *   again soon. It does not make Google index anything.
 * - IndexNow (Bing and others): sends the changed URLs.
 *
 * Built-ins only, so the workflow installs nothing and runs no third-party
 * code with these credentials in scope.
 *
 * Environment:
 *   SITE_URL             https://jlog.ai
 *   SNAPSHOT             path to the last run's snapshot; missing means a first
 *                        run, which sends every URL
 *   SEND_ALL=1           ignore the snapshot and send every URL
 *   GSC_PROPERTY         the Search Console property, `sc-domain:jlog.ai` or
 *                        `https://jlog.ai/`; Google is skipped without it
 *   GSC_SERVICE_ACCOUNT  a service account's JSON key; it must be a Full user
 *                        or owner on that property
 *   INDEXNOW_KEY         the key the site serves at /<key>.txt; IndexNow is
 *                        skipped without it
 */
import { createSign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Every <loc> in a sitemap or sitemap index. */
export function locs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1] ?? '');
}

/** `{ url: lastmod | null }` for every <url> in a urlset. */
export function sitemapEntries(xml) {
  const entries = {};
  for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/.exec(block ?? '')?.[1];
    if (!loc) continue;
    entries[loc] = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(block ?? '')?.[1] ?? null;
  }
  return entries;
}

/** URLs that are new since the snapshot, or whose lastmod moved. */
export function changedUrls(current, previous) {
  return Object.keys(current).filter((url) => !(url in previous) || previous[url] !== current[url]);
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`);
  return response.text();
}

/** Every page in the live sitemap, following the index to its children. */
async function liveEntries(indexUrl) {
  const children = locs(await fetchText(indexUrl));
  const parts = await Promise.all(
    children.map(async (child) => sitemapEntries(await fetchText(child))),
  );
  return Object.assign({}, ...parts);
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
  const current = await liveEntries(sitemap);

  const hasSnapshot = Boolean(env.SNAPSHOT) && existsSync(env.SNAPSHOT);
  const previous =
    env.SEND_ALL === '1' || !hasSnapshot ? {} : JSON.parse(readFileSync(env.SNAPSHOT, 'utf8'));
  const urls = changedUrls(current, previous);
  console.log(
    `${Object.keys(current).length} URL(s) in the sitemap, ${urls.length} new or changed${
      hasSnapshot ? '' : ' (no snapshot yet, so all of them)'
    }.`,
  );
  if (urls.length === 0) return;

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

  if (!env.INDEXNOW_KEY) {
    // The snapshot is what IndexNow has been told, so it only moves after a send.
    console.log('::notice::IndexNow skipped: INDEXNOW_KEY is not set.');
  } else {
    await sendToIndexNow({ site, key: env.INDEXNOW_KEY, urls }).catch((error) =>
      failures.push(error),
    );
  }

  // Both run even if one fails, and both failures are reported. No new
  // snapshot then, so the next run sends the same URLs again.
  for (const error of failures) console.log(`::error::${error.message}`);
  if (failures.length > 0) {
    process.exitCode = 1;
    return;
  }
  if (env.SNAPSHOT && env.INDEXNOW_KEY) {
    writeFileSync(env.SNAPSHOT, JSON.stringify(current, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.env).catch((error) => {
    console.log(`::error::${error.message}`);
    process.exitCode = 1;
  });
}
