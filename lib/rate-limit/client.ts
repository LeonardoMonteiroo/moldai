import Redis from "ioredis";

let client: Redis | null = null;

// Lazy: constructing an ioredis instance opens a socket, so a process that
// never rate-limits (and every unit test) stays Redis-free.
export function getRedis(): Redis {
  if (client) return client;
  client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380", {
    // Fail fast rather than queue commands forever while Redis is down --
    // consume() turns the rejection into fail-open.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  // ioredis crashes the process on an unhandled 'error' event. consume()
  // already reports per-call failures, so this only keeps the process alive.
  client.on("error", (err: Error) => {
    console.error("[rate-limit] redis connection error:", err.message);
  });
  return client;
}
