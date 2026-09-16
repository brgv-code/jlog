import { ArrowRightIcon, SparklesIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type CvProfile, EMPTY_PROFILE, isProfileUsable, loadCvProfile } from '../../lib/cvProfile';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { TailorCvDialog } from './TailorCvDialog';

interface Props {
  applicationId: string;
  company: string;
  role: string;
  jobDescription: string | null;
}

/**
 * The entry point for tailoring, on the application it tailors for.
 *
 * Both blockers are stated as the specific missing thing with the action that
 * fixes it. A disabled button with no reason is the worst version of this: the
 * user can see the feature and cannot find out why it will not run.
 */
export function TailorCvCard({ applicationId, company, role, jobDescription }: Props) {
  const [open, setOpen] = useState(false);
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

  return (
    <>
      <Card className="mb-6 overflow-hidden border-border/80">
        {/* A single hairline of accent — enough to mark this as the primary
            action on the page without turning the card into a banner. */}
        {ready && (
          <div className="h-px w-full bg-gradient-to-r from-primary via-primary/40 to-transparent" />
        )}
        <CardContent className="flex items-center gap-4 pt-4">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">Tailor your CV</p>
            <p className="text-muted-foreground mt-0.5 text-[13px] leading-relaxed">
              {blocker
                ? blocker.text
                : 'Match your stored facts against this posting and compile a PDF.'}
            </p>
          </div>
          {blocker?.href ? (
            <Button variant="outline" size="sm" asChild>
              <a href={blocker.href}>
                Settings <ArrowRightIcon />
              </a>
            </Button>
          ) : (
            <Button
              size="sm"
              variant={ready ? 'default' : 'secondary'}
              disabled={!ready}
              onClick={() => setOpen(true)}
            >
              <SparklesIcon /> Tailor
            </Button>
          )}
        </CardContent>
      </Card>

      {ready && profile && (
        <TailorCvDialog
          open={open}
          onOpenChange={setOpen}
          applicationId={applicationId}
          company={company}
          role={role}
          jobDescription={jobDescription ?? ''}
          profile={profile}
        />
      )}
    </>
  );
}
