import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/users", () => ({
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
}));
vi.mock("@/lib/auth/hash", () => ({ hashPassword: vi.fn() }));
vi.mock("@/lib/rate-limit/consume", () => ({ consume: vi.fn() }));
vi.mock("@/lib/db/verification", () => ({ issueToken: vi.fn() }));
vi.mock("@/lib/mail/send", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/mail/send")>("@/lib/mail/send");
  return {
    sendMail: vi.fn(),
    verificationLink: vi.fn(() => "http://test/verify?token=raw"),
    MailUnavailableError: actual.MailUnavailableError,
  };
});
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import { POST } from "./route";
import { getUserByEmail, createUser } from "@/lib/db/users";
import { hashPassword } from "@/lib/auth/hash";
import { consume } from "@/lib/rate-limit/consume";
import { issueToken } from "@/lib/db/verification";
import { sendMail, MailUnavailableError } from "@/lib/mail/send";

function req(body: unknown) {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const VALID = {
  name: "Leonardo",
  email: "novo@moldai.local",
  password: "senha-forte",
};

describe("POST /api/signup", () => {
  beforeEach(() => {
    vi.mocked(getUserByEmail).mockReset();
    vi.mocked(createUser).mockReset();
    vi.mocked(hashPassword).mockReset();
    vi.mocked(getUserByEmail).mockResolvedValue(null);
    vi.mocked(hashPassword).mockResolvedValue("hashed");
    vi.mocked(createUser).mockResolvedValue({
      id: "new",
      email: "novo@moldai.local",
      passwordHash: "hashed",
      name: "Leonardo",
      emailVerified: null,
    });
    vi.mocked(consume).mockReset();
    vi.mocked(issueToken).mockReset();
    vi.mocked(sendMail).mockReset();
    vi.mocked(consume).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(issueToken).mockResolvedValue("raw-token");
    vi.mocked(sendMail).mockResolvedValue(undefined);
  });

  it("creates the account and returns ok", async () => {
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(createUser).toHaveBeenCalledWith({
      email: "novo@moldai.local",
      name: "Leonardo",
      passwordHash: "hashed",
    });
  });

  it("never returns the password hash to the client", async () => {
    const res = await POST(req(VALID));
    expect(JSON.stringify(await res.json())).not.toContain("hashed");
  });

  it("409s with email_taken when the address exists", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({
      id: "u1",
      email: "novo@moldai.local",
      passwordHash: "x",
      name: null,
      emailVerified: null,
    });
    const res = await POST(req(VALID));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      status: "error",
      error: "email_taken",
    });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("409s with email_taken when the insert loses the race", async () => {
    vi.mocked(createUser).mockResolvedValue(null);
    const res = await POST(req(VALID));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      status: "error",
      error: "email_taken",
    });
  });

  it("400s with invalid_name on a blank name", async () => {
    const res = await POST(req({ ...VALID, name: "  " }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_name",
    });
  });

  it("400s with invalid_email on a malformed address", async () => {
    const res = await POST(req({ ...VALID, email: "nope" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_email",
    });
  });

  it("400s with weak_password under 8 characters", async () => {
    const res = await POST(req({ ...VALID, password: "curta12" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "weak_password",
    });
  });

  it("400s with bad_body on unparseable JSON", async () => {
    const res = await POST(
      new Request("http://test", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("400s with bad_body on a null JSON body", async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("issues a token and mails it after creating the account", async () => {
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect(issueToken).toHaveBeenCalledWith("new", expect.any(Date));
    expect(sendMail).toHaveBeenCalledWith(
      "novo@moldai.local",
      expect.objectContaining({ subject: expect.any(String) }),
    );
  });

  it("creates the account before sending, so a mail failure is recoverable", async () => {
    vi.mocked(sendMail).mockRejectedValue(
      new MailUnavailableError("SMTP_HOST is not set"),
    );
    const res = await POST(req(VALID));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: "error",
      error: "mail_unavailable",
    });
    expect(createUser).toHaveBeenCalled();
  });

  it("429s when the IP bucket is exhausted, without creating anything", async () => {
    vi.mocked(consume).mockResolvedValue({
      allowed: false,
      retryAfterSec: 900,
    });
    const res = await POST(req(VALID));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("900");
    expect(await res.json()).toEqual({
      status: "error",
      error: "rate_limited",
    });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("429s when only the email bucket is exhausted", async () => {
    vi.mocked(consume).mockImplementation(async (bucket) => ({
      allowed: bucket !== "signup_email",
      retryAfterSec: 60,
    }));
    const res = await POST(req(VALID));
    expect(res.status).toBe(429);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("consumes the ip bucket and the normalized-email bucket", async () => {
    await POST(req({ ...VALID, email: "  NOVO@MoldAI.local " }));
    expect(consume).toHaveBeenCalledWith("signup", "unknown");
    expect(consume).toHaveBeenCalledWith("signup_email", "novo@moldai.local");
  });

  it("never sends a mail when validation fails", async () => {
    await POST(req({ ...VALID, password: "curta12" }));
    expect(sendMail).not.toHaveBeenCalled();
    expect(issueToken).not.toHaveBeenCalled();
  });
});
