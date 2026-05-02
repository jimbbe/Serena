import test from "node:test";
import assert from "node:assert/strict";

import { StartMediationBridgeSession } from "../application/use-cases/start-mediation-bridge-session.ts";
import { RecordMediationBridgeReply } from "../application/use-cases/record-mediation-bridge-reply.ts";
import { CloseMediationBridgeSession } from "../application/use-cases/close-mediation-bridge-session.ts";
import { InMemoryMediationBridgeSessionStore } from "../infrastructure/memory/in-memory-mediation-bridge-session-store.ts";

const requester = { id: "u1", displayName: "María" };
const recipient = { id: "u2", displayName: "Carlos" };

function makeDeps(ids: string[] = []) {
  const store = new InMemoryMediationBridgeSessionStore();
  let idx = 0;
  const generateId: () => string = () => {
    if (idx < ids.length) {
      return ids[idx++]!;
    }
    return `id-${idx++}`;
  };
  return { store, generateId };
}

// ─── StartMediationBridgeSession ───

test("start session creates awaiting_recipient_reply status", async () => {
  const { store, generateId } = makeDeps();
  const useCase = new StartMediationBridgeSession({ sessionStore: store, generateId });

  const result = await useCase.execute({
    requester,
    recipient,
    messageToRelay: "llego 15 minutos tarde",
  });

  assert.equal(result.session.status, "awaiting_recipient_reply");
});

test("first draft to recipient includes Serena introduction", async () => {
  const { store, generateId } = makeDeps();
  const useCase = new StartMediationBridgeSession({ sessionStore: store, generateId });

  const result = await useCase.execute({
    requester,
    recipient,
    messageToRelay: "llego 15 minutos tarde",
  });

  assert.equal(result.outboundDraft.includesSerenaIntroduction, true);
  assert.ok(result.outboundDraft.text.startsWith("Hola Carlos, soy Serena."));
});

test("first draft attributes correctly to requester", async () => {
  const { store, generateId } = makeDeps();
  const useCase = new StartMediationBridgeSession({ sessionStore: store, generateId });

  const result = await useCase.execute({
    requester,
    recipient,
    messageToRelay: "llego 15 minutos tarde",
  });

  assert.equal(result.outboundDraft.attribution.fromParticipantId, "u1");
  assert.equal(result.outboundDraft.attribution.fromDisplayName, "María");
  assert.equal(result.outboundDraft.toParticipantId, "u2");
});

test("first turn is requester → recipient", async () => {
  const { store, generateId } = makeDeps();
  const useCase = new StartMediationBridgeSession({ sessionStore: store, generateId });

  const result = await useCase.execute({
    requester,
    recipient,
    messageToRelay: "llego 15 minutos tarde",
  });

  const turn = result.session.turns[0]!;
  assert.equal(turn.fromParticipantId, "u1");
  assert.equal(turn.toParticipantId, "u2");
  assert.equal(turn.originalText, "llego 15 minutos tarde");
});

test("start session sets awaitingParticipantId to recipient", async () => {
  const { store, generateId } = makeDeps();
  const useCase = new StartMediationBridgeSession({ sessionStore: store, generateId });

  const result = await useCase.execute({
    requester,
    recipient,
    messageToRelay: "llego 15 minutos tarde",
  });

  assert.equal(result.session.awaitingParticipantId, "u2");
});

test("start session marks recipientIntroduced as true", async () => {
  const { store, generateId } = makeDeps();
  const useCase = new StartMediationBridgeSession({ sessionStore: store, generateId });

  const result = await useCase.execute({
    requester,
    recipient,
    messageToRelay: "llego 15 minutos tarde",
  });

  assert.equal(result.session.recipientIntroduced, true);
});

// ─── RecordMediationBridgeReply ───

test("recipient reply creates turn recipient → requester", async () => {
  const { store, generateId } = makeDeps(["s1", "t1", "t2"]);
  const startUseCase = new StartMediationBridgeSession({ sessionStore: store, generateId });
  const recordUseCase = new RecordMediationBridgeReply({ sessionStore: store, generateId });

  const started = await startUseCase.execute({
    requester,
    recipient,
    messageToRelay: "llego 15 minutos tarde",
  });

  const replied = await recordUseCase.execute({
    sessionId: started.session.sessionId,
    fromParticipantId: "u2",
    text: "no hay problema",
  });

  assert.equal(replied.status, "ok");
  if (replied.status !== "ok") return;

  const lastTurn = replied.session.turns[replied.session.turns.length - 1]!;
  assert.equal(lastTurn.fromParticipantId, "u2");
  assert.equal(lastTurn.toParticipantId, "u1");
});

test("after recipient reply, session awaits requester", async () => {
  const { store, generateId } = makeDeps(["s1", "t1", "t2"]);
  const startUseCase = new StartMediationBridgeSession({ sessionStore: store, generateId });
  const recordUseCase = new RecordMediationBridgeReply({ sessionStore: store, generateId });

  const started = await startUseCase.execute({
    requester,
    recipient,
    messageToRelay: "llego 15 minutos tarde",
  });

  const replied = await recordUseCase.execute({
    sessionId: started.session.sessionId,
    fromParticipantId: "u2",
    text: "no hay problema",
  });

  assert.equal(replied.status, "ok");
  if (replied.status !== "ok") return;

  assert.equal(replied.session.status, "awaiting_requester_reply");
  assert.equal(replied.session.awaitingParticipantId, "u1");
});

test("requester reply creates turn requester → recipient", async () => {
  const { store, generateId } = makeDeps(["s1", "t1", "t2", "t3"]);
  const startUseCase = new StartMediationBridgeSession({ sessionStore: store, generateId });
  const recordUseCase = new RecordMediationBridgeReply({ sessionStore: store, generateId });

  const started = await startUseCase.execute({
    requester,
    recipient,
    messageToRelay: "llego 15 minutos tarde",
  });

  await recordUseCase.execute({
    sessionId: started.session.sessionId,
    fromParticipantId: "u2",
    text: "no hay problema",
  });

  const secondReply = await recordUseCase.execute({
    sessionId: started.session.sessionId,
    fromParticipantId: "u1",
    text: "gracias Carlos",
  });

  assert.equal(secondReply.status, "ok");
  if (secondReply.status !== "ok") return;

  const lastTurn = secondReply.session.turns[secondReply.session.turns.length - 1]!;
  assert.equal(lastTurn.fromParticipantId, "u1");
  assert.equal(lastTurn.toParticipantId, "u2");
});

test("does not repeat Serena introduction in later turns", async () => {
  const { store, generateId } = makeDeps(["s1", "t1", "t2"]);
  const startUseCase = new StartMediationBridgeSession({ sessionStore: store, generateId });
  const recordUseCase = new RecordMediationBridgeReply({ sessionStore: store, generateId });

  const started = await startUseCase.execute({
    requester,
    recipient,
    messageToRelay: "llego 15 minutos tarde",
  });

  const replied = await recordUseCase.execute({
    sessionId: started.session.sessionId,
    fromParticipantId: "u2",
    text: "no hay problema",
  });

  assert.equal(replied.status, "ok");
  if (replied.status !== "ok") return;

  // Draft goes back to requester, should NOT include Serena introduction
  assert.equal(replied.outboundDraft.includesSerenaIntroduction, false);
  assert.ok(!replied.outboundDraft.text.startsWith("Hola"));
});

test("rejects reply from participant not currently awaited", async () => {
  const { store, generateId } = makeDeps();
  const startUseCase = new StartMediationBridgeSession({ sessionStore: store, generateId });
  const recordUseCase = new RecordMediationBridgeReply({ sessionStore: store, generateId });

  const started = await startUseCase.execute({
    requester,
    recipient,
    messageToRelay: "llego 15 minutos tarde",
  });

  // Session is awaiting recipient (u2), requester (u1) tries to reply
  const result = await recordUseCase.execute({
    sessionId: started.session.sessionId,
    fromParticipantId: "u1",
    text: "ya llegué",
  });

  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.reason, "not_awaiting_participant");
  }
});

test("rejects reply for non-existent session", async () => {
  const { store, generateId } = makeDeps();
  const recordUseCase = new RecordMediationBridgeReply({ sessionStore: store, generateId });

  const result = await recordUseCase.execute({
    sessionId: "nonexistent",
    fromParticipantId: "u2",
    text: "hola",
  });

  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.reason, "session_not_found");
  }
});

test("rejects reply for closed session", async () => {
  const { store, generateId } = makeDeps(["s1", "t1"]);
  const startUseCase = new StartMediationBridgeSession({ sessionStore: store, generateId });
  const recordUseCase = new RecordMediationBridgeReply({ sessionStore: store, generateId });
  const closeUseCase = new CloseMediationBridgeSession({ sessionStore: store });

  const started = await startUseCase.execute({
    requester,
    recipient,
    messageToRelay: "llego 15 minutos tarde",
  });

  await closeUseCase.execute({
    sessionId: started.session.sessionId,
    closeReason: "explicit_done",
  });

  const result = await recordUseCase.execute({
    sessionId: started.session.sessionId,
    fromParticipantId: "u2",
    text: "no hay problema",
  });

  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.reason, "session_closed");
  }
});

// ─── CloseMediationBridgeSession ───

test("explicit close changes status to closed and saves closeReason", async () => {
  const { store, generateId } = makeDeps();
  const startUseCase = new StartMediationBridgeSession({ sessionStore: store, generateId });
  const closeUseCase = new CloseMediationBridgeSession({ sessionStore: store });

  const started = await startUseCase.execute({
    requester,
    recipient,
    messageToRelay: "llego 15 minutos tarde",
  });

  const closed = await closeUseCase.execute({
    sessionId: started.session.sessionId,
    closeReason: "explicit_done",
  });

  assert.equal(closed.status, "ok");
  if (closed.status !== "ok") return;

  assert.equal(closed.session.status, "closed");
  assert.equal(closed.session.closeReason, "explicit_done");
});

test("close rejects already closed session", async () => {
  const { store, generateId } = makeDeps();
  const startUseCase = new StartMediationBridgeSession({ sessionStore: store, generateId });
  const closeUseCase = new CloseMediationBridgeSession({ sessionStore: store });

  const started = await startUseCase.execute({
    requester,
    recipient,
    messageToRelay: "llego 15 minutos tarde",
  });

  await closeUseCase.execute({
    sessionId: started.session.sessionId,
    closeReason: "explicit_done",
  });

  const secondClose = await closeUseCase.execute({
    sessionId: started.session.sessionId,
    closeReason: "safety_stop",
  });

  assert.equal(secondClose.status, "rejected");
  if (secondClose.status === "rejected") {
    assert.equal(secondClose.reason, "session_already_closed");
  }
});

test("close rejects non-existent session", async () => {
  const store = new InMemoryMediationBridgeSessionStore();
  const closeUseCase = new CloseMediationBridgeSession({ sessionStore: store });

  const result = await closeUseCase.execute({
    sessionId: "nonexistent",
    closeReason: "explicit_done",
  });

  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.reason, "session_not_found");
  }
});

// ─── In-memory store ───

test("in-memory store saves and retrieves session", async () => {
  const { store, generateId } = makeDeps();
  const startUseCase = new StartMediationBridgeSession({ sessionStore: store, generateId });

  const result = await startUseCase.execute({
    requester,
    recipient,
    messageToRelay: "llego 15 minutos tarde",
  });

  const retrieved = await store.findById(result.session.sessionId);
  assert.ok(retrieved);
  assert.equal(retrieved.sessionId, result.session.sessionId);
  assert.equal(retrieved.requester.id, "u1");
  assert.equal(retrieved.recipient.id, "u2");
  assert.equal(retrieved.status, "awaiting_recipient_reply");
});

test("in-memory store returns undefined for unknown session", async () => {
  const store = new InMemoryMediationBridgeSessionStore();
  const result = await store.findById("nonexistent");
  assert.equal(result, undefined);
});

// ─── No real sending or external providers ───

test("start session contains no external provider fields", async () => {
  const { store, generateId } = makeDeps();
  const useCase = new StartMediationBridgeSession({ sessionStore: store, generateId });

  const result = await useCase.execute({
    requester,
    recipient,
    messageToRelay: "llego 15 minutos tarde",
  });

  const sessionShape = result.session as Record<string, unknown>;
  assert.equal("whatsappProvider" in sessionShape, false);
  assert.equal("apiKey" in sessionShape, false);
  assert.equal("llmModel" in sessionShape, false);

  const draftShape = result.outboundDraft as Record<string, unknown>;
  assert.equal("whatsappProvider" in draftShape, false);
  assert.equal("apiKey" in draftShape, false);
});