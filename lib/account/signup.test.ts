import { describe, it, expect, vi } from "vitest";
import { createAccount, normalizeEmail } from "./signup";
import type { SignupDeps, NewUser } from "./signup";
import type { UserRecord } from "@/lib/auth/types";

const EXISTING: UserRecord = {
  id: "u1",
  email: "taken@moldai.local",
  passwordHash: "hashed",
  name: "Taken",
  emailVerified: new Date(),
};

function deps(over: Partial<SignupDeps> = {}): SignupDeps {
  return {
    getUserByEmail: vi.fn(async () => null),
    createUser: vi.fn(async (input: NewUser) => ({
      id: "new",
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
      emailVerified: null,
    })),
    hash: vi.fn(async (plain: string) => `hashed:${plain}`),
    ...over,
  };
}

const VALID = {
  name: "Leonardo",
  email: "novo@moldai.local",
  password: "senha-forte",
};

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Foo@X.COM ")).toBe("foo@x.com");
  });
  it("rejects a non-string, a blank, and a malformed address", () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail("no-at-sign")).toBeNull();
    expect(normalizeEmail("no@domain")).toBeNull();
    expect(normalizeEmail("two spaces@x.com")).toBeNull();
  });
});

describe("createAccount", () => {
  it("hashes the password and creates the user", async () => {
    const d = deps();
    const result = await createAccount(d, VALID);
    expect(result).toEqual({
      ok: true,
      user: {
        id: "new",
        email: "novo@moldai.local",
        passwordHash: "hashed:senha-forte",
        name: "Leonardo",
        emailVerified: null,
      },
    });
    expect(vi.mocked(d.hash)).toHaveBeenCalledWith("senha-forte");
  });

  it("stores the email normalized, so authorizeUser's lookup can find it", async () => {
    const d = deps();
    await createAccount(d, { ...VALID, email: "  Foo@X.COM " });
    expect(vi.mocked(d.getUserByEmail)).toHaveBeenCalledWith("foo@x.com");
    expect(vi.mocked(d.createUser)).toHaveBeenCalledWith(
      expect.objectContaining({ email: "foo@x.com" }),
    );
  });

  it("trims the name", async () => {
    const d = deps();
    await createAccount(d, { ...VALID, name: "  Leonardo  " });
    expect(vi.mocked(d.createUser)).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Leonardo" }),
    );
  });

  it("rejects a blank name, a too-long name, and a non-string name", async () => {
    const d = deps();
    for (const name of ["   ", "x".repeat(81), 42]) {
      expect(await createAccount(d, { ...VALID, name })).toEqual({
        ok: false,
        error: "invalid_name",
      });
    }
    expect(vi.mocked(d.createUser)).not.toHaveBeenCalled();
  });

  it("rejects a malformed email", async () => {
    const d = deps();
    expect(await createAccount(d, { ...VALID, email: "nope" })).toEqual({
      ok: false,
      error: "invalid_email",
    });
    expect(vi.mocked(d.createUser)).not.toHaveBeenCalled();
  });

  it("rejects a password under 8 characters", async () => {
    const d = deps();
    expect(await createAccount(d, { ...VALID, password: "curta12" })).toEqual({
      ok: false,
      error: "weak_password",
    });
    expect(vi.mocked(d.hash)).not.toHaveBeenCalled();
    expect(vi.mocked(d.createUser)).not.toHaveBeenCalled();
  });

  // #30: bcryptjs silently truncates at 72 bytes -- a longer password must be
  // rejected here rather than hashed down to a shorter effective secret.
  it("rejects a password over the 72-character cap, without hashing", async () => {
    const d = deps();
    expect(
      await createAccount(d, { ...VALID, password: "a".repeat(73) }),
    ).toEqual({ ok: false, error: "weak_password" });
    expect(vi.mocked(d.hash)).not.toHaveBeenCalled();
    expect(vi.mocked(d.createUser)).not.toHaveBeenCalled();
  });

  it("accepts a password exactly at the 72-character cap", async () => {
    const d = deps();
    const result = await createAccount(d, {
      ...VALID,
      password: "a".repeat(72),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an email that already exists, without hashing", async () => {
    const d = deps({ getUserByEmail: vi.fn(async () => EXISTING) });
    expect(await createAccount(d, VALID)).toEqual({
      ok: false,
      error: "email_taken",
    });
    expect(vi.mocked(d.hash)).not.toHaveBeenCalled();
    expect(vi.mocked(d.createUser)).not.toHaveBeenCalled();
  });

  it("maps a lost insert race (createUser -> null) to email_taken", async () => {
    const d = deps({ createUser: vi.fn(async () => null) });
    expect(await createAccount(d, VALID)).toEqual({
      ok: false,
      error: "email_taken",
    });
  });

  it("checks the name before the email, so the first error wins deterministically", async () => {
    const d = deps();
    expect(
      await createAccount(d, { name: "", email: "nope", password: "x" }),
    ).toEqual({ ok: false, error: "invalid_name" });
  });
});
