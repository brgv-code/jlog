import { authorizedFor, resolveAuthorized } from '@jlog/shared/countries';

/**
 * Fill the standard fields of a job application form from the user's jlog CV
 * profile and the answers they saved. ADR-012 phases 1 and 2: deterministic,
 * no LLM, free tier.
 *
 * Three rules shape everything here:
 *
 * - **Never submit.** Nothing in this file clicks a button or submits a form.
 *   jlog fills; the user reads it and presses submit.
 * - **Only empty fields.** Whatever the user or the browser already typed stays.
 * - **Sensitive fields are never guessed.** Visa, sponsorship, salary, EEO,
 *   criminal history. Detection runs before classification, so a sensitive
 *   label wins over anything else the field also matches. A sensitive field is
 *   filled only from a value the user saved, only for the few kinds listed in
 *   {@link sensitiveKind}, and only when exactly one option fits.
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

/** As `GET /api/profile/autofill` serves it. Empty means "do not fill". */
export interface SavedValues {
  phone: string;
  authorizedCountries: string[];
  salaryExpectation: string;
  noticePeriod: string;
  eeo: '' | 'decline';
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
  | 'website'
  | 'phone'
  | 'noticePeriod';

/** Sensitive questions that may be filled, and then only from saved values. */
export type SensitiveKind = 'workAuthorization' | 'sponsorship' | 'salary' | 'eeo';

export type AutofillValues = Partial<Record<FieldKind, string>> & {
  saved?: Pick<SavedValues, 'authorizedCountries' | 'salaryExpectation' | 'eeo'>;
};

export interface FillReport {
  /** What was written, in document order. */
  filled: (FieldKind | SensitiveKind)[];
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
 * missing or unknown. Checkboxes, files and textareas are not ours: a textarea
 * is an open-ended question, which is phase 3. Radios and selects are filled
 * only for the sensitive kinds, from saved values.
 */
const TEXT_TYPES = new Set(['text', 'email', 'url', 'search', 'tel']);

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

function isChoice(el: Control): el is HTMLInputElement {
  return el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox');
}

/**
 * The label as the board wrote it, case intact, which the country match needs.
 * For a radio or checkbox that is the question, not the button's own label:
 * the button says "Yes", the question is in the fieldset's legend or in the
 * label-ish element above the group.
 */
export function rawLabelFor(el: Control): string {
  if (isChoice(el)) return questionFor(el);
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
  return nearbyLabel(el, 3);
}

const LABELISH = 'label, legend, [class*="label"], [class*="title"], [class*="question"]';

/**
 * A label-ish element near a field with no label of its own. Climbing stops at
 * the first ancestor that also holds another field, because past that point the
 * nearest label belongs to someone else and would put an email into whatever
 * the unlabelled field was asking for. Buttons of the same radio or checkbox
 * group are one question, so they do not count as someone else.
 */
function nearbyLabel(el: Control, levels: number): string {
  let node: Element | null = el.parentElement;
  for (let depth = 0; node && depth < levels; depth++, node = node.parentElement) {
    const others = Array.from(node.querySelectorAll<Control>(CONTROLS)).filter(
      (o) =>
        o !== el &&
        !(o instanceof HTMLInputElement && NOT_ASKED.has(o.type)) &&
        !(isChoice(o) && isChoice(el) && el.name !== '' && o.name === el.name),
    );
    if (others.length) return '';
    const candidate = Array.from(node.querySelectorAll(LABELISH)).find(
      (c) => !c.contains(el) && !c.querySelector('input, select, textarea'),
    );
    if (candidate) return candidate.textContent ?? '';
  }
  return '';
}

function questionFor(el: HTMLInputElement): string {
  const legend = el.closest('fieldset')?.querySelector('legend');
  if (legend?.textContent?.trim()) return legend.textContent;
  const group = el.closest('[role="radiogroup"], [role="group"]');
  const by = group?.getAttribute('aria-labelledby');
  if (by) {
    const text = el.ownerDocument.getElementById(by)?.textContent;
    if (text?.trim()) return text;
  }
  // Lever: the question is a div above a list of <label><input>Yes</label>.
  return nearbyLabel(el, 5);
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
  if (el.type === 'tel' || /phone|mobile|telephone/.test(both)) return 'phone';
  if (/notice period|when can you start|earliest start|available to start/.test(both)) {
    return 'noticePeriod';
  }
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

export function valuesFromProfile(p: CvProfile, saved?: SavedValues | null): AutofillValues {
  const values: AutofillValues = {};
  if (saved) {
    if (saved.phone.trim()) values.phone = saved.phone.trim();
    if (saved.noticePeriod.trim()) values.noticePeriod = saved.noticePeriod.trim();
    values.saved = {
      authorizedCountries: saved.authorizedCountries,
      salaryExpectation: saved.salaryExpectation.trim(),
      eeo: saved.eeo,
    };
  }
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
 * Topics jlog never answers. Checked against the whole label before anything
 * else, so a question that mixes one of these with something fillable
 * ("sponsorship, or a felony conviction?") is left whole.
 */
const NEVER =
  /criminal|convict|felony|arrest|birth|\bborn\b|\bage\b|religio|orientation|citizenship|nationality|marital|pronoun|what visa|which visa|type of visa|visa (type|status|category|class)|current visa/;

const KINDS: [SensitiveKind, RegExp][] = [
  ['sponsorship', /sponsor/],
  [
    'workAuthorization',
    /authori[sz]|right to work|work permit|eligible to work|legally (able|permitted|allowed|entitled) to work/,
  ],
  ['salary', /salary|compensation|pay expectation|expected pay|desired pay/],
  ['eeo', /gender|\bsex\b|\brace\b|ethnic|hispanic|latin[oax]|veteran|disabilit/],
];

/**
 * Which of the fillable sensitive kinds a question is. Anything in {@link NEVER}
 * returns null and is never filled, whatever was saved. So does a question that
 * matches more than one kind: "authorised to work here without sponsorship?"
 * has two halves, and a single yes or no cannot answer both.
 */
export function sensitiveKind(label: string): SensitiveKind | null {
  if (NEVER.test(label)) return null;
  const matched = KINDS.filter(([, re]) => re.test(label));
  return matched.length === 1 ? (matched[0] as [SensitiveKind, RegExp])[0] : null;
}

const DECLINE =
  /decline|prefer not|don.?t wish|do not wish|not to (say|answer|disclose|self.?identify)|choose not/;

interface Choice {
  text: string;
  pick: () => void;
}

function choicesOf(el: Control): Choice[] {
  if (el instanceof HTMLSelectElement) {
    return Array.from(el.options)
      .filter((o) => o.value !== '')
      .map((o) => ({ text: clean(o.textContent), pick: () => setSelectValue(el, o.value) }));
  }
  if (el instanceof HTMLInputElement && el.type === 'radio' && el.name) {
    return radioGroup(el).map((r) => ({
      text: clean(r.labels?.[0]?.textContent ?? r.value),
      // A click is what the user would do, and what React listens for on a
      // radio. It cannot submit anything: the target is an input, not a button.
      pick: () => r.click(),
    }));
  }
  return [];
}

/**
 * The buttons of one radio or checkbox group. Scoped to the element's own form,
 * as the browser scopes them: two forms on a page may both call a question
 * "q1", and merging them would find two "Yes" options and answer neither.
 */
function radioGroup(el: HTMLInputElement): HTMLInputElement[] {
  if (!el.name) return [el];
  // The whole document, filtered by `form`, rather than the form's subtree: a
  // button can sit outside its form and join it through a `form="…"` attribute.
  return Array.from(el.ownerDocument.querySelectorAll('input')).filter(
    (r) => r.type === el.type && r.name === el.name && r.form === el.form,
  );
}

/** One key per question: a group's first button, or the element itself. */
function questionKey(el: Control): Control {
  return isChoice(el) ? (radioGroup(el)[0] ?? el) : el;
}

/** Pick the one option that fits. Two that fit means the board is asking something finer. */
function pickOnly(choices: Choice[], fits: (text: string) => boolean): boolean {
  const matches = choices.filter((c) => fits(c.text));
  if (matches.length !== 1) return false;
  (matches[0] as Choice).pick();
  return true;
}

/**
 * An option that says yes or no and nothing that changes it. "Yes, but I
 * require sponsorship" starts with yes and means something else, so an option
 * that goes on to hedge, negate or mention sponsorship is not a plain answer,
 * and the question is left for the user.
 */
const QUALIFIED =
  /\b(but|not|sponsor\w*|visa|requir\w*|need\w*|however|except|pending|only|future|temporar\w*|condition\w*)\b|n't/;

function isPlainAnswer(text: string, answer: 'yes' | 'no'): boolean {
  if (!new RegExp(`^${answer}\\b`).test(text)) return false;
  const rest = text.slice(answer.length);
  return !QUALIFIED.test(rest);
}

/**
 * Fill one sensitive question from saved values. Returns the kind filled, or
 * null when nothing saved answers it, which leaves it for the user.
 */
function fillSensitive(
  el: Control,
  saved: NonNullable<AutofillValues['saved']> | undefined,
): SensitiveKind | null {
  if (!saved) return null;
  const kind = sensitiveKind(labelFor(el));
  if (!kind) return null;

  if (kind === 'salary') {
    if (!saved.salaryExpectation || !isFillable(el) || el.value.trim()) return null;
    setNativeValue(el, saved.salaryExpectation);
    return kind;
  }

  if (kind === 'eeo') {
    if (saved.eeo !== 'decline') return null;
    return pickOnly(choicesOf(el), (t) => DECLINE.test(t)) ? kind : null;
  }

  if (!saved.authorizedCountries.length) return null;
  const may = authorizedFor(rawLabelFor(el), resolveAuthorized(saved.authorizedCountries));
  if (may === null) return null;
  const yes = kind === 'workAuthorization' ? may : !may;
  return pickOnly(choicesOf(el), (t) => isPlainAnswer(t, yes ? 'yes' : 'no')) ? kind : null;
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

function setSelectValue(el: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
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
  if (isChoice(el)) return !radioGroup(el).some((r) => r.checked);
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

  // A radio group is one question however many buttons it has, so each group is
  // tried once, through its first button.
  const questions = new Set(sensitive.map(questionKey));
  for (const el of questions) {
    const kind = isEmpty(el) ? fillSensitive(el, values.saved) : null;
    if (kind) {
      el.dataset.jlogFilled = kind;
      report.filled.push(kind);
    } else if (isEmpty(el)) {
      report.sensitiveSkipped++;
    }
  }

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
  report.requiredEmpty = new Set(required.map(questionKey)).size;
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
