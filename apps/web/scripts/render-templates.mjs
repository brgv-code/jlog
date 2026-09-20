/**
 * Render a sample CV in every template and write the PDFs the gallery shows.
 *
 * The gallery leads with a picture of the actual document, so the picture has
 * to *be* the actual document. These are compiled through the same Tectonic
 * service production uses, then committed — accurate by construction, and free
 * at runtime because nothing compiles when someone opens the page.
 *
 * Run it when a template is added or its LaTeX changes. It needs the compile
 * service, so it is a deliberate manual step rather than part of the build:
 *
 *   LATEX_COMPILE_URL=https://… LATEX_COMPILE_TOKEN=… node apps/web/scripts/render-templates.mjs
 *
 * The sample is fictional on purpose. A gallery rendered from the owner's real
 * CV would commit their address and history to a public repo.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'templates');

const url = process.env.LATEX_COMPILE_URL;
const token = process.env.LATEX_COMPILE_TOKEN;
if (!url || !token) {
  console.error('LATEX_COMPILE_URL and LATEX_COMPILE_TOKEN are required.');
  process.exit(1);
}

/** Kept in step with TEMPLATE_CONFIGS in @jlog/shared. */
const TEMPLATES = [
  { id: 'classic', class: 'moderncv', style: 'classic' },
  { id: 'banking', class: 'moderncv', style: 'banking' },
  { id: 'casual', class: 'moderncv', style: 'casual' },
  { id: 'oldstyle', class: 'moderncv', style: 'oldstyle' },
  { id: 'fancy', class: 'moderncv', style: 'fancy' },
  { id: 'plain', class: 'article' },
];

const SAMPLE = {
  first: 'Ada',
  last: 'Lovelace',
  title: 'Senior Product Engineer',
  address: 'Berlin, Germany',
  email: 'ada@example.com',
  homepage: 'ada.example.com',
  summary:
    'Product engineer working across the edge and the front end. Ten years building developer tools, most recently owning a design system three teams depend on.',
  experience: [
    [
      '2022--2026',
      'Staff Engineer',
      'Northwind',
      'Berlin',
      [
        'Led the console rewrite, cutting time to first interaction by 40%.',
        'Owned the design system adopted by three product teams.',
      ],
    ],
    [
      '2019--2022',
      'Senior Engineer',
      'Initech',
      'Remote',
      ['Built the billing pipeline handling 2M events a day.'],
    ],
  ],
  education: [['2015--2019', 'BSc Computer Science', 'TU Berlin', 'Berlin', 'First class.']],
  skills: [
    ['Languages', 'TypeScript, Go, Python'],
    ['Edge', 'Cloudflare Workers, D1, R2'],
  ],
};

const esc = (s) => String(s).replace(/([&%$#_{}])/g, '\\$1');

function moderncvTex(style) {
  const lines = [
    '\\documentclass[11pt,a4paper,sans]{moderncv}',
    `\\moderncvstyle{${style}}`,
    '\\moderncvcolor{blue}',
    // marvosym rather than the FontAwesome default: it is what the production
    // renderer uses, and the awesome variant drags in a large font package.
    '\\moderncvicons{marvosym}',
    '\\usepackage[top=10mm,bottom=10mm,left=14mm,right=14mm]{geometry}',
    '\\usepackage[utf8]{inputenc}',
    `\\name{${esc(SAMPLE.first)}}{${esc(SAMPLE.last)}}`,
    `\\title{${esc(SAMPLE.title)}}`,
    `\\address{${esc(SAMPLE.address)}}{}{}`,
    `\\email{${esc(SAMPLE.email)}}`,
    `\\homepage{${esc(SAMPLE.homepage)}}`,
    '\\begin{document}',
    '\\makecvtitle',
    '\\vspace{-10mm}',
    `\\section{Summary}\\cvitem{}{${esc(SAMPLE.summary)}}`,
    '\\section{Experience}',
  ];
  for (const [when, role, org, where, bullets] of SAMPLE.experience) {
    const body = `\\begin{itemize}${bullets.map((b) => `\\item ${esc(b)}`).join('')}\\end{itemize}`;
    lines.push(`\\cventry{${when}}{${esc(role)}}{${esc(org)}}{${esc(where)}}{}{${body}}`);
  }
  lines.push('\\section{Education}');
  for (const [when, what, org, where, note] of SAMPLE.education) {
    lines.push(`\\cventry{${when}}{${esc(what)}}{${esc(org)}}{${esc(where)}}{}{${esc(note)}}`);
  }
  lines.push('\\section{Skills}');
  for (const [k, v] of SAMPLE.skills) lines.push(`\\cvitem{${esc(k)}}{${esc(v)}}`);
  lines.push('\\end{document}');
  return lines.join('\n');
}

/**
 * The ATS-safe design. Single column, no rules, no graphics, standard headings
 * — the shape a parser reads most reliably, which is the whole point of it.
 */
function plainTex() {
  const lines = [
    '\\documentclass[11pt,a4paper]{article}',
    '\\usepackage[top=18mm,bottom=18mm,left=20mm,right=20mm]{geometry}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage{enumitem}',
    '\\setlist[itemize]{topsep=2pt,itemsep=1pt,leftmargin=14pt}',
    '\\pagestyle{empty}',
    '\\renewcommand{\\familydefault}{\\sfdefault}',
    '\\begin{document}',
    `\\begin{center}{\\Large\\textbf{${esc(SAMPLE.first)} ${esc(SAMPLE.last)}}}\\\\[2pt]`,
    `${esc(SAMPLE.title)}\\\\[2pt]`,
    `${esc(SAMPLE.email)} \\quad ${esc(SAMPLE.homepage)} \\quad ${esc(SAMPLE.address)}`,
    '\\end{center}\\vspace{4mm}',
    `\\textbf{Summary}\\\\[2pt]${esc(SAMPLE.summary)}\\vspace{4mm}`,
    '\\textbf{Experience}\\\\[2pt]',
  ];
  for (const [when, role, org, where, bullets] of SAMPLE.experience) {
    lines.push(`\\textbf{${esc(role)}}, ${esc(org)} --- ${esc(where)} \\hfill ${when}\\\\`);
    lines.push(`\\begin{itemize}${bullets.map((b) => `\\item ${esc(b)}`).join('')}\\end{itemize}`);
  }
  lines.push('\\vspace{2mm}\\textbf{Education}\\\\[2pt]');
  for (const [when, what, org, where] of SAMPLE.education) {
    lines.push(`${esc(what)}, ${esc(org)} --- ${esc(where)} \\hfill ${when}\\\\`);
  }
  lines.push('\\vspace{2mm}\\textbf{Skills}\\\\[2pt]');
  for (const [k, v] of SAMPLE.skills) lines.push(`${esc(k)}: ${esc(v)}\\\\`);
  lines.push('\\end{document}');
  return lines.join('\n');
}

await mkdir(OUT_DIR, { recursive: true });

let failed = 0;
for (const t of TEMPLATES) {
  const tex = t.class === 'moderncv' ? moderncvTex(t.style) : plainTex();
  process.stdout.write(`${t.id} … `);

  const res = await fetch(new URL('/compile', url).toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ tex, files: {} }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));

  if (!res.ok) {
    // Reported rather than thrown: one template failing should not cost the
    // five that compiled.
    console.log(`failed (${res.status}) ${(await res.text()).slice(0, 300)}`);
    failed++;
    continue;
  }

  const pdf = Buffer.from(await res.arrayBuffer());
  await writeFile(join(OUT_DIR, `${t.id}.pdf`), pdf);
  console.log(`${(pdf.length / 1024).toFixed(0)}KB`);
}

console.log(
  failed
    ? `\n${failed} template(s) failed — the gallery shows a placeholder for those.`
    : '\nAll templates rendered.',
);
process.exit(failed ? 1 : 0);
