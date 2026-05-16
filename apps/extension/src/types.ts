export interface DetectedJob {
  company: string;
  role: string;
  location?: string;
  sourceUrl: string;
  sourceSite: string;
  appliedAt?: number;
}

export interface ExtractedJob {
  company: string;
  role: string;
  location: string | null;
  confidence: number;
}

// Messages between content scripts and background
export type ExtensionMessage =
  | { type: 'JOB_DETECTED'; job: DetectedJob }
  | { type: 'EXTRACT_REQUEST'; text: string; url: string }
  | { type: 'EXTRACT_RESPONSE'; job: ExtractedJob | null; error?: string }
  | { type: 'SAVE_JOB'; job: DetectedJob }
  | { type: 'SAVE_RESULT'; ok: boolean; error?: string };
