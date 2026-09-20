/**
 * CV templates.
 *
 * A template is config over one renderer, not a renderer of its own — see
 * ADR-010. What varies between regional CVs is convention, not typesetting:
 * which personal details are conventional, what order sections go in, and how
 * long the document is expected to be. All of that is data.
 *
 * Defined here rather than in the renderer so the public picker and the private
 * renderer consume one shape instead of two that drift.
 */

export const CV_TEMPLATES = ['europe', 'us', 'india'] as const;
export type CvTemplate = (typeof CV_TEMPLATES)[number];

export const DEFAULT_TEMPLATE: CvTemplate = 'europe';

/** Chrome fields a template is willing to emit. Absent means never emitted. */
export type ChromeField = 'photo' | 'address' | 'homepage' | 'socials' | 'title';

export interface TemplateConfig {
  id: CvTemplate;
  label: string;
  /** One line on who this is for, shown beside the picker. */
  summary: string;
  documentClass: string;
  /**
   * The allow-list. Enforced at the renderer rather than the UI, so the
   * guarantee holds whatever the profile stores or a caller passes.
   */
  chrome: readonly ChromeField[];
  /** Section order. Sections not listed keep their stored order at the end. */
  sectionOrder: readonly string[];
  /** What the document is expected to fit in. Advisory, not enforced. */
  pageTarget: number;
  /**
   * Why a field is excluded, when the reason is not obvious. Shown in the diff
   * so the user learns the convention rather than just seeing something vanish.
   */
  notes?: Readonly<Partial<Record<ChromeField, string>>>;
}

export const TEMPLATE_CONFIGS: Readonly<Record<CvTemplate, TemplateConfig>> = {
  europe: {
    id: 'europe',
    label: 'Europe',
    summary: 'The continental convention. Photo and address are usual.',
    documentClass: 'moderncv',
    chrome: ['photo', 'address', 'homepage', 'socials', 'title'],
    sectionOrder: ['Experience', 'Education', 'Skills', 'Languages'],
    pageTarget: 2,
  },
  us: {
    id: 'us',
    label: 'United States',
    summary: 'One page, no photo. Experience leads.',
    documentClass: 'moderncv',
    // No photo and no street address, deliberately and unconditionally.
    chrome: ['homepage', 'socials', 'title'],
    sectionOrder: ['Experience', 'Skills', 'Education'],
    pageTarget: 1,
    notes: {
      photo:
        'US employers routinely discard CVs carrying a photo, to limit discrimination exposure. This is not a style preference.',
      address: 'A city is expected; a street address is not, and reads as a privacy lapse.',
    },
  },
  india: {
    id: 'india',
    label: 'India',
    summary: 'Photo usual, education detailed, length less constrained.',
    documentClass: 'moderncv',
    chrome: ['photo', 'address', 'homepage', 'socials', 'title'],
    sectionOrder: ['Education', 'Experience', 'Skills', 'Languages'],
    pageTarget: 3,
  },
};

export function templateConfig(template: CvTemplate): TemplateConfig {
  return TEMPLATE_CONFIGS[template] ?? TEMPLATE_CONFIGS[DEFAULT_TEMPLATE];
}

export function isCvTemplate(value: unknown): value is CvTemplate {
  return typeof value === 'string' && (CV_TEMPLATES as readonly string[]).includes(value);
}

export interface TemplateDiff {
  /** Chrome fields this template drops relative to the comparison one. */
  dropped: { field: ChromeField; note?: string }[];
  /** Chrome fields this template adds relative to the comparison one. */
  added: ChromeField[];
  /** Set when the two order sections differently. */
  reordered: boolean;
  pageTarget: number;
}

/**
 * What changes if you pick `template` instead of `against`.
 *
 * Derived from the configs the renderer consumes, so the preview cannot claim
 * something the document will not do.
 */
export function diffTemplates(template: CvTemplate, against: CvTemplate): TemplateDiff {
  const next = templateConfig(template);
  const base = templateConfig(against);
  const nextFields = new Set<ChromeField>(next.chrome);
  const baseFields = new Set<ChromeField>(base.chrome);

  return {
    dropped: base.chrome
      .filter((f) => !nextFields.has(f))
      .map((field) => {
        const note = next.notes?.[field];
        return note ? { field, note } : { field };
      }),
    added: next.chrome.filter((f) => !baseFields.has(f)),
    reordered: next.sectionOrder.join() !== base.sectionOrder.join(),
    pageTarget: next.pageTarget,
  };
}
