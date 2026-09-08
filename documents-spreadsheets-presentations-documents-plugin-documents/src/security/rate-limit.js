export class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  consume(key) {
    const now = Date.now();
    const bucket = (this.hits.get(key) || []).filter((stamp) => now - stamp < this.windowMs);
    bucket.push(now);
    this.hits.set(key, bucket);
    return {
      allowed: bucket.length <= this.limit,
      remaining: Math.max(0, this.limit - bucket.length),
      retryAfterMs: bucket.length > this.limit ? this.windowMs - (now - bucket[0]) : 0
    };
  }
}

