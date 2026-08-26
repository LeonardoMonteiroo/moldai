import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  changedSourceFiles,
  resolveBaseRef,
  mergeBaseChangedFiles,
  readLastVerifiedSha,
  writeLastVerifiedSha,
} from "./verify-on-stop.mjs";

function git(cwd, args) {
  const res = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

/** A throwaway repo with app/lib/components dirs, an initial commit on "main", and a
 *  git identity/no-gpg config so commits succeed unattended. */
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-on-stop-test-"));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  for (const d of ["app", "lib", "components"]) {
    fs.mkdirSync(path.join(dir, d), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, "app", "seed.ts"), "export const seed = 1;\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "initial"]);
  return dir;
}

function rmRepo(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("changedSourceFiles", () => {
  let dir;

  afterEach(() => {
    if (dir) rmRepo(dir);
    dir = undefined;
  });

  it("returns nothing when the tree is clean and there is no divergence from base", () => {
    dir = makeRepo();
    const result = changedSourceFiles(dir);
    expect(result).not.toBeNull();
    expect(result.changed.size).toBe(0);
    expect(result.committedOnly).toBe(false);
  });

  it("detects a working-tree (uncommitted) change under a scoped dir", () => {
    dir = makeRepo();
    fs.writeFileSync(path.join(dir, "lib", "new.ts"), "export const x = 1;\n");
    const result = changedSourceFiles(dir);
    expect([...result.changed]).toContain("lib/new.ts");
    expect(result.committedOnly).toBe(false);
    expect(result.headSha).toBeNull();
  });

  it("detects a committed-but-unpushed change once the tree is clean again (issue #76)", () => {
    dir = makeRepo();
    // Work on a feature branch so a local "main" is resolvable as the base ref.
    git(dir, ["checkout", "-q", "-b", "feature"]);
    fs.writeFileSync(path.join(dir, "components", "New.tsx"), "export const New = () => null;\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "feat: add New"]);

    // Working tree is clean now — the old status-only check would see nothing.
    const status = git(dir, ["status", "--porcelain"]);
    expect(status.trim()).toBe("");

    const result = changedSourceFiles(dir);
    expect(result).not.toBeNull();
    expect([...result.changed]).toContain("components/New.tsx");
    expect(result.committedOnly).toBe(true);
    expect(result.headSha).toMatch(/^[0-9a-f]{40}$/);
    // cacheKey combines HEAD with the resolved merge-base, not a bare HEAD sha (a moved
    // base ref must invalidate the cache — see mergeBaseChangedFiles's own test below).
    expect(result.cacheKey).toBe(`${result.headSha}:${git(dir, ["rev-parse", "main"]).trim()}`);
  });

  it("prefers working-tree changes and does not also compute the merge-base diff", () => {
    dir = makeRepo();
    git(dir, ["checkout", "-q", "-b", "feature"]);
    fs.writeFileSync(path.join(dir, "components", "New.tsx"), "export const New = () => null;\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "feat: add New"]);
    // Now dirty the tree again on top of the commit.
    fs.writeFileSync(path.join(dir, "lib", "dirty.ts"), "export const dirty = 1;\n");

    const result = changedSourceFiles(dir);
    expect(result.committedOnly).toBe(false);
    expect(result.headSha).toBeNull();
    // Only the dirty working-tree file is reported — the committed one is not unioned in
    // when the tree isn't clean, matching the pre-#76 behaviour for the common case.
    expect([...result.changed]).toEqual(["lib/dirty.ts"]);
  });
});

describe("resolveBaseRef / mergeBaseChangedFiles", () => {
  let dir;

  afterEach(() => {
    if (dir) rmRepo(dir);
    dir = undefined;
  });

  it("falls back to a local main/master branch when no upstream/origin exists", () => {
    dir = makeRepo();
    git(dir, ["checkout", "-q", "-b", "feature"]);
    expect(resolveBaseRef(dir)).toBe("main");
  });

  it("returns null when nothing resolves (no main/master/origin at all)", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-on-stop-test-empty-"));
    git(dir, ["init", "-q"]);
    git(dir, ["config", "user.email", "test@example.com"]);
    git(dir, ["config", "user.name", "Test"]);
    // No commits at all -> no branch ref exists yet.
    expect(resolveBaseRef(dir)).toBeNull();
    rmRepo(dir);
    dir = undefined;
  });

  it("is empty (never null) when there is nothing to diff, even with no base", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-on-stop-test-empty2-"));
    git(dir, ["init", "-q"]);
    fs.mkdirSync(path.join(dir, "lib"));
    const result = mergeBaseChangedFiles(dir, ["lib"]);
    expect(result.changed.size).toBe(0);
    expect(result.mergeBaseSha).toBeNull();
  });

  it("resolves the actual merge-base commit sha, not just the base ref's name", () => {
    dir = makeRepo();
    const mainSha = git(dir, ["rev-parse", "HEAD"]).trim();
    git(dir, ["checkout", "-q", "-b", "feature"]);
    fs.writeFileSync(path.join(dir, "lib", "new.ts"), "export const x = 1;\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "feat: add new.ts"]);

    const result = mergeBaseChangedFiles(dir, ["lib"]);
    expect([...result.changed]).toContain("lib/new.ts");
    expect(result.mergeBaseSha).toBe(mainSha);
  });
});

describe("re-verify cache", () => {
  it("round-trips a sha for a given root", () => {
    const fakeRoot = path.join(os.tmpdir(), `verify-on-stop-cache-root-${Date.now()}`);
    expect(readLastVerifiedSha(fakeRoot)).toBeNull();
    writeLastVerifiedSha(fakeRoot, "abc123");
    expect(readLastVerifiedSha(fakeRoot)).toBe("abc123");
    // Overwriting with a new sha replaces the cached value.
    writeLastVerifiedSha(fakeRoot, "def456");
    expect(readLastVerifiedSha(fakeRoot)).toBe("def456");
  });

  it("is scoped per root — different roots never collide", () => {
    const rootA = path.join(os.tmpdir(), `verify-on-stop-cache-a-${Date.now()}`);
    const rootB = path.join(os.tmpdir(), `verify-on-stop-cache-b-${Date.now()}`);
    writeLastVerifiedSha(rootA, "sha-a");
    expect(readLastVerifiedSha(rootB)).not.toBe("sha-a");
  });
});
