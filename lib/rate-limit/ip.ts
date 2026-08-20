// Next 16 has no request.ip (removed in 15), so headers are the only source.
// This is best-effort: x-forwarded-for is spoofable when the app is not behind
// a trusted proxy. The email-keyed buckets in limits.ts are the real backstop.
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return "unknown";
  const first = forwarded.split(",")[0]?.trim();
  return first ? first : "unknown";
}
