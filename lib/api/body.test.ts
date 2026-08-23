import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { readJsonObject, hasNulByte, MAX_BODY_BYTES } from "./body";

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

// #65/#55: readJsonObject used to buffer and JSON.parse an unbounded body
// for every route -- a handful of concurrent oversized POSTs (e.g. to the
// unauthenticated /api/signup) could OOM the single app container before
// the rate limiter even ran.
//
// The ceiling below is a literal 65536, not the imported MAX_BODY_BYTES:
// computing test fixtures FROM the same constant the fix reads from would
// make these tests pass vacuously if that constant ever went missing
// (`undefined + 1` -> NaN -> "x".repeat(NaN) silently becomes "", per the
// #101 lesson elsewhere in this repo). A separate assertion below still
// pins the exported constant to that literal.
describe("readJsonObject body-size ceiling", () => {
  const CEILING = 65536;

  it("MAX_BODY_BYTES is 65536 (64 KB)", () => {
    expect(MAX_BODY_BYTES).toBe(CEILING);
  });

  it("accepts a body right at the ceiling", async () => {
    // {"name":"..."} plus padding, landing exactly at the ceiling.
    const padding = "x".repeat(CEILING - JSON.stringify({ name: "" }).length);
    const raw = JSON.stringify({ name: padding });
    expect(Buffer.byteLength(raw)).toBe(CEILING);
    const body = await readJsonObject(req(raw));
    expect(body).not.toBeInstanceOf(NextResponse);
  });

  // Deliberately still *valid* JSON once past the ceiling (a real object,
  // not a truncated blob) -- otherwise this would pass even against the
  // pre-fix code for the wrong reason (malformed JSON always 400s) and
  // never actually exercise the size check.
  it("rejects a body over the ceiling via a declared Content-Length, without reading it", async () => {
    const raw = JSON.stringify({ name: "x".repeat(CEILING + 1) });
    const body = await readJsonObject(req(raw));
    expect(body).toBeInstanceOf(NextResponse);
    expect((body as NextResponse).status).toBe(400);
    expect(await code(body as NextResponse)).toBe("bad_body");
  });

  // A client fully controls whether it declares Content-Length -- a chunked
  // body with no header at all must be bounded the same way, by counting
  // bytes as they stream in, not just by trusting a header that could lie
  // (or simply be absent). Same "still valid JSON" requirement as above.
  it("rejects an over-ceiling body streamed with no Content-Length header", async () => {
    const raw = JSON.stringify({ name: "x".repeat(CEILING + 1) });
    const bytes = new TextEncoder().encode(raw);
    const chunkSize = 1024;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.byteLength; i += chunkSize) {
          controller.enqueue(bytes.slice(i, i + chunkSize));
        }
        controller.close();
      },
    });
    const request = new Request("http://test/api/thing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stream,
      // @ts-expect-error -- required by undici for a streaming body, not
      // part of the standard RequestInit type.
      duplex: "half",
    });
    expect(request.headers.get("content-length")).toBeNull();
    const body = await readJsonObject(request);
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
