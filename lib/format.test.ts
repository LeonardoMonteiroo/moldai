import { describe, it, expect } from "vitest";
import { initialsFromEmail } from "./format";

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
