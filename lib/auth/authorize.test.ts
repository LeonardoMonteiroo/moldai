import { describe, it, expect } from "vitest";
import { authorizeUser, type AuthorizeDeps } from "./authorize";
import type { UserRecord } from "./types";

const user: UserRecord = {
  id: "u1",
  email: "dev@moldai.local",
  passwordHash: "HASH",
  name: "Dev",
};

function deps(over: Partial<AuthorizeDeps> = {}): AuthorizeDeps {
  return {
    getUserByEmail: async (email) => (email === user.email ? user : null),
    verify: async (plain) => plain === "correct",
    ...over,
  };
}

describe("authorizeUser", () => {
  it("valid credentials return the user (without passwordHash)", async () => {
    const r = await authorizeUser(
      { email: "dev@moldai.local", password: "correct" },
      deps(),
    );
    expect(r).toEqual({ id: "u1", email: "dev@moldai.local", name: "Dev" });
  });
  it("normalizes the email (trim + lowercase)", async () => {
    const r = await authorizeUser(
      { email: "  DEV@MoldAI.local ", password: "correct" },
      deps(),
    );
    expect(r?.id).toBe("u1");
  });
  it("wrong password returns null", async () => {
    expect(
      await authorizeUser(
        { email: "dev@moldai.local", password: "wrong" },
        deps(),
      ),
    ).toBeNull();
  });
  it("unknown email returns null", async () => {
    expect(
      await authorizeUser({ email: "x@y.z", password: "correct" }, deps()),
    ).toBeNull();
  });
  it("missing/non-string fields return null without calling the repo", async () => {
    let called = false;
    const d = deps({
      getUserByEmail: async (e) => {
        called = true;
        return e === user.email ? user : null;
      },
    });
    expect(
      await authorizeUser({ email: 123, password: "correct" }, d),
    ).toBeNull();
    expect(await authorizeUser({ password: "correct" }, d)).toBeNull();
    expect(await authorizeUser({ email: "dev@moldai.local" }, d)).toBeNull();
    expect(called).toBe(false);
  });
});
