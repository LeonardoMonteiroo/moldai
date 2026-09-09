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

  // #30's MAX_PASSWORD_LENGTH cap, reused via validateNewPassword.
  it("rejects a password over the 72-character cap", async () => {
    const r = await resetPassword({ hash }, "a".repeat(73));
    expect(r).toEqual({ ok: false, error: "weak_password" });
  });

  it("accepts a mixed password exactly at the 72-character cap", async () => {
    const r = await resetPassword({ hash }, "a".repeat(71) + "1");
    expect(r.ok).toBe(true);
  });

  // #238: letters-only and digits-only new passwords are rejected here too --
  // this is the same validateNewPassword shared with signup and settings.
  it("rejects a letters-only password", async () => {
    const r = await resetPassword({ hash }, "apenasletras");
    expect(r).toEqual({ ok: false, error: "weak_password" });
  });
  it("rejects a digits-only password", async () => {
    const r = await resetPassword({ hash }, "12345678");
    expect(r).toEqual({ ok: false, error: "weak_password" });
  });
  it("accepts a valid mixed password", async () => {
    const r = await resetPassword({ hash }, "senha-forte1");
    expect(r).toEqual({ ok: true, newHash: "HASHED(senha-forte1)" });
  });
});
