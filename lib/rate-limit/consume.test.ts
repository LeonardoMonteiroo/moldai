import { describe, it, expect, vi, beforeEach } from "vitest";

interface Entry {
  count: number;
  ttl: number;
}

const store = new Map<string, Entry>();
let failWith: Error | null = null;
const del = vi.fn(async (key: string) => {
  store.delete(key);
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
    const entry = store.get(this.key) ?? { count: 0, ttl: this.windowSec };
    entry.count += 1;
    store.set(this.key, entry);
    return [
      [null, entry.count],
      [null, 1],
      [null, entry.ttl],
    ];
  }
}

vi.mock("./client", () => ({
  getRedis: () => ({ multi: () => new FakeMulti(), del }),
}));

import { consume, reset } from "./consume";

describe("consume", () => {
  beforeEach(() => {
    store.clear();
    failWith = null;
    del.mockClear();
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

  it("reset deletes the bucket's key", async () => {
    await consume("login_email", "dev@moldai.local");
    await reset("login_email", "dev@moldai.local");
    expect(del).toHaveBeenCalledWith("rl:login_email:dev@moldai.local");
  });
});
