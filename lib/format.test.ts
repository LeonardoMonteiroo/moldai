import { describe, it, expect } from "vitest";
import { initialsFromEmail } from "./format";

describe("initialsFromEmail", () => {
  it("usa as duas primeiras letras do local-part, maiúsculas", () => {
    expect(initialsFromEmail("dev@moldai.local")).toBe("DE");
    expect(initialsFromEmail("atelier@moldai.local")).toBe("AT");
  });
  it("uma letra quando o local-part tem só uma", () => {
    expect(initialsFromEmail("a@b.c")).toBe("A");
  });
  it("fallback '?' quando não há letras", () => {
    expect(initialsFromEmail("123@x.y")).toBe("?");
  });
});
