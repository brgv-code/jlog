import { CV_TEMPLATES, type CvTemplate, templateConfig } from '@jlog/shared';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronRightIcon,
  EyeIcon,
  LayoutTemplateIcon,
  PencilIcon,
  PlusIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CV_PROFILE_CHANGED,
  type CvProfile,
  EMPTY_PROFILE,
  loadCvProfile,
  saveCvProfile,
} from '../../lib/cvProfile';
import {
  FACTS_CHANGED,
  type LatestTailored,
  ORIGIN_LABELS,
  type StoredBullet,
  type StoredFacts,
  type StoredRole,
  addBullet,
  loadLatestTailored,
  loadStoredFacts,
  sortRoles,
  updateFact,
} from '../../lib/facts';
import { ImportCvForm } from '../settings/ImportCvForm';
import { TemplateGallery } from '../settings/TemplateGallery';
import { Button } from '../ui/button';
import { CvPreview, type PreviewRole } from './CvPreview';
import {
  PhotoField,
  type SectionDraft,
  SectionEditor,
  fromDrafts,
  newId,
  toDrafts,
} from './profileParts';

type Save = 'saved' | 'saving' | 'error';

const PREVIEW_KEY = 'jlog.cv.preview';
type Sheet = null | 'import' | 'templates';

/** Colour per origin. A bullet read from your CV is the default and says nothing. */
const ORIGIN_INK: Partial<Record<StoredBullet['origin'], string>> = {
  edited: '#6d28d9',
  added: 'var(--color-accent)',
  kept: 'var(--color-success)',
};

const fieldClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-[var(--color-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-accent-subtle)]';

/**
 * The CV page as one workspace (ADR-015): a compact editor beside the page it
 * writes.
 *
 * It replaces three stacked cards (an always open import box, the stored facts,
 * a long profile form with one Save at the bottom). A returning owner landed on
 * the import box, and nothing showed what the CV looked like. Here experience
 * comes first, setup is folded away, the profile saves as it is typed, and the
 * page is always in view.
 */
export function CvWorkspace() {
  const [facts, setFacts] = useState<StoredFacts | null>(null);
  const [profile, setProfile] = useState<CvProfile>(EMPTY_PROFILE);
  const [sections, setSections] = useState<SectionDraft[]>([]);
  const [save, setSave] = useState<Save>('saved');
  const dirty = useRef(false);

  const [selected, setSelected] = useState<string | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [adding, setAdding] = useState<{ roleId: string; text: string } | null>(null);
  const [open, setOpen] = useState({ you: false, sections: false, review: false, archived: false });
  const [sheet, setSheet] = useState<Sheet>(null);
  // The page is opened when asked for: always open, it took half the screen
  // from the thing being edited. Remembered per browser.
  const [preview, setPreviewState] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [source, setSource] = useState<'tailored' | 'base'>('tailored');
  const [latest, setLatest] = useState<LatestTailored | null>(null);
  useEffect(() => {
    try {
      setPreviewState(localStorage.getItem(PREVIEW_KEY) === '1');
    } catch {
      // Storage blocked: the page simply starts closed.
    }
    loadLatestTailored().then(setLatest);
  }, []);
  function setPreview(open: boolean) {
    setPreviewState(open);
    try {
      localStorage.setItem(PREVIEW_KEY, open ? '1' : '0');
    } catch {
      // Not remembered, which is fine.
    }
  }
  const [notice, setNotice] = useState<string | null>(null);

  const say = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((m) => (m === msg ? null : m)), 3200);
  }, []);

  // Facts: loaded once, and again whenever an import stores new ones.
  const reloadFacts = useCallback(
    () =>
      loadStoredFacts().then((next) => {
        if (next) setFacts(next);
        else say('Could not load your experience.');
      }),
    [say],
  );
  useEffect(() => {
    reloadFacts();
    window.addEventListener(FACTS_CHANGED, reloadFacts);
    return () => window.removeEventListener(FACTS_CHANGED, reloadFacts);
  }, [reloadFacts]);

  // Profile: reloaded when an import fills it, unless the owner is mid-edit,
  // where a reload would throw away what they just typed.
  useEffect(() => {
    const load = () => {
      if (dirty.current) return;
      loadCvProfile()
        .then((p) => {
          setProfile(p);
          setSections(toDrafts(p.sections));
        })
        .catch(() => say('Could not load your CV profile.'));
    };
    load();
    window.addEventListener(CV_PROFILE_CHANGED, load);
    return () => window.removeEventListener(CV_PROFILE_CHANGED, load);
  }, [say]);

  // Saved as typed, debounced. A Save button at the end of a long form was
  // easy to miss, and leaving the page without it lost the edit silently.
  useEffect(() => {
    if (!dirty.current) return;
    setSave('saving');
    const t = window.setTimeout(() => {
      saveCvProfile({ ...profile, sections: fromDrafts(sections) })
        .then(() => {
          dirty.current = false;
          setSave('saved');
        })
        .catch(() => setSave('error'));
    }, 700);
    return () => window.clearTimeout(t);
  }, [profile, sections]);

  function setField<K extends keyof CvProfile>(key: K, value: CvProfile[K]) {
    dirty.current = true;
    setProfile((p) => ({ ...p, [key]: value }));
  }
  function editSections(next: SectionDraft[]) {
    dirty.current = true;
    setSections(next);
  }

  // What the page shows: active roles, most recent first, with the bullets
  // tailoring may use. Unconfirmed ones wait in the review list instead.
  const roles = useMemo(
    () =>
      sortRoles(facts?.roles ?? [])
        .filter((r) => r.status === 'active')
        .map((r) => ({
          ...r,
          bullets: r.bullets.filter((b) => b.status === 'active' && b.origin !== 'history'),
        })),
    [facts],
  );
  const review = useMemo(
    () =>
      (facts?.roles ?? [])
        .filter((r) => r.status === 'active')
        .flatMap((r) =>
          r.bullets
            .filter((b) => b.status === 'active' && b.origin === 'history')
            .map((b) => ({ ...b, employer: r.employer })),
        ),
    [facts],
  );
  const archived = useMemo(
    () =>
      (facts?.roles ?? []).flatMap((r) =>
        r.status === 'archived'
          ? [{ id: r.id, text: `${r.roleTitle ?? 'Role'} at ${r.employer ?? ''}`, role: true }]
          : r.bullets
              .filter((b) => b.status === 'archived')
              .map((b) => ({ id: b.id, text: b.text, role: false })),
      ),
    [facts],
  );
  const order = useMemo(() => roles.flatMap((r) => r.bullets.map((b) => b.id)), [roles]);

  /**
   * What the page shows: a CV, not the fact store. The latest tailored one is
   * closest to what the owner sends; without one, the imported CV's own
   * layout; without an import, the confirmed bullets.
   */
  const previewRoles = useMemo((): PreviewRole[] => {
    if (source === 'tailored' && latest) {
      return latest.selected.map((r) => ({
        id: r.roleFactId,
        title: r.roleTitle,
        employer: r.employer,
        dates: r.dates,
        bullets: r.bullets.map((b) => ({ id: b.factId, text: b.text })),
      }));
    }
    const base = facts?.base ?? [];
    if (base.length) {
      const byId = new Map(roles.flatMap((r) => r.bullets.map((b) => [b.id, b] as const)));
      return base.flatMap((entry) => {
        const role = roles.find((r) => r.id === entry.roleId);
        if (!role) return [];
        const bullets = entry.bulletIds.flatMap((id) => {
          const b = byId.get(id);
          return b ? [{ id: b.id, text: b.text }] : [];
        });
        return bullets.length
          ? [
              {
                id: role.id,
                title: role.roleTitle,
                employer: role.employer,
                dates: role.dates,
                bullets,
              },
            ]
          : [];
      });
    }
    return roles.map((r) => ({
      id: r.id,
      title: r.roleTitle,
      employer: r.employer,
      dates: r.dates,
      bullets: r.bullets.map((b) => ({ id: b.id, text: b.text })),
    }));
  }, [source, latest, facts, roles]);
  const showing =
    source === 'tailored' && latest
      ? `Tailored for ${latest.application.company}`
      : facts?.base?.length
        ? 'Your imported CV'
        : 'All confirmed bullets';

  /** Apply a change locally first, then persist it; reload on failure. */
  async function change(
    id: string,
    patch: Parameters<typeof updateFact>[1],
    local: (b: StoredBullet) => StoredBullet | null,
    done?: string,
  ) {
    setFacts((f) =>
      f
        ? {
            ...f,
            roles: f.roles.map((r) => ({
              ...r,
              ...(r.id === id && patch.status ? { status: patch.status } : {}),
              bullets: r.bullets.flatMap((b) => {
                if (b.id !== id) return [b];
                const next = local(b);
                return next ? [next] : [];
              }),
            })),
          }
        : f,
    );
    if (await updateFact(id, patch)) {
      if (done) say(done);
    } else {
      say('That change did not save. Showing what is stored.');
      reloadFacts();
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const text = editing.text.trim();
    setEditing(null);
    if (!text) return;
    await change(editing.id, { canonical: text }, (b) => ({ ...b, text, origin: 'edited' }));
  }

  async function saveAdd() {
    if (!adding?.text.trim()) return;
    const { roleId, text } = adding;
    setAdding(null);
    const created = await addBullet(roleId, text.trim());
    if (!created) {
      say('Could not add that bullet.');
      return;
    }
    await reloadFacts();
    setSelected(created.id);
    say('Added. Tailoring can use it from now on.');
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.matches('input, textarea, select')) return;
    const i = selected ? order.indexOf(selected) : -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next =
        order[Math.max(0, Math.min(order.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) {
        setSelected(next);
        document.getElementById(`fact-${next}`)?.focus();
      }
    } else if ((e.key === 'e' || e.key === 'E') && selected) {
      e.preventDefault();
      const b = roles.flatMap((r) => r.bullets).find((x) => x.id === selected);
      if (b) setEditing({ id: b.id, text: b.text });
    } else if (e.key === 'Escape') {
      setEditing(null);
      setAdding(null);
      setSheet(null);
    }
  }

  const initials =
    `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase() || '·';
  const template = templateConfig(profile.template);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      {/* Editor */}
      <section
        aria-label="Editor"
        // Keyboard shortcuts for the list live on its container.
        onKeyDown={onKeyDown}
        className={`relative min-h-0 w-full flex-col border-border ${preview ? 'hidden lg:flex lg:w-[480px] lg:flex-none lg:border-r' : 'flex'}`}
      >
        <div className="flex h-[52px] flex-none items-center justify-between border-b border-border pr-4 pl-6">
          <div className="flex items-center gap-2.5">
            <h1 className="m-0 text-[14px] font-semibold tracking-[-0.01em]">CV</h1>
            <SaveState state={save} />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setSheet('import')}>
              <UploadIcon /> Import
            </Button>
            <Button
              variant={preview ? 'secondary' : 'outline'}
              size="sm"
              aria-pressed={preview}
              onClick={() => setPreview(!preview)}
            >
              <EyeIcon /> Preview
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          {/* With the page closed the editor has the width; keep lines readable. */}
          <div className={preview ? '' : 'mx-auto max-w-[760px]'}>
            {review.length > 0 && (
              <div className="mx-4 mt-4 ml-6 rounded-[10px] bg-[var(--color-warning-subtle,#fffbeb)] shadow-[inset_0_0_0_1px_#fde68a]">
                <div className="flex items-center justify-between gap-3 py-2.5 pr-2.5 pl-3.5">
                  <span className="flex items-center gap-2 text-[13px] text-[#92400e]">
                    <i className="size-1.5 flex-none rounded-full bg-[var(--color-warning)]" />
                    {review.length} {review.length === 1 ? 'bullet' : 'bullets'} to confirm
                  </span>
                  <span className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={open.review}
                      onClick={() => setOpen((o) => ({ ...o, review: !o.review }))}
                    >
                      {open.review ? 'Hide' : 'Review'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-background"
                      onClick={async () => {
                        const ids = review.map((b) => b.id);
                        for (const id of ids)
                          await change(id, { confirmed: true }, (b) => ({ ...b, origin: 'kept' }));
                        say(`Kept ${ids.length}. Tailoring can use them now.`);
                      }}
                    >
                      Keep all
                    </Button>
                  </span>
                </div>
                {open.review && (
                  <ul className="m-0 list-none px-1.5 pb-1.5">
                    {review.map((b) => (
                      <li
                        key={b.id}
                        className="flex items-center gap-2 border-t border-[#fde68a] p-2 text-[13px] leading-snug"
                      >
                        <span className="min-w-0 flex-1">
                          {b.text}
                          <small className="block text-[11.5px] text-[#a16207]">{b.employer}</small>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            change(
                              b.id,
                              { status: 'archived' },
                              (x) => ({ ...x, status: 'archived' }),
                              'Archived.',
                            )
                          }
                        >
                          Not true
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-background"
                          onClick={() =>
                            change(
                              b.id,
                              { confirmed: true },
                              (x) => ({ ...x, origin: 'kept' }),
                              'Kept.',
                            )
                          }
                        >
                          Keep
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* You */}
            <div className="px-4 pt-4 pl-6">
              <button
                type="button"
                aria-expanded={open.you}
                onClick={() => setOpen((o) => ({ ...o, you: !o.you }))}
                className="-mx-3 flex w-[calc(100%+24px)] items-center gap-3 rounded-[10px] border-0 bg-transparent px-3 py-2.5 text-left hover:bg-[var(--color-surface-hover)]"
              >
                <span className="grid size-9 flex-none place-items-center rounded-full bg-gradient-to-br from-zinc-600 to-zinc-900 text-[12.5px] font-semibold text-white">
                  {initials}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="truncate text-[14px] font-semibold tracking-[-0.01em]">
                    {[profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
                      'Add your name'}
                  </b>
                  <span className="text-muted-foreground truncate text-[13px]">
                    {[profile.title, profile.address].filter(Boolean).join(' · ') ||
                      'Title, location and contact'}
                  </span>
                </span>
                <ChevronRightIcon
                  className={`text-muted-foreground size-4 transition-transform ${open.you ? 'rotate-90' : ''}`}
                />
              </button>
              {open.you && (
                <Panel>
                  <div className="grid grid-cols-2 gap-2.5">
                    {(
                      [
                        ['firstName', 'First name'],
                        ['lastName', 'Last name'],
                        ['title', 'Title'],
                        ['address', 'Location'],
                        ['email', 'Email'],
                        ['homepage', 'Homepage'],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className="text-muted-foreground flex flex-col gap-1.5 text-[11.5px]"
                      >
                        {label}
                        <input
                          className={fieldClass}
                          value={profile[key]}
                          onChange={(e) => setField(key, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                  <label className="text-muted-foreground flex flex-col gap-1.5 text-[11.5px]">
                    Summary
                    <textarea
                      rows={3}
                      className={`${fieldClass} h-auto resize-y py-2 leading-relaxed`}
                      value={profile.summary}
                      onChange={(e) => setField('summary', e.target.value)}
                    />
                  </label>
                  <PhotoField />
                </Panel>
              )}
            </div>

            {/* Experience */}
            <div className="px-4 pt-5 pl-6">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-muted-foreground m-0 text-[11px] font-medium tracking-[0.07em] uppercase">
                  Experience
                </h2>
              </div>
              {facts === null && <p className="text-muted-foreground text-[13px]">Loading…</p>}
              {facts !== null && roles.length === 0 && (
                <div className="py-6 text-center">
                  <p className="m-0 text-[13px] font-medium">No experience yet</p>
                  <p className="text-muted-foreground mt-1 text-[13px]">
                    Import a CV and jlog reads your roles and bullets out of it.
                  </p>
                  <Button className="mt-3" size="sm" onClick={() => setSheet('import')}>
                    <UploadIcon /> Import a CV
                  </Button>
                </div>
              )}
              {roles.map((role) => (
                <RoleBlock
                  key={role.id}
                  role={role}
                  selected={selected}
                  hot={hot}
                  editing={editing}
                  adding={adding?.roleId === role.id ? adding.text : null}
                  onSelect={setSelected}
                  onHot={setHot}
                  onEdit={(b) => setEditing({ id: b.id, text: b.text })}
                  onEditText={(text) => setEditing((e) => (e ? { ...e, text } : e))}
                  onSave={saveEdit}
                  onCancel={() => setEditing(null)}
                  onArchive={(b) =>
                    change(
                      b.id,
                      { status: 'archived' },
                      (x) => ({ ...x, status: 'archived' }),
                      'Archived. Tailoring won’t use it.',
                    )
                  }
                  onAdd={() => setAdding({ roleId: role.id, text: '' })}
                  onAddText={(text) => setAdding((a) => (a ? { ...a, text } : a))}
                  onAddSave={saveAdd}
                  onAddCancel={() => setAdding(null)}
                />
              ))}
              {archived.length > 0 && (
                <div className="mt-4">
                  <button
                    type="button"
                    aria-expanded={open.archived}
                    onClick={() => setOpen((o) => ({ ...o, archived: !o.archived }))}
                    className="text-muted-foreground hover:text-foreground border-0 bg-transparent p-0 text-[12.5px]"
                  >
                    {open.archived ? 'Hide archived' : `${archived.length} archived`}
                  </button>
                  {open.archived && (
                    <ul className="m-0 mt-2 list-none p-0">
                      {archived.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center gap-2 border-t border-border py-2 text-[13px]"
                        >
                          <span className="text-muted-foreground min-w-0 flex-1 line-through">
                            {a.text}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (await updateFact(a.id, { status: 'active' })) {
                                await reloadFacts();
                                say('Restored.');
                              } else say('Could not restore that.');
                            }}
                          >
                            <ArchiveRestoreIcon /> Restore
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Skills and sections */}
            <div className="px-4 pt-5 pl-6">
              <button
                type="button"
                aria-expanded={open.sections}
                onClick={() => setOpen((o) => ({ ...o, sections: !o.sections }))}
                className="-mx-3 flex w-[calc(100%+24px)] items-center justify-between rounded-lg border-0 bg-transparent px-3 py-2.5 text-left hover:bg-[var(--color-surface-hover)]"
              >
                <b className="text-[13px] font-medium">Skills, education and languages</b>
                <span className="text-muted-foreground text-[13px]">
                  {open.sections
                    ? ''
                    : `${sections.length} ${sections.length === 1 ? 'section' : 'sections'}`}
                </span>
              </button>
              {open.sections && (
                <Panel>
                  {sections.map((s) => (
                    <SectionEditor
                      key={s.id}
                      section={s}
                      onChange={(next) =>
                        editSections(sections.map((x) => (x.id === next.id ? next : x)))
                      }
                      onRemove={() => editSections(sections.filter((x) => x.id !== s.id))}
                    />
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      editSections([
                        ...sections,
                        { id: newId(), heading: '', items: [{ id: newId(), left: '', right: '' }] },
                      ])
                    }
                  >
                    <PlusIcon /> Section
                  </Button>
                  <p className="text-muted-foreground m-0 text-[11.5px]">
                    Not career claims, so they are not checked. Tailoring reorders skills toward a
                    posting and never adds one.
                  </p>
                </Panel>
              )}
            </div>
          </div>
        </div>
        <div className="text-muted-foreground hidden flex-none items-center gap-3.5 border-t border-border px-6 py-2.5 text-[11.5px] lg:flex">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span className="flex items-center gap-1">
            <Kbd>E</Kbd> edit
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Esc</Kbd> close
          </span>
        </div>

        {sheet && (
          <dialog
            open
            aria-label={sheet === 'import' ? 'Import a CV' : 'Templates'}
            className="absolute inset-0 z-10 m-0 flex h-full max-h-none w-full max-w-none flex-col border-0 bg-background p-0 text-foreground"
          >
            <div className="flex h-[52px] flex-none items-center justify-between border-b border-border pr-4 pl-6">
              <h2 className="m-0 text-[14px] font-semibold">
                {sheet === 'import' ? 'Import a CV' : 'Templates'}
              </h2>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setSheet(null)}>
                <XIcon />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {sheet === 'import' ? (
                <ImportCvForm />
              ) : (
                <TemplateGallery
                  value={profile.template}
                  onChange={(t) => {
                    setField('template', t);
                    setSheet(null);
                  }}
                />
              )}
            </div>
          </dialog>
        )}
      </section>

      {/* Page */}
      <main
        aria-label="Preview"
        className={`min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-surface-raised)] ${preview ? 'flex' : 'hidden'}`}
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(24,24,27,0.045) 1px, transparent 0)',
          backgroundSize: '16px 16px',
        }}
      >
        <div className="flex h-[52px] flex-none items-center justify-between gap-3 border-b border-border bg-[var(--color-surface)]/85 px-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            {latest && (
              <select
                aria-label="What the page shows"
                className="h-8 max-w-[220px] truncate rounded-md border border-border bg-background px-2 text-[13px]"
                value={source}
                onChange={(e) => setSource(e.target.value as 'tailored' | 'base')}
              >
                <option value="tailored">Tailored for {latest.application.company}</option>
                <option value="base">
                  {facts?.base?.length ? 'Your imported CV' : 'All confirmed bullets'}
                </option>
              </select>
            )}
            {!latest && (
              <span className="text-muted-foreground truncate text-[13px]">{showing}</span>
            )}
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <span className="text-muted-foreground">Template</span>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
              value={profile.template}
              onChange={(e) => setField('template', e.target.value as CvTemplate)}
            >
              {CV_TEMPLATES.map((t) => (
                <option key={t} value={t}>
                  {templateConfig(t).label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setSheet('templates')}>
              <LayoutTemplateIcon /> Browse
            </Button>
            <span className="text-muted-foreground font-mono text-[11.5px] tabular-nums">
              {pageCount} {pageCount === 1 ? 'page' : 'pages'}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close the preview"
              onClick={() => setPreview(false)}
            >
              <XIcon />
            </Button>
          </div>
        </div>
        <CvPreview
          profile={profile}
          sections={sections}
          roles={previewRoles}
          template={profile.template}
          onPages={setPageCount}
          selected={selected}
          hot={hot}
          onSelect={(id) => {
            setSelected(id);
            document
              .getElementById(`fact-${id}`)
              ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }}
          onHot={setHot}
        />
        <p className="text-muted-foreground m-0 flex-none pb-3 text-center text-[11.5px]">
          Close to the {template.label} design. Browse shows its real render.
        </p>
      </main>

      <output
        aria-live="polite"
        className={`bg-primary text-primary-foreground pointer-events-none fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-[10px] px-3.5 py-2 text-[12.5px] shadow-lg transition-[opacity,transform] duration-200 ${notice ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
      >
        {notice}
      </output>
    </div>
  );
}

function RoleBlock({
  role,
  selected,
  hot,
  editing,
  adding,
  onSelect,
  onHot,
  onEdit,
  onEditText,
  onSave,
  onCancel,
  onArchive,
  onAdd,
  onAddText,
  onAddSave,
  onAddCancel,
}: {
  role: StoredRole;
  selected: string | null;
  hot: string | null;
  editing: { id: string; text: string } | null;
  adding: string | null;
  onSelect: (id: string) => void;
  onHot: (id: string | null) => void;
  onEdit: (b: StoredBullet) => void;
  onEditText: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onArchive: (b: StoredBullet) => void;
  onAdd: () => void;
  onAddText: (text: string) => void;
  onAddSave: () => void;
  onAddCancel: () => void;
}) {
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[13.5px]">
          <b className="font-semibold">{role.roleTitle ?? 'Role'}</b>
          <span className="text-muted-foreground"> · {role.employer}</span>
        </span>
        {role.dates && (
          <span className="text-muted-foreground flex-none text-[12px] tabular-nums">
            {role.dates.replace(/--/g, ' – ')}
          </span>
        )}
      </div>

      {role.bullets.map((b) => {
        if (editing?.id === b.id) {
          return (
            <div
              key={b.id}
              className="-mx-2.5 my-1 rounded-[10px] bg-background p-2.5 shadow-[0_0_0_1px_var(--color-border-strong),0_4px_12px_rgba(24,24,27,0.06)]"
            >
              <textarea
                // biome-ignore lint/a11y/noAutofocus: the editor opens on an explicit Edit
                autoFocus
                rows={2}
                aria-label="Edit this bullet"
                className="w-full resize-none border-0 bg-transparent text-[13.5px] leading-relaxed"
                // The panel around it is the focus indicator; a second ring inside it doubles up.
                style={{ outline: 'none' }}
                value={editing.text}
                onChange={(e) => onEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onSave();
                  } else if (e.key === 'Escape') onCancel();
                }}
              />
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <small className="text-muted-foreground text-[11.5px]">
                  Changes this on every CV
                </small>
                <span className="flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={onCancel}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={onSave}>
                    Save
                  </Button>
                </span>
              </div>
            </div>
          );
        }
        const on = selected === b.id;
        const lit = hot === b.id;
        const ink = ORIGIN_INK[b.origin];
        return (
          <div
            key={b.id}
            className={`group -mx-2.5 grid grid-cols-[1fr_auto] gap-2 rounded-lg px-2.5 py-2 transition-colors ${on ? 'bg-[var(--color-accent-subtle)]' : lit ? 'bg-[var(--color-surface)]' : ''}`}
            onMouseEnter={() => onHot(b.id)}
            onMouseLeave={() => onHot(null)}
          >
            <button
              id={`fact-${b.id}`}
              type="button"
              onClick={() => onSelect(b.id)}
              onDoubleClick={() => onEdit(b)}
              className="min-w-0 border-0 bg-transparent p-0 text-left"
            >
              <span className="block text-[13.5px] leading-relaxed text-pretty">{b.text}</span>
              {ink && (
                <span className="mt-0.5 block text-[11.5px]" style={{ color: ink }}>
                  {ORIGIN_LABELS[b.origin]}
                </span>
              )}
            </button>
            <span
              className={`flex gap-px transition-opacity ${on ? 'opacity-100' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100'}`}
            >
              <IconButton label="Edit" onClick={() => onEdit(b)}>
                <PencilIcon />
              </IconButton>
              <IconButton label="Archive" onClick={() => onArchive(b)}>
                <ArchiveIcon />
              </IconButton>
            </span>
          </div>
        );
      })}

      {adding !== null ? (
        <Panel>
          <label className="text-muted-foreground flex flex-col gap-1.5 text-[11.5px]">
            What did you do there? In your own words
            <textarea
              // biome-ignore lint/a11y/noAutofocus: the field opens on an explicit Add
              autoFocus
              rows={2}
              className={`${fieldClass} h-auto resize-y py-2 leading-relaxed`}
              value={adding}
              onChange={(e) => onAddText(e.target.value)}
            />
          </label>
          <div className="flex items-center gap-1.5">
            <Button size="sm" disabled={!adding.trim()} onClick={onAddSave}>
              Add to {role.employer ?? 'this role'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onAddCancel}>
              Cancel
            </Button>
            <span className="text-muted-foreground ml-auto text-[11.5px]">
              Stored as you write it
            </span>
          </div>
        </Panel>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          className="text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-1.5 rounded-md border-0 bg-transparent px-0.5 py-1.5 text-[13px]"
        >
          <PlusIcon className="size-3.5" /> Bullet
        </button>
      )}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-1.5 flex flex-col gap-3 rounded-xl bg-background p-3.5 shadow-[0_0_0_1px_var(--color-border),0_6px_16px_-8px_rgba(24,24,27,0.12)]">
      {children}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground grid size-[26px] place-items-center rounded-md border-0 bg-transparent hover:bg-background hover:shadow-[0_0_0_1px_var(--color-border)] [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="text-muted-foreground rounded border border-b-2 border-border bg-background px-1 font-mono text-[10.5px]">
      {children}
    </kbd>
  );
}

function SaveState({ state }: { state: Save }) {
  const ink = state === 'error' ? 'var(--color-error)' : 'var(--color-text-tertiary)';
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12px]"
      style={{ color: ink }}
      aria-live="polite"
    >
      <i
        className="size-1.5 rounded-full"
        style={{
          background:
            state === 'saved'
              ? '#16a34a'
              : state === 'saving'
                ? 'var(--color-text-tertiary)'
                : 'var(--color-error)',
        }}
      />
      {state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving' : 'Not saved'}
    </span>
  );
}
