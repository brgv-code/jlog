import { describe, expect, it } from 'vitest';
import {
  createBaseDocumentSchema,
  createProfileFactSchema,
  findTraversingAssetRefs,
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
