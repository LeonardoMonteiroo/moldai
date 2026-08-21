import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { sessionUser, requireUserFrom, unauthorized } from "./session";

describe("sessionUser", () => {
  it("extracts a valid user", () => {
    expect(
      sessionUser({ user: { id: "u1", email: "a@b.c", name: "A" } }),
    ).toEqual({
      id: "u1",
      email: "a@b.c",
      name: "A",
    });
  });
  it("missing name becomes null", () => {
    expect(sessionUser({ user: { id: "u1", email: "a@b.c" } })).toEqual({
      id: "u1",
      email: "a@b.c",
      name: null,
    });
  });
  it("null when the session is empty or missing id/email", () => {
    expect(sessionUser(null)).toBeNull();
    expect(sessionUser({})).toBeNull();
    expect(sessionUser({ user: { email: "a@b.c" } })).toBeNull();
    expect(sessionUser({ user: { id: "u1" } })).toBeNull();
  });
});

describe("requireUserFrom", () => {
  it("returns the user when a session is present", () => {
    expect(requireUserFrom({ user: { id: "u1", email: "a@b.c" } })).toEqual({
      id: "u1",
      email: "a@b.c",
      name: null,
    });
  });
  it("returns 401 when there's no session", () => {
    const r = requireUserFrom(null);
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(401);
  });
});

describe("unauthorized", () => {
  it("carries the unauthorized code, not pt-BR prose", async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      status: "unauthorized",
      error: "unauthorized",
    });
  });
});
