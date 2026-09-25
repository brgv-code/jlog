// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { type DraftResult, isDraftable, questionOf, setTextareaValue, sourcesHtml } from './draft';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function area(id: string): HTMLTextAreaElement {
  return document.getElementById(id) as HTMLTextAreaElement;
}

describe('isDraftable', () => {
  it('offers a draft on an open-ended question', () => {
    setBody('<label for="q">Why do you want to work here?*</label><textarea id="q"></textarea>');
    expect(isDraftable(area('q'))).toBe(true);
    expect(questionOf(area('q'))).toBe('Why do you want to work here?');
  });

  it('never offers one on a sensitive question, even in a textarea', () => {
    for (const label of [
      'Please describe your visa situation',
      'Explain any criminal convictions',
      'What are your salary expectations?',
    ]) {
      setBody(`<label for="q">${label}</label><textarea id="q"></textarea>`);
      expect(isDraftable(area('q')), label).toBe(false);
    }
  });

  it('skips one-line inputs, read-only fields and unlabelled boxes', () => {
    setBody('<label for="i">Why do you want to work here?</label><input id="i">');
    expect(isDraftable(document.getElementById('i') as Element)).toBe(false);
    setBody(
      '<label for="q">Why do you want to work here?</label><textarea id="q" readonly></textarea>',
    );
    expect(isDraftable(area('q'))).toBe(false);
    setBody('<textarea id="q"></textarea>');
    expect(isDraftable(area('q'))).toBe(false);
  });

  it('reads a Lever question from the label above the box', () => {
    setBody(`
      <li class="application-question">
        <div class="application-label">Additional information</div>
        <div class="application-field"><textarea id="q" name="comments"></textarea></div>
      </li>`);
    expect(questionOf(area('q'))).toBe('Additional information');
    expect(isDraftable(area('q'))).toBe(true);
  });
});

describe('setTextareaValue', () => {
  it('writes through the prototype setter and fires input', () => {
    setBody('<textarea id="q"></textarea>');
    const el = area('q');
    const onInput = vi.fn();
    el.addEventListener('input', onInput);
    setTextareaValue(el, 'An answer.');
    expect(el.value).toBe('An answer.');
    expect(onInput).toHaveBeenCalledOnce();
  });
});

describe('sourcesHtml', () => {
  const draft: Extract<DraftResult, { status: 'drafted' }> = {
    status: 'drafted',
    answer: 'x',
    sentences: [
      {
        text: 'a',
        sources: [
          { factId: 'f1', text: 'Cut latency by 40%.', employer: 'Acme', roleTitle: 'Engineer' },
        ],
      },
      {
        text: 'b',
        sources: [
          { factId: 'f1', text: 'Cut latency by 40%.', employer: 'Acme', roleTitle: 'Engineer' },
        ],
        jd: { text: 'You will own payments.' },
      },
    ],
  };

  it('lists each source once, and the posting quote', () => {
    const html = sourcesHtml(draft);
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain('Cut latency by 40%. <span class="where">Engineer, Acme</span>');
    expect(html).toContain('You will own payments. <span class="where">job posting</span>');
  });

  it('escapes the user’s own text', () => {
    const html = sourcesHtml({
      ...draft,
      sentences: [
        {
          text: 'a',
          sources: [
            { factId: 'f', text: '<img src=x onerror=alert(1)>', employer: null, roleTitle: null },
          ],
        },
      ],
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&#60;img');
  });
});
