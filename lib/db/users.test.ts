import { describe, it, expect, vi, beforeEach } from "vitest";

const { update, del } = vi.hoisted(() => ({
  update: vi.fn(async (_args: unknown) => undefined),
  del: vi.fn(async (_args: unknown) => undefined),
}));

// #15: mocked by the SAME relative specifier users.ts itself imports
// ("./prisma", not the "@/lib/db/prisma" alias) -- on this sandbox's
// Windows/junctioned-node_modules setup, vi.mock's alias-resolved specifier
// and users.ts's relative import were observed to resolve to distinct
// module ids, so the mock silently never intercepted and prisma.user.update/
// delete ran against a real (unreachable) PrismaClient. Matching the exact
// specifier removes any alias-vs-relative resolution ambiguity.
vi.mock("./prisma", () => ({
  prisma: {
    user: {
      update,
      delete: del,
    },
  },
}));

vi.mock("@/lib/observability/report", () => ({
  reportError: vi.fn(),
}));

import { updateUserPasswordHash, deleteUser } from "./users";
import { reportError } from "@/lib/observability/report";

describe("updateUserPasswordHash", () => {
  beforeEach(() => {
    update.mockClear();
  });

  // #29: the stamp has to land in the SAME prisma.user.update call as the
  // hash -- a separate write could succeed on one and fail on the other,
  // leaving a changed password with no timestamp or vice versa.
  it("stamps passwordChangedAt in the same write as the password hash", async () => {
    const before = Date.now();
    await updateUserPasswordHash("u1", "NEW_HASH");
    const after = Date.now();

    expect(update).toHaveBeenCalledTimes(1);
    const call = update.mock.calls[0][0] as {
      where: { id: string };
      data: { passwordHash: string; passwordChangedAt: Date };
    };
    expect(call.where).toEqual({ id: "u1" });
    expect(call.data.passwordHash).toBe("NEW_HASH");
    expect(call.data.passwordChangedAt).toBeInstanceOf(Date);
    const stampedAt = call.data.passwordChangedAt.getTime();
    expect(stampedAt).toBeGreaterThanOrEqual(before);
    expect(stampedAt).toBeLessThanOrEqual(after);
  });
});

describe("deleteUser", () => {
  beforeEach(() => {
    del.mockClear();
    vi.mocked(reportError).mockClear();
  });

  it("deletes the row and reports the deletion for the operator's log", async () => {
    await deleteUser("u1");

    expect(del).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(reportError).toHaveBeenCalledWith(
      "account.delete",
      expect.anything(),
      { userId: "u1" },
    );
  });

  // Never logs the password, the hash, or any token -- only the userId, in
  // line with the resend-mail log precedent this mirrors.
  it("does not include a password or hash in the reported context", async () => {
    await deleteUser("u1");

    const context = vi.mocked(reportError).mock.calls[0][2];
    expect(context).toEqual({ userId: "u1" });
  });
});
