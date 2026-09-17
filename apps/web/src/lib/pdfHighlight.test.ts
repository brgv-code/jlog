import { describe, expect, it } from 'vitest';
import { type TextItemLike, findOnPages } from './pdfHighlight';

/** `transform` is [scaleX, skewX, skewY, scaleY, x, y] in PDF user space. */
const item = (str: string, x: number, y: number, width: number, hasEOL = false): TextItemLike => ({
  str,
  transform: [10, 0, 0, 10, x, y],
  width,
  height: 10,
  hasEOL,
});

const page = [
  item('Senior Engineer', 50, 700, 90, true),
  item('Cut p99 latency', 50, 680, 88),
  item('by 40% across checkout.', 142, 680, 130, true),
  item('Ran the migration.', 50, 660, 100, true),
];

describe('findOnPages', () => {
  it('finds words split across two text items on one line', () => {
    const match = findOnPages([page], 'Cut p99 latency by 40% across checkout.');
    expect(match?.pageIndex).toBe(0);
    expect(match?.rects).toHaveLength(1);
    // One box spanning both items, not one box each.
    expect(match?.rects[0]).toMatchObject({ x: 50, width: 222 });
  });

  it('boxes a match line by line when it wraps', () => {
    const wrapped = [item('Built the design', 50, 680, 95, true), item('system.', 50, 660, 40)];
    const match = findOnPages([wrapped], 'Built the design system.');
    expect(match?.rects).toHaveLength(2);
    expect(match?.rects.map((r) => r.y)).toEqual([680, 660]);
  });

  it('inserts the line break as a space so neighbours do not run together', () => {
    // "Senior Engineer" then "Cut" — without the EOL space this folds to
    // "engineercut" and a search for the real text fails.
    expect(findOnPages([page], 'Engineer Cut p99')).not.toBeNull();
    expect(findOnPages([page], 'EngineerCut')).toBeNull();
  });

  it('searches later pages when the first does not have it', () => {
    const second = [item('Mentored two designers.', 50, 700, 120)];
    expect(findOnPages([page, second], 'Mentored two designers.')?.pageIndex).toBe(1);
  });

  it('ignores case and collapsed whitespace', () => {
    expect(findOnPages([page], '  RAN   the\nmigration. ')).not.toBeNull();
  });

  it('returns null for words the document does not have', () => {
    expect(findOnPages([page], 'Led the rewrite of the billing system.')).toBeNull();
  });
});
