import type { DetectedJob, ExtensionMessage, ExtractedJob } from '../types';

const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8787';

async function getToken(): Promise<string | null> {
  const result = await chrome.storage.local.get('jlog_token');
  return (result.jlog_token as string | undefined) ?? null;
}

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
  // Token expired or revoked — clear it so the popup shows the re-enter screen
  if (res.status === 401) {
    await chrome.storage.local.remove('jlog_token');
  }
  return res;
}

async function saveJob(job: DetectedJob): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiCall('/api/applications', {
      method: 'POST',
      body: JSON.stringify({
        company: job.company,
        role: job.role,
        ...(job.location != null ? { location: job.location } : {}),
        status: 'applied',
        sourceUrl: job.sourceUrl,
        sourceSite: job.sourceSite,
        appliedAt: job.appliedAt ? Math.floor(job.appliedAt / 1000) : undefined,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({ error: { message: res.statusText } }))) as {
        error?: { message?: string };
      };
      return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: String(err) };
  }
}

async function extractJob(text: string, url: string): Promise<ExtractedJob | null> {
  const res = await apiCall('/api/extract', {
    method: 'POST',
    body: JSON.stringify({ html: text, url }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    company?: string;
    role?: string;
    location?: string | null;
    confidence?: number;
  };
  if (!data.company || !data.role) return null;
  return {
    company: data.company,
    role: data.role,
    location: data.location ?? null,
    confidence: data.confidence ?? 0,
  };
}

async function handleMessage(
  message: unknown,
): Promise<{ ok: boolean; error?: string } | { job: ExtractedJob | null; error?: string }> {
  if (typeof message !== 'object' || message === null) {
    return { ok: false, error: 'Invalid message' };
  }
  const msg = message as ExtensionMessage;

  switch (msg.type) {
    case 'JOB_DETECTED':
    case 'SAVE_JOB':
      return saveJob(msg.job);

    case 'EXTRACT_REQUEST': {
      try {
        const job = await extractJob(msg.text, msg.url);
        return { job };
      } catch (err: unknown) {
        return { job: null, error: String(err) };
      }
    }

    default:
      return { ok: false, error: 'Unknown message type' };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('jlog extension installed');
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
