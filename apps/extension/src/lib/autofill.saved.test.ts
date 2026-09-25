// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type CvProfile,
  type SavedValues,
  fillForm,
  sensitiveKind,
  valuesFromProfile,
} from './autofill';
import { authorizedFor, countriesIn, resolveAuthorized } from './countries';

const PROFILE: CvProfile = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  address: 'Berlin, Germany',
  email: 'ada@example.com',
  homepage: '',
  socials: [],
};

const SAVED: SavedValues = {
  phone: '+49 30 1234567',
  authorizedCountries: ['EU'],
  salaryExpectation: '85,000 EUR',
  noticePeriod: '3 months',
  eeo: 'decline',
};

const values = (saved: Partial<SavedValues> = {}) =>
  valuesFromProfile(PROFILE, { ...SAVED, ...saved });

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function select(id: string): HTMLSelectElement {
  return document.getElementById(id) as HTMLSelectElement;
}

function selectedText(id: string): string {
  const el = select(id);
  return el.options[el.selectedIndex]?.textContent ?? '';
}

const YES_NO =
  '<option value=""></option><option value="1">Yes</option><option value="0">No</option>';

describe('countries', () => {
  it('reads short codes only as the board capitalised them', () => {
    expect(countriesIn('Are you authorized to work in the US?')).toEqual(['us']);
    expect(countriesIn('Tell us about yourself')).toEqual([]);
    expect(countriesIn('Are you legally authorised to work in the U.K.?')).toEqual(['uk']);
  });

  it('treats EU as every member state', () => {
    const eu = resolveAuthorized(['EU']);
    expect(eu.has('de')).toBe(true);
    expect(eu.has('nl')).toBe(true);
    expect(eu.has('us')).toBe(false);
  });

  it('answers only when exactly one country is named', () => {
    const eu = resolveAuthorized(['EU']);
    expect(authorizedFor('Are you authorized to work in Germany?', eu)).toBe(true);
    expect(authorizedFor('Are you authorized to work in the United States?', eu)).toBe(false);
    expect(authorizedFor('Are you authorized to work in the country of this role?', eu)).toBeNull();
    expect(authorizedFor('Can you work in the US or Canada?', eu)).toBeNull();
  });

  it('does not read "North America" as the US', () => {
    expect(countriesIn('Are you based in North America?')).toEqual([]);
  });
});

describe('sensitiveKind', () => {
  it('fills only the kinds it may, and never criminal history', () => {
    expect(sensitiveKind('will you require visa sponsorship?')).toBe('sponsorship');
    expect(sensitiveKind('are you legally authorized to work in germany?')).toBe(
      'workAuthorization',
    );
    expect(sensitiveKind('what is your salary expectation?')).toBe('salary');
    expect(sensitiveKind('gender')).toBe('eeo');
    expect(sensitiveKind('have you ever been convicted of a felony?')).toBeNull();
    expect(sensitiveKind('what visa do you currently hold?')).toBeNull();
    expect(sensitiveKind('date of birth')).toBeNull();
  });

  it('leaves a question that asks authorisation and sponsorship at once', () => {
    expect(sensitiveKind('are you authorized to work in the us without sponsorship?')).toBeNull();
  });
});

describe('fillForm with saved values', () => {
  beforeEach(() =>
    setBody(`
      <form>
        <label for="phone">Phone*</label><input id="phone" type="tel" required>
        <label for="notice">Notice period</label><input id="notice" type="text">
        <label for="auth_de">Are you legally authorized to work in Germany?*</label>
        <select id="auth_de" required>${YES_NO}</select>
        <label for="spon_de">Will you now or in the future require sponsorship to work in Germany?</label>
        <select id="spon_de">${YES_NO}</select>
        <label for="auth_us">Are you legally authorized to work in the US?</label>
        <select id="auth_us">${YES_NO}</select>
        <label for="auth_any">Are you authorized to work in the country where this job is located?</label>
        <select id="auth_any">${YES_NO}</select>
        <label for="salary">What is your salary expectation?</label><input id="salary" type="text">
        <label for="gender">Gender</label>
        <select id="gender"><option value=""></option><option value="1">Female</option><option value="2">Male</option><option value="3">Decline to self-identify</option></select>
        <label for="crime">Have you ever been convicted of a crime?</label>
        <select id="crime">${YES_NO}</select>
        <fieldset>
          <legend>Are you a protected veteran?</legend>
          <label><input type="radio" name="vet" value="y">I am a protected veteran</label>
          <label><input type="radio" name="vet" value="n">I am not a protected veteran</label>
          <label><input type="radio" name="vet" value="d">I don't wish to answer</label>
        </fieldset>
      </form>`),
  );

  it('fills phone and notice period as ordinary fields', () => {
    fillForm(values());
    expect((document.getElementById('phone') as HTMLInputElement).value).toBe('+49 30 1234567');
    expect((document.getElementById('notice') as HTMLInputElement).value).toBe('3 months');
  });

  it('answers authorisation and sponsorship for a named country', () => {
    fillForm(values());
    expect(selectedText('auth_de')).toBe('Yes');
    expect(selectedText('spon_de')).toBe('No');
    expect(selectedText('auth_us')).toBe('No');
  });

  it('leaves a question that names no country', () => {
    fillForm(values());
    expect(select('auth_any').value).toBe('');
  });

  it('fills salary and declines EEO, on selects and radio groups', () => {
    fillForm(values());
    expect((document.getElementById('salary') as HTMLInputElement).value).toBe('85,000 EUR');
    expect(selectedText('gender')).toBe('Decline to self-identify');
    const vet = document.querySelector<HTMLInputElement>('input[name="vet"]:checked');
    expect(vet?.value).toBe('d');
  });

  it('never answers criminal history, whatever is saved', () => {
    const report = fillForm(values());
    expect(select('crime').value).toBe('');
    // the no-country authorisation question and criminal history
    expect(report.sensitiveSkipped).toBe(2);
  });

  it('fills nothing sensitive from an empty save', () => {
    const report = fillForm(values({ authorizedCountries: [], salaryExpectation: '', eeo: '' }));
    expect(select('auth_de').value).toBe('');
    expect(select('gender').value).toBe('');
    expect((document.getElementById('salary') as HTMLInputElement).value).toBe('');
    expect(report.filled).toEqual(['phone', 'noticePeriod']);
  });

  it('fills nothing sensitive without saved values at all', () => {
    fillForm(valuesFromProfile(PROFILE));
    expect(select('auth_de').value).toBe('');
    expect(select('gender').value).toBe('');
  });

  it('leaves an EEO select with two decline-ish options alone', () => {
    select('gender').innerHTML += '<option value="4">I prefer not to say</option>';
    fillForm(values());
    expect(select('gender').value).toBe('');
  });

  it('does not change a sensitive answer the user already picked', () => {
    select('auth_de').value = '0';
    fillForm(values());
    expect(selectedText('auth_de')).toBe('No');
  });
});
