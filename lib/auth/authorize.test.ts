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
    verify: async (plain) => plain === "certa",
    ...over,
  };
}

describe("authorizeUser", () => {
  it("credencial válida retorna o usuário (sem passwordHash)", async () => {
    const r = await authorizeUser(
      { email: "dev@moldai.local", password: "certa" },
      deps(),
    );
    expect(r).toEqual({ id: "u1", email: "dev@moldai.local", name: "Dev" });
  });
  it("normaliza email (trim + lowercase)", async () => {
    const r = await authorizeUser(
      { email: "  DEV@MoldAI.local ", password: "certa" },
      deps(),
    );
    expect(r?.id).toBe("u1");
  });
  it("senha errada retorna null", async () => {
    expect(
      await authorizeUser(
        { email: "dev@moldai.local", password: "errada" },
        deps(),
      ),
    ).toBeNull();
  });
  it("email desconhecido retorna null", async () => {
    expect(
      await authorizeUser({ email: "x@y.z", password: "certa" }, deps()),
    ).toBeNull();
  });
  it("campos ausentes/não-string retornam null sem chamar o repo", async () => {
    let called = false;
    const d = deps({
      getUserByEmail: async (e) => {
        called = true;
        return e === user.email ? user : null;
      },
    });
    expect(
      await authorizeUser({ email: 123, password: "certa" }, d),
    ).toBeNull();
    expect(await authorizeUser({ password: "certa" }, d)).toBeNull();
    expect(await authorizeUser({ email: "dev@moldai.local" }, d)).toBeNull();
    expect(called).toBe(false);
  });
});
