// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CvProfile,
  classify,
  countStandardFields,
  fillForm,
  setNativeValue,
  summarise,
  valuesFromProfile,
} from './autofill';

const PROFILE: CvProfile = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  address: 'Berlin, Germany',
  email: 'ada@example.com',
  homepage: 'ada.dev',
  socials: [
    { network: 'linkedin', handle: 'ada-lovelace' },
    { network: 'github', handle: '@ada' },
  ],
};
const VALUES = valuesFromProfile(PROFILE);

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function input(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error(`no input #${id}`);
  return el;
}

// Trimmed from job-boards.greenhouse.io: proper <label for>, custom questions as
// question_N, EEO as selects, a referrer question that also says "name".
const GREENHOUSE = `
  <form id="application-form">
    <label for="first_name">First Name<span>*</span></label>
    <input id="first_name" type="text" aria-required="true" autocomplete="given-name">
    <label for="last_name">Last Name<span>*</span></label>
    <input id="last_name" type="text" aria-required="true" autocomplete="family-name">
    <label for="email">Email<span>*</span></label>
    <input id="email" type="text" aria-required="true">
    <label for="phone">Phone<span>*</span></label>
    <input id="phone" type="tel" aria-required="true">
    <label for="question_1">LinkedIn Profile</label>
    <input id="question_1" type="text">
    <label for="question_2">Website</label>
    <input id="question_2" type="text">
    <label for="question_3">Referrer name</label>
    <input id="question_3" type="text">
    <label for="question_4">Are you legally authorized to work in Germany?*</label>
    <select id="question_4" required><option value=""></option><option>Yes</option></select>
    <label for="question_5">What is your salary expectation?</label>
    <input id="question_5" type="text">
    <label for="question_6">Why do you want to work here?</label>
    <textarea id="question_6"></textarea>
    <label for="gender">Gender</label>
    <select id="gender"><option value=""></option><option>Female</option></select>
    <button type="submit">Submit application</button>
  </form>`;

// Trimmed from jobs.lever.co/…/apply: the label is a sibling div, not a <label>.
const LEVER = `
  <form>
    <ul>
      <li class="application-question">
        <div class="application-label">Full name<span class="required">✱</span></div>
        <div class="application-field"><input type="text" name="name" required></div>
      </li>
      <li class="application-question">
        <div class="application-label">Email<span class="required">✱</span></div>
        <div class="application-field"><input type="email" name="email" required></div>
      </li>
      <li class="application-question">
        <div class="application-label">Current company</div>
        <div class="application-field"><input type="text" name="org"></div>
      </li>
      <li class="application-question">
        <div class="application-label">Current location</div>
        <div class="application-field"><input type="text" name="location"></div>
      </li>
      <li class="application-question">
        <div class="application-label">LinkedIn URL</div>
        <div class="application-field"><input type="text" name="urls[LinkedIn]"></div>
      </li>
      <li class="application-question">
        <div class="application-label">GitHub URL</div>
        <div class="application-field"><input type="text" name="urls[GitHub]"></div>
      </li>
    </ul>
  </form>`;

// Trimmed from jobs.ashbyhq.com: system fields are _systemfield_*, the rest UUIDs.
const ASHBY = `
  <form>
    <div class="_fieldEntry">
      <label class="ashby-application-form-question-title" for="_systemfield_name">Name</label>
      <input id="_systemfield_name" name="_systemfield_name" type="text" required>
    </div>
    <div class="_fieldEntry">
      <label class="ashby-application-form-question-title" for="_systemfield_email">Email</label>
      <input id="_systemfield_email" name="_systemfield_email" type="email" required>
    </div>
    <div class="_fieldEntry">
      <label class="ashby-application-form-question-title" for="a1b2">LinkedIn Profile</label>
      <input id="a1b2" type="text">
    </div>
    <div class="_fieldEntry">
      <label class="ashby-application-form-question-title" for="c3d4">Do you require visa sponsorship?</label>
      <input id="c3d4" type="text">
    </div>
  </form>`;

describe('valuesFromProfile', () => {
  it('turns handles into the URLs forms ask for', () => {
    expect(VALUES).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      location: 'Berlin, Germany',
      website: 'https://ada.dev',
      linkedin: 'https://www.linkedin.com/in/ada-lovelace',
      github: 'https://github.com/ada',
    });
  });

  it('keeps a social that is already a URL, and leaves out what is empty', () => {
    const values = valuesFromProfile({
      ...PROFILE,
      homepage: '',
      address: '',
      socials: [{ network: 'LinkedIn', handle: 'linkedin.com/in/ada/' }],
    });
    expect(values.linkedin).toBe('https://linkedin.com/in/ada/');
    expect(values.website).toBeUndefined();
    expect(values.location).toBeUndefined();
  });
});

describe('fillForm on Greenhouse', () => {
  beforeEach(() => setBody(GREENHOUSE));

  it('fills the standard fields and nothing else', () => {
    const report = fillForm(VALUES);
    expect(report.filled).toEqual(['firstName', 'lastName', 'email', 'linkedin', 'website']);
    expect(input('first_name').value).toBe('Ada');
    expect(input('question_1').value).toBe('https://www.linkedin.com/in/ada-lovelace');
  });

  it('never gives the referrer question the user’s own name', () => {
    fillForm(VALUES);
    expect(input('question_3').value).toBe('');
  });

  it('skips sensitive questions and reports them', () => {
    const report = fillForm(VALUES);
    expect(input('question_5').value).toBe('');
    // work authorisation, salary, gender
    expect(report.sensitiveSkipped).toBe(3);
  });

  it('reports the required fields still left for the user', () => {
    // phone (not on the profile yet) and the work authorisation select
    expect(fillForm(VALUES).requiredEmpty).toBe(2);
  });

  it('leaves a field the user already typed in alone', () => {
    input('email').value = 'work@example.com';
    fillForm(VALUES);
    expect(input('email').value).toBe('work@example.com');
  });

  it('never submits', () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    const onClick = vi.fn();
    document.querySelector('form')?.addEventListener('submit', onSubmit);
    document.querySelector('button')?.addEventListener('click', onClick);
    fillForm(VALUES);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not touch open-ended textareas', () => {
    fillForm(VALUES);
    expect((document.getElementById('question_6') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('fillForm on Lever', () => {
  beforeEach(() => setBody(LEVER));

  it('reads labels from the sibling div and fills the full name', () => {
    const report = fillForm(VALUES);
    expect(report.filled).toEqual(['fullName', 'email', 'location', 'linkedin', 'github']);
    expect((document.querySelector('[name="name"]') as HTMLInputElement).value).toBe(
      'Ada Lovelace',
    );
  });

  it('leaves current company empty rather than guessing', () => {
    fillForm(VALUES);
    expect((document.querySelector('[name="org"]') as HTMLInputElement).value).toBe('');
  });
});

describe('fillForm on Ashby', () => {
  beforeEach(() => setBody(ASHBY));

  it('fills system fields and skips the sponsorship question', () => {
    const report = fillForm(VALUES);
    expect(report.filled).toEqual(['fullName', 'email', 'linkedin']);
    expect(input('c3d4').value).toBe('');
    expect(report.sensitiveSkipped).toBe(1);
    expect(report.requiredEmpty).toBe(0);
  });
});

describe('detection', () => {
  it('counts an application form and ignores a search box', () => {
    setBody(GREENHOUSE);
    expect(countStandardFields()).toBeGreaterThanOrEqual(2);
    setBody('<input type="search" name="q" placeholder="Search jobs">');
    expect(countStandardFields()).toBe(0);
  });

  it('does not give a referrer field the user’s own LinkedIn', () => {
    setBody('<label for="x">Referrer LinkedIn</label><input id="x">');
    expect(classify(input('x'))).toBeNull();
  });

  it('treats a long label as a question, not a field', () => {
    setBody(
      '<label for="x">How did you hear about us? A website, a friend, a conference?</label><input id="x">',
    );
    expect(classify(input('x'))).toBeNull();
  });

  it('prefers returning nothing to guessing', () => {
    setBody('<label for="x">Anything else we should know?</label><input id="x">');
    expect(classify(input('x'))).toBeNull();
  });
});

describe('setNativeValue', () => {
  it('goes through the prototype setter so a React tracker sees the change', () => {
    setBody('<input id="r">');
    const el = input('r');
    // What React does: shadow `value` on the instance to track writes. A plain
    // `el.value = x` would hit this and React would ignore the change.
    const tracked = vi.fn();
    Object.defineProperty(el, 'value', {
      configurable: true,
      get: () => '',
      set: tracked,
    });
    const onInput = vi.fn();
    el.addEventListener('input', onInput);
    setNativeValue(el, 'Ada');
    expect(tracked).not.toHaveBeenCalled();
    expect(onInput).toHaveBeenCalledOnce();
  });
});

describe('summarise', () => {
  it('says what was filled, what is left, and to review', () => {
    expect(
      summarise({ filled: ['email', 'fullName'], requiredEmpty: 1, sensitiveSkipped: 3 }),
    ).toBe(
      'Filled 2 fields. 1 required field left for you. 3 questions on visa, pay or EEO left untouched. Review before you submit.',
    );
  });

  it('says so when there was nothing to fill', () => {
    expect(summarise({ filled: [], requiredEmpty: 0, sensitiveSkipped: 0 })).toMatch(
      /^Nothing to fill/,
    );
  });
});
