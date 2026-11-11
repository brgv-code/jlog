const REJECTED = /effort|reasoning|thinking|output_config/i;

export type SentWithEffort = { response: Response; effortRetried: boolean };

export async function sendWithEffort(
  send: (effort: string | undefined) => Promise<Response>,
  effort: string | undefined,
): Promise<SentWithEffort> {
  const response = await send(effort);
  if (response.ok || response.status !== 400 || !effort) return { response, effortRetried: false };
  const body = await response
    .clone()
    .text()
    .catch(() => '');
  if (!REJECTED.test(body)) return { response, effortRetried: false };
  return { response: await send(undefined), effortRetried: true };
}
