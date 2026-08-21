import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/users", () => ({ updateUserName: vi.fn() }));

import { PATCH } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { updateUserName } from "@/lib/db/users";

function req(body: unknown) {
  return new Request("http://test", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/account/profile", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(updateUserName).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: "Dev",
    });
    vi.mocked(updateUserName).mockResolvedValue(undefined);
  });

  it("updates the name and returns it", async () => {
    const res = await PATCH(req({ name: "Ateliê Dev" }));
    expect(updateUserName).toHaveBeenCalledWith("u1", "Ateliê Dev");
    expect(await res.json()).toEqual({
      status: "ok",
      name: "Ateliê Dev",
      email: "dev@moldai.local",
    });
  });

  it("trims the name before saving", async () => {
    await PATCH(req({ name: "  Ateliê Dev  " }));
    expect(updateUserName).toHaveBeenCalledWith("u1", "Ateliê Dev");
  });

  it("400s on a blank name", async () => {
    const res = await PATCH(req({ name: "   " }));
    expect(res.status).toBe(400);
    expect(updateUserName).not.toHaveBeenCalled();
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await PATCH(req({ name: "Ateliê Dev" }));
    expect(res.status).toBe(401);
    expect(updateUserName).not.toHaveBeenCalled();
  });

  it("answers invalid_name as a code, not pt-BR prose", async () => {
    const res = await PATCH(req({ name: "   " }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      status: "error",
      error: "invalid_name",
    });
  });

  it("answers bad_body as a code when the body is not JSON", async () => {
    const res = await PATCH(
      new Request("http://test", { method: "PATCH", body: "not json" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
  });

  // "null" parses fine, so it slipped past the catch and threw on body.name.
  it("answers bad_body for a literal null body instead of throwing", async () => {
    const res = await PATCH(req(null));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
    expect(updateUserName).not.toHaveBeenCalled();
  });
});
