import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/users", () => ({
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
}));
vi.mock("@/lib/auth/hash", () => ({ hashPassword: vi.fn() }));

import { POST } from "./route";
import { getUserByEmail, createUser } from "@/lib/db/users";
import { hashPassword } from "@/lib/auth/hash";

function req(body: unknown) {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const VALID = {
  name: "Leonardo",
  email: "novo@moldai.local",
  password: "senha-forte",
};

describe("POST /api/signup", () => {
  beforeEach(() => {
    vi.mocked(getUserByEmail).mockReset();
    vi.mocked(createUser).mockReset();
    vi.mocked(hashPassword).mockReset();
    vi.mocked(getUserByEmail).mockResolvedValue(null);
    vi.mocked(hashPassword).mockResolvedValue("hashed");
    vi.mocked(createUser).mockResolvedValue({
      id: "new",
      email: "novo@moldai.local",
      passwordHash: "hashed",
      name: "Leonardo",
    });
  });

  it("creates the account and returns ok", async () => {
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(createUser).toHaveBeenCalledWith({
      email: "novo@moldai.local",
      name: "Leonardo",
      passwordHash: "hashed",
    });
  });

  it("never returns the password hash to the client", async () => {
    const res = await POST(req(VALID));
    expect(JSON.stringify(await res.json())).not.toContain("hashed");
  });

  it("409s with email_taken when the address exists", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({
      id: "u1",
      email: "novo@moldai.local",
      passwordHash: "x",
      name: null,
    });
    const res = await POST(req(VALID));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      status: "error",
      error: "email_taken",
    });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("409s with email_taken when the insert loses the race", async () => {
    vi.mocked(createUser).mockResolvedValue(null);
    const res = await POST(req(VALID));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      status: "error",
      error: "email_taken",
    });
  });

  it("400s with invalid_name on a blank name", async () => {
    const res = await POST(req({ ...VALID, name: "  " }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_name",
    });
  });

  it("400s with invalid_email on a malformed address", async () => {
    const res = await POST(req({ ...VALID, email: "nope" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_email",
    });
  });

  it("400s with weak_password under 8 characters", async () => {
    const res = await POST(req({ ...VALID, password: "curta12" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "weak_password",
    });
  });

  it("400s with bad_body on unparseable JSON", async () => {
    const res = await POST(
      new Request("http://test", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
    expect(createUser).not.toHaveBeenCalled();
  });
});
