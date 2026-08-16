type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export function enforceTelevotingRateLimit(
  key: string,
  opts: { limit: number; windowMs: number; message?: string },
) {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((time) => now - time < opts.windowMs);

  if (bucket.hits.length >= opts.limit) {
    buckets.set(key, bucket);
    throw new Error(
      opts.message ?? "Too many attempts. Please wait a moment and try again.",
    );
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  if (buckets.size > MAX_KEYS) {
    for (const [storedKey, storedBucket] of buckets) {
      if (storedBucket.hits.every((time) => now - time >= opts.windowMs)) {
        buckets.delete(storedKey);
      }
      if (buckets.size <= MAX_KEYS) break;
    }
  }
}
