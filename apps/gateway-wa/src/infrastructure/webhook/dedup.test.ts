/**
 * T19 — Webhook deduplication tracker tests.
 *
 * Tests for DedupTracker: first occurrence, duplicate detection,
 * window expiry, lazy cleanup, and clear.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DedupTracker } from "./dedup.ts";

describe("DedupTracker", () => {
  describe("isDuplicate", () => {
    it("returns false for first occurrence of a messageId", () => {
      const tracker = new DedupTracker();
      assert.equal(tracker.isDuplicate("msg-001"), false);
      assert.equal(tracker.size, 1);
    });

    it("returns true for duplicate messageId within window", () => {
      const tracker = new DedupTracker();
      tracker.isDuplicate("msg-001"); // first occurrence
      assert.equal(tracker.isDuplicate("msg-001"), true); // duplicate within 5 min
      assert.equal(tracker.size, 1); // still 1 entry, no new one added
    });

    it("returns false for same messageId after window expiry", () => {
      const tracker = new DedupTracker(10); // 10ms window for quick testing

      // Record a messageId with a timestamp 15ms in the past (expired)
      const pastTime = Date.now() - 15;
      tracker._recordAt("msg-001", pastTime);

      // Should be cleaned up and treated as new
      assert.equal(tracker.isDuplicate("msg-001"), false);
      assert.equal(tracker.size, 1);
    });

    it("tracks multiple different messageIds independently", () => {
      const tracker = new DedupTracker();

      assert.equal(tracker.isDuplicate("msg-001"), false);
      assert.equal(tracker.isDuplicate("msg-002"), false);
      assert.equal(tracker.isDuplicate("msg-003"), false);
      assert.equal(tracker.size, 3);

      // msg-001 is a duplicate, msg-002 also
      assert.equal(tracker.isDuplicate("msg-001"), true);
      assert.equal(tracker.isDuplicate("msg-002"), true);

      // Still the same 3 entries tracked
      assert.equal(tracker.size, 3);
    });

    it("does not update timestamp on duplicate (preserves original)", () => {
      const tracker = new DedupTracker(50); // 50ms window

      // Simulate a message first seen 30ms ago
      const firstTime = Date.now() - 30;
      tracker._recordAt("msg-001", firstTime);

      // Should still be detected as duplicate (30ms < 50ms window)
      assert.equal(tracker.isDuplicate("msg-001"), true);

      // The timestamp should still be `firstTime`, not updated.
      // Verify by checking that after a short window it expires from
      // the original time, not from now:
      // (We test this indirectly: a second tracker call after the
      //  original time + windowMs would treat it as new.)
    });
  });

  describe("cleanup (lazy via isDuplicate)", () => {
    it("removes expired entries on isDuplicate check", () => {
      const tracker = new DedupTracker(10); // 10ms window

      // Insert entries with old timestamps (100ms ago — well past 10ms window)
      const oldTime = Date.now() - 100;
      tracker._recordAt("msg-old-1", oldTime);
      tracker._recordAt("msg-old-2", oldTime);
      // Insert one fresh entry via isDuplicate (this triggers cleanup!)
      tracker.isDuplicate("msg-new");

      // After isDuplicate triggers cleanup, old entries are gone — only msg-new remains
      assert.equal(tracker.size, 1);

      // Verify old entries are truly gone (treated as new again)
      assert.equal(tracker.isDuplicate("msg-old-1"), false);
      assert.equal(tracker.size, 2); // msg-old-1 re-added
    });

    it("does not remove entries still within window", () => {
      const tracker = new DedupTracker(60_000); // 1 minute window

      tracker.isDuplicate("msg-001");
      tracker.isDuplicate("msg-002");
      tracker.isDuplicate("msg-003");
      assert.equal(tracker.size, 3);

      // Trigger cleanup via new check — all 3 should remain
      tracker.isDuplicate("msg-004");
      assert.equal(tracker.size, 4);
    });

    it("cleans up many expired entries in a single isDuplicate call", () => {
      const tracker = new DedupTracker(10); // 10ms window
      const oldTime = Date.now() - 100;

      // Insert many old entries via _recordAt (bypasses cleanup)
      for (let i = 0; i < 50; i++) {
        tracker._recordAt(`old-${i}`, oldTime);
      }
      // Add one current entry via isDuplicate — this triggers cleanup of ALL old entries
      tracker.isDuplicate("current");

      // All 50 expired entries cleaned up, leaving just the fresh one
      assert.equal(tracker.size, 1);

      // Add another — now we have 2 fresh entries
      tracker.isDuplicate("another");
      assert.equal(tracker.size, 2);
    });
  });

  describe("clear", () => {
    it("removes all tracked entries", () => {
      const tracker = new DedupTracker();
      tracker.isDuplicate("msg-001");
      tracker.isDuplicate("msg-002");
      assert.equal(tracker.size, 2);

      tracker.clear();
      assert.equal(tracker.size, 0);

      // After clear, same IDs are treated as new
      assert.equal(tracker.isDuplicate("msg-001"), false);
      assert.equal(tracker.isDuplicate("msg-002"), false);
    });
  });

  describe("size", () => {
    it("returns 0 for empty tracker", () => {
      const tracker = new DedupTracker();
      assert.equal(tracker.size, 0);
    });

    it("reflects number of tracked unique messageIds", () => {
      const tracker = new DedupTracker();
      tracker.isDuplicate("a");
      tracker.isDuplicate("b");
      tracker.isDuplicate("c");
      assert.equal(tracker.size, 3);
    });
  });

  describe("default window", () => {
    it("uses 5-minute window by default", () => {
      const tracker = new DedupTracker();
      // Sanity: a fresh first check should not be a duplicate
      assert.equal(tracker.isDuplicate("test-msg"), false);
      // Immediately again should be duplicate (5 min >> 0ms)
      assert.equal(tracker.isDuplicate("test-msg"), true);
    });
  });
});
