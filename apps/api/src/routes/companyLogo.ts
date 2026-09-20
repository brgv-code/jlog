import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { lookupLogo } from '../lib/companyLogo';
import { requireSession } from '../lib/session';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * A company's logo, from the shared cache.
 *
 * Session-gated but not user-scoped: the bytes are the same for everyone, and
 * the session is here so the endpoint is not an open image proxy, not because
 * the content is private.
 *
 * A 404 is the ordinary case, not an error — most companies will not resolve,
 * and the client falls back to a monogram. The negative cache means a 404 costs
 * one indexed lookup rather than a fetch.
 */
router.get('/', async (c) => {
  requireSession(c);

  const company = c.req.query('company');
  if (!company) return c.body(null, 400);

  const record = await lookupLogo(c.env, company);
  if (!record || record.missing || !record.r2Key) return c.body(null, 404);

  const bucket = c.env.CV_FILES;
  if (!bucket) return c.body(null, 404);

  const object = await bucket.get(record.r2Key);
  if (!object) return c.body(null, 404);

  return new Response(object.body, {
    headers: {
      'Content-Type': record.contentType ?? 'application/octet-stream',
      // Shared rather than private: this is a company's logo, identical for
      // every user, and the whole point is to fetch it as rarely as possible.
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
});

export default router;
