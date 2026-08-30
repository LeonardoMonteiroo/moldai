import { describe, it, expect, vi, beforeEach } from "vitest";

const { update, updateMany, del, findUnique, create } = vi.hoisted(() => ({
  update: vi.fn(async (_args: unknown) => undefined),
  updateMany: vi.fn(async (_args: unknown) => undefined),
  del: vi.fn(async (_args: unknown) => undefined),
  findUnique: vi.fn(async (_args: unknown): Promise<unknown> => null),
  create: vi.fn(async (_args: unknown): Promise<unknown> => null),
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
      updateMany,
      delete: del,
      findUnique,
      create,
    },
  },
}));

vi.mock("@/lib/observability/report", () => ({
  reportError: vi.fn(),
}));

import {
  updateUserPasswordHash,
  deleteUser,
  getUserByEmail,
  getUserById,
  updateUserName,
  getOnboardingStatus,
  stampOnboarded,
  createUser,
  isWorkStyle,
  WORK_STYLES,
  stampEmailVerifiedIfMissing,
} from "./users";
import { reportError } from "@/lib/observability/report";
import { Prisma } from "@prisma/client";

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

// ---------------------------------------------------------------------------
// #168: the rest of this repository module. Every function here is a `select`
// list plus an error contract, and both are the kind of thing that breaks
// without a symptom: a widened select leaks a column into a shape whose
// consumers never asked for it, and a swallowed-or-rethrown Prisma error
// decides whether a lost signup race reads as `email_taken` or an HTTP 500.
// ---------------------------------------------------------------------------

const USER_ROW = {
  id: "u1",
  email: "ana@example.com",
  passwordHash: "HASH",
  name: "Ana",
  emailVerified: new Date("2026-08-01T00:00:00Z"),
};

/** Exactly the columns UserRecord is made of -- see lib/auth/types.ts. */
const USER_RECORD_SELECT = {
  id: true,
  email: true,
  passwordHash: true,
  name: true,
  emailVerified: true,
};

describe("getUserByEmail / getUserById", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findUnique.mockResolvedValue(USER_ROW);
  });

  it("looks a user up by email under the UserRecord select", async () => {
    await expect(getUserByEmail(USER_ROW.email)).resolves.toEqual(USER_ROW);
    expect(findUnique).toHaveBeenCalledWith({
      where: { email: USER_ROW.email },
      select: USER_RECORD_SELECT,
    });
  });

  it("looks a user up by id under the same select", async () => {
    await expect(getUserById("u1")).resolves.toEqual(USER_ROW);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: USER_RECORD_SELECT,
    });
  });

  // #62: every page guard and requireUser-adjacent caller keys off this
  // null. Turning a missing row into a thrown error, or into a fabricated
  // empty user, is what let a deleted account keep rendering real screens.
  it.each([
    ["getUserByEmail", () => getUserByEmail("gone@example.com")],
    ["getUserById", () => getUserById("gone")],
  ])(
    "%s resolves null for an account that no longer exists",
    async (_name, call) => {
      findUnique.mockResolvedValue(null);
      await expect(call()).resolves.toBeNull();
    },
  );
});

describe("updateUserName", () => {
  beforeEach(() => update.mockClear());

  it("writes only the name, never touching the credentials", async () => {
    await updateUserName("u1", "Ana Maria");
    expect(update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { name: "Ana Maria" },
    });
  });
});

describe("getOnboardingStatus", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findUnique.mockResolvedValue({ onboardedAt: null });
  });

  // The narrow select is the point of this function existing separately
  // from getUserById: the onboarding gate must not pull passwordHash into a
  // shape it has no use for.
  it("reads onboardedAt alone, not the whole UserRecord", async () => {
    await getOnboardingStatus("u1");
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { onboardedAt: true },
    });
  });

  // Two different nulls the callers must not conflate: a null STATUS means
  // the account is gone (redirect to /login), a null onboardedAt means the
  // wizard has not been seen yet (redirect to /onboarding).
  it("distinguishes a missing account from an un-onboarded one", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getOnboardingStatus("gone")).resolves.toBeNull();

    findUnique.mockResolvedValue({ onboardedAt: null });
    await expect(getOnboardingStatus("u1")).resolves.toEqual({
      onboardedAt: null,
    });
  });
});

describe("stampOnboarded", () => {
  beforeEach(() => update.mockClear());

  it("stamps the timestamp with no work style when none was chosen", async () => {
    await stampOnboarded("u1");
    const call = update.mock.calls[0][0] as {
      data: { onboardedAt: Date; workStyle?: string };
    };
    expect(call.data.onboardedAt).toBeInstanceOf(Date);
    // "Pular por agora" answers nothing -- the column must stay absent
    // rather than be written as null or an empty string.
    expect("workStyle" in call.data).toBe(false);
  });

  it("records the chosen work style alongside the timestamp", async () => {
    await stampOnboarded("u1", "brand");
    const call = update.mock.calls[0][0] as { data: { workStyle?: string } };
    expect(call.data.workStyle).toBe("brand");
  });
});

describe("isWorkStyle", () => {
  it.each(WORK_STYLES)("accepts the %s answer", (value) => {
    expect(isWorkStyle(value)).toBe(true);
  });

  // The column is honest research data, never read by any drafting path, so
  // a value outside the list is rejected rather than stored as-is.
  it.each([
    ["patternMaker"],
    [""],
    ["freelancer"],
    [42],
    [null],
    [undefined],
    [{}],
  ])("rejects %o", (value) => {
    expect(isWorkStyle(value)).toBe(false);
  });
});

describe("createUser", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue(USER_ROW);
  });

  it("inserts under the UserRecord select", async () => {
    const input = {
      email: USER_ROW.email,
      name: USER_ROW.name,
      passwordHash: "HASH",
    };
    await expect(createUser(input)).resolves.toEqual(USER_ROW);
    expect(create).toHaveBeenCalledWith({
      data: input,
      select: USER_RECORD_SELECT,
    });
  });

  // The read-then-insert race createAccount's own pre-read cannot close: two
  // simultaneous signups for one address. The loser must read as
  // `email_taken`, which requires this null rather than a thrown P2002.
  it("resolves null when the unique email constraint fires", async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "6",
      }),
    );
    await expect(
      createUser({ email: "a@b.co", name: "A", passwordHash: "H" }),
    ).resolves.toBeNull();
  });

  // ...but only P2002. Swallowing anything else would turn a broken
  // database into a silent "email already registered".
  it.each([
    [
      "a different Prisma error code",
      new Prisma.PrismaClientKnownRequestError("nope", {
        code: "P2003",
        clientVersion: "6",
      }),
    ],
    ["a connection failure", new Error("ECONNREFUSED")],
  ])(
    "rethrows %s instead of reporting the email as taken",
    async (_name, error) => {
      create.mockRejectedValue(error);
      await expect(
        createUser({ email: "a@b.co", name: "A", passwordHash: "H" }),
      ).rejects.toBe(error);
    },
  );
});

describe("stampEmailVerifiedIfMissing", () => {
  beforeEach(() => updateMany.mockClear());

  // #235: an existing Credentials account that never clicked its own mail
  // link, now proven by Google instead. The WHERE clause (not a
  // read-then-write) is what makes this a single atomic statement rather
  // than a race between a read and a write.
  it("targets only a row whose emailVerified is still null", async () => {
    const before = Date.now();
    await stampEmailVerifiedIfMissing("u1");
    const after = Date.now();

    expect(updateMany).toHaveBeenCalledTimes(1);
    const call = updateMany.mock.calls[0][0] as {
      where: { id: string; emailVerified: null };
      data: { emailVerified: Date };
    };
    expect(call.where).toEqual({ id: "u1", emailVerified: null });
    const stampedAt = call.data.emailVerified.getTime();
    expect(stampedAt).toBeGreaterThanOrEqual(before);
    expect(stampedAt).toBeLessThanOrEqual(after);
  });

  it("accepts an injected `now` for deterministic tests", async () => {
    const now = new Date("2026-08-30T12:00:00.000Z");
    await stampEmailVerifiedIfMissing("u1", now);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "u1", emailVerified: null },
      data: { emailVerified: now },
    });
  });
});
