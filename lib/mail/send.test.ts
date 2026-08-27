import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { createTransport, transportSendMail } = vi.hoisted(() => {
  const transportSendMail = vi.fn(async (_options: unknown) => undefined);
  return {
    transportSendMail,
    createTransport: vi.fn((_options: unknown) => ({
      sendMail: transportSendMail,
    })),
  };
});

vi.mock("nodemailer", () => ({ createTransport }));

import {
  sendMail,
  verificationLink,
  passwordResetLink,
  MailUnavailableError,
} from "./send";
import type { MailContent } from "./templates";

/**
 * #168: lib/mail/send.ts had no test. Every branch in it is a
 * fail-loudly-vs-fail-silently decision, and the silent side of each one is
 * the worst failure this app can have: the UI says "confirme seu email" for
 * a mail that was never sent, or -- worse -- a mail that WAS sent carrying
 * an unusable http://localhost:3000 link, which no user can act on and no
 * log records as wrong.
 *
 * NODE_ENV is what decides which side of each branch runs, so every case
 * below sets it explicitly rather than inheriting whatever the runner
 * happens to use -- through `vi.stubEnv`, which is also the only way to
 * write NODE_ENV at all (@types/node declares it read-only).
 */

const CONTENT: MailContent = {
  subject: "Confirme seu email",
  text: "Abra o link: https://moldai.app/verify?token=x",
  html: "<p>Abra o link</p>",
};

/** Every variable this module reads, cleared before each case so a value
 *  left in the developer's own shell can never decide a branch. */
const ENV_KEYS = [
  "APP_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "NODE_ENV",
] as const;

/** vi.unstubAllEnvs in afterEach restores every one of these. */
function setEnv(key: (typeof ENV_KEYS)[number], value: string) {
  vi.stubEnv(key, value);
}

describe("lib/mail/send", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) vi.stubEnv(k, undefined);
    createTransport.mockClear();
    transportSendMail.mockClear();
  });

  afterEach(() => vi.unstubAllEnvs());

  // Both link builders share one contract, so they are asserted through one
  // table -- a new mailed link that forgets the production APP_URL check
  // shows up as a missing row here.
  const LINK_BUILDERS = [
    ["verificationLink", verificationLink, "/verify"],
    ["passwordResetLink", passwordResetLink, "/password-reset"],
  ] as const;

  describe.each(LINK_BUILDERS)("%s", (_name, build, path) => {
    it("builds the link from APP_URL", () => {
      setEnv("APP_URL", "https://moldai.app");
      expect(build("tok")).toBe(`https://moldai.app${path}?token=tok`);
    });

    it("strips trailing slashes rather than emitting a double slash", () => {
      setEnv("APP_URL", "https://moldai.app///");
      expect(build("tok")).toBe(`https://moldai.app${path}?token=tok`);
    });

    // The token is 32 random bytes hex-encoded today, so this is defensive
    // rather than currently reachable -- but a raw token spliced into a
    // query string is exactly where an un-encoded value silently truncates
    // the link and makes verification fail with no error anywhere.
    it("percent-encodes the token", () => {
      setEnv("APP_URL", "https://moldai.app");
      expect(build("a b&c=d")).toBe(
        `https://moldai.app${path}?token=a%20b%26c%3Dd`,
      );
    });

    it("falls back to localhost outside production so a bare npm run dev works", () => {
      setEnv("NODE_ENV", "development");
      expect(build("tok")).toBe(`http://localhost:3000${path}?token=tok`);
    });

    // The important half: a deploy that forgot APP_URL must fail as
    // mail_unavailable, not mail every user a localhost link while the
    // screen reports success.
    it("throws MailUnavailableError in production with no APP_URL", () => {
      setEnv("NODE_ENV", "production");
      expect(() => build("tok")).toThrow(MailUnavailableError);
    });

    it("uses APP_URL in production when it IS set", () => {
      setEnv("NODE_ENV", "production");
      setEnv("APP_URL", "https://moldai.app");
      expect(build("tok")).toBe(`https://moldai.app${path}?token=tok`);
    });
  });

  describe("sendMail with no SMTP_HOST", () => {
    it("logs the content instead of sending, outside production", async () => {
      setEnv("NODE_ENV", "development");
      const info = vi.spyOn(console, "info").mockImplementation(() => {});

      await expect(
        sendMail("ana@example.com", CONTENT),
      ).resolves.toBeUndefined();

      // The logged line is the dev-stack substitute for an inbox, so it has
      // to carry both the recipient and the link-bearing body.
      const logged = info.mock.calls[0][0] as string;
      expect(logged).toContain("ana@example.com");
      expect(logged).toContain(CONTENT.text);
      expect(createTransport).not.toHaveBeenCalled();
      info.mockRestore();
    });

    // Never a silent drop: this is the difference between an operator seeing
    // mail_unavailable and a user staring at a "check your email" screen
    // forever.
    it("throws MailUnavailableError in production", async () => {
      setEnv("NODE_ENV", "production");
      await expect(sendMail("ana@example.com", CONTENT)).rejects.toBeInstanceOf(
        MailUnavailableError,
      );
      expect(createTransport).not.toHaveBeenCalled();
    });
  });

  describe("sendMail with SMTP configured", () => {
    beforeEach(() => {
      setEnv("NODE_ENV", "production");
      setEnv("SMTP_HOST", "smtp.example.com");
    });

    it("sends the subject, text and html to the recipient", async () => {
      await sendMail("ana@example.com", CONTENT);

      expect(transportSendMail).toHaveBeenCalledTimes(1);
      expect(transportSendMail.mock.calls[0][0]).toMatchObject({
        to: "ana@example.com",
        subject: CONTENT.subject,
        text: CONTENT.text,
        html: CONTENT.html,
      });
    });

    it("defaults to port 587 without STARTTLS-implicit secure", async () => {
      await sendMail("ana@example.com", CONTENT);
      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ port: 587, secure: false }),
      );
    });

    // 465 is implicit TLS and 587 is STARTTLS: getting `secure` wrong for
    // the configured port is a connection that hangs or downgrades, not a
    // clean error.
    it("turns on implicit TLS for port 465 only", async () => {
      setEnv("SMTP_PORT", "465");
      await sendMail("ana@example.com", CONTENT);
      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ port: 465, secure: true }),
      );
    });

    // The dev stack's Mailpit accepts unauthenticated SMTP; passing an
    // empty-credential auth object to it (or to a real provider) is a
    // different failure from passing none at all.
    it("omits auth entirely when SMTP_USER is unset", async () => {
      await sendMail("ana@example.com", CONTENT);
      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ auth: undefined }),
      );
    });

    it("passes credentials when SMTP_USER is set, with an empty pass default", async () => {
      setEnv("SMTP_USER", "mailer");
      await sendMail("ana@example.com", CONTENT);
      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ auth: { user: "mailer", pass: "" } }),
      );

      setEnv("SMTP_PASS", "s3cret");
      await sendMail("ana@example.com", CONTENT);
      expect(createTransport).toHaveBeenLastCalledWith(
        expect.objectContaining({ auth: { user: "mailer", pass: "s3cret" } }),
      );
    });

    it("uses SMTP_FROM when set and a MoldAI default when not", async () => {
      await sendMail("ana@example.com", CONTENT);
      expect(transportSendMail.mock.calls[0][0]).toMatchObject({
        from: "MoldAI <no-reply@moldai.local>",
      });

      setEnv("SMTP_FROM", "MoldAI <oi@moldai.app>");
      await sendMail("ana@example.com", CONTENT);
      expect(transportSendMail.mock.calls[1][0]).toMatchObject({
        from: "MoldAI <oi@moldai.app>",
      });
    });

    // A transport-level failure has to propagate: the verify/resend routes
    // turn a rejection into mail_unavailable, and swallowing it here would
    // answer 200 for a mail that never left.
    it("propagates a transport failure rather than swallowing it", async () => {
      transportSendMail.mockRejectedValueOnce(new Error("550 rejected"));
      await expect(sendMail("ana@example.com", CONTENT)).rejects.toThrow(
        "550 rejected",
      );
    });
  });
});
