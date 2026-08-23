import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/users", () => ({ getUserByEmail: vi.fn() }));
vi.mock("@/lib/db/verification", () => ({
  issueToken: vi.fn(),
  lastIssuedAt: vi.fn(),
}));
vi.mock("@/lib/auth/hash", () => ({
  verifyPassword: vi.fn(),
  DUMMY_HASH: "DUMMY_HASH_MOCK",
}));
vi.mock("@/lib/rate-limit/consume", () => ({ consume: vi.fn() }));
vi.mock("@/lib/mail/send", () => ({
  sendMail: vi.fn(),
  verificationLink: vi.fn(() => "http://test/verify?token=raw"),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import { POST } from "./route";
import { getUserByEmail } from "@/lib/db/users";
import { issueToken, lastIssuedAt } from "@/lib/db/verification";
import { verifyPassword } from "@/lib/auth/hash";
import { consume } from "@/lib/rate-limit/consume";
import { sendMail } from "@/lib/mail/send";

function req(body: unknown) {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const CREDS = { email: "novo@moldai.local", password: "senha-forte" };

const UNVERIFIED = {
  id: "u1",
  email: "novo@moldai.local",
  passwordHash: "HASH",
  name: "Novo",
  emailVerified: null,
};

describe("POST /api/verify-email/resend", () => {
  beforeEach(() => {
    vi.mocked(getUserByEmail).mockReset();
    vi.mocked(issueToken).mockReset();
    vi.mocked(lastIssuedAt).mockReset();
    vi.mocked(verifyPassword).mockReset();
    vi.mocked(consume).mockReset();
    vi.mocked(sendMail).mockReset();
    vi.mocked(consume).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(getUserByEmail).mockResolvedValue(UNVERIFIED);
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(lastIssuedAt).mockResolvedValue(null);
    vi.mocked(issueToken).mockResolvedValue("raw-token");
    vi.mocked(sendMail).mockResolvedValue(undefined);
  });

  it("reissues and mails a fresh link", async () => {
    const res = await POST(req(CREDS));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(issueToken).toHaveBeenCalledWith("u1", expect.any(Date));
    expect(sendMail).toHaveBeenCalled();
  });

  it("401s on a wrong password, so it cannot be a spam relay", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const res = await POST(req(CREDS));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_credentials",
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("401s on an unknown address with the same code, revealing nothing", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(null);
    const res = await POST(req(CREDS));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_credentials",
    });
  });

  // #26: an unknown address used to return right after getUserByEmail,
  // skipping the bcrypt compare a known address pays for -- verifyPassword
  // being called once either way (against the fixed DUMMY_HASH for the
  // unknown case) is what equalizes the two branches' cost.
  it("spends a bcrypt compare on an unknown address too, not just a known one", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(null);
    const res = await POST(req(CREDS));
    expect(res.status).toBe(401);
    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(verifyPassword).toHaveBeenCalledWith(
      CREDS.password,
      "DUMMY_HASH_MOCK",
    );
  });

  it("409s with already_verified once the address is confirmed", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({
      ...UNVERIFIED,
      emailVerified: new Date(),
    });
    const res = await POST(req(CREDS));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      status: "error",
      error: "already_verified",
    });
    expect(issueToken).not.toHaveBeenCalled();
  });

  it("429s with cooldown inside 60 seconds of the last issue", async () => {
    vi.mocked(lastIssuedAt).mockResolvedValue(new Date(Date.now() - 5_000));
    const res = await POST(req(CREDS));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ status: "error", error: "cooldown" });
    expect(res.headers.get("Retry-After")).toBe("55");
    expect(issueToken).not.toHaveBeenCalled();
  });

  it("allows a reissue once the cooldown has passed", async () => {
    vi.mocked(lastIssuedAt).mockResolvedValue(new Date(Date.now() - 61_000));
    const res = await POST(req(CREDS));
    expect(res.status).toBe(200);
    expect(issueToken).toHaveBeenCalled();
  });

  it("503s with mail_unavailable when sending throws", async () => {
    vi.mocked(sendMail).mockRejectedValue(new Error("SMTP down"));
    const res = await POST(req(CREDS));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: "error",
      error: "mail_unavailable",
    });
  });

  it("429s when the resend bucket is exhausted, before touching the repo", async () => {
    vi.mocked(consume).mockResolvedValue({
      allowed: false,
      retryAfterSec: 300,
    });
    const res = await POST(req(CREDS));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("300");
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

  it("429s when only the resend_email bucket is exhausted, before sending mail", async () => {
    vi.mocked(consume).mockImplementation(async (bucket) => ({
      allowed: bucket !== "resend_email",
      retryAfterSec: 300,
    }));
    const res = await POST(req(CREDS));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("300");
    expect(await res.json()).toEqual({
      status: "error",
      error: "rate_limited",
    });
    expect(issueToken).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("does not consume resend_email on a wrong password", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);
    await POST(req(CREDS));
    expect(consume).not.toHaveBeenCalledWith("resend_email", expect.anything());
  });

  it("does not consume resend_email when the cooldown blocks the request", async () => {
    vi.mocked(lastIssuedAt).mockResolvedValue(new Date(Date.now() - 5_000));
    await POST(req(CREDS));
    expect(consume).not.toHaveBeenCalledWith("resend_email", expect.anything());
  });

  // #23: without this, the resend IP bucket (spoofable via a rotated
  // x-forwarded-for) was the only thing standing between an attacker and
  // unlimited password guesses against a known address -- this email-keyed
  // bucket is the non-spoofable backstop, the same role resend_email plays
  // for mail volume, so it must be checked, and must precede verifyPassword.
  it("consumes resend_attempt keyed on the email before verifying the password", async () => {
    await POST(req(CREDS));
    const attemptCallIndex = vi
      .mocked(consume)
      .mock.calls.findIndex(
        ([bucket, key]) => bucket === "resend_attempt" && key === CREDS.email,
      );
    expect(attemptCallIndex).toBeGreaterThanOrEqual(0);
    expect(
      vi.mocked(verifyPassword).mock.invocationCallOrder[0],
    ).toBeGreaterThan(
      vi.mocked(consume).mock.invocationCallOrder[attemptCallIndex],
    );
  });

  it("429s when the resend_attempt bucket is exhausted, without touching the repo", async () => {
    vi.mocked(consume).mockImplementation(async (bucket) => ({
      allowed: bucket !== "resend_attempt",
      retryAfterSec: 300,
    }));
    const res = await POST(req(CREDS));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("300");
    expect(await res.json()).toEqual({
      status: "error",
      error: "rate_limited",
    });
    expect(getUserByEmail).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("caps password guesses even when the IP bucket is spoofed fresh every request", async () => {
    // Simulates an attacker rotating x-forwarded-for so the IP-keyed
    // `resend` bucket never fills -- only the email-keyed resend_attempt
    // bucket can still cap them.
    let attempts = 0;
    vi.mocked(consume).mockImplementation(async (bucket) => {
      if (bucket === "resend_attempt") attempts++;
      return {
        allowed: !(bucket === "resend_attempt" && attempts > 10),
        retryAfterSec: 300,
      };
    });
    vi.mocked(verifyPassword).mockResolvedValue(false);
    for (let i = 0; i < 11; i++) await POST(req(CREDS));
    const res = await POST(req(CREDS));
    expect(res.status).toBe(429);
  });
});
