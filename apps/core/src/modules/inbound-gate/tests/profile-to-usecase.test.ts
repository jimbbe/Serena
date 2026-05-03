/**
 * T20 — Unit tests for profileToUseCaseId pure mapping function.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { profileToUseCaseId } from "../domain/profile-to-usecase.ts";
import type { LlmProfileId } from "../domain/llm-profile.ts";

test("conversation profile maps to serena.conversation.reply", () => {
  assert.equal(profileToUseCaseId("conversation"), "serena.conversation.reply");
});

test("risk_review profile maps to serena.risk.review", () => {
  assert.equal(profileToUseCaseId("risk_review"), "serena.risk.review");
});

test("mediation_understanding profile maps to serena.mediation.understand_request", () => {
  assert.equal(
    profileToUseCaseId("mediation_understanding"),
    "serena.mediation.understand_request",
  );
});

test("clarification profile maps to serena.mediation.clarify", () => {
  assert.equal(profileToUseCaseId("clarification"), "serena.mediation.clarify");
});

test("same input always produces the same output (deterministic)", () => {
  const profiles: LlmProfileId[] = [
    "conversation",
    "risk_review",
    "mediation_understanding",
    "clarification",
  ];

  for (const profileId of profiles) {
    const first = profileToUseCaseId(profileId);
    const second = profileToUseCaseId(profileId);
    assert.equal(first, second, `Output for ${profileId} must be deterministic`);
  }
});

test("function has no side effects", () => {
  // Call multiple times and verify state hasn't leaked
  const results: string[] = [];
  results.push(profileToUseCaseId("conversation"));
  results.push(profileToUseCaseId("risk_review"));
  results.push(profileToUseCaseId("mediation_understanding"));
  results.push(profileToUseCaseId("clarification"));

  assert.equal(results[0], "serena.conversation.reply");
  assert.equal(results[1], "serena.risk.review");
  assert.equal(results[2], "serena.mediation.understand_request");
  assert.equal(results[3], "serena.mediation.clarify");
  assert.equal(results.length, 4);
});
