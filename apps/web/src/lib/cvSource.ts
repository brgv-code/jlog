/**
 * The document a generated CV is cited against.
 *
 * Tailoring picks stored facts, never prose, so every generated line already
 * corresponds to a `profile_facts` row. That is a guarantee about ids, and an
 * id is not something a person can check. This turns it into something they
 * can: the CV they imported, plus the character range each fact occupies in it,
 * so a generated bullet can be shown beside the line it was read from.
 *
 * Two shapes, one interface. `imported` is the real document. `facts` is what
 * is left when there is no stored source — a profile seeded by the corpus
 * scripts, or imported before sources were kept — and is composed here from the
 * stored facts so the viewer has one rendering path rather than two. The `kind`
 * travels with it because the difference is worth saying out loud: one is your
 * CV, the other is what was read out of it.
 */
import { apiFetch } from './api';

export type CvSpan = [start: number, end: number];

export type CvDocument = {
  kind: 'imported' | 'facts';
  /**
   * Whether the original file is stored and can be rendered as pages. False for
   * a pasted CV, and for anything imported before files were kept — the text
   * view is the fallback, not an error.
   */
  hasFile: boolean;
  /** The whole document as text. Highlights are offsets into this string. */
  text: string;
  /** factId → where that fact's words sit in `text`. */
  spans: Record<string, CvSpan>;
  importedAt: number | null;
};

type SourceResponse = {
  source: {
    id: string;
    format: string;
    content: string;
    hasFile?: boolean;
    importedAt: number;
  } | null;
  spans: Record<string, CvSpan>;
};

type FactsResponse = {
  roles: {
    id: string;
    employer: string | null;
    roleTitle: string | null;
    dates: string | null;
    bullets: { id: string; text: string }[];
  }[];
  orphans: { id: string; text: string }[];
};

/**
 * Write the stored facts out as a document, recording where each one landed.
 *
 * Offsets are taken while building rather than searched for afterwards: a CV
 * that repeats a line under two roles would otherwise resolve both to the first
 * occurrence, and the citation would point at the wrong role.
 */
function composeFromFacts(facts: FactsResponse): CvDocument {
  const spans: Record<string, CvSpan> = {};
  let text = 'EXPERIENCE\n';

  const push = (line: string, factId?: string) => {
    if (factId) spans[factId] = [text.length, text.length + line.length];
    text += `${line}\n`;
  };

  for (const role of facts.roles) {
    if (!role.bullets.length) continue;
    text += '\n';
    push(
      [role.roleTitle, role.employer].filter(Boolean).join(' — ') +
        (role.dates ? ` · ${role.dates}` : ''),
    );
    for (const bullet of role.bullets) push(`• ${bullet.text}`, bullet.id);
  }

  if (facts.orphans.length) {
    text += '\nOTHER\n';
    for (const orphan of facts.orphans) push(`• ${orphan.text}`, orphan.id);
  }

  return { kind: 'facts', hasFile: false, text, spans, importedAt: null };
}

/**
 * The imported CV if there is one, otherwise the facts written out as a
 * document. Never throws for "nothing stored": an empty document is a state the
 * viewer shows honestly, and an error here would take down a dialog whose main
 * job — showing the generated CV — does not depend on it.
 */
export async function loadCvDocument(): Promise<CvDocument> {
  const empty: CvDocument = {
    kind: 'facts',
    hasFile: false,
    text: '',
    spans: {},
    importedAt: null,
  };
  try {
    const res = await apiFetch('/api/profile/cv-source');
    if (res.ok) {
      const payload = (await res.json()) as SourceResponse;
      if (payload.source) {
        return {
          kind: 'imported',
          hasFile: Boolean(payload.source.hasFile),
          text: payload.source.content,
          spans: payload.spans ?? {},
          importedAt: payload.source.importedAt,
        };
      }
    }

    const factsRes = await apiFetch('/api/profile/facts');
    if (!factsRes.ok) return empty;
    return composeFromFacts((await factsRes.json()) as FactsResponse);
  } catch {
    return empty;
  }
}

/**
 * Where a stored phrasing was written.
 *
 * Most facts never appear in the imported base CV — they were mined from the
 * tailored CVs already sent, which is the whole reason the fact pool is bigger
 * than the document. For those, "you wrote this for this role at this company"
 * is the citation, and it is the one that is actually true.
 */
export type FactOrigins = {
  /**
   * `source` is the document the phrasing came from: a corpus CV's filename, or
   * 'import'. It matters, because `company` means the company applied TO for the
   * first and the EMPLOYER for the second.
   */
  variants: Record<
    string,
    { source: string | null; roleTitle: string | null; company: string | null }
  >;
  /** Per fact: applications that used it. Import-sourced phrasings excluded. */
  facts: Record<string, { uses: number; companies: string[] }>;
};

export const NO_ORIGINS: FactOrigins = { variants: {}, facts: {} };

/**
 * Never throws. Provenance enriches a citation; the view's main job — showing
 * the generated CV — must not depend on it.
 */
export async function loadFactOrigins(): Promise<FactOrigins> {
  try {
    const res = await apiFetch('/api/profile/fact-origins');
    if (!res.ok) return NO_ORIGINS;
    const payload = (await res.json()) as Partial<FactOrigins>;
    return { variants: payload.variants ?? {}, facts: payload.facts ?? {} };
  } catch {
    return NO_ORIGINS;
  }
}
