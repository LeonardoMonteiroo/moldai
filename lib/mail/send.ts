import type { MailContent } from "./templates";

export class MailUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailUnavailableError";
  }
}

// Missing APP_URL is explicit, never silent -- symmetric with sendMail's
// SMTP_HOST check below. Outside production the localhost fallback keeps a
// bare `npm run dev` and the test suite working; in production it throws, so
// a deploy that forgot APP_URL fails as mail_unavailable instead of mailing
// every user an unusable http://localhost:3000 link while the UI reports
// success.
export function verificationLink(rawToken: string): string {
  const rawBase = process.env.APP_URL;
  if (!rawBase && process.env.NODE_ENV === "production") {
    throw new MailUnavailableError("APP_URL is not set");
  }
  const base = (rawBase ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/verify?token=${encodeURIComponent(rawToken)}`;
}

// Same APP_URL contract as verificationLink -- missing in production throws
// rather than mailing an unusable http://localhost:3000 link.
export function passwordResetLink(rawToken: string): string {
  const rawBase = process.env.APP_URL;
  if (!rawBase && process.env.NODE_ENV === "production") {
    throw new MailUnavailableError("APP_URL is not set");
  }
  const base = (rawBase ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/password-reset?token=${encodeURIComponent(rawToken)}`;
}

// Missing SMTP is explicit, never silent. Outside production the link is logged
// so a bare `npm run dev` and the test suite keep working; in production it
// throws, surfacing as mail_unavailable rather than a "check your email" screen
// for a mail that was never sent.
export async function sendMail(
  to: string,
  content: MailContent,
): Promise<void> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    if (process.env.NODE_ENV === "production") {
      throw new MailUnavailableError("SMTP_HOST is not set");
    }
    console.info(
      `[mail] SMTP_HOST unset - not sending. Would deliver to ${to}:\n${content.text}`,
    );
    return;
  }

  // Dynamic import keeps nodemailer out of every bundle that never mails.
  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    // Mailpit accepts unauthenticated SMTP; a real provider will not.
    auth: user ? { user, pass: process.env.SMTP_PASS ?? "" } : undefined,
  });

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? "MoldAI <no-reply@moldai.local>",
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
}
