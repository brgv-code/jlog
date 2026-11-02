import { createDb, users } from '@jlog/db';
import { eq } from 'drizzle-orm';

// Server side so extension activity is counted with no analytics code in the extension.

interface AnalyticsEnv {
  POSTHOG_KEY?: string;
  POSTHOG_HOST?: string;
}

interface MatchedEvent {
  event: string;
  properties?: Record<string, string>;
}

const DEFAULT_HOST = 'https://eu.i.posthog.com';

// Reads are left out: they are page loads, which the web client already sees.
const EVENT_TABLE: [method: string, path: RegExp, event: string][] = [
  ['POST', /^\/api\/applications$/, 'application created'],
  ['PATCH', /^\/api\/applications\/[^/]+$/, 'application updated'],
  ['DELETE', /^\/api\/applications\/[^/]+$/, 'application deleted'],
  ['POST', /^\/api\/applications\/[^/]+\/events$/, 'follow up logged'],
  ['PUT', /^\/api\/applications\/[^/]+\/tailored$/, 'tailored cv saved'],
  ['POST', /^\/api\/extract$/, 'job extracted with ai'],
  ['POST', /^\/api\/extension\/token$/, 'extension key created'],
  ['DELETE', /^\/api\/extension\/tokens\/[^/]+$/, 'extension key revoked'],
  ['POST', /^\/api\/profile\/import\/commit$/, 'cv imported'],
  ['PUT', /^\/api\/profile\/cv$/, 'cv saved'],
  ['PUT', /^\/api\/profile\/autofill$/, 'autofill answers saved'],
  // The extension's fill button reads this; the web app does not.
  ['GET', /^\/api\/profile\/autofill$/, 'autofill profile loaded'],
  ['PUT', /^\/api\/llm\/config$/, 'ai provider configured'],
  ['POST', /^\/api\/billing\/checkout$/, 'checkout started'],
];

const PRO_PATH = /^\/api\/pro\/([^/]+)/;

export function eventFor(method: string, path: string): MatchedEvent | null {
  const pro = method !== 'GET' ? PRO_PATH.exec(path) : null;
  // First segment only: the rest of a pro path can carry an application id.
  if (pro?.[1]) return { event: 'pro feature used', properties: { feature: pro[1] } };

  const row = EVENT_TABLE.find(
    ([rowMethod, pattern]) => rowMethod === method && pattern.test(path),
  );
  return row ? { event: row[2] } : null;
}

// Null, never asked, counts as no.
export function accountConsents(db: D1Database) {
  return async (userId: string): Promise<boolean> => {
    const [row] = await createDb(db)
      .select({ consent: users.analyticsConsent })
      .from(users)
      .where(eq(users.id, userId));
    return row?.consent === true;
  };
}

// Never throws: a lost analytics event must not fail the request it describes.
export async function captureEvent(
  env: AnalyticsEnv,
  input: {
    userId: string;
    event: string;
    properties?: Record<string, string | number | boolean | null>;
    sessionId?: string | null;
    hasConsent: (userId: string) => Promise<boolean>;
  },
): Promise<void> {
  if (!env.POSTHOG_KEY) return;

  try {
    if (!(await input.hasConsent(input.userId))) return;

    await fetch(`${env.POSTHOG_HOST ?? DEFAULT_HOST}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: env.POSTHOG_KEY,
        event: input.event,
        distinct_id: input.userId,
        timestamp: new Date().toISOString(),
        properties: {
          ...input.properties,
          // Ties the event to the browser session, and so to its replay, when the web app made the call.
          ...(input.sessionId ? { $session_id: input.sessionId } : {}),
          $lib: 'jlog-api',
        },
      }),
    });
  } catch (err) {
    console.warn('PostHog capture failed', input.event, err);
  }
}
