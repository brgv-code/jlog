/** A 400 naming the effort field: this model or this API version does not take it. */
const REJECTED = /effort|reasoning|thinking|output_config/i;

/**
 * Send a request with the user's reasoning effort, and once more without it if
 * the provider refuses the field.
 *
 * Which models take an effort, and in which values, comes from the model
 * catalogue, and a catalogue can be a release behind the provider. A setting
 * meant to make calls cheaper must not be the reason a call fails, so a
 * rejection that names the field costs one retry, not the user's request.
 */
export async function sendWithEffort(
  send: (effort: string | undefined) => Promise<Response>,
  effort: string | undefined,
): Promise<Response> {
  const res = await send(effort);
  if (res.ok || res.status !== 400 || !effort) return res;
  const body = await res
    .clone()
    .text()
    .catch(() => '');
  return REJECTED.test(body) ? send(undefined) : res;
}
