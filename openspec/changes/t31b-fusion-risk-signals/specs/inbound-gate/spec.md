# Delta for Inbound Gate

## ADDED Requirements

### Requirement: Fusion Policy Hard/Soft Signal Logic

The system MUST modify `applyFusionPolicy` to accept a `matchedSignals: string[]` parameter and apply the following decision logic:

- If deterministic profile is `risk_review` AND `hasHardRiskSignal(matchedSignals)` is true → return `risk_review` (hard signal, deterministic wins)
- If deterministic profile is `risk_review` AND `hasHardRiskSignal(matchedSignals)` is false (soft-only or no signals) → fall through to AI intent evaluation
- If AI returns `risk_review` → always return `risk_review`
- All other cases → preserve current behavior (return AI intent)

#### Scenario: Hard signal detected → risk_review

- GIVEN matchedSignals = ["me caí"] and AI says "conversation" with 0.95 confidence
- WHEN applyFusionPolicy is called
- THEN result is "risk_review"

#### Scenario: Soft signal only, AI says conversation → conversation

- GIVEN matchedSignals = ["urgente"] and AI says "conversation" with 0.90 confidence
- WHEN applyFusionPolicy is called
- THEN result is "conversation" (AI overrides soft-only false positive)

#### Scenario: Soft signal only, AI says risk → risk_review

- GIVEN matchedSignals = ["urgente"] and AI says "risk_review" with 0.85 confidence
- WHEN applyFusionPolicy is called
- THEN result is "risk_review" (AI independently detected risk)

#### Scenario: Mixed signals (hard + soft) → risk_review

- GIVEN matchedSignals = ["urgente", "me caí"] and AI says "conversation"
- WHEN applyFusionPolicy is called
- THEN result is "risk_review" (hard signal present)

#### Scenario: No signals, AI says conversation → conversation

- GIVEN matchedSignals = [] and AI says "conversation"
- WHEN applyFusionPolicy is called
- THEN result is "conversation"

#### Scenario: No signals, AI says mediation → mediation_understanding

- GIVEN matchedSignals = [] and AI says "mediation_understanding"
- WHEN applyFusionPolicy is called
- THEN result is "mediation_understanding"

### Requirement: Inbound Policy Urgent/Risk Hints Expansion

The system MUST update `defaultInboundPolicy.urgentOrRiskHints` to include the following minimum set of phrases for deterministic signal matching without LLM:

- "me caí", "me cai"
- "no puedo levantarme", "no me puedo levantar"
- "estoy en el piso"
- "no puedo moverme", "no me puedo mover"
- "no puedo respirar", "me falta el aire"
- "dolor de pecho", "me duele el pecho"
- "brazo izquierdo"
- "me desmayé", "me desmaye"
- "no recuerdo nada"
- "sangre", "no para de salir sangre"
- "me robaron", "robaron"
- "alguien raro"
- "tengo mucho miedo"
- "urgente", "ayuda", "peligro"

#### Scenario: Negated soft signal → conversation

- GIVEN text = "No necesito nada urgente, solo charlar" with matchedSignals = ["urgente"]
- AND AI classifier returns intent "conversation"
- WHEN applyFusionPolicy is called
- THEN result is "conversation" (AI correctly interprets negation)

#### Scenario: AI unavailable with soft signal → deterministic fallback

- GIVEN matchedSignals = ["urgente"] and AI classifier throws error
- WHEN fusion policy is NOT called (AI failed)
- THEN deterministic profile "risk_review" is used (safe degradation — existing behavior, unchanged)

## MODIFIED Requirements

### Requirement: Inbound Policy Version

The system MUST bump `defaultInboundPolicy.version` from `t07-v1` to `t08-v1`.
(Previously: version was `t07-v1`)

#### Scenario: Policy version is t08-v1

- GIVEN the defaultInboundPolicy is loaded
- WHEN checking the version field
- THEN it equals "t08-v1"
