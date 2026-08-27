import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake Prisma: an in-memory "table" of PasswordResetToken rows, mirroring
// lib/db/verification.test.ts's precedent. The one real difference: this
// subject's consumeResetToken (#155) now uses the INTERACTIVE
// `prisma.$transaction(async (tx) => ...)` form (needed to call
// updateUserPasswordHash, an async function, as part of the transaction --
// the array form can't run one of those as one of its own operations), not
// the array form issueResetToken still uses. The fake below supports both
// shapes, dispatching on whether $transaction was called with a function or
// an array of already-in-flight promises.
interface TokenRow {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}
let tokens: TokenRow[] = [];

function deleteManyImpl({
  where,
}: {
  where: { userId?: string; tokenHash?: string };
}): { count: number } {
  const before = tokens.length;
  tokens = tokens.filter((r) => {
    if (where.userId !== undefined && r.userId !== where.userId) return true;
    if (where.tokenHash !== undefined && r.tokenHash !== where.tokenHash) {
      return true;
    }
    return false;
  });
  return { count: before - tokens.length };
}

// The exact object handed to the interactive transaction's callback --
// captured at module scope so a test can assert updateUserPasswordHash was
// called with THIS tx, not some other client, proving the hash write and
// the token deletion below share one transaction.
const fakeTx = {
  passwordResetToken: {
    deleteMany: vi.fn(async (args: { where: { userId?: string } }) =>
      deleteManyImpl(args),
    ),
  },
};

// Mocked by the exact relative specifier lib/db/passwordReset.ts imports
// ("./prisma", not the "@/lib/db/prisma" alias) -- the #166 worktree-trap
// rule this repo's CLAUDE.md records for vi.mock inside lib/db/*.
vi.mock("./prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: typeof fakeTx) => Promise<unknown>)(fakeTx);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
    passwordResetToken: {
      findUnique: vi.fn(
        async ({ where }: { where: { tokenHash: string } }) =>
          tokens.find((r) => r.tokenHash === where.tokenHash) ?? null,
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: { tokenHash: string; userId: string; expiresAt: Date };
        }) => {
          const row: TokenRow = { ...data, createdAt: new Date() };
          tokens.push(row);
          return row;
        },
      ),
      deleteMany: vi.fn(deleteManyImpl),
    },
  },
}));

// Also mocked by its exact relative specifier ("./users"). #155's whole
// point is that consumeResetToken routes through this SAME function the
// /settings password-change path uses (lib/db/users.ts's
// updateUserPasswordHash) instead of a second, hand-written
// `prisma.user.update` -- so this test asserts the call, not a second fake
// User table.
const { updateUserPasswordHash } = vi.hoisted(() => ({
  updateUserPasswordHash: vi.fn(async () => undefined),
}));
vi.mock("./users", () => ({ updateUserPasswordHash }));

import { issueResetToken, consumeResetToken } from "./passwordReset";
import { hashToken } from "@/lib/auth/verification";

const NOW = new Date("2026-08-27T12:00:00Z");

beforeEach(() => {
  tokens = [];
  vi.clearAllMocks();
});

describe("consumeResetToken (#155: stamps passwordChangedAt via updateUserPasswordHash)", () => {
  it("calls updateUserPasswordHash with the new hash, this call's own `now`, and the transaction's tx client", async () => {
    const raw = await issueResetToken("u1", NOW);

    const result = await consumeResetToken(hashToken(raw), "NEW_HASH", NOW);

    expect(result).toEqual({ ok: true, userId: "u1" });
    expect(updateUserPasswordHash).toHaveBeenCalledTimes(1);
    // The 3rd arg is THIS call's own `now` (not a fresh `new Date()` inside
    // updateUserPasswordHash's own default) and the 4th is the interactive
    // transaction's tx -- proving the hash write and the token deletion
    // below run atomically, on the same connection.
    expect(updateUserPasswordHash).toHaveBeenCalledWith(
      "u1",
      "NEW_HASH",
      NOW,
      fakeTx,
    );
  });

  it("is single-use: no row survives a successful reset", async () => {
    const raw = await issueResetToken("u1", NOW);
    await consumeResetToken(hashToken(raw), "NEW_HASH", NOW);

    expect(tokens.filter((r) => r.userId === "u1")).toHaveLength(0);
  });

  it("rejects a wrong/unknown token hash without calling updateUserPasswordHash", async () => {
    await issueResetToken("u1", NOW);

    const result = await consumeResetToken("not-a-real-hash", "NEW_HASH", NOW);

    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(updateUserPasswordHash).not.toHaveBeenCalled();
    // the real token for u1 is untouched
    expect(tokens.filter((r) => r.userId === "u1")).toHaveLength(1);
  });

  it("rejects and deletes an expired token without ever stamping a new hash", async () => {
    const raw = await issueResetToken("u1", NOW);
    const past24hLater = new Date(NOW.getTime() + 24 * 60 * 60 * 1000 + 1);

    const result = await consumeResetToken(
      hashToken(raw),
      "NEW_HASH",
      past24hLater,
    );

    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(updateUserPasswordHash).not.toHaveBeenCalled();
    expect(tokens).toHaveLength(0);
  });

  it("rejects reuse of an already-consumed token", async () => {
    const raw = await issueResetToken("u1", NOW);
    const first = await consumeResetToken(hashToken(raw), "NEW_HASH", NOW);
    expect(first.ok).toBe(true);

    const second = await consumeResetToken(hashToken(raw), "SECOND_HASH", NOW);
    expect(second).toEqual({ ok: false, reason: "invalid" });
    // reuse must not stamp a second hash
    expect(updateUserPasswordHash).toHaveBeenCalledTimes(1);
  });
});
