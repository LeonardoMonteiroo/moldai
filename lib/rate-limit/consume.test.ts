import { describe, it, expect, vi, beforeEach } from "vitest";

interface Entry {
  count: number;
  ttl: number;
}

const store = new Map<string, Entry>();
let failWith: Error | null = null;
// Simulates a Redis < 7.0 server: the NX flag on EXPIRE needs 7.0+, so on an
// older server EXPIRE ... NX errors while INCR still succeeds, and the key
// never gets a TTL through the MULTI alone.
let expireNxFails = false;
const del = vi.fn(async (key: string) => {
  store.delete(key);
  return 1;
});
// The plain, NX-less EXPIRE consume() falls back to when the MULTI's TTL
// comes back <= 0. Every Redis version supports it.
const expire = vi.fn(async (key: string, windowSec: number) => {
  const entry = store.get(key) ?? { count: 0, ttl: 0 };
  entry.ttl = windowSec;
  store.set(key, entry);
  return 1;
});

class FakeMulti {
  private key = "";
  private windowSec = 0;
  incr(key: string) {
    this.key = key;
    return this;
  }
  expire(_key: string, windowSec: number, _mode: string) {
    this.windowSec = windowSec;
    return this;
  }
  ttl(_key: string) {
    return this;
  }
  async exec() {
    if (failWith) throw failWith;
    const entry = store.get(this.key) ?? {
      count: 0,
      ttl: expireNxFails ? 0 : this.windowSec,
    };
    entry.count += 1;
    store.set(this.key, entry);
    return [
      [null, entry.count],
      expireNxFails ? [new Error("ERR NX not supported"), null] : [null, 1],
      [null, entry.ttl],
    ];
  }
}

vi.mock("./client", () => ({
  getRedis: () => ({ multi: () => new FakeMulti(), del, expire }),
}));

import { consume, reset } from "./consume";

describe("consume", () => {
  beforeEach(() => {
    store.clear();
    failWith = null;
    expireNxFails = false;
    del.mockClear();
    expire.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("allows requests up to the limit", async () => {
    // signup is 5/hour
    for (let i = 0; i < 5; i++) {
      expect((await consume("signup", "1.1.1.1")).allowed).toBe(true);
    }
  });

  it("denies the request past the limit", async () => {
    for (let i = 0; i < 5; i++) await consume("signup", "1.1.1.1");
    expect((await consume("signup", "1.1.1.1")).allowed).toBe(false);
  });

  it("keys buckets and ids independently", async () => {
    for (let i = 0; i < 6; i++) await consume("signup", "1.1.1.1");
    expect((await consume("signup", "2.2.2.2")).allowed).toBe(true);
    expect((await consume("login", "1.1.1.1")).allowed).toBe(true);
  });

  it("reports retryAfterSec from the key's remaining TTL", async () => {
    store.set("rl:signup:1.1.1.1", { count: 5, ttl: 42 });
    const r = await consume("signup", "1.1.1.1");
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBe(42);
  });

  it("fails open when the client throws", async () => {
    failWith = new Error("ECONNREFUSED");
    const r = await consume("signup", "1.1.1.1");
    expect(r.allowed).toBe(true);
    expect(console.error).toHaveBeenCalled();
  });

  it("falls back to a plain EXPIRE when EXPIRE ... NX errors, so the key can't grow forever", async () => {
    expireNxFails = true;
    const r = await consume("signup", "9.9.9.9");
    expect(r.allowed).toBe(true);
    // Real Redis < 7.0 rejects EXPIRE ... NX while INCR still succeeds, so
    // the key never gets a TTL through the MULTI alone. The old code
    // destructured the replies as `const [incr, , ttl] = res`, discarding the
    // EXPIRE reply and never falling back -- the key would grow forever,
    // denying this IP/email permanently and silently once past the limit,
    // with no way to recover. The fix notices the missing TTL (ttl <= 0) and
    // applies a plain EXPIRE, which every Redis version supports.
    expect(expire).toHaveBeenCalledWith("rl:signup:9.9.9.9", 3600);
  });

  it("reset deletes the bucket's key", async () => {
    await consume("login_email", "dev@moldai.local");
    await reset("login_email", "dev@moldai.local");
    expect(del).toHaveBeenCalledWith("rl:login_email:dev@moldai.local");
  });
});
