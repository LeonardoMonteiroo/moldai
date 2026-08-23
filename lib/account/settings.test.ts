import { describe, it, expect } from "vitest";
import {
  validateName,
  validateNewPassword,
  changePassword,
  verifyForDeletion,
  type PasswordDeps,
} from "./settings";

function deps(over: Partial<PasswordDeps> = {}): PasswordDeps {
  return {
    verify: async (plain, hash) => plain === "correct" && hash === "HASH",
    hash: async (plain) => `HASHED(${plain})`,
    ...over,
  };
}

describe("validateName", () => {
  it("trims and returns a valid name", () => {
    expect(validateName("  Ateliê Dev  ")).toBe("Ateliê Dev");
  });
  it("rejects empty/whitespace-only names", () => {
    expect(validateName("   ")).toBeNull();
    expect(validateName("")).toBeNull();
  });
  it("rejects non-string input", () => {
    expect(validateName(123)).toBeNull();
    expect(validateName(undefined)).toBeNull();
  });
  it("rejects names longer than 80 characters", () => {
    expect(validateName("a".repeat(81))).toBeNull();
    expect(validateName("a".repeat(80))).toBe("a".repeat(80));
  });
});

describe("validateNewPassword", () => {
  it("accepts passwords with 8+ characters", () => {
    expect(validateNewPassword("12345678")).toBe(true);
  });
  it("rejects passwords under 8 characters", () => {
    expect(validateNewPassword("1234567")).toBe(false);
  });
  it("rejects non-string input", () => {
    expect(validateNewPassword(12345678)).toBe(false);
    expect(validateNewPassword(undefined)).toBe(false);
  });

  // #55: only a minimum was ever enforced -- an unbounded password reached
  // bcrypt on both the signup and password-change paths with nothing
  // capping input size.
  it("accepts a password exactly at the 200-character cap", () => {
    expect(validateNewPassword("a".repeat(200))).toBe(true);
  });
  it("rejects a password over the 200-character cap", () => {
    expect(validateNewPassword("a".repeat(201))).toBe(false);
  });
});

describe("changePassword", () => {
  it("returns the new hash on correct current password + valid new password", async () => {
    const r = await changePassword(deps(), "correct", "newpassword1", "HASH");
    expect(r).toEqual({ ok: true, newHash: "HASHED(newpassword1)" });
  });
  it("rejects a wrong current password", async () => {
    const r = await changePassword(deps(), "wrong", "newpassword1", "HASH");
    expect(r).toEqual({ ok: false, error: "wrong_password" });
  });
  it("rejects a non-string current password without calling verify", async () => {
    let called = false;
    const d = deps({
      verify: async () => {
        called = true;
        return true;
      },
    });
    const r = await changePassword(d, undefined, "newpassword1", "HASH");
    expect(r).toEqual({ ok: false, error: "wrong_password" });
    expect(called).toBe(false);
  });
  it("rejects a too-short new password even if current password is correct", async () => {
    const r = await changePassword(deps(), "correct", "short", "HASH");
    expect(r).toEqual({ ok: false, error: "weak_password" });
  });
});

describe("verifyForDeletion", () => {
  it("returns true for the correct password", async () => {
    expect(await verifyForDeletion(deps(), "correct", "HASH")).toBe(true);
  });
  it("returns false for the wrong password", async () => {
    expect(await verifyForDeletion(deps(), "wrong", "HASH")).toBe(false);
  });
  it("returns false for non-string input without calling verify", async () => {
    let called = false;
    const d = deps({ verify: async () => ((called = true), true) });
    expect(await verifyForDeletion(d, undefined, "HASH")).toBe(false);
    expect(called).toBe(false);
  });
});
