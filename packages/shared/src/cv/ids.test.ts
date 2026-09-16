import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { factIdFor, normalise, roleFactIdFor, variantHashFor, variantIdFor } from './ids';

/** What `import-cv-corpus.mjs` computes, spelled out rather than imported. */
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

describe('imported ids', () => {
  // If these drift, someone who seeded facts with the corpus scripts gets a
  // second copy of their history the first time they paste the same CV.
  it('matches the corpus import scheme for a fact', async () => {
    const expected = `pf_${sha1(`Acme|${normalise('Shipped the billing system.')}`).slice(0, 24)}`;
    expect(await factIdFor('Acme', 'Shipped the billing system.')).toBe(expected);
  });

  it('matches the corpus import scheme for a role', async () => {
    expect(await roleFactIdFor('Acme')).toBe(`pf_role_${sha1('Acme').slice(0, 20)}`);
  });

  it('matches the corpus import scheme for a variant', async () => {
    const content = 'Owned billing end to end.';
    const hash = await variantHashFor(content);
    expect(hash).toBe(sha1(normalise(content)).slice(0, 32));
    expect(variantIdFor(hash)).toBe(`pv_${hash.slice(0, 24)}`);
  });

  it('gives one id to the same fact written with different spacing or case', async () => {
    expect(await factIdFor('Acme', 'Shipped  the BILLING system.')).toBe(
      await factIdFor('Acme', 'Shipped the billing system.'),
    );
  });

  it('keeps two employers sharing a prefix apart', async () => {
    expect(await roleFactIdFor('Foundamental VC')).not.toBe(await roleFactIdFor('Foundamental'));
  });
});
