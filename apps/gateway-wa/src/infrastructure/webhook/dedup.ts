/**
 * T19 — Webhook deduplication tracker.
 *
 * In-memory deduplication for Evolution API webhooks.
 * Stores processed messageIds with timestamps to detect
 * duplicate delivery within a configurable time window.
 *
 * Zero dependencies. Thread-safe not needed (Node.js single-threaded).
 */

const DEFAULT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export class DedupTracker {
  private seen = new Map<string, number>();
  private readonly windowMs: number;

  constructor(windowMs: number = DEFAULT_WINDOW_MS) {
    this.windowMs = windowMs;
  }

  /**
   * Check if messageId was already seen within the dedup window.
   * Returns true if duplicate (already processed within window).
   * Records the messageId if new or expired; does NOT update
   * timestamp on duplicate (preserves original first-seen time).
   * Performs lazy cleanup of expired entries.
   */
  isDuplicate(messageId: string): boolean {
    const now = Date.now();
    this.cleanup(now);

    const lastSeen = this.seen.get(messageId);
    if (lastSeen !== undefined && now - lastSeen < this.windowMs) {
      return true;
    }

    this.seen.set(messageId, now);
    return false;
  }

  /**
   * Remove entries older than windowMs. Called lazily on each check
   * to prevent unbounded memory growth.
   */
  private cleanup(now: number): void {
    for (const [id, timestamp] of this.seen) {
      if (now - timestamp > this.windowMs) {
        this.seen.delete(id);
      }
    }
  }

  /**
   * Clear all tracked entries. Useful for testing.
   */
  clear(): void {
    this.seen.clear();
  }

  /**
   * Number of entries currently tracked.
   */
  get size(): number {
    return this.seen.size;
  }

  /**
   * @internal For testing — directly insert a timestamp for a messageId.
   */
  _recordAt(messageId: string, timestamp: number): void {
    this.seen.set(messageId, timestamp);
  }
}

/**
 * Singleton dedup tracker used by the webhook receiver.
 */
export const dedupTracker = new DedupTracker();
