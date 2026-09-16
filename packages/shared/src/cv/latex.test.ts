import { describe, expect, it } from 'vitest';
import { normaliseDates, parseLatexCv, toProse } from './latex';
import { detectCvFormat } from './types';

const CV = String.raw`
\documentclass[11pt,a4paper]{moderncv}
\name{Ada}{Lovelace}
\title{Staff Engineer}
\address{Berlin, Germany}{}{}
\email{ada@example.com}
\photo[64pt][0.2pt]{portrait.jpg}
\homepage{ada.dev}
\social[linkedin]{adalovelace}
\social[github]{ada}
\begin{document}
\makecvtitle

\section{Summary}
Engineer with a decade on billing systems.

\section{Experience}

\cventry{Jun 2017 -- Oct 2021}{Staff Engineer}{Acme}{Berlin}{}{
\begin{itemize}
  \item Cut p99 latency by 40\% across the checkout path.
  \item Owned billing end to end, from \emph{ledger} to invoicing.
\end{itemize}}

\cventry{2021--current}{Founding Engineer}{Globex}{Remote}{}{
\begin{itemize}
  \item Built the ingestion pipeline. % TODO reword
\end{itemize}}

\section{Skills}
\cvitem{Languages}{TypeScript, Go}
\cvitem{Cloud}{Cloudflare, AWS}

\end{document}
`;

describe('parseLatexCv', () => {
  it('reads the header block into chrome', () => {
    const { chrome } = parseLatexCv(CV);
    expect(chrome.firstName).toBe('Ada');
    expect(chrome.lastName).toBe('Lovelace');
    expect(chrome.title).toBe('Staff Engineer');
    expect(chrome.address).toBe('Berlin, Germany');
    expect(chrome.email).toBe('ada@example.com');
    expect(chrome.homepage).toBe('ada.dev');
    // A filename, not prose — it is shipped alongside the compile.
    expect(chrome.photo).toBe('portrait.jpg');
    expect(chrome.socials).toEqual([
      { network: 'linkedin', handle: 'adalovelace' },
      { network: 'github', handle: 'ada' },
    ]);
  });

  it('reads each cventry as a role with its bullets', () => {
    const { roles } = parseLatexCv(CV);
    expect(roles).toHaveLength(2);
    expect(roles[0]).toMatchObject({
      employer: 'Acme',
      roleTitle: 'Staff Engineer',
      dates: '2017--2021',
      location: 'Berlin',
    });
    expect(roles[0]?.bullets).toHaveLength(2);
    expect(roles[1]?.bullets).toEqual(['Built the ingestion pipeline.']);
  });

  // The corpus import paid for this one: stripping \% ended the line early, so
  // "by 60\% and enabling..." became "by 60\".
  it('keeps an escaped percent as data', () => {
    const { roles } = parseLatexCv(CV);
    expect(roles[0]?.bullets[0]).toBe('Cut p99 latency by 40% across the checkout path.');
  });

  it('unwraps emphasis instead of dropping the words inside it', () => {
    const { roles } = parseLatexCv(CV);
    expect(roles[0]?.bullets[1]).toBe('Owned billing end to end, from ledger to invoicing.');
  });

  it('takes Summary as prose and other sections as items', () => {
    const { chrome } = parseLatexCv(CV);
    expect(chrome.summary).toBe('Engineer with a decade on billing systems.');
    expect(chrome.sections).toEqual([
      {
        heading: 'Skills',
        items: [
          { left: 'Languages', right: 'TypeScript, Go' },
          { left: 'Cloud', right: 'Cloudflare, AWS' },
        ],
      },
    ]);
  });

  // Experience holds the roles, which are read from \cventry directly. Listing
  // it again as a chrome section would put every job in the skills block.
  it('does not repeat Experience as a chrome section', () => {
    const { chrome } = parseLatexCv(CV);
    expect(chrome.sections.map((s) => s.heading)).not.toContain('Experience');
  });

  it('survives a file with no experience at all', () => {
    const { roles, chrome } = parseLatexCv('\\name{Ada}{Lovelace}\n\\email{a@b.c}');
    expect(roles).toEqual([]);
    expect(chrome.firstName).toBe('Ada');
  });

  it('skips a truncated cventry rather than looping on it', () => {
    const { roles } = parseLatexCv('\\cventry{2020}{Engineer}{Acme}');
    expect(roles).toEqual([]);
  });
});

describe('toProse', () => {
  it('drops a real comment but not an escaped percent', () => {
    expect(toProse('Grew revenue 20\\% % internal note')).toBe('Grew revenue 20%');
  });

  it('keeps the text of a link, not its target', () => {
    expect(toProse('See \\href{https://example.com}{the writeup}.')).toBe('See the writeup.');
  });
});

describe('normaliseDates', () => {
  it('reduces a written range to years', () => {
    expect(normaliseDates('Jun 2017 -- Oct 2021')).toBe('2017--2021');
    expect(normaliseDates('2017 – 2021')).toBe('2017--2021');
  });

  it('keeps an open range open', () => {
    expect(normaliseDates('Jan 2025 -- Present')).toBe('2025--present');
  });

  it('collapses a range that starts and ends in one year', () => {
    expect(normaliseDates('Mar 2020 -- Nov 2020')).toBe('2020');
  });
});

describe('detectCvFormat', () => {
  it('reads a moderncv file as latex', () => {
    expect(detectCvFormat(CV)).toBe('latex');
  });

  it('reads a bare cventry fragment as latex', () => {
    expect(detectCvFormat('\\cventry{2020}{Engineer}{Acme}{Berlin}{}{}')).toBe('latex');
  });

  // A backslash in prose is not a document class.
  it('reads a markdown CV as markdown', () => {
    expect(detectCvFormat('# Ada Lovelace\n\n## Experience\n\n- Shipped a C:\\ migration.')).toBe(
      'markdown',
    );
  });
});
