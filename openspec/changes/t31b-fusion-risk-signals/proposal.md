# Proposal: Hard/Soft Risk Signal Split in Fusion Policy

## Intent

The current `applyFusionPolicy` treats ANY deterministic `risk_review` as absolute (line 355), causing false positives when soft signals like "urgente" appear in negated context ("no necesito nada urgente"). The AI correctly classifies the intent as `conversation` but is overridden. This change introduces a HARD/SOFT signal split so that only genuine safety-critical signals are non-negotiable, while soft signals can be overridden by the AI classifier.

## Scope

### In Scope
- Create `risk-signals.ts` with `HARD_RISK_SIGNALS`, `SOFT_RISK_SIGNALS`, and `hasHardRiskSignal()` helper
- Expand `urgentOrRiskHints` in `inbound-policy.ts` to cover minimum deterministic signals without LLM
- Modify `applyFusionPolicy` to accept `matchedSignals` and apply hard/soft logic
- Update call site in `process-channel-inbound-message.ts` to pass `decision.metadata.matchedSignals`
- Update tests that break by design (soft-signal tests now expect AI override)
- Bump policy version from `t07-v1` to `t08-v1`

### Out of Scope
- No new external dependencies
- No LLM prompt changes
- No changes to outbound mediation or risk review workflows
- No changes to the deterministic gate evaluation itself — only the fusion layer

## Capabilities

### New Capabilities
- `risk-signal-classification`: Classification of deterministic signals as HARD (non-negotiable) or SOFT (AI-overridable)

### Modified Capabilities
- `inbound-gate`: Fusion policy behavior changes — soft risk signals no longer force deterministic risk_review when AI disagrees

## Approach

1. **New file** `apps/core/src/modules/inbound-gate/domain/risk-signals.ts`:
   - `HARD_RISK_SIGNALS`: physical/emergency keywords (falls, respiratory, cardiac, stroke, bleeding)
   - `SOFT_RISK_SIGNALS`: urgency/ambiguity keywords (urgente, ayuda, peligro, miedo, raro, sola)
   - `hasHardRiskSignal(matchedSignals: string[]): boolean` — pure function

2. **Modify** `apps/core/src/modules/inbound-gate/domain/inbound-policy.ts`:
   - Expand `urgentOrRiskHints` with additional hard signals
   - Bump version `t07-v1` → `t08-v1`

3. **Modify** `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts`:
   - Change `applyFusionPolicy` signature: add `matchedSignals: string[]` parameter
   - Pass `decision.metadata.matchedSignals` at call site (already available at line 176)
   - Logic: hard signals → deterministic wins; soft-only → AI can override

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/core/src/modules/inbound-gate/domain/risk-signals.ts` | New | HARD/SOFT signal lists and helper function |
| `apps/core/src/modules/inbound-gate/domain/inbound-policy.ts` | Modified | Expand hints, bump version |
| `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` | Modified | Fusion policy signature + hard/soft logic |
| `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.test.ts` | Modified | Update tests for soft-signal override behavior |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Soft signal false negative (AI misses real risk) | Low | Hard signals still catch genuine emergencies; soft signals still trigger risk_review when AI agrees |
| Test breakage from changed behavior | High | Expected — tests using soft signals should be updated to reflect new override behavior |
| Signal list incomplete | Medium | Start conservative; iterate based on real-world false positive/negative reports |

## Rollback Plan

Revert `applyFusionPolicy` to its current behavior (line 355: `if (deterministicProfile === "risk_review") return "risk_review"`). Remove `risk-signals.ts`. Revert `inbound-policy.ts` version and hints to `t07-v1`. All changes are additive or behavioral — no data migration needed.

## Dependencies

- PR #36 (branch: `feat/t31a-manual-simulation-readiness`) must be merged first — this change builds on top of the semantic classifier infrastructure

## Success Criteria

- [x] `hasHardRiskSignal(["me caí"])` returns `true`; `hasHardRiskSignal(["urgente"])` returns `false`
- [x] Deterministic `risk_review` with hard signal → always returns `risk_review`
- [x] Deterministic `risk_review` with soft-only signal + AI says `conversation` → returns `conversation`
- [x] All existing tests pass (updated for soft-signal override) — 612/612 passing
- [x] Policy version is `t08-v1`
