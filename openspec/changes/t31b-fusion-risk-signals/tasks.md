# Tasks: Split Fusion Risk Signals into HARD/SOFT

## Phase 1: Foundation — risk-signals.ts

- [ ] T1.1 Create `apps/core/src/modules/inbound-gate/domain/risk-signals.ts` — export `HARD_RISK_SIGNALS`, `SOFT_RISK_SIGNALS` (both `readonly string[]`) and `hasHardRiskSignal(matchedSignals: readonly string[]): boolean`
- [ ] T1.2 Implement `hasHardRiskSignal` — case-insensitive substring match; returns `true` if any `matchedSignals` item includes any `HARD_RISK_SIGNALS` entry; returns `false` for empty input

## Phase 2: Core Implementation — Inbound Policy

- [ ] T2.1 Bump `defaultInboundPolicy.version` from `"t07-v1"` to `"t08-v1"` in `inbound-policy.ts`
- [ ] T2.2 Expand `urgentOrRiskHints` in `inbound-policy.ts` to include all `HARD_RISK_SIGNALS` plus `"alguien raro"`, `"tengo mucho miedo"`, `"urgente"`, `"ayuda"`, `"peligro"`

## Phase 3: Core Implementation — Fusion Policy

- [ ] T3.1 Import `hasHardRiskSignal` from `risk-signals.ts` in `process-channel-inbound-message.ts`
- [ ] T3.2 Update `applyFusionPolicy` signature — add 4th parameter `matchedSignals: readonly string[] = []`
- [ ] T3.3 Replace hard return on line 355 with: if `deterministicProfile === "risk_review"`, return `"risk_review"` only if `hasHardRiskSignal(matchedSignals)`; otherwise fall through to AI intent
- [ ] T3.4 Pass `decision.metadata.matchedSignals` at call site (line 219) as 4th arg to `applyFusionPolicy`

## Phase 4: Testing

- [ ] T4.1 Update existing T31 integration test (line 635): keep `text: "Me caí y no puedo levantarme"` (already HARD), verify result is still `"serena.risk.review"`
- [ ] T4.2 Add new integration test: soft-only signal (`text: "urgente"`), AI says `"conversation"` → result is `"serena.conversation.reply"` (AI overrides)
- [ ] T4.3 Add 4th arg `[]` to all existing `applyFusionPolicy` unit tests (lines 694-753) — behavior unchanged for empty signals
- [ ] T4.4 Add unit tests for `hasHardRiskSignal`: empty `[]` → `false`, soft-only `["urgente"]` → `false`, hard signal `["me caí"]` → `true`, mixed `["urgente", "me caí"]` → `true`, case-insensitive `["ME CAÍ"]` → `true`
- [ ] T4.5 Verify `npm run check` passes
