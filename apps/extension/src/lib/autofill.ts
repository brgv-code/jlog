/**
 * Fill the standard fields of a job application form from the user's jlog CV
 * profile. ADR-012 phase 1: deterministic, no LLM, free tier.
 *
 * Three rules shape everything here:
 *
 * - **Never submit.** Nothing in this file clicks a button or submits a form.
 *   jlog fills; the user reads it and presses submit.
 * - **Only empty fields.** Whatever the user or the browser already typed stays.
 * - **Sensitive fields are never guessed.** Visa, sponsorship, salary, EEO,
 *   criminal history. Detection runs before classification, so a sensitive
 *   label wins over anything else the field also matches.
 *
 * A miss leaves a field empty, which the user sees and fills. A wrong fill goes
 * to an employer under their name. So when in doubt the classifier returns null.
 */

/** The profile as `GET /api/profile/cv` serves it. Only the fields used here. */
export interface CvProfile {
  firstName: string;
  lastName: string;
  address: string;
  email: string;
  homepage: string;
  socials: { network: string; handle: string }[];
}

export type FieldKind =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'location'
  | 'linkedin'
  | 'github'
  | 'twitter'
  | 'website';

export type AutofillValues = Partial<Record<FieldKind, string>>;

export interface FillReport {
  /** What was written, in document order. */
  filled: FieldKind[];
  /** Fields left alone because they ask for something jlog must not guess. */
  sensitiveSkipped: number;
  /** Required fields still empty after the fill, which the user has to finish. */
  requiredEmpty: number;
}

const SENSITIVE =
  /visa|sponsor|authori[sz]|work permit|right to work|salary|compensation|pay expectation|expected pay|gender|\bsex\b|\brace\b|ethnic|hispanic|latin[oax]|veteran|disabilit|criminal|convict|felony|pronoun|birth|\bborn\b|\bage\b|religio|orientation|citizenship|nationality|marital/;

/**
 * Labels that contain "name" or "email" but are about someone else. "Referrer
 * name" is the case that matters: without this it would get the user's name.
 */
const SOMEONE_ELSE =
  /refer|recruit|manager|reference|company|employer|emergency|school|universit|college|preferred|nick/;

/**
 * Inputs that take free text. `type` reads back as "text" when the attribute is
 * missing or unknown. Checkboxes, radios, files, tel and textareas are not
 * phase 1's: a phone number is not on the profile yet, and a textarea is an
 * open-ended question, which is phase 3.
 */
const TEXT_TYPES = new Set(['text', 'email', 'url', 'search']);

type Fillable = HTMLInputElement;
/** Anything with a label, for the sensitive check and the "left for you" count. */
type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const CONTROLS = 'input, textarea, select';
const NOT_ASKED = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

function isFillable(el: Element): el is Fillable {
  return el instanceof HTMLInputElement && TEXT_TYPES.has(el.type);
}

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').replace(/[*✱]/g, '').trim().toLowerCase();
}

/**
 * The human label for a field. Boards do this three different ways: a proper
 * `<label for>` (Greenhouse, Ashby), `aria-labelledby`, or a sibling div with a
 * label-ish class and no association at all (Lever).
 */
export function labelFor(el: Control): string {
  return clean(rawLabelFor(el));
}

/** The label as the board wrote it, asterisks and case intact. */
function rawLabelFor(el: Control): string {
  const labels = el.labels ? Array.from(el.labels) : [];
  if (labels.length) return labels.map((l) => l.textContent ?? '').join(' ');

  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const text = by
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ');
    if (text.trim()) return text;
  }

  // No association: look for a label-ish element nearby. Climbing stops at the
  // first ancestor that also holds another field, because past that point the
  // nearest label belongs to someone else and would put an email into
  // whatever the unlabelled field was asking for.
  let node: Element | null = el.parentElement;
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    const others = Array.from(node.querySelectorAll(CONTROLS)).filter(
      (o) => o !== el && !(o instanceof HTMLInputElement && NOT_ASKED.has(o.type)),
    );
    if (others.length) return '';
    const candidate = node.querySelector(
      'label, legend, [class*="label"], [class*="title"], [class*="question"]',
    );
    if (candidate && !candidate.contains(el)) return candidate.textContent ?? '';
  }
  return '';
}

/** name, id, autocomplete, placeholder and aria-label, lowercased, one string. */
function attributes(el: Control): string {
  return clean(
    [
      el.getAttribute('autocomplete'),
      el.name,
      el.id,
      el.getAttribute('placeholder'),
      el.getAttribute('aria-label'),
    ].join(' '),
  );
}

export function isSensitive(el: Control): boolean {
  return SENSITIVE.test(`${labelFor(el)} ${attributes(el)}`);
}

/** Longer than this, a label is a question rather than a field name. */
const MAX_LABEL = 50;

/** Exact-ish full-name labels. Deliberately narrow: see {@link SOMEONE_ELSE}. */
const FULL_NAME_LABEL = /^(your |full |legal |candidate )?(full )?name$/;
const FULL_NAME_ATTR = /(^|[\s_-])(name|full_?name|candidate_?name|_systemfield_name)($|\s)/;

export function classify(el: Fillable): FieldKind | null {
  if (isSensitive(el)) return null;

  const label = labelFor(el);
  const attrs = attributes(el);
  const both = `${label} ${attrs}`;

  // A field is labelled with a noun ("Email", "LinkedIn Profile"). A sentence is
  // a question, and a question that happens to mention "website" is not asking
  // for one. Both checks come before `autocomplete`, because a board can mark a
  // referrer's email field `autocomplete="email"` just as well as the user's.
  if (label.length > MAX_LABEL) return null;
  if (SOMEONE_ELSE.test(label)) return null;

  // The browser's own vocabulary, when a board uses it, is the strongest signal.
  const auto = clean(el.getAttribute('autocomplete'));
  if (auto === 'given-name') return 'firstName';
  if (auto === 'family-name') return 'lastName';
  if (auto === 'email') return 'email';

  if (/linkedin/.test(both)) return 'linkedin';
  if (/github/.test(both)) return 'github';
  if (/twitter|\bx\.com\b/.test(both)) return 'twitter';

  if (/first[\s_-]?name|given[\s_-]?name|\bfname\b/.test(both)) return 'firstName';
  if (/last[\s_-]?name|surname|family[\s_-]?name|\blname\b/.test(both)) return 'lastName';
  if (FULL_NAME_LABEL.test(label) || (!label && FULL_NAME_ATTR.test(attrs))) return 'fullName';
  if (label === '' && auto === 'name') return 'fullName';
  if (el.type === 'email' || /e-?mail/.test(both)) return 'email';
  if (/\blocation\b|\bcity\b|where are you based|current location/.test(both)) return 'location';
  if (/website|portfolio|homepage|personal site|\bblog\b/.test(both)) return 'website';
  return null;
}

const SOCIAL_BASE: Record<string, string> = {
  linkedin: 'https://www.linkedin.com/in/',
  github: 'https://github.com/',
  twitter: 'https://x.com/',
  x: 'https://x.com/',
};

/** A handle stored as "brgv-code" becomes the URL a form expects. */
function socialUrl(network: string, handle: string): string {
  const h = handle.trim();
  if (/^https?:\/\//i.test(h)) return h;
  if (/^[\w.-]+\.[a-z]{2,}\//i.test(h)) return `https://${h}`;
  const base = SOCIAL_BASE[network];
  return base ? `${base}${h.replace(/^@/, '')}` : h;
}

function withScheme(url: string): string {
  const u = url.trim();
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

export function valuesFromProfile(p: CvProfile): AutofillValues {
  const values: AutofillValues = {};
  const first = p.firstName.trim();
  const last = p.lastName.trim();
  if (first) values.firstName = first;
  if (last) values.lastName = last;
  if (first || last) values.fullName = [first, last].filter(Boolean).join(' ');
  if (p.email.trim()) values.email = p.email.trim();
  if (p.address.trim()) values.location = p.address.trim();
  if (p.homepage.trim()) values.website = withScheme(p.homepage);

  for (const { network, handle } of p.socials) {
    const key = network.trim().toLowerCase();
    if (!handle.trim()) continue;
    const kind: FieldKind | null =
      key === 'linkedin'
        ? 'linkedin'
        : key === 'github'
          ? 'github'
          : key === 'twitter' || key === 'x'
            ? 'twitter'
            : null;
    if (kind && !values[kind]) values[kind] = socialUrl(key, handle);
  }
  return values;
}

/**
 * Write a value so a React-controlled input notices. Assigning `el.value`
 * directly updates the DOM but not React's tracker, and the page then submits
 * the old value. Going through the prototype's setter and firing `input` is
 * what a real keystroke does.
 */
export function setNativeValue(el: Fillable, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function isRequired(el: Control): boolean {
  if (el.required || el.getAttribute('aria-required') === 'true') return true;
  // Some boards mark required only visually, with an asterisk in the label,
  // which on Lever is a sibling div rather than a <label>.
  return /[*✱]\s*$/.test(rawLabelFor(el).trim());
}

function controls(root: ParentNode): Control[] {
  return Array.from(root.querySelectorAll<Control>(CONTROLS)).filter(
    (el) => !el.disabled && !(el instanceof HTMLInputElement && NOT_ASKED.has(el.type)),
  );
}

function candidates(root: ParentNode): Fillable[] {
  return controls(root).filter((el): el is Fillable => isFillable(el) && !el.readOnly);
}

function isEmpty(el: Control): boolean {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    const group = el.name
      ? Array.from(el.ownerDocument.querySelectorAll('input')).filter((r) => r.name === el.name)
      : [el];
    return !group.some((r) => r.checked);
  }
  return !el.value.trim();
}

/** How many standard fields the page has. Two or more reads as an application form. */
export function countStandardFields(root: ParentNode = document): number {
  return candidates(root).filter((el) => classify(el) !== null).length;
}

export function fillForm(values: AutofillValues, root: ParentNode = document): FillReport {
  const report: FillReport = { filled: [], sensitiveSkipped: 0, requiredEmpty: 0 };
  const all = controls(root);
  const sensitive = all.filter(isSensitive);
  // A radio group is one question however many buttons it has.
  report.sensitiveSkipped = new Set(
    sensitive.map((el) => (el instanceof HTMLInputElement && el.type === 'radio' ? el.name : el)),
  ).size;

  for (const el of candidates(root)) {
    if (sensitive.includes(el) || el.value.trim()) continue;
    const kind = classify(el);
    const value = kind ? values[kind] : undefined;
    if (!kind || !value) continue;
    setNativeValue(el, value);
    el.dataset.jlogFilled = kind;
    report.filled.push(kind);
  }

  const required = all.filter((el) => isRequired(el) && isEmpty(el));
  report.requiredEmpty = new Set(
    required.map((el) => (el instanceof HTMLInputElement && el.type === 'radio' ? el.name : el)),
  ).size;
  return report;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function summarise(report: FillReport): string {
  // What is left matters most when nothing was filled, so it is said either way.
  const parts = report.filled.length
    ? [`Filled ${plural(report.filled.length, 'field')}.`]
    : ['Nothing to fill: the fields jlog knows are already filled or not on this form.'];
  if (report.requiredEmpty)
    parts.push(`${plural(report.requiredEmpty, 'required field')} left for you.`);
  if (report.sensitiveSkipped) {
    parts.push(
      `${plural(report.sensitiveSkipped, 'question')} on visa, pay or EEO left untouched.`,
    );
  }
  if (report.filled.length) parts.push('Review before you submit.');
  return parts.join(' ');
}
