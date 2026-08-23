import type { Translate } from "@/lib/i18n/translate";
import { TOKEN_TTL_MS } from "@/lib/auth/verification";

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// `t` arrives already scoped to the VerificationEmail namespace, matching how
// the drafters receive a PatternData-scoped resolver.
export function verificationEmail(
  t: Translate,
  link: string,
  name: string,
): MailContent {
  const hours = Math.round(TOKEN_TTL_MS / 3_600_000);
  const subject = t("subject");
  const greeting = t("greeting", { name });
  const body = t("body");
  const button = t("button");
  const linkFallback = t("linkFallback");
  const expiry = t("expiry", { hours });
  const ignore = t("ignore");

  const text = [greeting, "", body, "", link, "", expiry, ignore].join("\n");

  // Inline styles and a table-free layout: mail clients strip <style> blocks.
  // Colors are literal here on purpose -- an email cannot read globals.css.
  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#f7f7f2;font-family:Helvetica,Arial,sans-serif;color:#26261f;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e4da;border-radius:12px;padding:28px;">
      <p style="margin:0 0 20px;font-size:22px;font-weight:700;">Mold<span style="color:#6b7a4a;">AI</span></p>
      <p style="margin:0 0 12px;font-size:15px;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.5;">${escapeHtml(body)}</p>
      <p style="margin:0 0 20px;">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#6b7a4a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">${escapeHtml(button)}</a>
      </p>
      <p style="margin:0 0 6px;font-size:12px;color:#6f6f63;">${escapeHtml(linkFallback)}</p>
      <p style="margin:0 0 20px;font-size:12px;word-break:break-all;"><a href="${escapeHtml(link)}" style="color:#55603a;">${escapeHtml(link)}</a></p>
      <p style="margin:0 0 4px;font-size:12px;color:#6f6f63;">${escapeHtml(expiry)}</p>
      <p style="margin:0;font-size:12px;color:#6f6f63;">${escapeHtml(ignore)}</p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}

// `t` arrives already scoped to the PasswordResetEmail namespace. Reuses
// TOKEN_TTL_MS -- the reset token is minted by the same
// newVerificationToken/hashToken primitives as the verification token, so it
// shares the same 24h/single-use lifetime.
export function passwordResetEmail(
  t: Translate,
  link: string,
  name: string,
): MailContent {
  const hours = Math.round(TOKEN_TTL_MS / 3_600_000);
  const subject = t("subject");
  const greeting = t("greeting", { name });
  const body = t("body");
  const button = t("button");
  const linkFallback = t("linkFallback");
  const expiry = t("expiry", { hours });
  const ignore = t("ignore");

  const text = [greeting, "", body, "", link, "", expiry, ignore].join("\n");

  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#f7f7f2;font-family:Helvetica,Arial,sans-serif;color:#26261f;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e4da;border-radius:12px;padding:28px;">
      <p style="margin:0 0 20px;font-size:22px;font-weight:700;">Mold<span style="color:#6b7a4a;">AI</span></p>
      <p style="margin:0 0 12px;font-size:15px;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.5;">${escapeHtml(body)}</p>
      <p style="margin:0 0 20px;">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#6b7a4a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">${escapeHtml(button)}</a>
      </p>
      <p style="margin:0 0 6px;font-size:12px;color:#6f6f63;">${escapeHtml(linkFallback)}</p>
      <p style="margin:0 0 20px;font-size:12px;word-break:break-all;"><a href="${escapeHtml(link)}" style="color:#55603a;">${escapeHtml(link)}</a></p>
      <p style="margin:0 0 4px;font-size:12px;color:#6f6f63;">${escapeHtml(expiry)}</p>
      <p style="margin:0;font-size:12px;color:#6f6f63;">${escapeHtml(ignore)}</p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}
