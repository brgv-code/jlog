import { apiFetch } from './api';

/** Matches MAX_PHOTO_BYTES in the API. */
export const MAX_PHOTO_BYTES = 512_000;
/** A CV photo is printed a few centimetres tall; more pixels than this is waste. */
const MAX_EDGE = 600;
const JPEG_QUALITY = 0.85;

/**
 * Downscale and re-encode to JPEG before upload.
 *
 * Done in the browser on purpose: a Worker has no image decoder without pulling
 * one in, and a phone photo is several megabytes of detail that a 64pt-tall
 * LaTeX frame throws away anyway. The server still enforces its own limit —
 * this makes the common case fit, it does not replace the check.
 */
export async function preparePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image.');
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image in this browser.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new Error('Could not process the image in this browser.');
  if (blob.size > MAX_PHOTO_BYTES) {
    throw new Error('That image is still too large after resizing. Try a smaller crop.');
  }
  return blob;
}

export async function uploadPhoto(file: File): Promise<void> {
  const blob = await preparePhoto(file);
  const res = await apiFetch('/api/profile/photo', {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? 'Could not store that photo.');
  }
}

export async function deletePhoto(): Promise<void> {
  const res = await apiFetch('/api/profile/photo', { method: 'DELETE' });
  if (!res.ok) throw new Error('Could not remove the photo.');
}

/**
 * The photo endpoint needs the session cookie, so it cannot be an <img src>
 * straight to the API on a cross-origin deployment. Fetched as a blob URL
 * instead; the caller revokes it.
 */
export async function loadPhotoUrl(): Promise<string | null> {
  const res = await apiFetch('/api/profile/photo');
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}

/**
 * The stored photo as a base64 compile asset, or null if there is none.
 *
 * The LaTeX references a filename (`chrome.photo`); the bytes travel beside the
 * document as a sibling file. Fetched at generation time rather than held in
 * state so a photo replaced in another tab cannot be silently stale in the PDF.
 */
export async function photoAsset(
  filename: string,
): Promise<Record<string, { encoding: 'base64'; content: string }> | null> {
  const res = await apiFetch('/api/profile/photo').catch(() => null);
  if (!res?.ok) return null;

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) return null;

  // Chunked rather than spread into String.fromCharCode in one call: a few
  // hundred KB of arguments overflows the call stack in some browsers.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }

  return { [filename]: { encoding: 'base64', content: btoa(binary) } };
}
