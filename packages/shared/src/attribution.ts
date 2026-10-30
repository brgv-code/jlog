import { z } from 'zod';

/**
 * Where a new account came from (growth experiment E01).
 *
 * Two answers, kept apart because they fail differently:
 *
 *   - **First touch**, recorded by the browser on the first jlog page it ever
 *     opens: the referring site and any campaign tags. Exact, but blind to
 *     anything without a referrer, which includes most people who heard about
 *     jlog in an AI answer and typed the address in later.
 *   - **What the person says**, from "How did you find jlog?" in the setup
 *     guide. Covers exactly that case, and is only as good as memory.
 *
 * The channel is worked out here, at write time, from the raw values, which are
 * stored as well so that a channel can be re-derived if these rules change.
 */

export const SIGNUP_CHANNELS = [
  'ai',
  'google',
  'other_search',
  'reddit',
  'hacker_news',
  'github',
  'x',
  'linkedin',
  'product_hunt',
  'chrome_web_store',
  'email',
  /** A tagged link whose source is none of the above: a talk slide, a QR code. */
  'campaign',
  /** Any other site that linked here. */
  'referral',
  /** No referrer and no tags. */
  'direct',
] as const;

export type SignupChannel = (typeof SIGNUP_CHANNELS)[number];

/** The choices for "How did you find jlog?". */
export const HEARD_FROM = [
  'google',
  'ai_assistant',
  'reddit',
  'github',
  'x',
  'linkedin',
  'chrome_web_store',
  'friend',
  'other',
] as const;

export type HeardFrom = (typeof HEARD_FROM)[number];

/**
 * Hosts matched as the domain itself or any subdomain of it, so `old.reddit.com`
 * counts as reddit.com. Checked in order, which is why the AI assistants come
 * before Google: gemini.google.com is an answer engine, not a search result.
 */
const HOST_CHANNELS: ReadonlyArray<readonly [SignupChannel, readonly string[]]> = [
  [
    'ai',
    [
      'chatgpt.com',
      'chat.openai.com',
      'perplexity.ai',
      'gemini.google.com',
      'bard.google.com',
      'claude.ai',
      'copilot.microsoft.com',
      'chat.deepseek.com',
      'chat.mistral.ai',
      'grok.com',
      'meta.ai',
      'you.com',
      'phind.com',
    ],
  ],
  ['chrome_web_store', ['chromewebstore.google.com', 'chrome.google.com']],
  ['email', ['mail.google.com', 'outlook.live.com', 'outlook.office.com', 'mail.yahoo.com']],
  [
    'other_search',
    [
      'bing.com',
      'duckduckgo.com',
      'ecosia.org',
      'search.brave.com',
      'search.yahoo.com',
      'startpage.com',
      'kagi.com',
      'yandex.com',
      'baidu.com',
    ],
  ],
  ['reddit', ['reddit.com']],
  ['hacker_news', ['news.ycombinator.com']],
  ['github', ['github.com']],
  ['x', ['x.com', 'twitter.com', 't.co']],
  ['linkedin', ['linkedin.com', 'lnkd.in']],
  ['product_hunt', ['producthunt.com']],
];

/** google.com, google.de, google.co.uk, with or without www. Not its subdomains. */
const GOOGLE_SEARCH = /^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/;

/**
 * `utm_source` values, as people actually write them. ChatGPT appends
 * `utm_source=chatgpt.com` to the links it cites, which is the one AI visit
 * that arrives labelled even when the referrer is stripped.
 */
const SOURCE_CHANNELS: ReadonlyArray<readonly [SignupChannel, readonly string[]]> = [
  [
    'ai',
    ['chatgpt', 'chatgpt.com', 'openai', 'perplexity', 'gemini', 'claude', 'copilot', 'deepseek'],
  ],
  ['chrome_web_store', ['chrome-web-store', 'chrome_web_store', 'chromewebstore']],
  ['google', ['google']],
  ['other_search', ['bing', 'duckduckgo', 'ecosia', 'brave']],
  ['reddit', ['reddit']],
  ['hacker_news', ['hn', 'hackernews', 'hacker-news', 'news.ycombinator.com']],
  ['github', ['github']],
  ['x', ['x', 'twitter', 'x.com']],
  ['linkedin', ['linkedin']],
  ['product_hunt', ['producthunt', 'product-hunt', 'product_hunt']],
  ['email', ['email', 'newsletter']],
];

function matchesHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Lower-cased, without a leading `www.` or `m.`, or null if there is none. */
export function normaliseHost(host: string | null | undefined): string | null {
  const h = host?.trim().toLowerCase().replace(/\.$/, '');
  if (!h) return null;
  return h.replace(/^(www|m)\./, '');
}

export interface FirstTouchSignals {
  referrerHost?: string | null | undefined;
  utmSource?: string | null | undefined;
  utmMedium?: string | null | undefined;
}

/**
 * The channel for a first touch. Campaign tags win over the referrer, because a
 * tag is something someone chose to put on a link and a referrer is whatever
 * the browser happened to send.
 */
export function channelFor({
  referrerHost,
  utmSource,
  utmMedium,
}: FirstTouchSignals): SignupChannel {
  const source = utmSource?.trim().toLowerCase();
  if (source) {
    for (const [channel, names] of SOURCE_CHANNELS) {
      if (names.includes(source)) return channel;
    }
    if (utmMedium?.trim().toLowerCase() === 'email') return 'email';
    return 'campaign';
  }

  const host = normaliseHost(referrerHost);
  if (!host) return 'direct';

  for (const [channel, domains] of HOST_CHANNELS) {
    if (domains.some((d) => matchesHost(host, d))) return channel;
  }
  if (GOOGLE_SEARCH.test(host)) return 'google';
  return 'referral';
}

// --- Request bodies ---

/** Longest value kept from a tag or path; anything longer is someone's experiment, not a link. */
const MAX_TAG = 200;

const tag = z.string().trim().max(MAX_TAG).nullish();

/** What the browser remembered about its first visit, sent once after sign-up. */
export const firstTouchSchema = z.object({
  referrerHost: z
    .string()
    .trim()
    .max(253)
    .regex(/^[a-z0-9.-]+$/i, 'A host name only')
    .nullish(),
  utmSource: tag,
  utmMedium: tag,
  utmCampaign: tag,
  landingPath: z.string().trim().max(MAX_TAG).startsWith('/').nullish(),
  /** Milliseconds since the epoch, as the browser saw it. */
  firstSeenAt: z.number().int().positive().nullish(),
});

export type FirstTouch = z.infer<typeof firstTouchSchema>;

export const heardFromSchema = z.object({
  heardFrom: z.enum(HEARD_FROM),
  detail: z.string().trim().max(200).optional(),
});
