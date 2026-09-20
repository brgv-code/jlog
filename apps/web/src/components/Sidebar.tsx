import {
  BookOpenIcon,
  BriefcaseIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  FileUserIcon,
  HomeIcon,
  LogOutIcon,
  PanelLeftIcon,
  SettingsIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ThemeSegmented } from './ui/ThemeSegmented';

const COLLAPSED_KEY = 'jlog_sidebar_collapsed';
const DOCS_URL = 'https://github.com/brgv-code/jlog#readme';

export type NavKey = 'home' | 'applications' | 'cv' | 'settings';

interface NavItem {
  key: NavKey | 'docs';
  label: string;
  href: string;
  Icon: typeof BriefcaseIcon;
  /** Rule 3: the sidebar should not be a column of identical grey glyphs. */
  tone: string;
  external?: boolean;
}

const NAV: NavItem[] = [
  {
    key: 'home',
    label: 'Home',
    href: '/dashboard',
    Icon: HomeIcon,
    tone: 'var(--color-icon-home)',
  },
  {
    key: 'applications',
    label: 'Applications',
    href: '/applications',
    Icon: BriefcaseIcon,
    tone: 'var(--color-icon-applications)',
  },
  {
    key: 'cv',
    label: 'CV',
    href: '/cv',
    Icon: FileUserIcon,
    tone: 'var(--color-icon-cv)',
  },
  {
    key: 'settings',
    label: 'Settings',
    href: '/settings',
    Icon: SettingsIcon,
    tone: 'var(--color-icon-settings)',
  },
  {
    key: 'docs',
    label: 'Documentation',
    href: DOCS_URL,
    Icon: BookOpenIcon,
    tone: 'var(--color-icon-docs)',
    external: true,
  },
];

interface User {
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface SidebarProps {
  user: User;
  active: NavKey;
  onSignOut: () => void;
}

/**
 * The left rail.
 *
 * jlog used to hang everything off a top bar, which meant the account, the
 * primary action and the navigation all competed for one horizontal strip. A
 * rail gives navigation a permanent home and hands the whole page width back
 * to the thing being read, which for a text-dense app is the point.
 *
 * Collapsed, it keeps the same order and vertical positions as expanded, so the
 * icon rail is the same muscle memory rather than a second layout to learn.
 */
export function Sidebar({ user, active, onSignOut }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
  }, []);

  useEffect(() => {
    if (!accountOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setAccountOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountOpen]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }

  const width = collapsed ? 56 : 232;

  return (
    <aside
      style={{
        width,
        flexShrink: 0,
        height: '100vh',
        position: 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        transition: 'width var(--transition-base)',
      }}
    >
      {/* Wordmark */}
      <div
        style={{
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? 0 : '0 var(--space-3) 0 var(--space-4)',
          flexShrink: 0,
        }}
      >
        {!collapsed && (
          <a
            href="/dashboard"
            style={{
              fontWeight: 600,
              fontSize: 'var(--text-sm)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-primary)',
              textDecoration: 'none',
            }}
          >
            jlog
          </a>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            background: 'none',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-tertiary)',
            cursor: 'pointer',
          }}
        >
          <PanelLeftIcon size={16} strokeWidth={1.75} />
        </button>
      </div>

      {/* Nav */}
      <nav
        style={{
          padding: `0 ${collapsed ? '8px' : 'var(--space-2)'}`,
          display: 'grid',
          gap: '2px',
        }}
      >
        {NAV.map(({ key, label, href, Icon, tone, external }) => {
          const isActive = key === active;
          return (
            <a
              key={key}
              href={href}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                height: '34px',
                padding: collapsed ? 0 : '0 var(--space-3)',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 'var(--radius-md)',
                backgroundColor: isActive ? 'var(--color-surface-active)' : 'transparent',
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                fontSize: 'var(--text-sm)',
                fontWeight: isActive ? 500 : 400,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              <Icon size={16} strokeWidth={1.75} style={{ color: tone, flexShrink: 0 }} />
              {!collapsed && (
                <>
                  <span style={{ flex: 1 }}>{label}</span>
                  {external && (
                    <ExternalLinkIcon
                      size={13}
                      strokeWidth={1.75}
                      style={{ color: 'var(--color-text-tertiary)' }}
                    />
                  )}
                </>
              )}
            </a>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Account */}
      <div ref={accountRef} style={{ position: 'relative', padding: 'var(--space-2)' }}>
        {accountOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% - var(--space-1))',
              left: 'var(--space-2)',
              minWidth: '232px',
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              padding: 'var(--space-3)',
              display: 'grid',
              gap: 'var(--space-3)',
              zIndex: 40,
            }}
          >
            <div style={{ display: 'grid', gap: '2px' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{user.name}</span>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'var(--font-mono)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.email}
              </span>
            </div>
            <ThemeSegmented compact />
            <button
              type="button"
              onClick={onSignOut}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                background: 'none',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-sans)',
                padding: 'var(--space-2)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <LogOutIcon size={14} strokeWidth={1.75} />
              Sign out
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setAccountOpen((o) => !o)}
          aria-expanded={accountOpen}
          aria-haspopup="menu"
          title={collapsed ? user.name : undefined}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            justifyContent: collapsed ? 'center' : 'flex-start',
            background: 'none',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: collapsed ? '6px 0' : 'var(--space-2)',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            textAlign: 'left',
          }}
        >
          <Avatar user={user} />
          {!collapsed && (
            <>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user.name}
              </span>
              <ChevronUpIcon
                size={14}
                strokeWidth={1.75}
                style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}
              />
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function Avatar({ user }: { user: User }) {
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        width={26}
        height={26}
        style={{ borderRadius: '50%', display: 'block', flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      style={{
        width: '26px',
        height: '26px',
        borderRadius: '50%',
        flexShrink: 0,
        backgroundColor: 'var(--color-primary)',
        color: 'var(--color-primary-fg)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '11px',
        fontWeight: 600,
      }}
    >
      {user.name.charAt(0).toUpperCase()}
    </span>
  );
}
