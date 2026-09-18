import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  type ThemeChoice,
  applyThemeChoice,
  readThemeChoice,
  resolveTheme,
  watchSystemTheme,
} from '../../lib/theme';

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: MonitorIcon },
];

interface ThemeSegmentedProps {
  /** Icon-only, for the cramped account popover. */
  compact?: boolean;
}

/**
 * One theme control, rendered in both places someone looks for it: the account
 * popover and Settings → Appearance. Same component, so the two cannot drift
 * and there is nothing to hunt for.
 */
export function ThemeSegmented({ compact = false }: ThemeSegmentedProps) {
  const [choice, setChoice] = useState<ThemeChoice>('system');

  useEffect(() => {
    setChoice(readThemeChoice());
  }, []);

  // Only matters while "system" is selected, but subscribing unconditionally
  // keeps the effect free of a dependency that would resubscribe on every pick.
  useEffect(
    () =>
      watchSystemTheme(() => {
        if (readThemeChoice() === 'system') applyThemeChoice('system');
      }),
    [],
  );

  function pick(next: ThemeChoice) {
    setChoice(next);
    applyThemeChoice(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      style={{
        display: 'inline-flex',
        // inline-flex is not enough inside a grid, where an item stretches to
        // the track by default — which sprayed the control across the whole
        // account popover.
        justifySelf: 'start',
        width: 'fit-content',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      {OPTIONS.map(({ value, label, Icon }, i) => {
        const active = value === choice;
        return (
          // A real radio, visually hidden. A row of <button role="radio"> looks
          // identical and reads the same to a screen reader, but loses arrow-key
          // navigation within the group, which is the whole point of a radiogroup.
          <label
            key={value}
            title={label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              background: active ? 'var(--color-accent-subtle)' : 'transparent',
              borderLeft: i === 0 ? 'none' : '1px solid var(--color-border)',
              color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              fontSize: 'var(--text-sm)',
              padding: compact ? '6px 10px' : '7px 14px',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="jlog-theme"
              value={value}
              checked={active}
              onChange={() => pick(value)}
              style={{
                position: 'absolute',
                width: '1px',
                height: '1px',
                opacity: 0,
                pointerEvents: 'none',
              }}
            />
            <Icon size={14} strokeWidth={1.75} />
            {compact ? <span className="sr-only">{label}</span> : label}
          </label>
        );
      })}
    </div>
  );
}

/** The theme actually in effect, for anything that has to branch on it. */
export function useResolvedTheme() {
  const [theme, setTheme] = useState(() => resolveTheme(readThemeChoice()));
  useEffect(() => {
    const sync = () => setTheme(resolveTheme(readThemeChoice()));
    sync();
    return watchSystemTheme(sync);
  }, []);
  return theme;
}
