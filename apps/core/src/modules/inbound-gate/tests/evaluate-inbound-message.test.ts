import test from "node:test";
import assert from "node:assert/strict";

import { EvaluateInboundMessage } from "../application/use-cases/evaluate-inbound-message.ts";
import { InMemoryContactDirectory } from "../infrastructure/memory/in-memory-contact-directory.ts";
import { InMemoryDecisionAudit } from "../infrastructure/memory/in-memory-decision-audit.ts";

test("blocks blank sender", async () => {
  const useCase = new EvaluateInboundMessage(new InMemoryContactDirectory(["maria"]));

  const decision = await useCase.execute({ senderId: "   ", text: "hola" });

  assert.equal(decision.status, "blocked");
  assert.equal(decision.reason, "invalid_sender");
});

test("blocks unknown sender", async () => {
  const useCase = new EvaluateInboundMessage(new InMemoryContactDirectory(["maria"]));

  const decision = await useCase.execute({ senderId: "juan", text: "hola" });

  assert.equal(decision.status, "blocked");
  assert.equal(decision.reason, "unknown_sender");
});

test("allows known sender with conversational text", async () => {
  const useCase = new EvaluateInboundMessage(new InMemoryContactDirectory(["maria"]));

  const decision = await useCase.execute({ senderId: "  MARIA  ", text: "hola, como estas?" });

  assert.equal(decision.status, "allowed");
  assert.equal(decision.reason, "known_sender_conversational");
  assert.equal(decision.metadata.senderKnown, true);
  assert.equal(decision.metadata.normalizedSenderId, "maria");
});

test("routes mediation requests to needs_mediation", async () => {
  const useCase = new EvaluateInboundMessage(new InMemoryContactDirectory(["maria"]));

  const decision = await useCase.execute({ senderId: "maria", text: "por favor avisale a Carlos que llegue" });

  assert.equal(decision.status, "needs_mediation");
  assert.equal(decision.reason, "third_party_mediation_request");
});

test("prioritizes urgency as needs_mediation", async () => {
  const useCase = new EvaluateInboundMessage(new InMemoryContactDirectory(["maria"]));

  const decision = await useCase.execute({ senderId: "maria", text: "es urgente, necesito ayuda" });

  assert.equal(decision.status, "needs_mediation");
  assert.equal(decision.reason, "urgent_or_risk_content");
});

test("audit adapter stores decisions and marks metadata audited", async () => {
  const audit = new InMemoryDecisionAudit();
  const useCase = new EvaluateInboundMessage(new InMemoryContactDirectory(["maria"]), audit);

  const decision = await useCase.execute({ senderId: "maria", text: "hola" });

  assert.equal(decision.metadata.audited, true);
  assert.equal(audit.getAll().length, 1);
  assert.equal(audit.getAll()[0]?.decision.status, "allowed");
});
