import { useEffect } from 'react';

const SUFFIX = ' · jlog';

/**
 * Keeps the tab title in step with what the page is showing.
 *
 * The app pages are static shells whose content arrives after load, so the
 * title the server rendered ("Applications · jlog") can only name the page, not
 * what is on it. This sets the richer one once the data is here: the open
 * application, or the list's filter and count. `null` leaves the rendered title
 * alone, which is also what a crawler and a first paint see.
 */
export function usePageTitle(title: string | null): void {
  useEffect(() => {
    if (title) document.title = `${title}${SUFFIX}`;
  }, [title]);
}
