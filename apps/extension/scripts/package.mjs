/**
 * Builds the extension and writes the zip the Chrome Web Store wants.
 *
 * Two things this does that `zip -r` did not.
 *
 * It refuses to package a bundle pointing at localhost. `VITE_API_BASE` falls
 * back to `http://localhost:8787` when no `.env` is present, and `.env` is
 * gitignored — so on a fresh clone the obvious command produced an upload-ready
 * artefact that would send every user's job applications to a server on their
 * own machine. That failure is invisible until someone installs it.
 *
 * And it writes the archive itself, with zlib, rather than shelling out to
 * `zip`. The zip binary is not installed everywhere and is absent from a
 * standard Windows shell, which left the only route to a store bundle
 * unavailable to some contributors.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

// Declared up here rather than beside crc32: `const` does not hoist, and the
// top-level build flow below runs before anything further down the file.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const outFile = join(root, 'jlog-extension.zip');

// --- 1. Fail early on an obviously wrong .env -------------------------------
// Not authoritative: see the post-build inspection below, which checks the
// bytes that would actually be uploaded.

const apiBase = process.env.VITE_API_BASE ?? readEnvFile('VITE_API_BASE');
const webBase = process.env.VITE_WEB_BASE ?? readEnvFile('VITE_WEB_BASE');

for (const [name, value] of [
  ['VITE_API_BASE', apiBase],
  ['VITE_WEB_BASE', webBase],
]) {
  if (!value) {
    fail(
      `${name} is not set.
A bundle built without it defaults to localhost, which is fine for development and
must never reach the store. Copy .env.example to .env and set the hosted URLs.`,
    );
  }
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(value)) {
    fail(
      `${name} points at ${value}.
That is a development build. An extension cannot be repointed after installation, so
this one would send every user's data to their own machine. Set the hosted URL first.`,
    );
  }
}

console.log(`  API  ${apiBase}`);
console.log(`  Web  ${webBase}`);

// --- 2. Build ---------------------------------------------------------------

execFileSync('npx', ['vite', 'build'], { cwd: root, stdio: 'inherit' });

if (!existsSync(join(dist, 'manifest.json'))) {
  fail('dist/manifest.json is missing — the build did not produce a loadable extension.');
}

/*
 * The check that actually counts.
 *
 * The one above reads `.env`, but Vite also loads `.env.local`,
 * `.env.production` and `.env.production.local`, and those win. A contributor
 * with a hosted URL in `.env` and a localhost one in `.env.local` would pass
 * the pre-flight and still build a localhost bundle. Rather than reimplement
 * Vite's precedence and hope it stays in step, this inspects what was actually
 * emitted — which is the only thing that ships.
 */
const emitted = collect(dist)
  .filter((f) => /\.(js|html|json)$/.test(f.name))
  .map((f) => f.body.toString('utf8'))
  .join('\n');

const localhostHit = emitted.match(/https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/);
if (localhostHit) {
  fail(
    `The built bundle contains ${localhostHit[0]}.
Something other than .env supplied it — Vite also reads .env.local and
.env.production, and those take precedence. Find and remove it before uploading.`,
  );
}

if (!emitted.includes(apiBase)) {
  fail(
    `The built bundle does not contain ${apiBase}.
The build used a different API URL than the one checked above, so what would be
uploaded is not what was verified.`,
  );
}

// --- 3. Archive -------------------------------------------------------------

rmSync(outFile, { force: true });
writeFileSync(outFile, buildZip(collect(dist)));

const { size } = statSync(outFile);
console.log(`\nWrote ${relative(process.cwd(), outFile)} (${(size / 1024).toFixed(1)} KB)`);
console.log('Upload this to the Chrome Web Store. See STORE_LISTING.md for the listing copy.');

// --- helpers ----------------------------------------------------------------

function fail(message) {
  console.error(`\nRefusing to package.\n\n${message}\n`);
  process.exit(1);
}

/** Reads one key out of .env without pulling in a dotenv dependency. */
function readEnvFile(key) {
  const path = join(root, '.env');
  if (!existsSync(path)) return undefined;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && match[1] === key) return match[2].replace(/^["']|["']$/g, '');
  }
  return undefined;
}

/** Every file under `dir`, with the forward-slash paths a zip entry needs. */
function collect(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full, base));
    else out.push({ name: relative(base, full).split(sep).join('/'), body: readFileSync(full) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * A minimal ZIP writer: one local header per file, then the central directory,
 * then the end-of-central-directory record. Everything is deflated, and the
 * timestamp fields are left at zero so the same input produces the same bytes.
 */
function buildZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const compressed = deflateRawSync(file.body);
    const crc = crc32(file.body);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 10); // time + date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.body.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.body.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // disk
  end.writeUInt16LE(0, 6); // disk with central dir
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([Buffer.concat(locals), centralBuf, end]);
}
