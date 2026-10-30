import { describe, expect, it } from 'vitest';
import { channelFor, firstTouchSchema, heardFromSchema, normaliseHost } from './attribution';

describe('channelFor', () => {
  it('reads an untagged visit with no referrer as direct', () => {
    expect(channelFor({})).toBe('direct');
    expect(channelFor({ referrerHost: '', utmSource: '  ' })).toBe('direct');
  });

  it('recognises the answer engines by referrer', () => {
    for (const host of [
      'chatgpt.com',
      'www.perplexity.ai',
      'gemini.google.com',
      'claude.ai',
      'copilot.microsoft.com',
    ]) {
      expect(channelFor({ referrerHost: host })).toBe('ai');
    }
  });

  it('reads ChatGPT’s own tag as AI even with the referrer stripped', () => {
    expect(channelFor({ utmSource: 'chatgpt.com' })).toBe('ai');
  });

  it('keeps Gemini apart from Google search', () => {
    expect(channelFor({ referrerHost: 'gemini.google.com' })).toBe('ai');
    expect(channelFor({ referrerHost: 'www.google.com' })).toBe('google');
    expect(channelFor({ referrerHost: 'google.de' })).toBe('google');
    expect(channelFor({ referrerHost: 'www.google.co.uk' })).toBe('google');
  });

  it('does not count a sign-in or the web store as a Google search', () => {
    expect(channelFor({ referrerHost: 'chromewebstore.google.com' })).toBe('chrome_web_store');
    expect(channelFor({ referrerHost: 'accounts.google.com' })).toBe('referral');
  });

  it('matches subdomains of the communities', () => {
    expect(channelFor({ referrerHost: 'old.reddit.com' })).toBe('reddit');
    expect(channelFor({ referrerHost: 'out.reddit.com' })).toBe('reddit');
    expect(channelFor({ referrerHost: 'news.ycombinator.com' })).toBe('hacker_news');
    expect(channelFor({ referrerHost: 't.co' })).toBe('x');
    expect(channelFor({ referrerHost: 'lnkd.in' })).toBe('linkedin');
    expect(channelFor({ referrerHost: 'github.com' })).toBe('github');
  });

  it('does not match a host that merely ends in the same letters', () => {
    expect(channelFor({ referrerHost: 'notreddit.com' })).toBe('referral');
  });

  it('lets a tag win over the referrer', () => {
    expect(channelFor({ referrerHost: 'www.google.com', utmSource: 'reddit' })).toBe('reddit');
  });

  it('reads a tag it does not know as a campaign, and email by medium', () => {
    expect(channelFor({ utmSource: 'berlin-ai-meetup' })).toBe('campaign');
    expect(channelFor({ utmSource: 'weekly-digest', utmMedium: 'email' })).toBe('email');
  });

  it('reads the extension’s install tab as the web store', () => {
    expect(channelFor({ utmSource: 'chrome-web-store', utmMedium: 'extension-install' })).toBe(
      'chrome_web_store',
    );
  });

  it('reads any other site as a referral', () => {
    expect(channelFor({ referrerHost: 'bhargav.dev' })).toBe('referral');
  });
});

describe('normaliseHost', () => {
  it('drops www., m. and a trailing dot, and lower-cases', () => {
    expect(normaliseHost('WWW.Reddit.com')).toBe('reddit.com');
    expect(normaliseHost('m.facebook.com')).toBe('facebook.com');
    expect(normaliseHost('news.ycombinator.com.')).toBe('news.ycombinator.com');
    expect(normaliseHost('  ')).toBeNull();
    expect(normaliseHost(null)).toBeNull();
  });
});

describe('firstTouchSchema', () => {
  it('accepts what the browser sends', () => {
    expect(
      firstTouchSchema.safeParse({
        referrerHost: 'chatgpt.com',
        utmSource: 'chatgpt.com',
        utmMedium: null,
        utmCampaign: null,
        landingPath: '/features/autofill',
        firstSeenAt: 1_761_800_000_000,
      }).success,
    ).toBe(true);
  });

  it('refuses a full URL where a host belongs', () => {
    expect(firstTouchSchema.safeParse({ referrerHost: 'https://chatgpt.com/c/123' }).success).toBe(
      false,
    );
  });

  it('refuses a landing path that is not a path', () => {
    expect(firstTouchSchema.safeParse({ landingPath: 'https://evil.example' }).success).toBe(false);
  });
});

describe('heardFromSchema', () => {
  it('takes one of the listed answers, with optional detail', () => {
    expect(heardFromSchema.safeParse({ heardFrom: 'ai_assistant' }).success).toBe(true);
    expect(
      heardFromSchema.safeParse({ heardFrom: 'friend', detail: 'Berlin AI meetup' }).success,
    ).toBe(true);
    expect(heardFromSchema.safeParse({ heardFrom: 'tiktok' }).success).toBe(false);
  });
});
