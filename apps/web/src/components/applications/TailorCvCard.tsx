import { ArrowRightIcon, SparklesIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type CvProfile, EMPTY_PROFILE, isProfileUsable, loadCvProfile } from '../../lib/cvProfile';
import { Button } from '../ui/button';

interface Props {
  applicationId: string;
  jobDescription: string | null;
}

/**
 * The entry point for tailoring, on the application it tailors for.
 *
 * Both blockers are stated as the specific missing thing with the action that
 * fixes it. A disabled button with no reason is the worst version of this: the
 * user can see the feature and cannot find out why it will not run.
 */
export function TailorCvCard({ applicationId, jobDescription }: Props) {
  const [profile, setProfile] = useState<CvProfile | null>(null);

  // Fetched rather than read locally, and only in an effect: there is no
  // session during Astro's SSR pass.
  useEffect(() => {
    loadCvProfile()
      .then(setProfile)
      .catch(() => setProfile(EMPTY_PROFILE));
  }, []);

  const hasJd = (jobDescription ?? '').trim().length > 0;
  const hasProfile = profile !== null && isProfileUsable(profile);
  const ready = hasJd && hasProfile;

  const blocker = !hasJd
    ? { text: 'Add a job description below to tailor against it.', href: null }
    : !hasProfile
      ? { text: 'Add your name and contact details to build a CV header.', href: '/settings' }
      : null;

  /*
   * A section of the rail, not a card. The black button is the one loud thing
   * on the page (DESIGN.md), so it does not need a box and a gradient around it
   * to be found; full width, it reads as the rail's conclusion.
   */
  return (
    <>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <div>
          <p className="text-[13px] font-medium">Tailor your CV</p>
          <p className="text-muted-foreground mt-0.5 text-[13px] leading-relaxed">
            {blocker
              ? blocker.text
              : 'Match your stored facts against this posting and compile a PDF.'}
          </p>
        </div>
        {blocker?.href ? (
          <Button variant="outline" size="sm" className="w-full" asChild>
            <a href={blocker.href}>
              Settings <ArrowRightIcon />
            </a>
          </Button>
        ) : ready ? (
          // Tailoring is a page now (ADR-015); the rail only leads to it.
          <Button size="sm" className="w-full" asChild>
            <a href={`/applications/cv?id=${encodeURIComponent(applicationId)}`}>
              <SparklesIcon /> Tailor
            </a>
          </Button>
        ) : (
          <Button size="sm" className="w-full" variant="secondary" disabled>
            <SparklesIcon /> Tailor
          </Button>
        )}
      </div>
    </>
  );
}
