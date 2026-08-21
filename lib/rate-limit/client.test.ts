import { describe, it, expect } from "vitest";
import { REDIS_OPTIONS } from "./client";

// A regression guard, not a behaviour test: the fail-open-on-cold-start bug was
// caused entirely by these three options, and flipping enableOfflineQueue back
// to false would silently reopen it (the symptom only shows in a real process's
// first request). The behavioural proof is an integration one -- restart the
// server, watch the first signup NOT log "failing open".
describe("REDIS_OPTIONS", () => {
  it("queues commands issued before the socket is ready", () => {
    expect(REDIS_OPTIONS.enableOfflineQueue).toBe(true);
  });

  it("still bounds how long a command waits on an unreachable Redis", () => {
    expect(REDIS_OPTIONS.maxRetriesPerRequest).toBe(1);
    expect(REDIS_OPTIONS.commandTimeout).toBeGreaterThan(0);
    expect(REDIS_OPTIONS.commandTimeout).toBeLessThanOrEqual(2_000);
  });
});
