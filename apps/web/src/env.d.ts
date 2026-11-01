/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_API_URL: string;
  /** Build only: the IndexNow key, written to /<key>.txt (src/pages/[indexnow].txt.ts). */
  readonly INDEXNOW_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
