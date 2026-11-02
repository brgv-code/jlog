import { useEffect, useState } from 'react';
import {
  CONSENT_OPEN,
  type Consent,
  analyticsAvailable,
  setConsent,
  startAnalytics,
  storedConsent,
} from '../lib/analytics';
import { Button } from './ui/button';

/** Asks once per browser, and again whenever Settings or the footer reopens it. */
export function ConsentBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!analyticsAvailable) return;
    startAnalytics();
    setOpen(storedConsent() === null);
    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_OPEN, reopen);
    return () => window.removeEventListener(CONSENT_OPEN, reopen);
  }, []);

  if (!open) return null;

  function choose(consent: Consent) {
    setConsent(consent);
    setOpen(false);
  }

  return (
    <section
      aria-label="Cookie choice"
      className="fixed inset-x-4 bottom-4 z-50 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-border bg-card px-4 py-3 text-card-foreground shadow-lg sm:left-6 sm:right-auto sm:max-w-md"
    >
      <p className="text-[13px]">
        🍪 Cookies? They help us find bugs, not you.{' '}
        {/* The details live behind this link, so the question itself can stay one line. */}
        <a
          href="/privacy/#analytics"
          className="text-muted-foreground underline underline-offset-2"
        >
          Privacy
        </a>
      </p>
      {/* Same weight for both answers: declining should be as easy as accepting. */}
      <div className="ml-auto flex gap-2">
        <Button variant="outline" size="sm" onClick={() => choose('denied')}>
          No
        </Button>
        <Button variant="outline" size="sm" onClick={() => choose('granted')}>
          Yes
        </Button>
      </div>
    </section>
  );
}
