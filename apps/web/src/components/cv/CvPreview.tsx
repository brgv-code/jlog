import { useLayoutEffect, useRef, useState } from 'react';
import type { CvProfile } from '../../lib/cvProfile';
import type { StoredRole } from '../../lib/facts';
import type { SectionDraft } from './profileParts';

/** A4's height over its width, which is exactly root two. */
const A4 = Math.SQRT2;
const PAGE_WIDTH = 640;

interface Props {
  profile: CvProfile;
  sections: SectionDraft[];
  roles: StoredRole[];
  selected: string | null;
  hot: string | null;
  onSelect: (id: string) => void;
  onHot: (id: string | null) => void;
}

/**
 * The base CV as a page, beside the editor that writes it.
 *
 * A layout preview, not the compiled PDF: the real document is LaTeX in one of
 * six moderncv designs, and a browser cannot render those. What this shows is
 * true to the content and its order, which is what is being edited here; the
 * template gallery shows each design's real output.
 *
 * Lines are linked to the editor: hovering either lights both, and clicking a
 * line on the page selects it in the editor.
 */
export function CvPreview({ profile, sections, roles, selected, hot, onSelect, onHot }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  // Fit the whole page in view: a CV is judged as a page, and a preview that
  // has to be scrolled to see its bottom half hides the thing being judged.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const z = Math.min(
        1,
        (stage.clientHeight - 64) / (PAGE_WIDTH * A4),
        (stage.clientWidth - 64) / PAGE_WIDTH,
      );
      setZoom(Math.max(0.3, z));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Your name';
  const contact = [profile.title, profile.address, profile.email, profile.homepage].filter(Boolean);
  const filled = sections.filter((s) => s.heading.trim() && s.items.some((i) => i.left || i.right));

  return (
    <div
      ref={stageRef}
      className="flex min-h-0 flex-1 justify-center overflow-auto p-8"
      onMouseLeave={() => onHot(null)}
    >
      <article
        aria-label="Preview of your CV"
        className="shrink-0 rounded-[2px] bg-[var(--color-paper)] text-[var(--color-paper-ink)] shadow-[0_0_0_0.5px_rgba(24,24,27,0.08),0_1px_2px_rgba(24,24,27,0.05),0_16px_40px_-8px_rgba(24,24,27,0.14)]"
        style={{
          width: PAGE_WIDTH,
          minHeight: PAGE_WIDTH * A4,
          padding: '58px 62px',
          zoom,
          fontFamily: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
          fontSize: 11.4,
          lineHeight: 1.5,
        }}
      >
        <header className="text-center">
          <div style={{ fontSize: 25, fontWeight: 600 }}>{name}</div>
          {contact.length > 0 && (
            <div className="mt-[3px]" style={{ color: '#57534e' }}>
              {contact.join(' · ')}
            </div>
          )}
        </header>
        {profile.summary.trim() && <p className="mt-4 mb-0">{profile.summary}</p>}

        {roles.length > 0 && <PageHeading>Experience</PageHeading>}
        {roles.map((role) => (
          <section key={role.id} aria-label={role.employer ?? 'Role'}>
            <div className="mt-[11px] flex justify-between gap-3">
              <span>
                <b style={{ fontWeight: 600 }}>{role.roleTitle ?? 'Role'}</b>
                {role.employer ? `, ${role.employer}` : ''}
              </span>
              {role.dates && <span>{role.dates.replace(/--/g, ' – ')}</span>}
            </div>
            <ul className="mt-1 mb-0 pl-[15px]" style={{ listStyle: 'disc' }}>
              {role.bullets.map((b) => {
                const on = selected === b.id;
                const lit = hot === b.id;
                return (
                  <li key={b.id} className="my-[1.5px]">
                    <button
                      type="button"
                      onClick={() => onSelect(b.id)}
                      onMouseEnter={() => onHot(b.id)}
                      // Reset to plain text, keeping the global focus ring.
                      className="m-0 cursor-pointer appearance-none rounded-[3px] border-0 p-0 text-left text-inherit [font:inherit] transition-[background,box-shadow] duration-200"
                      style={{
                        background: on
                          ? 'var(--color-accent-subtle)'
                          : lit
                            ? 'rgba(37,99,235,0.06)'
                            : 'transparent',
                        boxShadow: on
                          ? '0 0 0 3px var(--color-accent-subtle)'
                          : lit
                            ? '0 0 0 3px rgba(37,99,235,0.06)'
                            : 'none',
                      }}
                    >
                      {b.text}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {filled.map((s) => (
          <section key={s.id} aria-label={s.heading}>
            <PageHeading>{s.heading}</PageHeading>
            <div className="mt-[7px] grid gap-y-0.5" style={{ gridTemplateColumns: 'auto 1fr' }}>
              {s.items.map((i) => (
                <div key={i.id} className="contents">
                  <b style={{ fontWeight: 600, paddingRight: 12 }}>{i.left}</b>
                  <span>{i.right}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </article>
    </div>
  );
}

function PageHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mt-[18px] mb-0 pb-[3px]"
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        borderBottom: '0.6px solid var(--color-paper-ink)',
      }}
    >
      {children}
    </h3>
  );
}
