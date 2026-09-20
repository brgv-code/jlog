/**
 * CV templates.
 *
 * A template is a *design* — what the document looks like. It is not a country.
 *
 * The first cut of this got that wrong: it defined europe/us/india, which were
 * three sets of conventions over one identical moderncv layout. Asking to see
 * them side by side is what exposed it — a gallery would have shown three
 * near-identical documents. Region is a property some designs carry defaults
 * for, never the thing being chosen.
 *
 * Everything here compiles on the Tectonic image as it stands, which caches
 * `article` and `moderncv` and nothing else. moderncv's five built-in styles do
 * most of the work; anything needing another class is an image rebuild.
 */

export const CV_TEMPLATES = ['classic', 'banking', 'casual', 'oldstyle', 'fancy', 'plain'] as const;
export type CvTemplate = (typeof CV_TEMPLATES)[number];

/** What the renderer emitted before templates existed, so it stays the default. */
export const DEFAULT_TEMPLATE: CvTemplate = 'classic';

/** Filters in the gallery. They narrow; they never forbid. */
export const TEMPLATE_TAGS = [
  'Simple',
  'Modern',
  'Traditional',
  'Academic',
  'Creative',
  'ATS-safe',
  'One-page',
  'Two-page',
] as const;
export type TemplateTag = (typeof TEMPLATE_TAGS)[number];

export type ChromeField = 'photo' | 'address' | 'homepage' | 'socials' | 'title';

export interface TemplateConfig {
  id: CvTemplate;
  label: string;
  /** One or two sentences on who it suits. Shown under the name, as a blurb. */
  blurb: string;
  tags: readonly TemplateTag[];
  documentClass: 'moderncv' | 'article';
  /** moderncv's built-in style. Absent for the article-based design. */
  style?: 'classic' | 'banking' | 'casual' | 'oldstyle' | 'fancy';
  /**
   * Starting conventions, not rules. A photo default of false is a sensible
   * start for a one-page ATS design, not a prohibition — the user can turn it
   * on, and the card says what the default is.
   */
  defaults: {
    photo: boolean;
    pageTarget: number;
    sectionOrder: readonly string[];
  };
  /** Designs whose layout has nowhere to put one. */
  supportsPhoto: boolean;
  /** Committed sample render, page one. Real output, not a mockup. */
  preview: string;
}

const EXPERIENCE_FIRST = ['Experience', 'Education', 'Skills', 'Languages'] as const;

export const TEMPLATE_CONFIGS: Readonly<Record<CvTemplate, TemplateConfig>> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    blurb: 'A dated hints column beside each entry. The default, and the safest thing to send.',
    tags: ['Traditional', 'Two-page'],
    documentClass: 'moderncv',
    style: 'classic',
    defaults: { photo: true, pageTarget: 2, sectionOrder: EXPERIENCE_FIRST },
    supportsPhoto: true,
    preview: '/templates/classic.pdf',
  },
  banking: {
    id: 'banking',
    label: 'Banking',
    blurb: 'Centred header, restrained rules. Built for conservative industries.',
    tags: ['Traditional', 'Simple'],
    documentClass: 'moderncv',
    style: 'banking',
    defaults: { photo: false, pageTarget: 2, sectionOrder: EXPERIENCE_FIRST },
    supportsPhoto: true,
    preview: '/templates/banking.pdf',
  },
  casual: {
    id: 'casual',
    label: 'Casual',
    blurb: 'Warmer spacing and a softer header. Reads well at startups.',
    tags: ['Modern'],
    documentClass: 'moderncv',
    style: 'casual',
    defaults: { photo: true, pageTarget: 2, sectionOrder: EXPERIENCE_FIRST },
    supportsPhoto: true,
    preview: '/templates/casual.pdf',
  },
  oldstyle: {
    id: 'oldstyle',
    label: 'Oldstyle',
    blurb: 'Serif throughout, generous margins. Suits research and academic posts.',
    tags: ['Academic', 'Traditional'],
    documentClass: 'moderncv',
    style: 'oldstyle',
    defaults: {
      photo: false,
      pageTarget: 3,
      sectionOrder: ['Education', 'Experience', 'Skills', 'Languages'],
    },
    supportsPhoto: true,
    preview: '/templates/oldstyle.pdf',
  },
  fancy: {
    id: 'fancy',
    label: 'Fancy',
    blurb: 'Decorated section headers and a coloured rule. The most expressive of the set.',
    tags: ['Creative', 'Modern'],
    documentClass: 'moderncv',
    style: 'fancy',
    defaults: { photo: true, pageTarget: 2, sectionOrder: EXPERIENCE_FIRST },
    supportsPhoto: true,
    preview: '/templates/fancy.pdf',
  },
  plain: {
    id: 'plain',
    label: 'Plain',
    blurb:
      'One column, no rules, no graphics, standard headings. The shape applicant tracking systems parse most reliably.',
    tags: ['ATS-safe', 'Simple', 'One-page'],
    documentClass: 'article',
    defaults: { photo: false, pageTarget: 1, sectionOrder: EXPERIENCE_FIRST },
    // A parser-friendly single column has nowhere to float an image that would
    // not also confuse the parser it exists to satisfy.
    supportsPhoto: false,
    preview: '/templates/plain.pdf',
  },
};

export function templateConfig(template: CvTemplate): TemplateConfig {
  return TEMPLATE_CONFIGS[template] ?? TEMPLATE_CONFIGS[DEFAULT_TEMPLATE];
}

export function isCvTemplate(value: unknown): value is CvTemplate {
  return typeof value === 'string' && (CV_TEMPLATES as readonly string[]).includes(value);
}

export function templatesWithTag(tag: TemplateTag | null): TemplateConfig[] {
  const all = CV_TEMPLATES.map(templateConfig);
  return tag ? all.filter((t) => t.tags.includes(tag)) : all;
}

/** Short factual chips for the card — derived, so they cannot contradict the config. */
export function templateChips(config: TemplateConfig): string[] {
  const chips: string[] = [];
  chips.push(config.defaults.pageTarget === 1 ? 'One page' : `${config.defaults.pageTarget} pages`);
  if (!config.supportsPhoto) chips.push('No photo');
  else if (!config.defaults.photo) chips.push('Photo off by default');
  return chips;
}

/**
 * What the renderer needs, derived from what the gallery shows.
 *
 * The renderer wants an allow-list of chrome fields; the gallery describes a
 * design and its default conventions. Deriving one from the other here keeps a
 * single source of truth — the private renderer restates only this shape
 * (ADR-007) and never the catalogue.
 */
export interface TemplateStyle {
  documentClass: TemplateConfig['documentClass'];
  style?: NonNullable<TemplateConfig['style']>;
  chrome: ChromeField[];
  sectionOrder: readonly string[];
}

export function templateStyle(config: TemplateConfig, includePhoto?: boolean): TemplateStyle {
  // Everything except the photo is conventional across these designs; the photo
  // is the one field a layout can refuse outright.
  const chrome: ChromeField[] = ['title', 'address', 'homepage', 'socials'];
  const wantsPhoto = includePhoto ?? config.defaults.photo;
  if (config.supportsPhoto && wantsPhoto) chrome.push('photo');

  return {
    documentClass: config.documentClass,
    ...(config.style ? { style: config.style } : {}),
    chrome,
    sectionOrder: config.defaults.sectionOrder,
  };
}
