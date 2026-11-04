type Bucket = { hits: number[]; windowMs: number };

const buckets = new Map<string, Bucket>();
let earliestExpiryAt = Number.POSITIVE_INFINITY;

// This is a per-instance defence in depth. The canonical voting commands
// remain responsible for cross-instance integrity and replay protection.
const MAX_KEYS = 5000;
const MAX_KEY_LENGTH = 256;
const MAX_HITS_PER_KEY = 100;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MESSAGE = "Too many attempts. Please wait a moment and try again.";

function trimExpired(bucket: Bucket, now: number) {
  bucket.hits = bucket.hits.filter((time) => now - time < bucket.windowMs);
}

function makeRoomForNewIdentity(now: number) {
  if (buckets.size < MAX_KEYS || now < earliestExpiryAt) return;

  // Avoid a full O(keys * hits) scan for every denied identity at capacity.
  // The earliest retained timestamp tells us when expiry is first possible.
  // Prune using EACH bucket's own window, never the new caller's window.
  let nextExpiryAt = Number.POSITIVE_INFINITY;
  for (const [storedKey, storedBucket] of buckets) {
    trimExpired(storedBucket, now);
    if (storedBucket.hits.length === 0) {
      buckets.delete(storedKey);
    } else {
      nextExpiryAt = Math.min(
        nextExpiryAt,
        storedBucket.hits[0] + storedBucket.windowMs,
      );
    }
  }
  earliestExpiryAt = nextExpiryAt;
}

export function enforceTelevotingRateLimit(
  key: string,
  opts: { limit: number; windowMs: number; message?: string },
) {
  // Bound the memory cost of identities, timestamps and retained windows.
  // Invalid configuration must deny rather than silently disable throttling.
  if (
    !key ||
    key.length > MAX_KEY_LENGTH ||
    !Number.isSafeInteger(opts.limit) ||
    opts.limit < 1 ||
    opts.limit > MAX_HITS_PER_KEY ||
    !Number.isSafeInteger(opts.windowMs) ||
    opts.windowMs < 1 ||
    opts.windowMs > MAX_WINDOW_MS
  ) {
    throw new Error("Voting rate limiting is temporarily unavailable.");
  }

  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    makeRoomForNewIdentity(now);
    if (buckets.size >= MAX_KEYS) {
      // Fail closed rather than let a flood of fresh keys grow memory forever.
      throw new Error(opts.message ?? DEFAULT_MESSAGE);
    }
    bucket = { hits: [], windowMs: opts.windowMs };
    buckets.set(key, bucket);
  } else {
    // The active calling contract owns this key's window.
    bucket.windowMs = opts.windowMs;
    trimExpired(bucket, now);
    // A shorter window may expire earlier even if this attempt is denied.
    // Keep the capacity fast path's expiry bound valid before returning.
    if (bucket.hits.length > 0) {
      earliestExpiryAt = Math.min(earliestExpiryAt, bucket.hits[0] + bucket.windowMs);
    }
  }

  if (bucket.hits.length >= opts.limit) {
    throw new Error(opts.message ?? DEFAULT_MESSAGE);
  }

  bucket.hits.push(now);
  earliestExpiryAt = Math.min(earliestExpiryAt, bucket.hits[0] + bucket.windowMs);
}
