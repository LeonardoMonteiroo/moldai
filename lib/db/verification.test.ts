import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake Prisma: an in-memory "table" of EmailVerificationToken rows plus a
// user store recording emailVerified stamps -- same in-memory-rows precedent
// as lib/db/pattern.test.ts / lib/db/sloper.test.ts.
//
// The critical difference from those fakes: lib/db/verification.ts uses the
// ARRAY form `prisma.$transaction([...])`, not the callback form
// wallet.ts/pattern.ts use. Each op fake below executes eagerly the moment
// it's called (not lazily inside a callback), so `$transaction` just needs
// to await the already-in-flight promises -- assertions are made on the
// resulting fake-store state, not on call ordering.
interface TokenRow {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}
let tokens: TokenRow[] = [];
let userVerifiedAt: Record<string, Date | null> = {};

// #166: matches the specifier this file's own subject imports (see
// lib/db/aliasResolution.test.ts and CLAUDE.md's testing-conventions note).
vi.mock("./prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    emailVerificationToken: {
      findUnique: vi.fn(
        async ({ where }: { where: { tokenHash: string } }) =>
          tokens.find((r) => r.tokenHash === where.tokenHash) ?? null,
      ),
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { userId: string };
        }): Promise<{ createdAt: Date } | null> => {
          const rows = tokens
            .filter((r) => r.userId === where.userId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          return rows[0] ? { createdAt: rows[0].createdAt } : null;
        },
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
      deleteMany: vi.fn(
        async ({
          where,
        }: {
          where: { userId?: string; tokenHash?: string };
        }): Promise<{ count: number }> => {
          const before = tokens.length;
          tokens = tokens.filter((r) => {
            if (where.userId !== undefined && r.userId !== where.userId)
              return true;
            if (
              where.tokenHash !== undefined &&
              r.tokenHash !== where.tokenHash
            )
              return true;
            return false;
          });
          return { count: before - tokens.length };
        },
      ),
    },
    user: {
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { emailVerified: Date };
        }) => {
          userVerifiedAt[where.id] = data.emailVerified;
          return { id: where.id };
        },
      ),
    },
  },
}));

import { issueToken, consumeToken, lastIssuedAt } from "./verification";
import { hashToken } from "@/lib/auth/verification";

const NOW = new Date("2026-08-26T12:00:00Z");

beforeEach(() => {
  tokens = [];
  userVerifiedAt = {};
  vi.clearAllMocks();
});

describe("issueToken", () => {
  it("is newest-only: issuing again deletes the user's prior tokens", async () => {
    const first = await issueToken("u1", NOW);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toBe(hashToken(first));

    const later = new Date(NOW.getTime() + 1000);
    const second = await issueToken("u1", later);

    // exactly one row survives, and it's the newest one
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toBe(hashToken(second));
    expect(tokens[0].tokenHash).not.toBe(hashToken(first));

    // the first raw token no longer resolves to a stored row
    expect(
      tokens.find((r) => r.tokenHash === hashToken(first)),
    ).toBeUndefined();
  });

  it("does not touch another user's tokens", async () => {
    const otherUsers = await issueToken("u2", NOW);
    await issueToken("u1", NOW);
    expect(
      tokens.find((r) => r.tokenHash === hashToken(otherUsers)),
    ).toBeDefined();
  });

  it("returns the raw token whose sha-256 digest is what gets stored", async () => {
    const raw = await issueToken("u1", NOW);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toBe(hashToken(raw));
    // the raw token itself is never persisted verbatim
    expect(tokens[0].tokenHash).not.toBe(raw);
  });
});

describe("consumeToken", () => {
  it("accepts a valid token, stamps emailVerified, and is single-use: no row survives", async () => {
    const raw = await issueToken("u1", NOW);
    const result = await consumeToken(hashToken(raw), NOW);

    expect(result).toEqual({ ok: true, userId: "u1" });
    expect(userVerifiedAt["u1"]).toEqual(NOW);
    expect(tokens.filter((r) => r.userId === "u1")).toHaveLength(0);
  });

  it("rejects reuse of an already-consumed token", async () => {
    const raw = await issueToken("u1", NOW);
    const first = await consumeToken(hashToken(raw), NOW);
    expect(first.ok).toBe(true);

    const second = await consumeToken(hashToken(raw), NOW);
    expect(second).toEqual({ ok: false, reason: "invalid" });
    // reuse must not re-stamp or otherwise mutate state
    expect(tokens).toHaveLength(0);
  });

  it("rejects a wrong/unknown token hash", async () => {
    await issueToken("u1", NOW);
    const result = await consumeToken("not-a-real-hash", NOW);
    expect(result).toEqual({ ok: false, reason: "invalid" });
    // the real token for u1 is untouched
    expect(tokens.filter((r) => r.userId === "u1")).toHaveLength(1);
  });

  it("rejects and deletes an expired token", async () => {
    const raw = await issueToken("u1", NOW);
    const past24hLater = new Date(NOW.getTime() + 24 * 60 * 60 * 1000 + 1);

    const result = await consumeToken(hashToken(raw), past24hLater);

    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(tokens).toHaveLength(0);
    // an expired-and-rejected token must not stamp verification
    expect(userVerifiedAt["u1"]).toBeUndefined();
  });

  it("does not delete other users' tokens when consuming one user's token", async () => {
    const rawOther = await issueToken("u2", NOW);
    const raw = await issueToken("u1", NOW);

    await consumeToken(hashToken(raw), NOW);

    expect(
      tokens.find((r) => r.tokenHash === hashToken(rawOther)),
    ).toBeDefined();
  });
});

describe("lastIssuedAt", () => {
  it("returns null when the user has no token", async () => {
    expect(await lastIssuedAt("u1")).toBeNull();
  });

  it("returns the newest createdAt across multiple issuances", async () => {
    // issueToken is itself newest-only, so to observe "newest" pick logic
    // meaningfully we insert rows directly rather than only via issueToken.
    const older = new Date(NOW.getTime() - 60_000);
    const newer = new Date(NOW.getTime());
    tokens.push(
      {
        tokenHash: "hash-older",
        userId: "u1",
        expiresAt: NOW,
        createdAt: older,
      },
      {
        tokenHash: "hash-newer",
        userId: "u1",
        expiresAt: NOW,
        createdAt: newer,
      },
    );

    expect(await lastIssuedAt("u1")).toEqual(newer);
  });
});
