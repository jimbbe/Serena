# Risk Signal Classification Specification

## Purpose

Define the taxonomy of risk signals used by the fusion policy, classifying deterministic signals as HARD (non-negotiable, safety-critical) or SOFT (contextual, AI-overridable) to eliminate false positives in the inbound gate.

## Requirements

### Requirement: HARD Risk Signal List

The system MUST export a `HARD_RISK_SIGNALS` constant as a `readonly string[]` containing phrases that describe physical emergencies or safety-critical situations. These signals MUST NEVER be downgraded by the AI classifier. The list MUST include at minimum:

| Signal | Variant |
|--------|---------|
| "me caí" | "me cai" |
| "no puedo levantarme" | "no me puedo levantar" |
| "estoy en el piso" | — |
| "no puedo moverme" | "no me puedo mover" |
| "no puedo respirar" | "me falta el aire" |
| "dolor de pecho" | "me duele el pecho" |
| "brazo izquierdo" | — |
| "me desmayé" | "me desmaye" |
| "no recuerdo nada" | — |
| "sangre" | "no para de salir sangre" |
| "me robaron" | "robaron" |

#### Scenario: HARD list contains fall-related signals

- GIVEN the HARD_RISK_SIGNALS constant
- WHEN checking for "me caí", "me cai", "estoy en el piso"
- THEN all three are present in the list

#### Scenario: HARD list contains medical emergency signals

- GIVEN the HARD_RISK_SIGNALS constant
- WHEN checking for "no puedo respirar", "dolor de pecho", "me desmayé"
- THEN all are present in the list

#### Scenario: HARD list contains crime-related signals

- GIVEN the HARD_RISK_SIGNALS constant
- WHEN checking for "me robaron", "robaron"
- THEN both are present in the list

### Requirement: SOFT Risk Signal List

The system MUST export a `SOFT_RISK_SIGNALS` constant as a `readonly string[]` containing contextual words that MAY appear in normal or negated conversation. These signals MAY be overridden by the AI classifier. The list MUST include at minimum:

- "urgente"
- "ayuda"
- "peligro"
- "miedo"
- "raro"
- "sola"
- "emergencia"
- "riesgo"

#### Scenario: SOFT list contains urgency words

- GIVEN the SOFT_RISK_SIGNALS constant
- WHEN checking for "urgente", "ayuda", "emergencia"
- THEN all three are present in the list

#### Scenario: SOFT list contains emotional context words

- GIVEN the SOFT_RISK_SIGNALS constant
- WHEN checking for "miedo", "peligro", "raro", "sola", "riesgo"
- THEN all are present in the list

### Requirement: hasHardRiskSignal Helper Function

The system MUST export a `hasHardRiskSignal(matchedSignals: string[]): boolean` function that returns `true` if and only if at least one element in `matchedSignals` matches (case-insensitive substring match) any entry in `HARD_RISK_SIGNALS`. Returns `false` for empty input or when no hard signals are found.

#### Scenario: Single hard signal returns true

- GIVEN matchedSignals = ["me caí"]
- WHEN hasHardRiskSignal is called
- THEN it returns true

#### Scenario: Soft signal only returns false

- GIVEN matchedSignals = ["urgente"]
- WHEN hasHardRiskSignal is called
- THEN it returns false

#### Scenario: Mixed signals returns true

- GIVEN matchedSignals = ["urgente", "me caí"]
- WHEN hasHardRiskSignal is called
- THEN it returns true (hard signal present)

#### Scenario: Empty input returns false

- GIVEN matchedSignals = []
- WHEN hasHardRiskSignal is called
- THEN it returns false

#### Scenario: Accent-insensitive match

- GIVEN matchedSignals = ["me cai"] (without accent)
- WHEN hasHardRiskSignal is called
- THEN it returns true (matches "me cai" variant)
