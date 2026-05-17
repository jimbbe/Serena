# Tasks: Gateway WA Unknown-Instance Hardening

## Phase 1: Failing Tests First

- [x] 1.1 Add `apps/gateway-wa/src/infrastructure/webhook/receiver.test.ts` regressions for routing-table mode: unknown instance with incomplete payload returns safe `routing_not_configured`, and missing/blank/non-string `instance` returns `400 invalid_webhook_payload`.
- [x] 1.2 Add `apps/gateway-wa/src/tests/integration.test.ts` HTTP regression for `POST /webhook/evolution` in routing-table mode using a malformed unknown-instance payload; assert non-500 and no normalization/routing side effects.

## Phase 2: Code Change

- [x] 2.1 Update `apps/gateway-wa/src/infrastructure/webhook/receiver.ts` to extract/validate `instance` before `shouldDiscard()` and `normalizeEvolutionPayload()` when a routing table exists.
- [x] 2.2 Preserve `connection.update` handling and legacy fallback routing, while reusing the same `route` lookup for known instances and returning `routing_not_configured` only for unknown routed instances.

## Phase 3: Spec / Docs Sync

- [x] 3.1 Sync `openspec/specs/gateway-webhook-receiver/spec.md` so the requirement and scenarios explicitly cover early unknown-instance fail-closed behavior and malformed missing-instance input.
- [x] 3.2 Verify the change proposal/design wording in `openspec/changes/t43a-gateway-wa-unknown-instance-hardening/{proposal.md,design.md}` still matches the implemented scope; adjust only if implementation forces a wording correction.

## Phase 4: Validation / PR Prep

- [x] 4.1 Run `npm run test:gateway-wa` to confirm the new regressions and existing webhook cases pass.
- [x] 4.2 Run `npm run check` from the repo root and capture any remaining issues before preparing the PR branch.
