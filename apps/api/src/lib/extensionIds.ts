/**
 * Which builds of the jlog extension the API trusts.
 *
 * `EXTENSION_ID` holds one ID or several, separated by commas or whitespace.
 * jlog.ai lists two: the Chrome Web Store item, and the unpacked build a
 * developer loads from apps/extension/dist, whose ID comes from its folder.
 * A self-hosted instance usually lists just its own build.
 *
 * Each entry is an exact ID. chrome-extension:// is a scheme, not a domain, so
 * trusting the prefix alone would trust every extension in the user's browser.
 */

export function parseExtensionIds(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

/** The origins the trusted extensions send requests from. */
export function extensionOrigins(raw: string | undefined): string[] {
  return parseExtensionIds(raw).map((id) => `chrome-extension://${id}`);
}

/** Whether a request's Origin is one of the trusted extensions. */
export function isTrustedExtensionOrigin(raw: string | undefined, origin: string): boolean {
  return extensionOrigins(raw).includes(origin);
}
