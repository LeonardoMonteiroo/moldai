import Redis from "ioredis";

let client: Redis | null = null;

/**
 * Connection options, exported so they can be asserted rather than only
 * eyeballed -- `enableOfflineQueue` in particular is a correctness setting
 * here, not a preference.
 *
 * It used to be `false`, to "fail fast rather than queue commands forever".
 * But ioredis connects lazily, so the first commands after process start were
 * issued before the socket was writeable and were rejected outright --
 * "Stream isn't writeable and enableOfflineQueue options is false". consume()
 * turned that into fail-open, which meant the first sensitive request of every
 * fresh process (each deploy, restart and scale-out) was served with no rate
 * limiting at all. Measured against a healthy Redis: both consume() calls in
 * the very first signup failed open.
 *
 * Queuing during the initial connect closes that window. "Forever" is not the
 * alternative: maxRetriesPerRequest bounds the reconnect attempts a queued
 * command waits through, and commandTimeout is a hard ceiling on any single
 * command, so a genuinely unreachable Redis still fails open -- just after a
 * bounded wait instead of instantly.
 */
export const REDIS_OPTIONS = {
  // Queue commands issued before the socket is ready (the initial connect),
  // instead of rejecting them and silently losing the limit.
  enableOfflineQueue: true,
  // Bounds how long a queued/in-flight command waits on a dead server.
  maxRetriesPerRequest: 1,
  // Hard per-command ceiling so the auth path can never hang on Redis.
  commandTimeout: 1_000,
} as const;

// Lazy: constructing an ioredis instance opens a socket, so a process that
// never rate-limits (and every unit test) stays Redis-free.
export function getRedis(): Redis {
  if (client) return client;
  client = new Redis(
    process.env.REDIS_URL ?? "redis://localhost:6380",
    REDIS_OPTIONS,
  );
  // ioredis crashes the process on an unhandled 'error' event. consume()
  // already reports per-call failures, so this only keeps the process alive.
  client.on("error", (err: Error) => {
    console.error("[rate-limit] redis connection error:", err.message);
  });
  return client;
}
