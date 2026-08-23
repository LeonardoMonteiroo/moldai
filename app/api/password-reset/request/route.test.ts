import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/users", () => ({ getUserByEmail: vi.fn() }));
vi.mock("@/lib/db/passwordReset", () => ({ issueResetToken: vi.fn() }));
vi.mock("@/lib/rate-limit/consume", () => ({ consume: vi.fn() }));
vi.mock("@/lib/mail/send", () => ({
  sendMail: vi.fn(),
  passwordResetLink: vi.fn(() => "http://test/password-reset?token=raw"),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import { POST } from "./route";
import { getUserByEmail } from "@/lib/db/users";
import { issueResetToken } from "@/lib/db/passwordReset";
import { consume } from "@/lib/rate-limit/consume";
import { sendMail } from "@/lib/mail/send";

function req(body: unknown) {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const KNOWN = {
  id: "u1",
  email: "novo@moldai.local",
  passwordHash: "HASH",
  name: "Novo",
  emailVerified: new Date(),
};

describe("POST /api/password-reset/request", () => {
  beforeEach(() => {
    vi.mocked(getUserByEmail).mockReset();
    vi.mocked(issueResetToken).mockReset();
    vi.mocked(consume).mockReset();
    vi.mocked(sendMail).mockReset();
    vi.mocked(consume).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(getUserByEmail).mockResolvedValue(KNOWN);
    vi.mocked(issueResetToken).mockResolvedValue("raw-token");
    vi.mocked(sendMail).mockResolvedValue(undefined);
  });

  it("issues a token and mails it for a known address", async () => {
    const res = await POST(req({ email: KNOWN.email }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(issueResetToken).toHaveBeenCalledWith("u1", expect.any(Date));
    expect(sendMail).toHaveBeenCalled();
  });

  // The core of #24's no-enumeration requirement: the response for an
  // unregistered address must be byte-identical to a registered one.
  it("answers the same ok for an unknown address, and mails nothing", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(null);
    const res = await POST(req({ email: "ghost@moldai.local" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(issueResetToken).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  // A broken SMTP server must not become an oracle either: it would only ever
  // throw for a KNOWN address (mail is skipped entirely for an unknown one),
  // so leaking mail_unavailable here would tell an attacker the address
  // exists exactly when the unknown-address case answers plain "ok".
  it("still answers ok when sending the mail throws", async () => {
    vi.mocked(sendMail).mockRejectedValue(new Error("SMTP down"));
    const res = await POST(req({ email: KNOWN.email }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("400s with bad_body on an invalid email", async () => {
    const res = await POST(req({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("400s with bad_body on unparseable JSON", async () => {
    const res = await POST(
      new Request("http://test", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
  });

  it("400s with bad_body on a null JSON body", async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
  });

  it("429s when the password_reset_request bucket is exhausted, before touching the repo", async () => {
    vi.mocked(consume).mockResolvedValue({
      allowed: false,
      retryAfterSec: 300,
    });
    const res = await POST(req({ email: KNOWN.email }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("300");
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("429s when only the password_reset_request_email bucket is exhausted, before sending mail", async () => {
    vi.mocked(consume).mockImplementation(async (bucket) => ({
      allowed: bucket !== "password_reset_request_email",
      retryAfterSec: 300,
    }));
    const res = await POST(req({ email: KNOWN.email }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("300");
    expect(await res.json()).toEqual({
      status: "error",
      error: "rate_limited",
    });
    expect(issueResetToken).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  // The email-keyed bucket is consumed even for an address that turns out to
  // be unregistered -- otherwise an attacker could flood an unregistered
  // victim's inbox for free by skipping straight past it.
  it("consumes the email-keyed bucket even for an unknown address", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(null);
    await POST(req({ email: "ghost@moldai.local" }));
    expect(consume).toHaveBeenCalledWith(
      "password_reset_request_email",
      "ghost@moldai.local",
    );
  });
});
