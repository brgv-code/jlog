import type { DetectedJob } from '../types';

export interface SiteDetector {
  matches: string[];
  detect: () => DetectedJob | null;
  watchForApply: (cb: (job: DetectedJob) => void) => () => void;
}
