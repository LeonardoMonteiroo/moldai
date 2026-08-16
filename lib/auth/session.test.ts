import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { sessionUser, requireUserFrom } from "./session";

describe("sessionUser", () => {
  it("extrai user válido", () => {
    expect(sessionUser({ user: { id: "u1", email: "a@b.c", name: "A" } })).toEqual({
      id: "u1", email: "a@b.c", name: "A",
    });
  });
  it("name ausente vira null", () => {
    expect(sessionUser({ user: { id: "u1", email: "a@b.c" } })).toEqual({ id: "u1", email: "a@b.c", name: null });
  });
  it("null quando sessão vazia ou sem id/email", () => {
    expect(sessionUser(null)).toBeNull();
    expect(sessionUser({})).toBeNull();
    expect(sessionUser({ user: { email: "a@b.c" } })).toBeNull();
    expect(sessionUser({ user: { id: "u1" } })).toBeNull();
  });
});

describe("requireUserFrom", () => {
  it("sessão presente devolve o user", () => {
    expect(requireUserFrom({ user: { id: "u1", email: "a@b.c" } })).toEqual({ id: "u1", email: "a@b.c", name: null });
  });
  it("sessão ausente devolve 401", () => {
    const r = requireUserFrom(null);
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(401);
  });
});
