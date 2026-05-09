# Tasks: Split Fusion Risk Signals into HARD/SOFT

## Phase 1: Foundation — risk-signals.ts

- [x] T1.1 Create `apps/core/src/modules/inbound-gate/domain/risk-signals.ts` — export `HARD_RISK_SIGNALS`, `SOFT_RISK_SIGNALS` (both `readonly string[]`) and `hasHardRiskSignal(matchedSignals: readonly string[]): boolean`
- [x] T1.2 Implement `hasHardRiskSignal` — case-insensitive substring match; returns `true` if any `matchedSignals` item includes any `HARD_RISK_SIGNALS` entry; returns `false` for empty input

## Phase 2: Core Implementation — Inbound Policy

- [x] T2.1 Bump `defaultInboundPolicy.version` from `"t07-v1"` to `"t08-v1"` in `inbound-policy.ts`
- [x] T2.2 Expand `urgentOrRiskHints` in `inbound-policy.ts` to include all `HARD_RISK_SIGNALS` plus `"alguien raro"`, `"tengo mucho miedo"`, `"urgente"`, `"ayuda"`, `"peligro"`

## Phase 3: Core Implementation — Fusion Policy

- [x] T3.1 Import `hasHardRiskSignal` from `risk-signals.ts` in `process-channel-inbound-message.ts`
- [x] T3.2 Update `applyFusionPolicy` signature — add 4th parameter `matchedSignals: readonly string[] = []`
- [x] T3.3 Replace hard return on line 355 with: if `deterministicProfile === "risk_review"`, return `"risk_review"` only if `hasHardRiskSignal(matchedSignals)`; otherwise fall through to AI intent
- [x] T3.4 Pass `decision.metadata.matchedSignals` at call site (line 219) as 4th arg to `applyFusionPolicy`

## Phase 4: Testing

- [x] T4.1 Update existing T31 integration test (line 635): keep `text: "Me caí y no puedo levantarme"` (already HARD), verify result is still `"serena.risk.review"`
- [x] T4.2 Add new integration test: soft-only signal (`text: "urgente"`), AI says `"conversation"` → result is `"serena.conversation.reply"` (AI overrides)
- [x] T4.3 Add 4th arg `[]` to all existing `applyFusionPolicy` unit tests (lines 694-753) — behavior unchanged for empty signals
- [x] T4.4 Add unit tests for `hasHardRiskSignal`: empty `[]` → `false`, soft-only `["urgente"]` → `false`, hard signal `["me caí"]` → `true`, mixed `["urgente", "me caí"]` → `true`, case-insensitive `["ME CAÍ"]` → `true`
- [x] T4.5 Verify `npm run check` passes

## Phase 5: Defensive Fix — Sticky Mediation (post-T31b)

- [x] T5.1 Update `applyFusionPolicy` with sticky mediation rule: deterministic `mediation_understanding` cannot be downgraded to `conversation` or `clarification` by AI classifier
- [x] T5.2 Add unit tests: mediation + AI conversation → mediation; mediation + AI clarification → mediation; mediation + AI risk → risk
- [x] T5.3 Update integration tests in `simulation-endpoint.test.ts` and `scenario-endpoint.test.ts` that previously expected mediation → conversation override
- [x] T5.4 Fix existing test `applyFusionPolicy: AI conversation overrides deterministic mediation` → now expects `mediation_understanding`
