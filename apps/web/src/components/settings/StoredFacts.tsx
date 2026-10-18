import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  FACTS_CHANGED,
  type StoredFacts as Facts,
  ORIGIN_LABELS,
  type StoredBullet,
  type StoredRole,
  archivedCount,
  loadStoredFacts,
  sortRoles,
  updateFact,
} from '../../lib/facts';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';

const inputClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] leading-relaxed text-foreground outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/25';

/**
 * Your experience, as stored: the roles and bullets every tailored CV is
 * selected from, each marked with where it came from. Archive what is not
 * true or not wanted, and correct a bullet's wording, here rather than by
 * re-importing.
 */
export function StoredFacts() {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      loadStoredFacts().then((next) => {
        if (next) setFacts(next);
        else setError('Could not load your stored experience.');
      });
    load();
    window.addEventListener(FACTS_CHANGED, load);
    return () => window.removeEventListener(FACTS_CHANGED, load);
  }, []);

  async function change(id: string, patch: { status?: 'active' | 'archived'; canonical?: string }) {
    setBusy(id);
    setError(null);
    const ok = await updateFact(id, patch);
    setBusy(null);
    if (!ok) {
      setError('That change was not saved. Try again.');
      return false;
    }
    const next = await loadStoredFacts();
    if (next) setFacts(next);
    return true;
  }

  if (!facts) {
    return error ? <p className="text-destructive text-[13px]">{error}</p> : null;
  }

  const hidden = archivedCount(facts);
  const roles = sortRoles(facts.roles).filter((r) => showArchived || r.status === 'active');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your experience</CardTitle>
        <CardDescription>
          What tailored CVs are built from. Each line says where it came from: lines from older
          applications may have been written by an AI, so check them. Archive anything that is not
          true or that you do not want used; edit a line to correct its wording.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && <p className="text-destructive text-[13px]">{error}</p>}
        {roles.length === 0 && (
          <p className="text-muted-foreground text-[13px]">
            Nothing stored yet. Import your CV above to add your experience.
          </p>
        )}
        {roles.map((role, i) => (
          <div key={role.id} className="space-y-2">
            {i > 0 && <Separator />}
            <RoleHeader
              role={role}
              busy={busy === role.id}
              onToggle={() =>
                change(role.id, { status: role.status === 'active' ? 'archived' : 'active' })
              }
            />
            {role.status === 'active' && (
              <ul className="space-y-1.5">
                {role.bullets
                  .filter((b) => showArchived || b.status === 'active')
                  .map((bullet) => (
                    <BulletRow
                      key={bullet.id}
                      bullet={bullet}
                      busy={busy === bullet.id}
                      editing={editing?.id === bullet.id ? editing.text : null}
                      onEdit={(text) => setEditing({ id: bullet.id, text })}
                      onCancel={() => setEditing(null)}
                      onSave={async (text) => {
                        if (await change(bullet.id, { canonical: text })) setEditing(null);
                      }}
                      onToggle={() =>
                        change(bullet.id, {
                          status: bullet.status === 'active' ? 'archived' : 'active',
                        })
                      }
                    />
                  ))}
              </ul>
            )}
          </div>
        ))}
        {hidden > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide archived' : `Show archived (${hidden})`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function RoleHeader({
  role,
  busy,
  onToggle,
}: {
  role: StoredRole;
  busy: boolean;
  onToggle: () => void;
}) {
  const archived = role.status === 'archived';
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={`text-[13px] font-medium ${archived ? 'text-muted-foreground line-through' : ''}`}
      >
        {role.roleTitle || 'Role'}
      </span>
      <span className="text-muted-foreground text-[13px]">
        at {role.employer || 'unknown employer'}
      </span>
      {role.dates && <span className="text-muted-foreground/70 text-[12px]">{role.dates}</span>}
      {role.origin === 'history' && <Badge variant="warning">{ORIGIN_LABELS.history}</Badge>}
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto"
        disabled={busy}
        onClick={onToggle}
        aria-label={
          archived ? `Restore ${role.employer ?? 'role'}` : `Archive ${role.employer ?? 'role'}`
        }
      >
        {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
        {archived ? 'Restore role' : 'Archive role'}
      </Button>
    </div>
  );
}

function BulletRow({
  bullet,
  busy,
  editing,
  onEdit,
  onCancel,
  onSave,
  onToggle,
}: {
  bullet: StoredBullet;
  busy: boolean;
  editing: string | null;
  onEdit: (text: string) => void;
  onCancel: () => void;
  onSave: (text: string) => void;
  onToggle: () => void;
}) {
  const archived = bullet.status === 'archived';
  if (editing !== null) {
    return (
      <li className="space-y-2">
        <textarea
          aria-label="Bullet text"
          className={`${inputClass} h-20 resize-y`}
          value={editing}
          onChange={(e) => onEdit(e.target.value)}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={busy || !editing.trim()}
            onClick={() => onSave(editing.trim())}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <span className="text-muted-foreground self-center text-[12px]">
            Older wordings of this line are removed, so tailoring uses yours.
          </span>
        </div>
      </li>
    );
  }
  return (
    <li className="group flex items-start gap-2">
      <span
        className={`flex-1 text-[13px] leading-relaxed ${archived ? 'text-muted-foreground line-through' : ''}`}
      >
        {bullet.text}
      </span>
      {bullet.origin !== 'cv' && (
        <Badge variant={bullet.origin === 'history' ? 'warning' : 'info'}>
          {ORIGIN_LABELS[bullet.origin]}
        </Badge>
      )}
      {!archived && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onEdit(bullet.text)}
          aria-label="Edit"
        >
          <PencilIcon />
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={onToggle}
        aria-label={archived ? 'Restore' : 'Archive'}
      >
        {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
      </Button>
    </li>
  );
}
