import { loadRecentActivity } from '../lib/activity';
import type { CvProfile, SavedValues } from '../lib/autofill';
import {
  API_BASE,
  type Connection,
  checkConnection,
  getToken,
  setCachedConnection,
} from '../lib/connection';
import type { DraftResult } from '../lib/draft';
import type { DetectedJob, ExtensionMessage, ExtractedJob, RecentActivity } from '../types';

async function apiCall(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  // A 401 means the key is no longer good. It used to be deleted here and
  // nowhere else, which is why the popup could only ever say "something went
  // wrong" and then, after a reload, act as if a key had never been pasted.
  // Now the key is kept and the reason is looked up, so the popup can say
  // "expired on Tuesday, here is where to get a new one".
  if (res.status === 401) {
    await checkConnection();
  }
  return res;
}

async function saveJob(
  job: DetectedJob,
): Promise<{ ok: boolean; error?: string; status?: number }> {
  try {
    const res = await apiCall('/api/applications', {
      method: 'POST',
      body: JSON.stringify({
        company: job.company,
        role: job.role,
        ...(job.location != null ? { location: job.location } : {}),
        status: job.status ?? 'saved',
        sourceUrl: job.sourceUrl,
        sourceSite: job.sourceSite,
        appliedAt: job.appliedAt ? Math.floor(job.appliedAt / 1000) : undefined,
        ...(job.notes ? { notes: job.notes } : {}),
        ...(job.jobDescription ? { jobDescription: job.jobDescription } : {}),
        ...(job.logoUrl ? { companyLogoUrl: job.logoUrl } : {}),
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({ error: { message: res.statusText } }))) as {
        error?: { message?: string };
      };
      return { ok: false, error: data.error?.message ?? `HTTP ${res.status}`, status: res.status };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: String(err) };
  }
}

async function extractJob(
  text: string,
  url: string,
): Promise<{ job: ExtractedJob | null; error?: string; status?: number }> {
  const res = await apiCall('/api/extract', {
    method: 'POST',
    body: JSON.stringify({ html: text, url }),
  });
  // The status is carried back rather than flattened into `null`. Losing it was
  // how an auth failure came to be reported as "could not extract job details".
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { job: null, error: data.error?.message ?? `HTTP ${res.status}`, status: res.status };
  }
  const data = (await res.json()) as {
    company?: string;
    role?: string;
    location?: string | null;
    confidence?: number;
  };
  if (!data.company || !data.role) return { job: null };
  return {
    job: {
      company: data.company,
      role: data.role,
      location: data.location ?? null,
      confidence: data.confidence ?? 0,
    },
  };
}

/**
 * The CV profile, for the autofill content script. Fetched here rather than in
 * the page because the key lives in extension storage and the API only trusts
 * the extension's own origin — a content script's requests carry the board's.
 */
async function loadProfile(): Promise<{
  profile: CvProfile | null;
  saved: SavedValues | null;
  error?: string;
  status?: number;
}> {
  try {
    const [res, savedRes] = await Promise.all([
      apiCall('/api/profile/cv'),
      apiCall('/api/profile/autofill'),
    ]);
    if (!res.ok) {
      return { profile: null, saved: null, error: `HTTP ${res.status}`, status: res.status };
    }
    const data = (await res.json()) as { profile: CvProfile; stored: boolean };
    // Saved answers are optional. An API from before they existed answers 404,
    // and the fill then does what phase 1 did: standard fields only.
    const saved = savedRes.ok
      ? ((await savedRes.json()) as { values: SavedValues; stored: boolean })
      : null;
    return {
      profile: data.stored ? data.profile : null,
      saved: saved?.stored ? saved.values : null,
    };
  } catch (err: unknown) {
    return { profile: null, saved: null, error: String(err) };
  }
}

/**
 * One drafted answer. The status and error code are passed back as they came,
 * because 402 (not pro), 422 (a refused question) and 503 (no LLM configured)
 * each need a different sentence in the page, and all three are normal.
 */
async function draftAnswer(msg: {
  question: string;
  pageUrl: string;
  pageText: string;
}): Promise<{ draft: DraftResult | null; status?: number; code?: string; error?: string }> {
  try {
    const res = await apiCall('/api/pro/answer', {
      method: 'POST',
      body: JSON.stringify({
        question: msg.question,
        pageUrl: msg.pageUrl,
        pageText: msg.pageText,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: { code?: string; message?: string };
      };
      return {
        draft: null,
        status: res.status,
        ...(data.error?.code ? { code: data.error.code } : {}),
        error: data.error?.message ?? `HTTP ${res.status}`,
      };
    }
    return { draft: (await res.json()) as DraftResult };
  } catch (err: unknown) {
    return { draft: null, error: String(err) };
  }
}

type MessageResult =
  | { ok: boolean; error?: string; status?: number }
  | { job: ExtractedJob | null; error?: string; status?: number }
  | { connection: Connection }
  | { activity: RecentActivity | null }
  | { profile: CvProfile | null; saved: SavedValues | null; error?: string; status?: number }
  | { draft: DraftResult | null; status?: number; code?: string; error?: string };

async function handleMessage(message: unknown): Promise<MessageResult> {
  if (typeof message !== 'object' || message === null) {
    return { ok: false, error: 'Invalid message' };
  }
  const msg = message as ExtensionMessage;

  switch (msg.type) {
    case 'JOB_DETECTED':
    case 'SAVE_JOB':
      return saveJob(msg.job);

    case 'CHECK_CONNECTION':
      return { connection: await checkConnection() };

    case 'RECENT_ACTIVITY':
      return { activity: await loadRecentActivity(apiCall) };

    case 'AUTOFILL_PROFILE':
      return loadProfile();

    case 'DRAFT_ANSWER':
      return draftAnswer(msg);

    case 'EXTRACT_REQUEST': {
      try {
        return await extractJob(msg.text, msg.url);
      } catch (err: unknown) {
        return { job: null, error: String(err) };
      }
    }

    default:
      return { ok: false, error: 'Unknown message type' };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  // A fresh install has no key, and saying so up front means the popup opens
  // straight onto the paste screen instead of guessing.
  void setCachedConnection({ status: 'no-key', expiresAt: null, label: null, account: null });
});

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err: unknown) => {
        sendResponse({ ok: false, error: String(err) });
      });
    return true; // keep channel open for async response
  },
);
