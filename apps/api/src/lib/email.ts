import { HttpError } from '@jlog/shared';
import type { Env } from '../index';

/**
 * Sending transactional email, via Resend.
 *
 * One provider, behind a one-method interface, because the only message jlog
 * sends is the sign-in link. Swapping Resend for something else is a change to
 * `send` and nothing above it.
 */
export type Mailer = {
  send(message: { to: string; subject: string; html: string; text: string }): Promise<void>;
};

/**
 * Null when the deployment has no mail credentials — the normal state for a
 * self-hoster who signs in with GitHub and never wants to run a mail domain.
 * The email sign-in route checks for null and reports that the method is
 * switched off, rather than silently accepting an address it cannot write to.
 */
export function getMailer(env: Env): Mailer | null {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!apiKey || !from) return null;

  return {
    async send(message) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });

      if (!res.ok) {
        // Resend's body names the actual problem — an unverified sending
        // domain, most often — and without it every failure looks identical.
        const detail = await res.text().catch(() => '');
        throw new HttpError(502, 'EMAIL_SEND_FAILED', `Resend rejected the send: ${detail}`);
      }
    },
  };
}

/**
 * The sign-in email itself.
 *
 * Plain text is not an afterthought: some clients prefer it, and a link that
 * only exists inside HTML is a link some people cannot follow.
 */
export function magicLinkMessage(args: { link: string; minutesValid: number }) {
  const subject = 'Your jlog sign-in link';

  const text = [
    'Sign in to jlog',
    '',
    'Open this link to sign in:',
    args.link,
    '',
    `The link works once and expires in ${args.minutesValid} minutes.`,
    '',
    "If you didn't ask to sign in, you can ignore this email — nobody can get",
    'into your account without the link above.',
  ].join('\n');

  // Inline styles and a table-free layout: every interesting mail client strips
  // <style> blocks, and half of them still handle flexbox badly.
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:440px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">Sign in to jlog</h1>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#6b7280;">
        Click the button below and you're in. The link works once and expires in
        ${args.minutesValid} minutes.
      </p>
      <a href="${args.link}"
         style="display:inline-block;background:#111827;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;">
        Sign in to jlog
      </a>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">
        If the button doesn't work, paste this into your browser:<br />
        <span style="word-break:break-all;color:#6b7280;">${args.link}</span>
      </p>
      <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">
        If you didn't ask to sign in, you can ignore this email.
      </p>
    </div>
  </body>
</html>`;

  return { subject, html, text };
}
