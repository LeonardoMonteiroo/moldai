import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { readJsonObject } from "./body";

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
