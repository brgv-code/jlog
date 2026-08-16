import { HttpError } from '@jlog/shared';

export function requireSession(c: {
  var: { session: { userId: string; sessionId: string } | null };
}) {
  const session = c.var.session;
  if (!session) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Not authenticated');
  }
  return session;
}
