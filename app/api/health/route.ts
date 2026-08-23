import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRedis } from "@/lib/rate-limit/client";
import { reportError } from "@/lib/observability/report";

// #100/#73: unauthenticated by design -- a Docker/Compose healthcheck
// carries no session, and this is what gives one something to probe (before
// this, no health endpoint existed at all, so a wedged-but-still-"Up"
// container was indistinguishable from a healthy one). Postgres is a hard
// dependency (every route needs it), so its failure answers 503. Redis is
// not: the rate limiter already fails open by design
// (lib/rate-limit/consume.ts) rather than locking everyone out, so a Redis
// outage is reported in the body but does not flip this endpoint unhealthy
// -- doing so would make Docker restart a perfectly-serving app container
// over a lesser, already-tolerated degradation.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    reportError("health", err, { check: "postgres" });
    return NextResponse.json(
      { status: "error", postgres: "unreachable" },
      { status: 503 },
    );
  }

  let redis: "ok" | "unreachable" = "ok";
  try {
    await getRedis().ping();
  } catch (err) {
    reportError("health", err, { check: "redis" });
    redis = "unreachable";
  }

  return NextResponse.json({ status: "ok", redis });
}
