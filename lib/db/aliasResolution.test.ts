import { describe, it, expect, vi } from "vitest";

// #166 regression guard.
//
// vitest.workspace.ts's `resolve.alias["@"]` must resolve to the checkout
// vitest is actually running from -- not, e.g., a nested git worktree's
// OUTER repository, which is the failure this issue tracks. When that
// resolution goes wrong, `vi.mock("@/...")` and a subject module's own
// *relative* import of the identical file stop being the same module id to
// Vite/vite-node's module graph: the mock silently never intercepts, and
// whatever the subject imported runs for real instead -- in lib/db/*.ts's
// case, a real (and here unreachable) PrismaClient. That failure mode is
// the worst kind: not a resolution error, just an ordinary-looking
// assertion failure or a hung real network call.
//
// This test pins the mechanism directly: mock lib/db/prisma.ts via its
// "@/..." specifier (the form several lib/db/*.test.ts files already use),
// then load the SAME file two ways -- once through that alias, once through
// the relative specifier the real lib/db/*.ts subjects use ("./prisma") --
// and assert both imports hand back the identical mocked object. If the
// alias ever resolves against the wrong root again, this fails immediately
// instead of surfacing as an unrelated-looking DB connection error deep in
// some other suite.
vi.mock("@/lib/db/prisma", () => ({
  prisma: { __mocked: true },
}));

describe("vitest alias resolution (#166)", () => {
  it("collapses an @/ specifier and a relative specifier for the same file into one module", async () => {
    const viaAlias = await import("@/lib/db/prisma");
    const viaRelative = await import("./prisma");

    // Same object identity, not just structurally-equal copies -- proves
    // vi.mock's interception (keyed on the alias-resolved module id) is
    // also what the relative import receives.
    expect(viaRelative.prisma).toBe(viaAlias.prisma);
    expect(viaRelative.prisma).toEqual({ __mocked: true });
  });
});
