/** Simple per-IP rate limit for browser Live sessions. */
const hits = new Map<string, number[]>();

export function consumeSessionQuota(ip: string, now = Date.now(), limit = 10, windowMs = 60 * 60 * 1000): boolean {
  const cutoff = now - windowMs;
  const recent = (hits.get(ip) ?? []).filter((t) => t > cutoff);
  if (recent.length >= limit) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}
