/**
 * Paste a CV, see what was read out of it, tick what is true, import.
 *
 * The review step is the point. Facts are what tailoring is allowed to select
 * from, so a parser that guessed a wrong employer or split a bullet badly has
 * to be caught here — once imported, those words can end up in front of a
 * hiring manager.
 */
import { CheckIcon, FileTextIcon, ImportIcon, Loader2Icon, UploadIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { type CvProfile, loadCvProfile, saveCvProfile } from '../../lib/cvProfile';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';

type PreviewBullet = { text: string; factId: string; known: boolean };
type PreviewRole = {
  employer: string;
  roleTitle: string;
  dates: string;
  location: string;
  bullets: PreviewBullet[];
};
type Preview = {
  format: 'latex' | 'markdown' | 'text';
  /** Whether a model sorted the text, or the structure rules did. */
  readBy: 'model' | 'rules';
  chrome: CvProfile;
  roles: PreviewRole[];
  unplaced: string[];
  counts: { roles: number; bullets: number; known: number };
};

type ApiError = { error: { code: string; message: string } };

const inputClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/25';

const PLACEHOLDER = `Paste your CV here — LaTeX (moderncv) or Markdown.

# Ada Lovelace
ada@example.com

## Experience

### Staff Engineer — Acme (2017 – 2021)

- Cut p99 latency by 40% across the checkout path.`;

export function ImportCvForm() {
  const [source, setSource] = useState('');
  /**
   * The picked PDF, held until the facts are committed. It is uploaded only
   * after that succeeds, so the tailoring view can show a generated line over
   * the real page rather than over reflowed text.
   */
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<{
    roles: number;
    bullets: number;
    located: number;
  } | null>(null);
  const [chromeApplied, setChromeApplied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * The text layer is pulled out here, in the browser. The PDF itself is never
   * uploaded — only the words, which are structured, shown back for review, and
   * then kept with the facts so a generated CV can cite the lines it came from.
   * A scan has no text layer and cannot be read this way, which is said plainly
   * rather than importing nothing and looking broken.
   */
  async function readPdf(file: File) {
    setBusy(true);
    setError(null);
    setFile(null);
    try {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const { text } = await extractText(pdf, { mergePages: true });
      const flat = Array.isArray(text) ? text.join('\n') : text;
      if (!flat.trim()) {
        setError('That PDF has no text in it — it is probably a scan. Paste the text instead.');
        return;
      }
      setSource(flat);
      setFile(file);
      await runPreview(flat, 'text');
    } catch {
      setError('Could not read that PDF.');
    } finally {
      setBusy(false);
    }
  }

  /** Identity for the ticks: a bullet is addressed by where it sits. */
  const key = (roleIndex: number, bulletIndex: number) => `${roleIndex}:${bulletIndex}`;

  async function runPreview(text: string = source, format: 'auto' | 'text' = 'auto') {
    setBusy(true);
    setError(null);
    setImported(null);
    setChromeApplied(false);
    try {
      const res = await apiFetch('/api/profile/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: text, format }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as ApiError | null;
        setError(payload?.error?.message ?? `Could not read that CV (${res.status}).`);
        return;
      }
      const parsed = (await res.json()) as Preview;
      setPreview(parsed);
      // Nothing is pre-unticked: what the parser found is the proposal, and the
      // reviewer removes rather than hunts for what to add.
      setSkipped(new Set());
    } catch {
      setError('Could not reach the API.');
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const roles = preview.roles
        .map((role, roleIndex) => ({
          employer: role.employer,
          roleTitle: role.roleTitle,
          dates: role.dates,
          location: role.location,
          bullets: role.bullets
            .filter((_, bulletIndex) => !skipped.has(key(roleIndex, bulletIndex)))
            .map((b) => b.text),
        }))
        .filter((role) => role.employer && role.bullets.length);

      // The document travels with the facts. Tailoring can then show a
      // generated line beside the passage of this CV it was read from, which
      // is the difference between claiming the output is grounded and showing
      // it. Sent as it was parsed, so the offsets the server computes land on
      // the text the reviewer just saw.
      const res = await apiFetch('/api/profile/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles, source, sourceFormat: preview.format }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as ApiError | null;
        setError(payload?.error?.message ?? `Import failed (${res.status}).`);
        return;
      }
      const result = (await res.json()) as {
        roles: number;
        bullets: number;
        located: number;
        sourceId: string | null;
      };

      // After the facts, never instead of them. An upload that fails leaves an
      // import that fully succeeded, and the viewer falls back to the text it
      // already has — so this does not touch `error`, which would tell the user
      // their import broke when it did not.
      if (file && result.sourceId) {
        try {
          await apiFetch(`/api/profile/cv-source/file?sourceId=${result.sourceId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/pdf' },
            body: await file.arrayBuffer(),
          });
        } catch {
          // Nothing to say: the text citation still works.
        }
      }

      setImported(result);
      setPreview(null);
      setSource('');
      setFile(null);
    } catch {
      setError('Could not reach the API.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * The non-claim half goes to the CV profile, which still owns it. Only the
   * fields the CV actually filled in are written, so importing a CV that omits
   * a homepage does not erase the one already stored.
   */
  async function applyChrome() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const current = await loadCvProfile();
      const found = Object.fromEntries(
        Object.entries(preview.chrome).filter(([, v]) =>
          Array.isArray(v) ? v.length > 0 : String(v ?? '').trim() !== '',
        ),
      );
      await saveCvProfile({ ...current, ...found } as CvProfile);
      setChromeApplied(true);
    } catch {
      setError('Could not save those details to your profile.');
    } finally {
      setBusy(false);
    }
  }

  const selectedCount = preview
    ? preview.roles.reduce(
        (n, role, roleIndex) =>
          n + role.bullets.filter((_, i) => !skipped.has(key(roleIndex, i))).length,
        0,
      )
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImportIcon className="size-4" /> Import a CV
        </CardTitle>
        <CardDescription>
          Paste a CV — LaTeX or Markdown — or upload a PDF, and jlog reads your roles and bullets
          out of it. A PDF is read in your browser; only the text is sent. Nothing is stored until
          you have looked at what it found.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!preview && (
          <>
            <textarea
              className={`${inputClass} min-h-[180px] font-mono text-[12px] leading-relaxed`}
              value={source}
              placeholder={PLACEHOLDER}
              onChange={(e) => setSource(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <Button onClick={() => runPreview()} disabled={busy || !source.trim()}>
                {busy ? <Loader2Icon className="animate-spin" /> : <FileTextIcon />} Read it
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
                <UploadIcon /> Upload a PDF
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Cleared so picking the same file twice still fires.
                  e.target.value = '';
                  if (file) void readPdf(file);
                }}
              />
              {imported && (
                <span className="text-[13px] text-muted-foreground">
                  Imported {imported.bullets} bullet{imported.bullets === 1 ? '' : 's'} across{' '}
                  {imported.roles} role{imported.roles === 1 ? '' : 's'}.{' '}
                  {/* Said out loud, because it is what tailoring can cite. A
                      number short of the total means the reading drifted from
                      the document and those lines will have nothing to point
                      at. */}
                  {imported.located === imported.bullets
                    ? 'Each one can be traced back to a line of your CV.'
                    : `${imported.located} of them can be traced back to a line of your CV.`}
                </span>
              )}
            </div>
          </>
        )}

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}

        {preview && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              <span>
                Read as{' '}
                {preview.format === 'latex'
                  ? 'LaTeX'
                  : preview.format === 'text'
                    ? `PDF text, sorted by ${preview.readBy === 'model' ? 'your model' : 'structure rules'}`
                    : 'Markdown'}{' '}
                — {preview.counts.roles} role{preview.counts.roles === 1 ? '' : 's'},{' '}
                {preview.counts.bullets} bullet
                {preview.counts.bullets === 1 ? '' : 's'}.
              </span>
              {preview.counts.known > 0 && (
                <span>{preview.counts.known} already in your profile.</span>
              )}
            </div>

            {preview.chrome.firstName && (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-[13px]">
                <span className="text-muted-foreground">
                  Also found: {preview.chrome.firstName} {preview.chrome.lastName}
                  {preview.chrome.email ? ` · ${preview.chrome.email}` : ''}
                  {preview.chrome.sections.length
                    ? ` · ${preview.chrome.sections.length} section${preview.chrome.sections.length === 1 ? '' : 's'}`
                    : ''}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={applyChrome}
                  disabled={chromeApplied || busy}
                >
                  {chromeApplied ? <CheckIcon /> : null}
                  {chromeApplied ? 'Filled in below' : 'Use for my profile'}
                </Button>
              </div>
            )}

            {preview.roles.map((role, roleIndex) => (
              <div key={`${role.employer}-${role.dates}-${roleIndex}`} className="space-y-2">
                <Separator />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-medium">{role.roleTitle || 'Role'}</span>
                  <span className="text-[13px] text-muted-foreground">
                    at {role.employer || 'unknown employer'}
                  </span>
                  {role.dates && (
                    <span className="text-[12px] text-muted-foreground/70">{role.dates}</span>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {role.bullets.map((bullet, bulletIndex) => {
                    const id = key(roleIndex, bulletIndex);
                    const on = !skipped.has(id);
                    return (
                      <li key={bullet.factId || id}>
                        <label className="flex cursor-pointer items-start gap-2.5">
                          <input
                            type="checkbox"
                            className="mt-1 size-3.5 accent-primary"
                            checked={on}
                            onChange={() =>
                              setSkipped((prev) => {
                                const next = new Set(prev);
                                if (next.has(id)) next.delete(id);
                                else next.add(id);
                                return next;
                              })
                            }
                          />
                          <span
                            className={`text-[13px] leading-relaxed ${on ? '' : 'text-muted-foreground/50 line-through'}`}
                          >
                            {bullet.text}
                            {bullet.known && (
                              <span className="ml-2 text-[11px] text-muted-foreground/70">
                                already stored
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {preview.unplaced.length > 0 && (
              <div className="space-y-1.5">
                <Separator />
                <p className="text-[12px] text-muted-foreground">
                  {preview.readBy === 'model'
                    ? 'Dropped — these came back reworded rather than copied from your CV:'
                    : 'These had no role above them, so they were not assigned to one:'}
                </p>
                <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
                  {preview.unplaced.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={commit} disabled={busy || selectedCount === 0}>
                {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Import{' '}
                {selectedCount} bullet{selectedCount === 1 ? '' : 's'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setPreview(null);
                  setError(null);
                }}
                disabled={busy}
              >
                Back
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
