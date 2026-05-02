/**
 * Orchestrator — End-to-end integration tests for the mediation pipeline (T15).
 *
 * These tests wire all modules together using in-memory adapters
 * and verify the full pipeline from incoming message to PipelineResult.
 *
 * No external infrastructure, no HTTP, no WhatsApp, no database.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ProcessIncomingWhatsAppMessage } from "../application/use-cases/process-incoming-whatsapp-message.ts";
import type { ProcessIncomingWhatsAppMessageDependencies } from "../application/use-cases/process-incoming-whatsapp-message.ts";
import type { PipelineResult } from "../domain/pipeline-result.ts";

import { ProcessInboundMessage } from "../../inbound-gate/application/use-cases/process-inbound-message.ts";
import { EvaluateInboundMessage } from "../../inbound-gate/application/use-cases/evaluate-inbound-message.ts";
import { InMemoryContactDirectory as InboundGateContactDirectory } from "../../inbound-gate/infrastructure/memory/in-memory-contact-directory.ts";
import { InMemoryDecisionAudit } from "../../inbound-gate/infrastructure/memory/in-memory-decision-audit.ts";

import { ExtractMediationRequest } from "../../mediation-understanding/application/use-cases/extract-mediation-request.ts";
import { RuleBasedMediationUnderstanding } from "../../mediation-understanding/infrastructure/rules/rule-based-mediation-understanding.ts";

import { InMemoryContactDirectory } from "../../contact-directory/infrastructure/memory/in-memory-contact-directory.ts";
import { ResolveContact } from "../../contact-directory/application/use-cases/resolve-contact.ts";
import type { Contact } from "../../contact-directory/domain/contact.ts";

import { createResolveSession } from "../../session-manager/application/use-cases/resolve-session.ts";
import { InMemorySessionQuery } from "../../session-manager/infrastructure/memory/in-memory-session-query.ts";
import { MediationBridgeActiveSessionQuery } from "../../session-manager/infrastructure/memory/mediation-bridge-active-session-query.ts";
import type { ActiveSessionInfo } from "../../session-manager/application/ports/active-session-query.ts";

import { StartMediationBridgeSession } from "../../mediation-bridge/application/use-cases/start-mediation-bridge-session.ts";
import { RecordMediationBridgeReply } from "../../mediation-bridge/application/use-cases/record-mediation-bridge-reply.ts";
import { InMemoryMediationBridgeSessionStore } from "../../mediation-bridge/infrastructure/memory/in-memory-mediation-bridge-session-store.ts";

import { IndirectRewording } from "../../prudent-rewording/infrastructure/templates/indirect-rewording.ts";
import { RewordMessage } from "../../prudent-rewording/application/use-cases/reword-message.ts";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MARIA: Contact = { id: "c1", displayName: "María", whatsappId: "5491111111111" };
const CARLOS: Contact = { id: "c2", displayName: "Carlos", whatsappId: "5492222222222" };
const JUAN: Contact = { id: "c3", displayName: "Juan", whatsappId: "5493333333333" };

const KNOWN_CONTACTS: Contact[] = [MARIA, CARLOS, JUAN];

function createTestDeps() {
  // Contact directory (full module)
  const contactDirectory = new InMemoryContactDirectory(KNOWN_CONTACTS);
  const resolveContact = new ResolveContact({ contactDirectory });

  // Inbound gate
  const inboundGateContactDir = new InboundGateContactDirectory(KNOWN_CONTACTS.map((c) => c.whatsappId));
  const decisionAudit = new InMemoryDecisionAudit();
  const evaluator = new EvaluateInboundMessage({
    contactDirectory: inboundGateContactDir,
    decisionAudit,
  });
  const processInboundMessage = new ProcessInboundMessage({ evaluator });

  // Mediation understanding
  const mediationUnderstanding = new RuleBasedMediationUnderstanding();
  const extractMediationRequest = new ExtractMediationRequest({ mediationUnderstanding });

  // Session management — InMemorySessionQuery has .add() for tests
  const sessionQuery = new InMemorySessionQuery();
  const resolveSession = createResolveSession({ activeSessionQuery: sessionQuery });

  // Mediation bridge
  const mediationBridgeSessionStore = new InMemoryMediationBridgeSessionStore();
  const startMediationBridgeSession = new StartMediationBridgeSession({
    sessionStore: mediationBridgeSessionStore,
    generateId: () => "session-1",
  });
  const recordMediationBridgeReply = new RecordMediationBridgeReply({
    sessionStore: mediationBridgeSessionStore,
    generateId: () => "turn-2",
  });

  // Prudent rewording
  const prudentRewording = new IndirectRewording();
  const rewordMessage = new RewordMessage({ prudentRewording });

  const deps: ProcessIncomingWhatsAppMessageDependencies = {
    processInboundMessage,
    extractMediationRequest,
    contactDirectory,
    resolveContact,
    activeSessionQuery: sessionQuery,
    resolveSession,
    startMediationBridgeSession,
    recordMediationBridgeReply,
    mediationBridgeSessionStore,
    rewordMessage,
  };

  return {
    deps,
    contactDirectory,
    sessionQuery,
    mediationBridgeSessionStore,
    startMediationBridgeSession,
    recordMediationBridgeReply,
  };
}

/**
 * Bridge-backed dependencies: ActiveSessionQuery reads directly from
 * MediationBridgeSessionStore.  No manual sessionQuery.add() needed —
 * a session started by the orchestrator is immediately visible to
 * session-manager on the next message.
 */
function createBridgeBackedDeps() {
  const contactDirectory = new InMemoryContactDirectory(KNOWN_CONTACTS);
  const resolveContact = new ResolveContact({ contactDirectory });

  const inboundGateContactDir = new InboundGateContactDirectory(KNOWN_CONTACTS.map((c) => c.whatsappId));
  const decisionAudit = new InMemoryDecisionAudit();
  const evaluator = new EvaluateInboundMessage({
    contactDirectory: inboundGateContactDir,
    decisionAudit,
  });
  const processInboundMessage = new ProcessInboundMessage({ evaluator });

  const mediationUnderstanding = new RuleBasedMediationUnderstanding();
  const extractMediationRequest = new ExtractMediationRequest({ mediationUnderstanding });

  // Bridge store — the single source of truth for sessions
  const bridgeStore = new InMemoryMediationBridgeSessionStore();

  // Adapter that reads sessions from the bridge store (no manual .add())
  const bridgeQuery = new MediationBridgeActiveSessionQuery(bridgeStore);
  const resolveSession = createResolveSession({ activeSessionQuery: bridgeQuery });

  const startMediationBridgeSession = new StartMediationBridgeSession({
    sessionStore: bridgeStore,
    generateId: () => "s-1",
  });
  const recordMediationBridgeReply = new RecordMediationBridgeReply({
    sessionStore: bridgeStore,
    generateId: () => "t-2",
  });

  const prudentRewording = new IndirectRewording();
  const rewordMessage = new RewordMessage({ prudentRewording });

  const deps: ProcessIncomingWhatsAppMessageDependencies = {
    processInboundMessage,
    extractMediationRequest,
    contactDirectory,
    resolveContact,
    activeSessionQuery: bridgeQuery,
    resolveSession,
    startMediationBridgeSession,
    recordMediationBridgeReply,
    mediationBridgeSessionStore: bridgeStore,
    rewordMessage,
  };

  return { deps, bridgeStore };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Orchestrator — ProcessIncomingWhatsAppMessage pipeline", () => {
  // 1. Invalid sender → discard
  it("invalid sender (empty) → discard", async () => {
    const { deps } = createTestDeps();
    const pipeline = new ProcessIncomingWhatsAppMessage(deps);

    const result = await pipeline.execute({
      senderWhatsAppId: "",
      messageText: "holaaa",
      receivedAt: new Date().toISOString(),
    });

    assert.equal(result.type, "discard");
    if (result.type === "discard") {
      assert.equal(result.reason, "invalid_sender");
    }
  });

  // 2. Unknown sender → discard
  it("unknown sender → discard", async () => {
    const { deps } = createTestDeps();
    const pipeline = new ProcessIncomingWhatsAppMessage(deps);

    const result = await pipeline.execute({
      senderWhatsAppId: "9999999999",
      messageText: "hola, cómo estás?",
      receivedAt: new Date().toISOString(),
    });

    assert.equal(result.type, "discard");
    if (result.type === "discard") {
      assert.equal(result.reason, "unknown_sender");
    }
  });

  // 3. Normal conversational message → conversation_pending
  it("conversational message → conversation_pending", async () => {
    const { deps } = createTestDeps();
    const pipeline = new ProcessIncomingWhatsAppMessage(deps);

    const result = await pipeline.execute({
      senderWhatsAppId: MARIA.whatsappId,
      messageText: "hola, cómo estás?",
      receivedAt: new Date().toISOString(),
    });

    assert.equal(result.type, "conversation_pending");
    if (result.type === "conversation_pending") {
      assert.equal(result.senderId, MARIA.whatsappId);
    }
  });

  // 4. Urgent/risk content → risk_review_required
  it("urgent/risk message → risk_review_required", async () => {
    const { deps } = createTestDeps();
    const pipeline = new ProcessIncomingWhatsAppMessage(deps);

    const result = await pipeline.execute({
      senderWhatsAppId: MARIA.whatsappId,
      messageText: "necesito ayuda urgente",
      receivedAt: new Date().toISOString(),
    });

    assert.equal(result.type, "risk_review_required");
    if (result.type === "risk_review_required") {
      assert.equal(result.senderId, MARIA.whatsappId);
      assert.ok(result.matchedSignals.length > 0);
    }
  });

  // 5. Mediation signal but not understood → mediation_not_understood
  it("mediation signal but unparseable → mediation_not_understood", async () => {
    const { deps } = createTestDeps();
    const pipeline = new ProcessIncomingWhatsAppMessage(deps);

    const result = await pipeline.execute({
      senderWhatsAppId: MARIA.whatsappId,
      // "avisale" triggers mediation in inbound-gate, but no "a [name]" pattern
      // so mediation-understanding extraction fails
      messageText: "avisale que todo bien",
      receivedAt: new Date().toISOString(),
    });

    assert.equal(result.type, "mediation_not_understood");
    if (result.type === "mediation_not_understood") {
      assert.equal(result.senderId, MARIA.whatsappId);
    }
  });

  // 6. Mediation request with non-existent recipient → recipient_not_found
  it("mediation request for unknown recipient → recipient_not_found", async () => {
    const { deps } = createTestDeps();
    const pipeline = new ProcessIncomingWhatsAppMessage(deps);

    const result = await pipeline.execute({
      senderWhatsAppId: MARIA.whatsappId,
      messageText: "avisale a Fulano que llego tarde",
      receivedAt: new Date().toISOString(),
    });

    assert.equal(result.type, "recipient_not_found");
    if (result.type === "recipient_not_found") {
      assert.equal(result.senderId, MARIA.whatsappId);
      assert.equal(result.recipientName, "Fulano");
    }
  });

  // 7. Valid mediation request with no active session → mediation_started
  it("valid mediation request → mediation_started with reworded text", async () => {
    const { deps } = createTestDeps();
    const pipeline = new ProcessIncomingWhatsAppMessage(deps);

    const result = await pipeline.execute({
      senderWhatsAppId: MARIA.whatsappId,
      messageText: "avisale a Carlos que llego tarde",
      receivedAt: new Date().toISOString(),
    });

    assert.equal(result.type, "mediation_started");
    if (result.type === "mediation_started") {
      assert.equal(result.requesterId, MARIA.whatsappId);
      assert.equal(result.requesterDisplayName, MARIA.displayName);
      assert.equal(result.recipientId, CARLOS.whatsappId);
      assert.equal(result.recipientDisplayName, CARLOS.displayName);
      assert.ok(result.rewordedText.includes("Carlos"));
      assert.ok(result.rewordedText.includes("María"));
      assert.ok(result.rewordedText.includes("llego tarde"));
      assert.ok(result.rewordedText.includes("Serena"));
      assert.ok(result.sessionId);
    }
  });

  // 8. Reply from recipient in active session → mediation_reply_recorded
  it("recipient reply in active session → mediation_reply_recorded", async () => {
    const { deps, sessionQuery, startMediationBridgeSession } = createTestDeps();
    const pipeline = new ProcessIncomingWhatsAppMessage(deps);

    // First: María starts a mediation with Carlos
    const startResult = await startMediationBridgeSession.execute({
      requester: { id: MARIA.whatsappId, displayName: MARIA.displayName },
      recipient: { id: CARLOS.whatsappId, displayName: CARLOS.displayName },
      messageToRelay: "llego tarde",
    });

    // Register session in session query for session resolution
    sessionQuery.add({
      sessionId: startResult.session.sessionId,
      requesterId: MARIA.whatsappId,
      recipientId: CARLOS.whatsappId,
      status: startResult.session.status,
      createdAt: startResult.session.createdAt,
    });

    // Now Carlos replies — the session is awaiting his reply
    const result = await pipeline.execute({
      senderWhatsAppId: CARLOS.whatsappId,
      messageText: "nos vemos mañana",
      receivedAt: new Date().toISOString(),
    });

    assert.equal(result.type, "mediation_reply_recorded");
    if (result.type === "mediation_reply_recorded") {
      assert.equal(result.fromParticipantId, CARLOS.whatsappId);
      assert.equal(result.toParticipantId, MARIA.whatsappId);
      assert.equal(result.fromDisplayName, CARLOS.displayName);
      assert.equal(result.toDisplayName, MARIA.displayName);
      assert.ok(result.rewordedText.includes("Carlos"));
      assert.ok(result.rewordedText.includes("nos vemos mañana"));
      assert.ok(result.sessionId);
    }
  });

  // 9. Closed session allows new session to start
  it("closed session allows new mediation session", async () => {
    const { deps, mediationBridgeSessionStore } = createTestDeps();
    const pipeline = new ProcessIncomingWhatsAppMessage(deps);

    // Manually create a closed session in the store
    const closedSession = {
      sessionId: "closed-session-1",
      requester: { id: MARIA.whatsappId, displayName: MARIA.displayName },
      recipient: { id: CARLOS.whatsappId, displayName: CARLOS.displayName },
      status: "closed" as const,
      turns: [],
      awaitingParticipantId: CARLOS.whatsappId,
      recipientIntroduced: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closeReason: "explicit_done" as const,
    };
    await mediationBridgeSessionStore.save(closedSession);

    // The closed session is NOT registered in activeSessionQuery
    // So resolveSession returns new_session_possible → new mediation starts

    const result = await pipeline.execute({
      senderWhatsAppId: MARIA.whatsappId,
      messageText: "avisale a Carlos que ya llegue",
      receivedAt: new Date().toISOString(),
    });

    assert.equal(result.type, "mediation_started");
    if (result.type === "mediation_started") {
      assert.equal(result.requesterId, MARIA.whatsappId);
      assert.equal(result.recipientId, CARLOS.whatsappId);
    }
  });

  // 10. Ambiguous active sessions → ambiguous_active_session
  it("ambiguous active sessions → ambiguous_active_session", async () => {
    const { deps, sessionQuery, mediationBridgeSessionStore } = createTestDeps();
    const pipeline = new ProcessIncomingWhatsAppMessage(deps);

    // Create two active sessions for the same pair in the bridge store
    const session1 = {
      sessionId: "session-a",
      requester: { id: MARIA.whatsappId, displayName: MARIA.displayName },
      recipient: { id: CARLOS.whatsappId, displayName: CARLOS.displayName },
      status: "awaiting_recipient_reply" as const,
      turns: [],
      awaitingParticipantId: CARLOS.whatsappId,
      recipientIntroduced: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const session2 = {
      sessionId: "session-b",
      requester: { id: MARIA.whatsappId, displayName: MARIA.displayName },
      recipient: { id: CARLOS.whatsappId, displayName: CARLOS.displayName },
      status: "awaiting_requester_reply" as const,
      turns: [],
      awaitingParticipantId: MARIA.whatsappId,
      recipientIntroduced: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await mediationBridgeSessionStore.save(session1);
    await mediationBridgeSessionStore.save(session2);

    // Register both sessions in session query
    sessionQuery.add({
      sessionId: "session-a",
      requesterId: MARIA.whatsappId,
      recipientId: CARLOS.whatsappId,
      status: "awaiting_recipient_reply",
      createdAt: new Date().toISOString(),
    });
    sessionQuery.add({
      sessionId: "session-b",
      requesterId: MARIA.whatsappId,
      recipientId: CARLOS.whatsappId,
      status: "awaiting_requester_reply",
      createdAt: new Date().toISOString(),
    });

    const result = await pipeline.execute({
      senderWhatsAppId: MARIA.whatsappId,
      messageText: "avisale a Carlos que ya estoy",
      receivedAt: new Date().toISOString(),
    });

    assert.equal(result.type, "ambiguous_active_session");
    if (result.type === "ambiguous_active_session") {
      assert.equal(result.senderId, MARIA.whatsappId);
      assert.equal(result.activeSessionIds.length, 2);
    }
  });

  // 11. End-to-end: bridge-backed adapter — no manual session registration
  it("bridge-backed adapter: María starts, Carlos replies → no manual add()", async () => {
    const { deps, bridgeStore } = createBridgeBackedDeps();
    const pipeline = new ProcessIncomingWhatsAppMessage(deps);

    // Step 1: María sends a mediation request
    const startResult = await pipeline.execute({
      senderWhatsAppId: MARIA.whatsappId,
      messageText: "avisale a Carlos que llego tarde",
      receivedAt: new Date().toISOString(),
    });

    assert.equal(startResult.type, "mediation_started");
    if (startResult.type !== "mediation_started") return;
    const sessionId = startResult.sessionId;
    assert.equal(startResult.requesterDisplayName, "María");
    assert.equal(startResult.recipientDisplayName, "Carlos");

    // The session should be in the bridge store (awaiting Carlos's reply)
    const sessionAfterStart = bridgeStore.findAll().find((s) => s.sessionId === sessionId);
    assert.ok(sessionAfterStart);
    assert.equal(sessionAfterStart!.status, "awaiting_recipient_reply");
    assert.equal(sessionAfterStart!.awaitingParticipantId, CARLOS.whatsappId);

    // Step 2: Carlos replies with a plain conversational message
    // No manual sessionQuery.add() — the adapter reads from the bridge store
    const replyResult = await pipeline.execute({
      senderWhatsAppId: CARLOS.whatsappId,
      messageText: "nos vemos mañana",
      receivedAt: new Date().toISOString(),
    });

    assert.equal(replyResult.type, "mediation_reply_recorded");
    if (replyResult.type === "mediation_reply_recorded") {
      assert.equal(replyResult.fromParticipantId, CARLOS.whatsappId);
      assert.equal(replyResult.fromDisplayName, CARLOS.displayName);
      assert.equal(replyResult.toParticipantId, MARIA.whatsappId);
      assert.equal(replyResult.toDisplayName, MARIA.displayName);
      assert.ok(replyResult.sessionId);
    }

    // Session should now await María
    const sessionAfterReply = bridgeStore.findAll().find((s) => s.sessionId === sessionId)!;
    assert.equal(sessionAfterReply.status, "awaiting_requester_reply");
    assert.equal(sessionAfterReply.awaitingParticipantId, MARIA.whatsappId);
  });
});