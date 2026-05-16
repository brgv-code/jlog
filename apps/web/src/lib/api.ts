const BASE = import.meta.env.PUBLIC_API_URL as string;

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, { credentials: 'include', ...init });
}
