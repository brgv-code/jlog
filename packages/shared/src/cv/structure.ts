/**
 * Structuring a plain-text CV with a model.
 *
 * `parseTextCv` recognises how CVs are usually written; a model recognises the
 * ones that are not. It is given the extracted text and asked only to sort it —
 * never to write. Every bullet it returns is checked back against the source in
 * `toImportedCv`, so a model that improves your wording produces a bullet that
 * is dropped rather than stored. That check is what makes this safe to feed
 * into a table whose whole purpose is that its contents are things you said.
 */
import { z } from 'zod';
import { normalise } from './ids';
import { EMPTY_CHROME, type ImportedCv } from './types';

export const CV_STRUCTURE_SYSTEM = `You sort the text of a CV into structure. You never write, reword, summarise or invent anything.

Return JSON only, in exactly this shape:

{
  "chrome": {
    "firstName": "", "lastName": "", "title": "", "address": "", "email": "", "homepage": "",
    "socials": [{ "network": "linkedin", "handle": "" }],
    "summary": "",
    "sections": [{ "heading": "Skills", "items": [{ "left": "Languages", "right": "TypeScript, Go" }] }]
  },
  "roles": [
    { "employer": "", "roleTitle": "", "dates": "2017--2021", "location": "", "bullets": [""] }
  ]
}

Rules:
- Every bullet must be copied VERBATIM from the input. Not shortened, not tidied, not merged. A bullet you alter will be discarded.
- Put each achievement under the job it was written beneath.
- Dates as years: "2017--2021", or "2021--present" if it is still current. Nothing else.
- Skills, education, languages and similar blocks go in chrome.sections, not in roles.
- Omit anything the CV does not say. An empty string is correct; a guess is not.`;

export const cvStructureSchema = z.object({
  chrome: z
    .object({
      firstName: z.string().nullish(),
      lastName: z.string().nullish(),
      title: z.string().nullish(),
      address: z.string().nullish(),
      email: z.string().nullish(),
      homepage: z.string().nullish(),
      socials: z
        .array(z.object({ network: z.string().nullish(), handle: z.string().nullish() }))
        .nullish(),
      summary: z.string().nullish(),
      sections: z
        .array(
          z.object({
            heading: z.string().nullish(),
            items: z
              .array(z.object({ left: z.string().nullish(), right: z.string().nullish() }))
              .nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
  roles: z
    .array(
      z.object({
        employer: z.string().nullish(),
        roleTitle: z.string().nullish(),
        dates: z.string().nullish(),
        location: z.string().nullish(),
        bullets: z.array(z.string()).nullish(),
      }),
    )
    .nullish(),
});

export type CvStructure = z.infer<typeof cvStructureSchema>;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Words that are not in the CV did not come from the CV.
 *
 * The model is told to copy verbatim; this is what makes that a rule rather
 * than a request. Whitespace and case are normalised away first — a PDF's line
 * breaks are an artefact of layout, not of what was written.
 */
function isQuoted(haystack: string, bullet: string): boolean {
  return haystack.includes(normalise(bullet));
}

export function toImportedCv(parsed: CvStructure, source: string): ImportedCv {
  const haystack = normalise(source);
  const dropped: string[] = [];

  const roles = (parsed.roles ?? []).map((role) => {
    const kept: string[] = [];
    for (const bullet of role.bullets ?? []) {
      const text = str(bullet);
      if (!text) continue;
      if (isQuoted(haystack, text)) kept.push(text);
      else dropped.push(text);
    }
    return {
      employer: str(role.employer),
      roleTitle: str(role.roleTitle),
      dates: str(role.dates),
      location: str(role.location),
      bullets: kept,
    };
  });

  const chrome = parsed.chrome ?? {};
  return {
    chrome: {
      ...EMPTY_CHROME,
      firstName: str(chrome.firstName),
      lastName: str(chrome.lastName),
      title: str(chrome.title),
      address: str(chrome.address),
      email: str(chrome.email),
      homepage: str(chrome.homepage),
      socials: (chrome.socials ?? [])
        .map((s) => ({ network: str(s.network), handle: str(s.handle) }))
        .filter((s) => s.network && s.handle),
      summary: str(chrome.summary),
      sections: (chrome.sections ?? [])
        .map((section) => ({
          heading: str(section.heading),
          items: (section.items ?? [])
            .map((i) => ({ left: str(i.left), right: str(i.right) }))
            .filter((i) => i.left || i.right),
        }))
        .filter((section) => section.heading && section.items.length),
    },
    roles: roles.filter((r) => r.employer || r.bullets.length),
    // Surfaced in review rather than swallowed: a bullet the model rewrote is
    // worth seeing, because it says something about the reading as a whole.
    unplaced: dropped,
  };
}
