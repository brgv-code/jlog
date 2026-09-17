/**
 * Finding a fact's words on a rendered PDF page.
 *
 * The stored span from import is a character range into the EXTRACTED text,
 * which is a different string from the one a page's text layer concatenates —
 * near enough to read, not near enough to index into. So the page is searched
 * for the fact's own words instead, by the same whitespace-and-case-insensitive
 * rule that located it in the first place, and the rectangles come from the
 * text items the match actually covered.
 *
 * Matching against the text rather than reusing offsets also survives the case
 * that matters most: a CV whose bullet wrapped across two lines, two columns, or
 * a page break. The items carry their own geometry, so a match spanning them
 * produces one box per line rather than one box around the whole region.
 */

/** A highlight box in PDF user space, before the viewport scale is applied. */
export type PdfRect = { x: number; y: number; width: number; height: number };

export type PdfMatch = { pageIndex: number; rects: PdfRect[] };

/** The shape of a pdf.js text item, narrowed to what is used here. */
export type TextItemLike = {
  str: string;
  /** [scaleX, skewX, skewY, scaleY, offsetX, offsetY] */
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
};

type Folded = { text: string; origin: number[] };

/** A text item's box in PDF user space. */
function rectOf(item: TextItemLike): PdfRect {
  const [, , , scaleY, x, y] = item.transform as [number, number, number, number, number, number];
  // `height` is zero on some producers; the vertical scale is the reliable one.
  const height = item.height || Math.abs(scaleY);
  return { x, y, width: item.width, height };
}

/** Whether two items sit on the same line, allowing for sub- and superscripts. */
function sameLine(a: PdfRect, b: PdfRect): boolean {
  return Math.abs(a.y - b.y) <= Math.max(a.height, b.height) * 0.6;
}

/**
 * The page's items as one normalised string, with each character remembering
 * which item it came from.
 *
 * Whether two neighbouring items need a space between them is a question of
 * geometry, not of punctuation: a text layer stores "Cut p99 latency" and
 * "by 40%" as adjacent items with no separator, while the very same structure
 * also splits a single word across items for kerning. Joining blindly gives
 * "latencyby"; separating blindly gives "Enginee r". So the gap decides —
 * anything wider than a fraction of the line height was a space on the page.
 */
function foldItems(items: TextItemLike[]): Folded {
  const out: string[] = [];
  const origin: number[] = [];
  let pendingSpace = false;
  let previous: PdfRect | null = null;

  items.forEach((item, index) => {
    const rect = rectOf(item);
    if (previous && out.length) {
      const gap = rect.x - (previous.x + previous.width);
      if (!sameLine(previous, rect) || gap > rect.height * 0.25) pendingSpace = true;
    }

    for (const ch of item.str) {
      if (/\s/.test(ch)) {
        pendingSpace = out.length > 0;
        continue;
      }
      if (pendingSpace) {
        out.push(' ');
        origin.push(index);
        pendingSpace = false;
      }
      out.push(ch.toLowerCase());
      origin.push(index);
    }

    if (item.hasEOL) pendingSpace = out.length > 0;
    if (item.str.trim()) previous = rect;
  });

  return { text: out.join(''), origin };
}

/**
 * One box per line of the match, so a bullet that wrapped is boxed the way it
 * reads rather than as a single rectangle swallowing the text beside it.
 */
function boxesFor(items: TextItemLike[], from: number, to: number): PdfRect[] {
  const lines: PdfRect[] = [];

  for (let i = from; i <= to; i++) {
    const item = items[i];
    if (!item || !item.str.trim()) continue;
    const rect = rectOf(item);
    const last = lines[lines.length - 1];

    if (last && sameLine(last, rect)) {
      const left = Math.min(last.x, rect.x);
      const right = Math.max(last.x + last.width, rect.x + rect.width);
      last.x = left;
      last.width = right - left;
      last.height = Math.max(last.height, rect.height);
      last.y = Math.min(last.y, rect.y);
      continue;
    }
    lines.push({ ...rect });
  }

  return lines;
}

/**
 * Where `needle` appears across the document's pages, or null if nowhere.
 *
 * Pages are searched in order and the first hit wins. A CV that repeats a line
 * would need the same cursor treatment the import locator uses; it is not worth
 * it here, because the caller is highlighting one selected bullet rather than
 * laying out every citation at once.
 */
export function findOnPages(pages: TextItemLike[][], needle: string): PdfMatch | null {
  const target = needle.replace(/\s+/g, ' ').trim().toLowerCase();
  if (target.length < 4) return null;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const items = pages[pageIndex] as TextItemLike[];
    const folded = foldItems(items);
    const at = folded.text.indexOf(target);
    if (at === -1) continue;

    const from = folded.origin[at] as number;
    const to = folded.origin[at + target.length - 1] as number;
    const rects = boxesFor(items, from, to);
    if (rects.length) return { pageIndex, rects };
  }

  return null;
}
