export interface DetectedJob {
  company: string;
  role: string;
  location?: string;
  status?: 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn';
  notes?: string;
  jobDescription?: string;
  sourceUrl: string;
  sourceSite: string;
  appliedAt?: number;
  /**
   * The employer's logo as the board rendered it. Captured here because the
   * posting page is the only place the URL is reliably knowable — sourceUrl is
   * the job board, not the company. Cached server-side, once, for every user.
   */
  logoUrl?: string;
}

export interface ExtractedJob {
  company: string;
  role: string;
  location: string | null;
  confidence: number;
  /** Logo URL captured from the posting page, when the board exposes one. */
  logoUrl?: string;
}

// Messages between content scripts and background
export type ExtensionMessage =
  | { type: 'JOB_DETECTED'; job: DetectedJob }
  | { type: 'EXTRACT_REQUEST'; text: string; url: string }
  | { type: 'EXTRACT_RESPONSE'; job: ExtractedJob | null; error?: string }
  | { type: 'SAVE_JOB'; job: DetectedJob }
  | { type: 'SAVE_RESULT'; ok: boolean; error?: string };
