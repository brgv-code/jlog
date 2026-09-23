import { describe, expect, it } from 'vitest';
import {
  NEVER_EXPIRES_AT,
  createBaseDocumentSchema,
  createProfileFactSchema,
  expiryFromLifetime,
  extensionTokenSchema,
  findTraversingAssetRefs,
  isNeverExpiring,
  normaliseVariantContent,
} from './schemas';

describe('findTraversingAssetRefs', () => {
  it('flags the Overleaf photo path that fails in the compile sandbox', () => {
    // Real case: this exact line produced an unrecoverable XeTeX error,
    // "Unable to load picture or PDF file '../Profile.png'".
    expect(findTraversingAssetRefs('\\photo[64pt][0.2pt]{../Profile.png}')).toEqual([
      '../Profile.png',
    ]);
  });

  it('accepts an in-directory reference', () => {
    expect(findTraversingAssetRefs('\\photo[64pt][0.2pt]{Profile.png}')).toEqual([]);
  });

  it('accepts a relative subdirectory', () => {
    expect(findTraversingAssetRefs('\\includegraphics{img/logo.png}')).toEqual([]);
  });

  it('flags absolute paths', () => {
    expect(findTraversingAssetRefs('\\includegraphics{/Users/me/logo.png}')).toEqual([
      '/Users/me/logo.png',
    ]);
  });

  it('flags traversal buried mid-path', () => {
    expect(findTraversingAssetRefs('\\input{assets/../../secret.tex}')).toEqual([
      'assets/../../secret.tex',
    ]);
  });

  it('does not flag a filename that merely contains dots', () => {
    expect(findTraversingAssetRefs('\\includegraphics{logo..v2.png}')).toEqual([]);
  });

  it('ignores commands that do not name files', () => {
    expect(findTraversingAssetRefs('\\usepackage{../evil}\\moderncvstyle{classic}')).toEqual([]);
  });

  it('reports each bad path once across many references', () => {
    const tex = '\\photo{../a.png}\\includegraphics{../a.png}\\input{../b.tex}';
    expect(findTraversingAssetRefs(tex).sort()).toEqual(['../a.png', '../b.tex']);
  });

  it('handles an empty argument without crashing', () => {
    expect(findTraversingAssetRefs('\\photo{}')).toEqual([]);
  });
});

describe('createBaseDocumentSchema', () => {
  const valid = { type: 'cv', label: 'Base CV', content: '\\photo{Profile.png}' };

  it('accepts a document whose assets are in-directory', () => {
    expect(createBaseDocumentSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a document that traverses out of the compile directory', () => {
    const res = createBaseDocumentSchema.safeParse({
      ...valid,
      content: '\\photo{../Profile.png}',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.errors[0]?.message).toContain('../Profile.png');
    }
  });
});

describe('profile facts', () => {
  it('defaults a fact to active', () => {
    const res = createProfileFactSchema.safeParse({ kind: 'bullet', canonical: 'Did a thing.' });
    expect(res.success && res.data.status).toBe('active');
  });

  it('rejects an unknown kind', () => {
    expect(createProfileFactSchema.safeParse({ kind: 'vibe', canonical: 'x' }).success).toBe(false);
  });

  it('normalises variant content so dedupe ignores case and whitespace', () => {
    // These two are the same phrasing from two different tailored CVs.
    const a = normaliseVariantContent('  Shipped an  in-app messenger bot.\n');
    const b = normaliseVariantContent('Shipped an in-app Messenger bot.');
    expect(a).toBe(b);
  });
});

describe('extension key lifetimes', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('turns each dated lifetime into the right expiry', () => {
    expect(expiryFromLifetime('1d', now).toISOString()).toBe('2026-01-02T00:00:00.000Z');
    expect(expiryFromLifetime('7d', now).toISOString()).toBe('2026-01-08T00:00:00.000Z');
    expect(expiryFromLifetime('30d', now).toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });

  it('parks a non-expiring key on the sentinel rather than a real date', () => {
    expect(expiryFromLifetime('never', now)).toEqual(NEVER_EXPIRES_AT);
    expect(isNeverExpiring(expiryFromLifetime('never', now))).toBe(true);
  });

  it('does not mistake a long-dated key for a non-expiring one', () => {
    // The distinction drives what Settings shows and whether a warning appears,
    // so a 30-day key must never read as "never expires".
    expect(isNeverExpiring(expiryFromLifetime('30d', now))).toBe(false);
  });

  it('keeps the sentinel far enough out that the middleware treats it as live', () => {
    expect(NEVER_EXPIRES_AT.getTime()).toBeGreaterThan(Date.now());
  });

  it('defaults to 30 days when the caller sends nothing', () => {
    // An empty body means "use the picker default", not "bad request" — the
    // extension settings form always has a selection.
    const res = extensionTokenSchema.safeParse({});
    expect(res.success && res.data.expiresIn).toBe('30d');
  });

  it('rejects a lifetime that is not on the menu', () => {
    expect(extensionTokenSchema.safeParse({ expiresIn: '99y' }).success).toBe(false);
  });

  it('trims a label and refuses an essay', () => {
    const res = extensionTokenSchema.safeParse({ label: '  Work laptop  ' });
    expect(res.success && res.data.label).toBe('Work laptop');
    expect(extensionTokenSchema.safeParse({ label: 'x'.repeat(61) }).success).toBe(false);
  });
});
