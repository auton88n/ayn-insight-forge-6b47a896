/**
 * Simple client-side rate limiter using a sliding window.
 * Not a security measure (that must be server-side) — this prevents
 * accidental rapid-fire from UI interactions.
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  canProceed(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }

    this.timestamps.push(now);
    return true;
  }

  getTimeUntilNext(): number {
    if (this.timestamps.length < this.maxRequests) return 0;
    const oldest = this.timestamps[0];
    return this.windowMs - (Date.now() - oldest);
  }

  reset(): void {
    this.timestamps = [];
  }
}

// Shared instances
export const chatRateLimiter = new RateLimiter(5, 10_000);        // 5 messages per 10s
export const engineeringRateLimiter = new RateLimiter(3, 15_000);  // 3 calcs per 15s
export const fileUploadRateLimiter = new RateLimiter(3, 30_000);   // 3 uploads per 30s
