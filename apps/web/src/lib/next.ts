/**
 * Where to go after signing in, carried through /login as `?next=`.
 *
 * Without it every sign-in ended on the dashboard, so a page that sent someone
 * to sign in (the extension's "Open Settings", most of all) lost them on the
 * way back. The extension links to /settings#extension; that anchor has to
 * survive the round trip or the person lands at the top of a long page.
 */

/**
 * The path to return to, or null when there is none worth trusting.
 *
 * Same origin paths only. `//evil.com` and `/\evil.com` are both read by
 * browsers as another host, and an open redirect on the sign-in page is the
 * classic way to make a phishing link look like jlog's own.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  // Control characters (a tab or newline inside "//") are stripped by URL
  // parsers before the host is read, which would undo the check above.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  // Back to the sign-in page is a loop, not a destination.
  if (raw === '/login' || raw.startsWith('/login/') || raw.startsWith('/login?')) return null;
  return raw;
}

/** /login, remembering the current page so sign-in can return to it. */
export function loginUrlFor(location: { pathname: string; search: string; hash: string }): string {
  const here = `${location.pathname}${location.search}${location.hash}`;
  const next = safeNext(here);
  return next ? `/login?next=${encodeURIComponent(next)}` : '/login';
}
