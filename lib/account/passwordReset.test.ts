import { describe, it, expect } from "vitest";
import { resetPassword } from "./passwordReset";

const hash = async (plain: string) => `HASHED(${plain})`;

describe("resetPassword", () => {
  it("returns the new hash for a valid password", async () => {
    const r = await resetPassword({ hash }, "newpassword1");
    expect(r).toEqual({ ok: true, newHash: "HASHED(newpassword1)" });
  });

  it("rejects a password under 8 characters without hashing", async () => {
    let called = false;
    const r = await resetPassword(
      { hash: async (p) => ((called = true), `HASHED(${p})`) },
      "short",
    );
    expect(r).toEqual({ ok: false, error: "weak_password" });
    expect(called).toBe(false);
  });

  it("rejects non-string input", async () => {
    const r = await resetPassword({ hash }, undefined);
    expect(r).toEqual({ ok: false, error: "weak_password" });
  });

  // #55's MAX_PASSWORD_LENGTH cap, reused via validateNewPassword.
  it("rejects a password over the 200-character cap", async () => {
    const r = await resetPassword({ hash }, "a".repeat(201));
    expect(r).toEqual({ ok: false, error: "weak_password" });
  });

  it("accepts a password exactly at the 200-character cap", async () => {
    const r = await resetPassword({ hash }, "a".repeat(200));
    expect(r.ok).toBe(true);
  });
});
