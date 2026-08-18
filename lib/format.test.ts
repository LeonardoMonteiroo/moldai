import { describe, it, expect } from "vitest";
import { initialsFromEmail, relativeTime } from "./format";

describe("initialsFromEmail", () => {
  it("uses the local-part's first two letters, uppercased", () => {
    expect(initialsFromEmail("dev@moldai.local")).toBe("DE");
    expect(initialsFromEmail("atelier@moldai.local")).toBe("AT");
  });
  it("one letter when the local-part has only one", () => {
    expect(initialsFromEmail("a@b.c")).toBe("A");
  });
  it("falls back to '?' when there are no letters", () => {
    expect(initialsFromEmail("123@x.y")).toBe("?");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-08-18T12:00:00.000Z");

  it("returns 'agora' under a minute", () => {
    expect(relativeTime("2026-08-18T11:59:30.000Z", now)).toBe("agora");
  });

  it("returns minutes under an hour", () => {
    expect(relativeTime("2026-08-18T11:45:00.000Z", now)).toBe("há 15 min");
  });

  it("returns hours under a day", () => {
    expect(relativeTime("2026-08-18T09:00:00.000Z", now)).toBe("há 3h");
  });

  it("returns days under a week", () => {
    expect(relativeTime("2026-08-16T12:00:00.000Z", now)).toBe("há 2d");
  });

  it("falls back to a pt-BR date past a week", () => {
    expect(relativeTime("2026-08-01T12:00:00.000Z", now)).toBe(
      new Date("2026-08-01T12:00:00.000Z").toLocaleDateString("pt-BR"),
    );
  });
});
