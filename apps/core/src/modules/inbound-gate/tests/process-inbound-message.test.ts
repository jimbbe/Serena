import test from "node:test";
import assert from "node:assert/strict";

import { ProcessInboundMessage } from "../application/use-cases/process-inbound-message.ts";
import { InMemoryContactDirectory } from "../infrastructure/memory/in-memory-contact-directory.ts";

test("invalid sender routes to discard", async () => {
  const useCase = new ProcessInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const result = await useCase.execute({ senderId: "   ", text: "hola" });

  assert.equal(result.route.nextStep, "discard");
  assert.equal(result.route.reason, "invalid_sender");
});

test("unknown sender with urgent signal still routes to discard", async () => {
  const useCase = new ProcessInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const result = await useCase.execute({ senderId: "juan", text: "es urgente y hay peligro" });

  assert.equal(result.route.nextStep, "discard");
  assert.equal(result.route.reason, "unknown_sender");
});

test("ordinary known sender routes to conversation profile", async () => {
  const useCase = new ProcessInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const result = await useCase.execute({ senderId: "maria", text: "hola, como estas?" });

  assert.equal(result.route.nextStep, "llm_profile_required");
  if (result.route.nextStep === "llm_profile_required") {
    assert.equal(result.route.profileId, "conversation");
    assert.equal(result.route.reason, "known_sender_conversational");
  }
});

test("mediation request routes to mediation_understanding profile", async () => {
  const useCase = new ProcessInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const result = await useCase.execute({ senderId: "maria", text: "avisale a Carlos que llegue" });

  assert.equal(result.route.nextStep, "llm_profile_required");
  if (result.route.nextStep === "llm_profile_required") {
    assert.equal(result.route.profileId, "mediation_understanding");
    assert.equal(result.route.reason, "third_party_mediation_request");
  }
});

test("urgent or risk content routes to risk_review profile", async () => {
  const useCase = new ProcessInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const result = await useCase.execute({ senderId: "maria", text: "es urgente, necesito ayuda" });

  assert.equal(result.route.nextStep, "llm_profile_required");
  if (result.route.nextStep === "llm_profile_required") {
    assert.equal(result.route.profileId, "risk_review");
    assert.equal(result.route.reason, "urgent_or_risk_content");
  }
});

test("mediation plus risk resolves to risk_review profile", async () => {
  const useCase = new ProcessInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const result = await useCase.execute({ senderId: "maria", text: "avisale a Juan que hay peligro" });

  assert.equal(result.route.nextStep, "llm_profile_required");
  if (result.route.nextStep === "llm_profile_required") {
    assert.equal(result.route.profileId, "risk_review");
    assert.equal(result.route.reason, "urgent_or_risk_content");
  }
});

test("route context preserves original message and decision trace fields", async () => {
  const receivedAt = new Date("2026-05-01T10:11:12.000Z");
  const useCase = new ProcessInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const result = await useCase.execute({
    senderId: "  MARIA  ",
    text: "hola",
    receivedAt,
  });

  assert.equal(result.route.nextStep, "llm_profile_required");
  if (result.route.nextStep === "llm_profile_required") {
    assert.equal(result.route.context.senderId, "  MARIA  ");
    assert.equal(result.route.context.normalizedSenderId, "maria");
    assert.equal(result.route.context.originalText, "hola");
    assert.equal(result.route.context.receivedAt, "2026-05-01T10:11:12.000Z");
    assert.equal(result.route.context.decisionStatus, "allowed");
    assert.equal(result.route.context.decisionReason, "known_sender_conversational");
    assert.equal(result.route.context.policyVersion, "t07-v1");
    assert.deepEqual(result.route.context.matchedSignals, []);
    assert.equal(result.route.context.precedence, "conversation_default");
  }
});

test("routing contains no provider execution fields", async () => {
  const useCase = new ProcessInboundMessage({ contactDirectory: new InMemoryContactDirectory(["maria"]) });

  const result = await useCase.execute({ senderId: "maria", text: "hola" });

  assert.equal(result.route.nextStep, "llm_profile_required");
  if (result.route.nextStep === "llm_profile_required") {
    const unknownRouteShape = result.route as Record<string, unknown>;
    assert.equal("provider" in unknownRouteShape, false);
    assert.equal("apiKey" in unknownRouteShape, false);
    assert.equal("model" in unknownRouteShape, false);
    assert.equal("systemPrompt" in unknownRouteShape, false);
  }
});
