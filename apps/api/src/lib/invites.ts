/**
 * Invite-only sign-up.
 *
 * `ALLOWED_EMAILS` lists who may create an account: whole addresses, or
 * `@domain.com` for everyone at a domain, separated by commas or whitespace.
 * Unset or empty means sign-up is open, which is the right default for a
 * self-hosted instance.
 *
 * The gate is on creating an account and nothing else. Anyone who already has
 * one keeps signing in as before, with any method linked to it, so turning the
 * list on never locks an existing user out.
 */

export interface InviteList {
  addresses: Set<string>;
  domains: Set<string>;
}

export function parseInviteList(raw: string | undefined): InviteList | null {
  const entries = (raw ?? '')
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (entries.length === 0) return null;

  const list: InviteList = { addresses: new Set(), domains: new Set() };
  for (const entry of entries) {
    if (entry.startsWith('@')) list.domains.add(entry.slice(1));
    else list.addresses.add(entry);
  }
  return list;
}

/** Whether this address may create an account. Always true when no list is set. */
export function isInvited(raw: string | undefined, email: string): boolean {
  const list = parseInviteList(raw);
  if (!list) return true;
  const address = email.trim().toLowerCase();
  const domain = address.split('@')[1] ?? '';
  return list.addresses.has(address) || list.domains.has(domain);
}

/** Whether sign-up is restricted at all, for the login page to say so. */
export function isInviteOnly(raw: string | undefined): boolean {
  return parseInviteList(raw) !== null;
}

export const INVITE_ONLY_MESSAGE =
  'jlog is invite-only while it is in early access. Sign in with the address you were invited with, or ask for an invite at support@jlog.ai.';
