import { LIMITS, type Bucket } from "./limits";
import { getRedis } from "./client";

export interface ConsumeResult {
  allowed: boolean;
  retryAfterSec: number;
}

function redisKey(bucket: Bucket, id: string): string {
  return `rl:${bucket}:${id}`;
}

// One atomic round trip. EXPIRE ... NX (Redis 7+) sets the TTL only when none
// exists, making this a fixed window that starts on the first request and
// expires itself -- no sweep job, unlike a Postgres-table implementation.
export async function consume(
  bucket: Bucket,
  id: string,
): Promise<ConsumeResult> {
  const { limit, windowSec } = LIMITS[bucket];
  const key = redisKey(bucket, id);
  try {
    const res = await getRedis()
      .multi()
      .incr(key)
      .expire(key, windowSec, "NX")
      .ttl(key)
      .exec();
    if (!res) throw new Error("redis MULTI aborted");

    const [incr, , ttl] = res as [Error | null, unknown][];
    if (incr[0]) throw incr[0];

    const count = typeof incr[1] === "number" ? incr[1] : 0;
    const remainingTtl = typeof ttl?.[1] === "number" ? ttl[1] : -1;

    return {
      allowed: count <= limit,
      retryAfterSec: remainingTtl > 0 ? remainingTtl : windowSec,
    };
  } catch (err) {
    // Fail open. An auth system that locks everyone out when its cache dies is
    // worse than one that briefly loses throttling. The trade is explicit:
    // while Redis is down, there is no rate limiting.
    console.error(`[rate-limit] ${bucket} failing open:`, err);
    return { allowed: true, retryAfterSec: 0 };
  }
}

// Called after a correct password so a user who mistypes twice then succeeds is
// not penalised, while a brute-force run against one account still hits the wall.
export async function reset(bucket: Bucket, id: string): Promise<void> {
  try {
    await getRedis().del(redisKey(bucket, id));
  } catch (err) {
    console.error(`[rate-limit] reset ${bucket} failed:`, err);
  }
}
