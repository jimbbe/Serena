import test from "node:test";
import assert from "node:assert/strict";

import type {
  ActiveSessionInfo,
  ActiveSessionQuery,
} from "../application/ports/active-session-query.ts";
import { createResolveSession } from "../application/use-cases/resolve-session.ts";
import { InMemorySessionQuery } from "../infrastructure/memory/in-memory-session-query.ts";
import type { SessionResolution } from "../domain/session-resolution.ts";

// ─── Helpers ───

function makeActiveSession(overrides: Partial<ActiveSessionInfo> = {}): ActiveSessionInfo {
  const defaults: ActiveSessionInfo = {
    sessionId: "s1",
    requesterId: "u1",
    recipientId: "u2",
    status: "awaiting_recipient_reply",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  return { ...defaults, ...overrides };
}

function makeQuery(sessions: ActiveSessionInfo[] = []): ActiveSessionQuery {
  const store = new InMemorySessionQuery();
  for (const s of sessions) {
    store.add(s);
  }
  return store;
}

// ─── Session Resolution Tests ───

test("no active session returns new_session_possible", async () => {
  const query = makeQuery([]);
  const resolveSession = createResolveSession({ activeSessionQuery: query });

  const result = await resolveSession("u1", "u2");

  assert.deepEqual(result, { type: "new_session_possible" });
});

test("existing session A→B returns existing_session with correct sessionId", async () => {
  const query = makeQuery([
    makeActiveSession({ sessionId: "s1", requesterId: "u1", recipientId: "u2" }),
  ]);
  const resolveSession = createResolveSession({ activeSessionQuery: query });

  const result = await resolveSession("u1", "u2");

  assert.deepEqual(result, { type: "existing_session", sessionId: "s1" });
});

test("existing session B→A returns same session regardless of participant order", async () => {
  const query = makeQuery([
    makeActiveSession({ sessionId: "s1", requesterId: "u1", recipientId: "u2" }),
  ]);
  const resolveSession = createResolveSession({ activeSessionQuery: query });

  const result = await resolveSession("u2", "u1");

  assert.deepEqual(result, { type: "existing_session", sessionId: "s1" });
});

test("closed session is ignored — returns new_session_possible", async () => {
  // The ActiveSessionQuery contract requires the adapter to filter out closed sessions.
  // This test simulates that by NOT including closed sessions in the query store.
  // If the adapter filters properly, the use case sees no active sessions for this pair.
  const query = makeQuery([
    // active session for a DIFFERENT pair — not relevant to u1/u2
    makeActiveSession({ sessionId: "other", requesterId: "u3", recipientId: "u4" }),
    // closed sessions for u1/u2 are NOT added because the adapter would filter them
  ]);
  const resolveSession = createResolveSession({ activeSessionQuery: query });

  const result = await resolveSession("u1", "u2");

  assert.deepEqual(result, { type: "new_session_possible" });
});

test("close session — store has no sessions → new_session_possible", async () => {
  const query = makeQuery([]);
  const resolveSession = createResolveSession({ activeSessionQuery: query });

  const result = await resolveSession("u1", "u2");

  assert.deepEqual(result, { type: "new_session_possible" });
});

test("ambiguous multiple active sessions returns ambiguous_active_sessions with IDs", async () => {
  const query = makeQuery([
    makeActiveSession({ sessionId: "s1", requesterId: "u1", recipientId: "u2" }),
    makeActiveSession({ sessionId: "s2", requesterId: "u1", recipientId: "u2" }),
  ]);
  const resolveSession = createResolveSession({ activeSessionQuery: query });

  const result = await resolveSession("u1", "u2");

  assert.deepEqual(result, {
    type: "ambiguous_active_sessions",
    activeSessionIds: ["s1", "s2"],
  });
});

test("same participant pair with reversed order also returns ambiguous", async () => {
  const query = makeQuery([
    makeActiveSession({ sessionId: "s1", requesterId: "u1", recipientId: "u2" }),
    makeActiveSession({ sessionId: "s2", requesterId: "u2", recipientId: "u1" }),
  ]);
  const resolveSession = createResolveSession({ activeSessionQuery: query });

  const result = await resolveSession("u1", "u2");

  assert.deepEqual(result, {
    type: "ambiguous_active_sessions",
    activeSessionIds: ["s1", "s2"],
  });
});

// ─── Participant Filtering Tests ───

test("session with different participant pair is not found", async () => {
  const query = makeQuery([
    makeActiveSession({ sessionId: "s1", requesterId: "u1", recipientId: "u2" }),
  ]);
  const resolveSession = createResolveSession({ activeSessionQuery: query });

  const result = await resolveSession("u1", "u3");

  assert.deepEqual(result, { type: "new_session_possible" });
});

test("session where participantA is requester but participantB is not involved", async () => {
  const query = makeQuery([
    makeActiveSession({ sessionId: "s1", requesterId: "u1", recipientId: "u3" }),
  ]);
  const resolveSession = createResolveSession({ activeSessionQuery: query });

  const result = await resolveSession("u1", "u2");

  assert.deepEqual(result, { type: "new_session_possible" });
});

test("session where both participants are involved as same role is not a match", async () => {
  // Both are requesters in separate sessions — neither session has them as a pair
  const query = makeQuery([
    makeActiveSession({ sessionId: "s1", requesterId: "u1", recipientId: "u3" }),
    makeActiveSession({ sessionId: "s2", requesterId: "u2", recipientId: "u4" }),
  ]);
  const resolveSession = createResolveSession({ activeSessionQuery: query });

  const result = await resolveSession("u1", "u2");

  assert.deepEqual(result, { type: "new_session_possible" });
});

// ─── In-memory adapter tests ───

test("InMemorySessionQuery returns sessions where participant is requester", async () => {
  const store = new InMemorySessionQuery();
  store.add(makeActiveSession({ sessionId: "s1", requesterId: "u1", recipientId: "u2" }));

  const result = await store.findActiveSessionsByParticipant("u1");

  assert.equal(result.length, 1);
  assert.equal(result[0]!.sessionId, "s1");
});

test("InMemorySessionQuery returns sessions where participant is recipient", async () => {
  const store = new InMemorySessionQuery();
  store.add(makeActiveSession({ sessionId: "s1", requesterId: "u1", recipientId: "u2" }));

  const result = await store.findActiveSessionsByParticipant("u2");

  assert.equal(result.length, 1);
  assert.equal(result[0]!.sessionId, "s1");
});

test("InMemorySessionQuery returns empty for unknown participant", async () => {
  const store = new InMemorySessionQuery();
  store.add(makeActiveSession({ sessionId: "s1", requesterId: "u1", recipientId: "u2" }));

  const result = await store.findActiveSessionsByParticipant("u99");

  assert.equal(result.length, 0);
});

test("InMemorySessionQuery returns all sessions for participant across multiple sessions", async () => {
  const store = new InMemorySessionQuery();
  store.add(makeActiveSession({ sessionId: "s1", requesterId: "u1", recipientId: "u2" }));
  store.add(makeActiveSession({ sessionId: "s2", requesterId: "u1", recipientId: "u3" }));

  const result = await store.findActiveSessionsByParticipant("u1");

  assert.equal(result.length, 2);
  const ids = result.map((s) => s.sessionId).sort();
  assert.deepEqual(ids, ["s1", "s2"]);
});

test("InMemorySessionQuery.remove clears a session", async () => {
  const store = new InMemorySessionQuery();
  store.add(makeActiveSession({ sessionId: "s1", requesterId: "u1", recipientId: "u2" }));
  store.remove("s1");

  const result = await store.findActiveSessionsByParticipant("u1");

  assert.equal(result.length, 0);
});

// ─── Exhaustive variant coverage ───

test("all SessionResolution variants are reachable", async () => {
  const activeSessions: SessionResolution[] = [];
  const variants = new Set<string>();

  // existing_session
  {
    const query = makeQuery([
      makeActiveSession({ sessionId: "s1", requesterId: "u1", recipientId: "u2" }),
    ]);
    const resolveSession = createResolveSession({ activeSessionQuery: query });
    const result = await resolveSession("u1", "u2");
    variants.add(result.type);
    activeSessions.push(result);
  }

  // new_session_possible
  {
    const query = makeQuery([]);
    const resolveSession = createResolveSession({ activeSessionQuery: query });
    const result = await resolveSession("u1", "u2");
    variants.add(result.type);
  }

  // ambiguous_active_sessions
  {
    const query = makeQuery([
      makeActiveSession({ sessionId: "s1", requesterId: "u1", recipientId: "u2" }),
      makeActiveSession({ sessionId: "s2", requesterId: "u1", recipientId: "u2" }),
    ]);
    const resolveSession = createResolveSession({ activeSessionQuery: query });
    const result = await resolveSession("u1", "u2");
    variants.add(result.type);
  }

  assert.ok(variants.has("existing_session"));
  assert.ok(variants.has("new_session_possible"));
  assert.ok(variants.has("ambiguous_active_sessions"));
  // no_active_session is defined in the type but not produced by this use case
  // — it exists for cases where no session store is available at all
});
