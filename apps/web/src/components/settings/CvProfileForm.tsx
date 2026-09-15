import { CheckIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  type CvProfile,
  type CvSection,
  EMPTY_PROFILE,
  loadCvProfile,
  saveCvProfile,
} from '../../lib/cvProfile';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';

type ItemDraft = { id: string; left: string; right: string };
type SectionDraft = { id: string; heading: string; items: ItemDraft[] };

const newId = () => crypto.randomUUID();

const toDrafts = (sections: CvSection[]): SectionDraft[] =>
  sections.map((s) => ({
    id: newId(),
    heading: s.heading,
    items: s.items.map((i) => ({ id: newId(), left: i.left, right: i.right })),
  }));

const fromDrafts = (drafts: SectionDraft[]): CvSection[] =>
  drafts.map((d) => ({
    heading: d.heading,
    items: d.items.map((i) => ({ left: i.left, right: i.right })),
  }));

const inputClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/25';

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </span>
      <input
        className={inputClass}
        value={value}
        placeholder={placeholder ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** Skills, Education and Languages are all label/value rows — one editor does all three. */
function SectionEditor({
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

export function CvProfileForm() {
  const [profile, setProfile] = useState<CvProfile>(EMPTY_PROFILE);
  const [sections, setSections] = useState<SectionDraft[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const loaded = loadCvProfile();
    setProfile(loaded);
    setSections(toDrafts(loaded.sections));
  }, []);

  function set<K extends keyof CvProfile>(key: K, value: CvProfile[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
    setSaved(false);
  }

  function editSections(next: SectionDraft[]) {
    setSections(next);
    setSaved(false);
  }

  function save() {
    saveCvProfile({ ...profile, sections: fromDrafts(sections) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>CV profile</CardTitle>
        <CardDescription>
          The parts of your CV that are not career claims — your header, and the skills, education
          and language blocks. Your experience bullets come from your stored facts and are chosen
          per application.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="First name"
            value={profile.firstName}
            onChange={(v) => set('firstName', v)}
          />
          <Field label="Last name" value={profile.lastName} onChange={(v) => set('lastName', v)} />
          <Field
            label="Title"
            value={profile.title}
            onChange={(v) => set('title', v)}
            placeholder="Full-Stack Engineer"
          />
          <Field
            label="Location"
            value={profile.address}
            onChange={(v) => set('address', v)}
            placeholder="Berlin, Germany"
          />
          <Field label="Email" value={profile.email} onChange={(v) => set('email', v)} />
          <Field
            label="Homepage"
            value={profile.homepage}
            onChange={(v) => set('homepage', v)}
            placeholder="bhargav.dev"
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            Summary
          </span>
          <textarea
            className={`${inputClass} h-24 resize-y py-2 leading-relaxed`}
            value={profile.summary}
            onChange={(e) => set('summary', e.target.value)}
          />
        </label>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              Sections
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                editSections([
                  ...sections,
                  { id: newId(), heading: '', items: [{ id: newId(), left: '', right: '' }] },
                ])
              }
            >
              <PlusIcon /> Section
            </Button>
          </div>
          {sections.map((section) => (
            <SectionEditor
              key={section.id}
              section={section}
              onChange={(next) => editSections(sections.map((x) => (x.id === next.id ? next : x)))}
              onRemove={() => editSections(sections.filter((x) => x.id !== section.id))}
            />
          ))}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button size="sm" onClick={save}>
            {saved ? <CheckIcon /> : null}
            {saved ? 'Saved' : 'Save profile'}
          </Button>
          <span className="text-muted-foreground text-xs">Stored in this browser.</span>
        </div>
      </CardContent>
    </Card>
  );
}
