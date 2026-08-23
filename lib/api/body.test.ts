import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { readJsonObject, hasNulByte } from "./body";

// A literal control character in a source file is awkward and some tooling
// rejects it -- build it at runtime instead, per this module's own comment.
const NUL = String.fromCharCode(0);

function req(raw: string | undefined) {
  return new Request("http://test/api/thing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  });
}

async function code(res: NextResponse) {
  return (await res.json()).error;
}

describe("readJsonObject", () => {
  it("returns the parsed object for a normal body", async () => {
    const body = await readJsonObject(req(JSON.stringify({ name: "Blusa" })));
    expect(body).toEqual({ name: "Blusa" });
  });

  // The bug this exists to prevent: "null" is valid JSON, so it survives
  // request.json() and every `body.field` access afterwards throws.
  it("rejects a literal null body instead of returning it", async () => {
    const body = await readJsonObject(req("null"));
    expect(body).toBeInstanceOf(NextResponse);
    expect((body as NextResponse).status).toBe(400);
    expect(await code(body as NextResponse)).toBe("bad_body");
  });

  it("rejects a JSON scalar body", async () => {
    for (const raw of ["42", '"a string"', "true"]) {
      const body = await readJsonObject(req(raw));
      expect(body, raw).toBeInstanceOf(NextResponse);
    }
  });

  it("rejects an array body", async () => {
    const body = await readJsonObject(req("[1,2,3]"));
    expect(body).toBeInstanceOf(NextResponse);
  });

  it("rejects a malformed body", async () => {
    const body = await readJsonObject(req("{not json"));
    expect(body).toBeInstanceOf(NextResponse);
    expect(await code(body as NextResponse)).toBe("bad_body");
  });

  it("rejects an absent body", async () => {
    const body = await readJsonObject(req(undefined));
    expect(body).toBeInstanceOf(NextResponse);
    expect(await code(body as NextResponse)).toBe("bad_body");
  });
});

// #69: Postgres's jsonb type rejects an embedded NUL code point specifically
// -- verified live against Postgres 16 that every other C0 control
// character (0x01-0x1f) and DEL (0x7f) round-trips through a ::jsonb cast
// fine. hasNulByte is deliberately scoped to just the NUL code point so it
// doesn't also reject a real newline (Shift+Enter in the chat composer).
describe("hasNulByte", () => {
  it("detects a NUL code point anywhere in the string", () => {
    expect(hasNulByte(`a${NUL}b`)).toBe(true);
    expect(hasNulByte(NUL)).toBe(true);
    expect(hasNulByte(`ab${NUL}`)).toBe(true);
  });

  it("does not flag ordinary text, including accented pt-BR characters", () => {
    expect(hasNulByte("Blusa 100% algodão")).toBe(false);
    expect(hasNulByte("")).toBe(false);
  });

  it("does not flag other control characters -- only NUL breaks jsonb", () => {
    expect(hasNulByte("a\nb")).toBe(false); // newline: Shift+Enter in chat
    expect(hasNulByte("a\tb")).toBe(false);
    expect(hasNulByte(`a${String.fromCharCode(0x7f)}b`)).toBe(false); // DEL
    expect(hasNulByte(`a${String.fromCharCode(0x01)}b`)).toBe(false);
  });
});
