import type { CvTemplate } from '@jlog/shared';
import { useLayoutEffect, useRef, useState } from 'react';
import type { CvProfile } from '../../lib/cvProfile';
import type { SectionDraft } from './profileParts';

/** A4's height over its width, which is exactly root two. */
const A4 = Math.SQRT2;
const PAGE_WIDTH = 640;
const PAGE_HEIGHT = PAGE_WIDTH * A4;
const PAD_Y = 52;

export type PreviewRole = {
  id: string;
  title: string | null;
  employer: string | null;
  dates: string | null;
  bullets: { id: string; text: string }[];
};

interface Props {
  profile: CvProfile;
  sections: SectionDraft[];
  roles: PreviewRole[];
  template: CvTemplate;
  selected: string | null;
  hot: string | null;
  onSelect: (id: string) => void;
  onHot: (id: string | null) => void;
  onPages?: (pages: number) => void;
}

/**
 * How each design is drawn here. Taken from what the six moderncv styles do
 * that a reader notices first: where the name sits, how a section is marked,
 * whether dates get their own column, the type and the one colour. Close to
 * the real output, not identical: the PDF is LaTeX, and the gallery shows each
 * design's real render.
 */
type Look = {
  font: string;
  size: number;
  accent: string;
  header: 'left' | 'center';
  heading: 'rule' | 'bar' | 'centered' | 'caps' | 'plain';
  datesColumn: boolean;
  nameStyle: React.CSSProperties;
};

const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const LOOKS: Record<CvTemplate, Look> = {
  classic: {
    font: SANS,
    size: 10.6,
    accent: '#3873b3',
    header: 'left',
    heading: 'bar',
    datesColumn: true,
    nameStyle: { fontSize: 30, fontWeight: 400, letterSpacing: '-0.01em' },
  },
  banking: {
    font: SANS,
    size: 10.6,
    accent: '#253c6c',
    header: 'center',
    heading: 'centered',
    datesColumn: false,
    nameStyle: { fontSize: 24, fontWeight: 700, letterSpacing: '0.02em' },
  },
  casual: {
    font: SANS,
    size: 10.8,
    accent: '#3873b3',
    header: 'left',
    heading: 'bar',
    datesColumn: true,
    nameStyle: { fontSize: 34, fontWeight: 300, color: '#3873b3' },
  },
  oldstyle: {
    font: SERIF,
    size: 11.2,
    accent: '#5b4636',
    header: 'left',
    heading: 'caps',
    datesColumn: true,
    nameStyle: { fontSize: 26, fontWeight: 400, fontStyle: 'italic' },
  },
  fancy: {
    font: SANS,
    size: 10.6,
    accent: '#a33a3a',
    header: 'center',
    heading: 'centered',
    datesColumn: true,
    nameStyle: { fontSize: 28, fontWeight: 700, color: '#a33a3a' },
  },
  plain: {
    font: SANS,
    size: 10.4,
    accent: '#18181b',
    header: 'left',
    heading: 'plain',
    datesColumn: false,
    nameStyle: { fontSize: 20, fontWeight: 700 },
  },
};

/**
 * The CV as pages, beside the editor that writes it. Shows a real CV — the one
 * most recently tailored, or the imported one's layout — rather than every
 * stored fact. Lines are linked to the editor: hover either and both light up;
 * click one here to select it there.
 */
export function CvPreview({
  profile,
  sections,
  roles,
  template,
  selected,
  hot,
  onSelect,
  onHot,
  onPages,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(PAGE_HEIGHT);
  const look = LOOKS[template] ?? LOOKS.classic;

  // Fit the page width to the panel. The height is the content's, broken into
  // A4 pages below, so a long CV shows as two pages rather than spilling out.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => setScale(Math.max(0.4, Math.min(1, (stage.clientWidth - 64) / PAGE_WIDTH)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // Measured on the content, not the page: the page's height is set from this,
  // so measuring the page would never let a two page CV shrink back to one.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      const h = content.offsetHeight + PAD_Y * 2;
      const pages = Math.max(1, Math.ceil(h / PAGE_HEIGHT));
      setHeight(pages * PAGE_HEIGHT);
      onPages?.(pages);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    return () => ro.disconnect();
  }, [onPages]);

  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Your name';
  const contact = [profile.title, profile.address, profile.email, profile.homepage].filter(Boolean);
  const filled = sections.filter((s) => s.heading.trim() && s.items.some((i) => i.left || i.right));
  const pages = Math.round(height / PAGE_HEIGHT);
  const dateCol = look.datesColumn ? '22%' : null;

  return (
    <div
      ref={stageRef}
      className="flex min-h-0 flex-1 justify-center overflow-auto px-8 py-8"
      onMouseLeave={() => onHot(null)}
    >
      <div style={{ width: PAGE_WIDTH * scale, height: height * scale, flex: 'none' }}>
        <article
          aria-label="Preview of your CV"
          className="relative bg-[var(--color-paper)] text-[var(--color-paper-ink)] shadow-[0_0_0_0.5px_rgba(24,24,27,0.08),0_1px_2px_rgba(24,24,27,0.05),0_16px_40px_-8px_rgba(24,24,27,0.14)]"
          style={{
            width: PAGE_WIDTH,
            minHeight: height,
            padding: `${PAD_Y}px 56px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            fontFamily: look.font,
            fontSize: look.size,
            lineHeight: 1.5,
          }}
        >
          {/* Where one A4 page ends and the next begins. */}
          {Array.from({ length: pages - 1 }, (_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: page breaks are positional
              key={i}
              aria-hidden="true"
              className="pointer-events-none absolute right-0 left-0 border-t border-dashed border-zinc-300"
              style={{ top: (i + 1) * PAGE_HEIGHT }}
            >
              <span className="absolute -top-2.5 right-3 bg-[var(--color-paper)] px-1.5 font-mono text-[9px] text-zinc-400">
                page {i + 2}
              </span>
            </div>
          ))}

          <div ref={contentRef}>
            <header style={{ textAlign: look.header }}>
              <div style={look.nameStyle}>{name}</div>
              {contact.length > 0 && (
                <div style={{ marginTop: 4, color: '#6b6b70', fontSize: look.size - 0.4 }}>
                  {contact.join(look.header === 'center' ? '  ·  ' : ' · ')}
                </div>
              )}
            </header>
            {profile.summary.trim() && (
              <p
                style={{ margin: '16px 0 0', paddingLeft: dateCol ? `calc(${dateCol} + 12px)` : 0 }}
              >
                {profile.summary}
              </p>
            )}

            {roles.length > 0 && <Heading look={look}>Experience</Heading>}
            {roles.map((role) => (
              <section key={role.id} aria-label={role.employer ?? 'Role'} style={{ marginTop: 10 }}>
                <Entry
                  look={look}
                  dateCol={dateCol}
                  dates={role.dates}
                  title={
                    <>
                      <b style={{ fontWeight: 700 }}>{role.title ?? 'Role'}</b>
                      {role.employer ? (
                        <span style={{ fontStyle: look.heading === 'caps' ? 'italic' : 'normal' }}>
                          , {role.employer}
                        </span>
                      ) : null}
                    </>
                  }
                >
                  <ul style={{ margin: '3px 0 0', padding: 0, listStyle: 'none' }}>
                    {role.bullets.map((b) => (
                      <li key={b.id} style={{ display: 'flex', gap: 7, margin: '1.5px 0' }}>
                        <span aria-hidden="true" style={{ color: look.accent, flex: 'none' }}>
                          •
                        </span>
                        <button
                          type="button"
                          onClick={() => onSelect(b.id)}
                          onMouseEnter={() => onHot(b.id)}
                          // Plain text, keeping the global focus ring.
                          className="m-0 min-w-0 cursor-pointer appearance-none rounded-[3px] border-0 p-0 text-left text-inherit [font:inherit] transition-[background,box-shadow] duration-200"
                          style={{
                            background:
                              selected === b.id
                                ? 'var(--color-accent-subtle)'
                                : hot === b.id
                                  ? 'rgba(37,99,235,0.06)'
                                  : 'transparent',
                            boxShadow:
                              selected === b.id
                                ? '0 0 0 3px var(--color-accent-subtle)'
                                : hot === b.id
                                  ? '0 0 0 3px rgba(37,99,235,0.06)'
                                  : 'none',
                          }}
                        >
                          {b.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Entry>
              </section>
            ))}

            {filled.map((s) => (
              <section key={s.id} aria-label={s.heading}>
                <Heading look={look}>{s.heading}</Heading>
                <div style={{ marginTop: 6 }}>
                  {s.items.map((i) => (
                    <Entry key={i.id} look={look} dateCol={dateCol} dates={null} label={i.left}>
                      <span>
                        {look.datesColumn ? i.right : `${i.left ? `${i.left}: ` : ''}${i.right}`}
                      </span>
                    </Entry>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}

/** A row: dates (or a label) in the left column when the design has one, content beside it. */
function Entry({
  look,
  dateCol,
  dates,
  label,
  title,
  children,
}: {
  look: Look;
  dateCol: string | null;
  dates: string | null;
  label?: string;
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  const when = dates?.replace(/--/g, ' – ') ?? null;
  if (dateCol) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `${dateCol} 1fr`, columnGap: 12 }}>
        <div
          style={{
            textAlign: 'right',
            color: '#6b6b70',
            fontStyle: look.heading === 'caps' ? 'italic' : 'normal',
          }}
        >
          {when ?? label}
        </div>
        <div>
          {title && <div>{title}</div>}
          {children}
        </div>
      </div>
    );
  }
  return (
    <div>
      {title && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{title}</span>
          {when && <span style={{ color: '#6b6b70' }}>{when}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

function Heading({ look, children }: { look: Look; children: React.ReactNode }) {
  const base: React.CSSProperties = {
    margin: '18px 0 0',
    fontWeight: 600,
    fontSize: look.size + 2,
  };
  switch (look.heading) {
    case 'bar':
      // moderncv's classic and casual: a coloured bar in the date column, the title beside it.
      return (
        <h3
          style={{
            ...base,
            display: 'grid',
            gridTemplateColumns: '22% 1fr',
            columnGap: 12,
            alignItems: 'center',
            color: look.accent,
            fontWeight: 400,
            fontSize: look.size + 4,
          }}
        >
          <span style={{ height: 6, background: look.accent, opacity: 0.85 }} />
          <span>{children}</span>
        </h3>
      );
    case 'centered':
      return (
        <h3
          style={{
            ...base,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: look.accent,
            fontSize: look.size + 1.5,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ flex: 1, height: 1, background: look.accent, opacity: 0.5 }} />
          {children}
          <span style={{ flex: 1, height: 1, background: look.accent, opacity: 0.5 }} />
        </h3>
      );
    case 'caps':
      return (
        <h3
          style={{
            ...base,
            fontVariant: 'small-caps',
            letterSpacing: '0.06em',
            color: look.accent,
            borderBottom: `0.6px solid ${look.accent}`,
            paddingBottom: 2,
          }}
        >
          {children}
        </h3>
      );
    default:
      // Plain: what applicant tracking systems parse best. Bold, uppercase, no rules, no colour.
      return (
        <h3
          style={{
            ...base,
            fontWeight: 700,
            fontSize: look.size + 0.6,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {children}
        </h3>
      );
  }
}
