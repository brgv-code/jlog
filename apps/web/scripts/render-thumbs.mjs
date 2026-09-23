/**
 * Turn the committed template PDFs into web images for the landing page.
 *
 * The landing page used to draw six abstract grey rectangles and call them a
 * template gallery. Six real typeset pages make the same claim — "six designs,
 * compiled from LaTeX" — without asking anyone to take it on trust, and we
 * already have the PDFs: `render-templates.mjs` compiles and commits them.
 *
 * Output is committed alongside the PDFs for the same reason they are: it is
 * accurate by construction and free at runtime. Run this after
 * render-templates.mjs, whenever a template's LaTeX changes:
 *
 *   node apps/web/scripts/render-thumbs.mjs
 *
 * Needs poppler's pdftoppm and cwebp on PATH (`brew install poppler webp`,
 * `apt install poppler-utils webp`). Deliberately not part of `astro build`:
 * the build runs on CI and on Cloudflare, and neither has them.
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const PDF_DIR = join(HERE, '..', 'public', 'templates');
const OUT_DIR = join(PDF_DIR, 'thumbs');

/** Kept in step with TEMPLATES in render-templates.mjs. */
const IDS = ['classic', 'banking', 'casual', 'oldstyle', 'fancy', 'plain'];

/*
 * 620px wide, which is a shade over 2x the largest the card is ever drawn.
 * Retina-sharp without shipping a 1500px page nobody can read anyway — the
 * card is a picture of a document, not a document.
 */
const WIDTH = 620;
const QUALITY = 82;

/** Rendering DPI. A4 at 100dpi is 827x1169, comfortably above the target. */
const DPI = 100;

async function need(binary, hint) {
  try {
    await run(binary, ['-v']);
  } catch (e) {
    // pdftoppm and cwebp both answer -v on stderr with a non-zero exit on some
    // builds, so only a missing binary counts as missing.
    if (e.code === 'ENOENT') {
      console.error(`${binary} is not on PATH. ${hint}`);
      process.exit(1);
    }
  }
}

await need('pdftoppm', 'Install poppler (brew install poppler / apt install poppler-utils).');
await need('cwebp', 'Install webp (brew install webp / apt install webp).');

await mkdir(OUT_DIR, { recursive: true });
const work = await mkdtemp(join(tmpdir(), 'jlog-thumbs-'));

/** Intrinsic size of each render, so the page can set width/height honestly. */
const sizes = {};

/**
 * Read the size back out of the WebP that was actually written.
 *
 * Deriving it from the source PNG and the resize width means rounding the same
 * way cwebp rounds, which it does not document and which came out a pixel
 * short. A lossy WebP keeps its dimensions as two 14-bit fields just past the
 * 'VP8 ' chunk header, so ask the file.
 */
const webpSize = (buf) => {
  const at = buf.indexOf('VP8 ');
  if (at < 0) throw new Error('not a lossy WebP');
  return {
    w: buf.readUInt16LE(at + 14) & 0x3fff,
    h: buf.readUInt16LE(at + 16) & 0x3fff,
  };
};

try {
  for (const id of IDS) {
    process.stdout.write(`${id} … `);

    const pdf = join(PDF_DIR, `${id}.pdf`);
    try {
      await readFile(pdf);
    } catch {
      // One missing PDF should not cost the five that are there.
      console.log('no PDF — run render-templates.mjs first');
      continue;
    }

    const png = join(work, id);
    // -singlefile drops the page-number suffix; first page only, since a
    // gallery card shows the first page.
    await run('pdftoppm', [
      '-png',
      '-r',
      String(DPI),
      '-f',
      '1',
      '-l',
      '1',
      '-singlefile',
      pdf,
      png,
    ]);

    const out = join(OUT_DIR, `${id}.webp`);
    await run('cwebp', [
      '-quiet',
      '-q',
      String(QUALITY),
      '-resize',
      String(WIDTH),
      '0',
      `${png}.png`,
      '-o',
      out,
    ]);

    const written = await readFile(out);
    // The page needs the real intrinsic size on the <img>, or the six cards
    // have no height until the images decode and the section jumps when they do.
    sizes[id] = webpSize(written);
    console.log(`${sizes[id].w}x${sizes[id].h}, ${(written.length / 1024).toFixed(0)}KB`);
  }

  /*
   * The manifest the page actually reads.
   *
   * index.astro imports this and looks every template up in it, so a template
   * whose PDF never rendered fails the build with a named error instead of
   * shipping a broken <img> that nobody notices until someone opens the page.
   * It carries the intrinsic sizes for the same reason: two places holding the
   * same numbers is two places to get them wrong.
   */
  await writeFile(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(sizes, null, 2)}\n`);
} finally {
  await rm(work, { recursive: true, force: true });
}

console.log('\nThumbnails written to public/templates/thumbs/.');
