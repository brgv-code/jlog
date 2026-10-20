/**
 * The non-claim parts of a CV, as editable pieces: the photo, and the
 * label/value sections (skills, education, languages).
 *
 * Lifted out of the old profile card when the CV page became one workspace
 * (ADR-015), so the workspace can place them where they read best.
 */
import { PlusIcon, Trash2Icon, UploadIcon, UserRoundIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CvSection } from '../../lib/cvProfile';
import { deletePhoto, loadPhotoUrl, uploadPhoto } from '../../lib/photo';
import { Button } from '../ui/button';

type ItemDraft = { id: string; left: string; right: string };
export type SectionDraft = { id: string; heading: string; items: ItemDraft[] };

export const newId = () => crypto.randomUUID();

export const toDrafts = (sections: CvSection[]): SectionDraft[] =>
  sections.map((s) => ({
    id: newId(),
    heading: s.heading,
    items: s.items.map((i) => ({ id: newId(), left: i.left, right: i.right })),
  }));

export const fromDrafts = (drafts: SectionDraft[]): CvSection[] =>
  drafts.map((d) => ({
    heading: d.heading,
    items: d.items.map((i) => ({ left: i.left, right: i.right })),
  }));

const inputClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/25';

/** Skills, Education and Languages are all label/value rows — one editor does all three. */
export function SectionEditor({
  section,
  onChange,
  onRemove,
}: {
  section: SectionDraft;
  onChange: (s: SectionDraft) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-muted/20 p-3.5">
      <div className="flex items-center gap-2">
        <input
          className={`${inputClass} h-8 font-medium`}
          value={section.heading}
          placeholder="Section heading"
          onChange={(e) => onChange({ ...section, heading: e.target.value })}
        />
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove section">
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
      {section.items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <input
            className={`${inputClass} h-8 w-auto shrink-0 basis-1/3`}
            value={item.left}
            placeholder="Label"
            onChange={(e) => {
              onChange({
                ...section,
                items: section.items.map((x) =>
                  x.id === item.id ? { ...x, left: e.target.value } : x,
                ),
              });
            }}
          />
          <input
            className={`${inputClass} h-8 w-auto min-w-0 flex-1`}
            value={item.right}
            placeholder="Value"
            onChange={(e) => {
              onChange({
                ...section,
                items: section.items.map((x) =>
                  x.id === item.id ? { ...x, right: e.target.value } : x,
                ),
              });
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remove row"
            onClick={() =>
              onChange({ ...section, items: section.items.filter((x) => x.id !== item.id) })
            }
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          onChange({ ...section, items: [...section.items, { id: newId(), left: '', right: '' }] })
        }
      >
        <PlusIcon /> Row
      </Button>
    </div>
  );
}

/**
 * The photo control.
 *
 * Deliberately says nothing about whether a CV should carry one — that is a
 * regional convention, not a preference, and it is decided per render rather
 * than here. This only stores it.
 */
export function PhotoField() {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Blob URLs leak until revoked, and this one is replaced on every change.
  useEffect(() => {
    let revoked: string | null = null;
    loadPhotoUrl()
      .then((next) => {
        revoked = next;
        setUrl(next);
      })
      .catch(() => {});
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, []);

  async function refresh() {
    const next = await loadPhotoUrl().catch(() => null);
    setUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next;
    });
  }

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadPhoto(file);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not store that photo.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    try {
      await deletePhoto();
      setUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        Photo
      </span>
      <div className="flex items-center gap-4">
        <span className="bg-muted text-muted-foreground flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md">
          {url ? (
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <UserRoundIcon className="size-6" strokeWidth={1.5} />
          )}
        </span>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0])}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon className="size-3.5" />
              {url ? 'Replace' : 'Upload'}
            </Button>
            {url && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={onRemove}>
                Remove
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Resized and re-encoded in your browser before upload. Whether a generated CV includes it
            is chosen per application — US CVs conventionally have none.
          </p>
        </div>
      </div>
      {error && <p className="text-destructive text-[11px]">{error}</p>}
    </div>
  );
}
