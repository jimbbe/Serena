import test from "node:test";
import assert from "node:assert/strict";

import { EvaluateInboundMessage } from "../application/use-cases/evaluate-inbound-message.ts";
import { InMemoryContactDirectory } from "../infrastructure/memory/in-memory-contact-directory.ts";
import { InMemoryDecisionAudit } from "../infrastructure/memory/in-memory-decision-audit.ts";

test("blocks blank sender", async () => {
  const useCase = new EvaluateInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const decision = await useCase.execute({ senderId: "   ", text: "hola" });

  assert.equal(decision.status, "blocked");
  assert.equal(decision.reason, "invalid_sender");
  assert.equal(decision.metadata.precedence, "invalid_sender");
});

test("invalid text wins before content interpretation", async () => {
  const useCase = new EvaluateInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const decision = await useCase.execute({ senderId: "maria", text: "     " });

  assert.equal(decision.status, "blocked");
  assert.equal(decision.reason, "invalid_text");
  assert.equal(decision.metadata.precedence, "invalid_text");
});

test("unknown sender blocks even with urgent signals", async () => {
  const useCase = new EvaluateInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const decision = await useCase.execute({ senderId: "juan", text: "es urgente, hay peligro" });

  assert.equal(decision.status, "blocked");
  assert.equal(decision.reason, "unknown_sender");
  assert.equal(decision.metadata.precedence, "unknown_sender");
  assert.deepEqual(decision.metadata.matchedSignals, ["urgente", "peligro"]);
});

test("known sender with ordinary text is allowed", async () => {
  const useCase = new EvaluateInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const decision = await useCase.execute({ senderId: "  MARIA  ", text: "hola, como estas?" });

  assert.equal(decision.status, "allowed");
  assert.equal(decision.reason, "known_sender_conversational");
  assert.equal(decision.metadata.senderKnown, true);
  assert.equal(decision.metadata.normalizedSenderId, "maria");
  assert.equal(decision.metadata.precedence, "conversation_default");
});

test("known sender + mediation signal routes to needs_mediation", async () => {
  const useCase = new EvaluateInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const decision = await useCase.execute({ senderId: "maria", text: "por favor avisale a Carlos que llegue" });

  assert.equal(decision.status, "needs_mediation");
  assert.equal(decision.reason, "third_party_mediation_request");
  assert.equal(decision.metadata.precedence, "mediation_over_conversation");
  assert.deepEqual(decision.metadata.matchedSignals, ["avisale", "avisa"]);
});

test("known sender + urgent signal routes to needs_mediation with urgent reason", async () => {
  const useCase = new EvaluateInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const decision = await useCase.execute({ senderId: "maria", text: "es urgente, necesito ayuda" });

  assert.equal(decision.status, "needs_mediation");
  assert.equal(decision.reason, "urgent_or_risk_content");
  assert.equal(decision.metadata.precedence, "urgent_or_risk_over_mediation");
  assert.deepEqual(decision.metadata.matchedSignals, ["urgente", "ayuda"]);
});

test("known sender + fall and immobility signal routes to risk review", async () => {
  const useCase = new EvaluateInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const decision = await useCase.execute({ senderId: "maria", text: "Me caí y no puedo levantarme" });

  assert.equal(decision.status, "needs_mediation");
  assert.equal(decision.reason, "urgent_or_risk_content");
  assert.equal(decision.metadata.precedence, "urgent_or_risk_over_mediation");
  assert.deepEqual(decision.metadata.matchedSignals, ["me caí", "no puedo levantarme"]);
});

test("known sender + mediation and risk prefers urgent reason", async () => {
  const useCase = new EvaluateInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const decision = await useCase.execute({ senderId: "maria", text: "avisale a Juan que hay peligro" });

  assert.equal(decision.status, "needs_mediation");
  assert.equal(decision.reason, "urgent_or_risk_content");
  assert.equal(decision.metadata.precedence, "urgent_or_risk_over_mediation");
  assert.deepEqual(decision.metadata.matchedSignals, ["peligro"]);
});

test("metadata includes traceability fields", async () => {
  const useCase = new EvaluateInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const decision = await useCase.execute({ senderId: "maria", text: "hola" });

  assert.equal(decision.metadata.policyVersion, "t08-v1");
  assert.deepEqual(decision.metadata.matchedSignals, []);
  assert.equal(typeof decision.metadata.precedence, "string");
});

test("audit adapter stores decisions and marks metadata audited", async () => {
  const audit = new InMemoryDecisionAudit();
  const useCase = new EvaluateInboundMessage({
    contactDirectory: new InMemoryContactDirectory(["maria"]),
    decisionAudit: audit,
  });

  const decision = await useCase.execute({ senderId: "maria", text: "hola" });

  assert.equal(decision.metadata.audited, true);
  assert.equal(audit.getAll().length, 1);
  assert.equal(audit.getAll()[0]?.decision.status, "allowed");
  assert.equal(audit.getAll()[0]?.decision.metadata.policyVersion, "t08-v1");
  assert.equal(audit.getAll()[0]?.decision.metadata.precedence, "conversation_default");
});
