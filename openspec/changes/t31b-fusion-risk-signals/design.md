# Design: Split Fusion Risk Signals into HARD/SOFT

## Technical Approach

Extract risk signal classification from `InboundPolicy.urgentOrRiskHints` into a dedicated `risk-signals.ts` module with two immutable arrays (HARD_RISK_SIGNALS, SOFT_RISK_SIGNALS) and a boolean helper `hasHardRiskSignal()`. Modify `applyFusionPolicy` to accept `matchedSignals` as a 4th parameter, defaulting to `[]`. The fusion logic changes: deterministic `risk_review` only blocks AI when a HARD signal matched; SOFT-only signals let AI intent through. Policy version bumps from `t07-v1` to `t08-v1`.

## Architecture Decisions

| Decision | Options | Tradeoffs | Choice |
|---|---|---|---|
| Risk signal storage | Inline in InboundPolicy vs separate module | Inline = simpler but mixes concerns; separate = clear ownership, testable independently | **Separate module** `risk-signals.ts` — signals change independently from mediation hints |
| HARD signal list | Only physical emergencies vs physical + safety-critical | Narrow = fewer false positives; broader = more conservative | **Physical emergencies only** (falls, breathing, cardiac, bleeding, theft) — per spec S9/S10 |
| SOFT signal list | Contextual urgency words vs all current non-physical hints | Current list has 12 entries; spec lists 8 soft signals | **Spec list** (urgente, ayuda, peligro, miedo, raro, sola, emergencia, riesgo) — drops "avisale"/"decile" etc. which are mediation, not risk |
| Signal matching | Exact substring case-insensitive vs regex vs normalized | Substring = matches partials ("me cai" matches "me caí"); regex = precise but complex | **Case-insensitive `includes()`** — simple, matches accented/non-accented variants naturally (e.g. "caí" vs "cai") |
| applyFusionPolicy signature | Object param vs positional 4th arg | Object = clearer but breaks ALL callers; positional = minimal diff | **Positional 4th arg** `matchedSignals?: readonly string[]` with default `[]` — zero friction at existing 3-arg call sites, behavior degrades safely (no signals → soft fallthrough) |
| Test for deterministic risk + no hard signal | Update existing test vs add new test | Update = one less test; new = preserves coverage of old behavior | **Update test at line 635** to use `["me caí"]` (HARD) → still wins; **add test** for soft-only `["urgente"]` → AI wins |
| InboundPolicy.urgentOrRiskHints | Remove SOFT signals from hints vs keep full union | Remove = hints only used for deterministic classification, SOFT shouldn't trigger risk; keep = backward compatible | **Keep full union** — `urgentOrRiskHints` drives deterministic gate (EvaluateInboundMessage), not fusion policy. The gate should still flag "urgente" for attention; the FIX is in fusion policy only |

## Data Flow

```
EvaluateInboundMessage
  └→ decision.metadata.matchedSignals  [already populated, no change]
       │
ProcessChannelInboundMessage.execute()
  ├→ deterministic profileId = route.profileId
  ├→ AI classify_intent → intent + confidence
  └→ applyFusionPolicy(profileId, intent, confidence, matchedSignals)
       │
       ├─ hasHardRiskSignal(matchedSignals)?
       │    ├─ YES + det=risk_review → risk_review  (no cambio)
       │    └─ NO + det=risk_review → AI intent wins  (NEW: soft overridable)
       ├─ AI=risk_review → risk_review  (no cambio)
       └─ else → existing priority chain  (no cambio)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/core/src/modules/inbound-gate/domain/risk-signals.ts` | **Create** | Export `HARD_RISK_SIGNALS`, `SOFT_RISK_SIGNALS` (both `readonly string[]`), `hasHardRiskSignal(matchedSignals)` |
| `apps/core/src/modules/inbound-gate/domain/inbound-policy.ts` | **Modify** | Bump version `t08-v1`; expand `urgentOrRiskHints` to union of HARD + ["alguien raro", "tengo mucho miedo", "urgente", "ayuda", "peligro"] |
| `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` | **Modify** | Import `hasHardRiskSignal`; add 4th param `matchedSignals?: readonly string[]` to `applyFusionPolicy`; insert hard/soft check before line 355; pass `decision.metadata.matchedSignals` at call site (line 219) |
| `apps/core/src/modules/inbound-gate/tests/process-channel-inbound-message.test.ts` | **Modify** | Update test line 635 (change matchedSignals to `["me caí"]`); add test for soft-only override; add 4th arg to unit tests 694-753 that pass `"risk_review"` as deterministic |

## Interfaces / Contracts

```ts
// risk-signals.ts — NEW
export const HARD_RISK_SIGNALS: readonly string[] = [
  "me caí", "me cai",
  "no puedo levantarme", "no me puedo levantar",
  "estoy en el piso",
  "no puedo moverme", "no puedo mover",
  "no puedo respirar", "me falta el aire",
  "dolor de pecho", "me duele el pecho",
  "brazo izquierdo",
  "me desmayé", "me desmaye", "no recuerdo nada",
  "sangre", "no para de salir sangre",
  "me robaron", "robaron",
];

export const SOFT_RISK_SIGNALS: readonly string[] = [
  "urgente", "ayuda", "peligro", "miedo",
  "raro", "sola", "emergencia", "riesgo",
];

export function hasHardRiskSignal(matchedSignals: readonly string[]): boolean {
  // Case-insensitive substring match
}
```

```ts
// applyFusionPolicy — MODIFIED signature
export function applyFusionPolicy(
  deterministicProfile: LlmProfileId,
  aiIntent: string,
  _aiConfidence: number,
  matchedSignals: readonly string[] = [],  // NEW
): LlmProfileId {
  // NEW: deterministic risk only wins if hard signal present
  if (deterministicProfile === "risk_review") {
    if (hasHardRiskSignal(matchedSignals)) return "risk_review";
    // Soft-only or empty — fall through to AI intent below
  }
  // ... existing AI priority chain unchanged
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit — `risk-signals` | `hasHardRiskSignal` with empty, soft-only, hard, mixed, case-insensitive, accented | New test file or inline in process-channel-inbound-message.test.ts |
| Unit — `applyFusionPolicy` | Deterministic risk + hard signals → risk_review; det risk + soft → AI wins; det risk + no signals → AI wins; AI risk always wins | Update 4 existing tests (add 4th arg), add 2 new tests |
| Integration — `ProcessChannelInboundMessage` | Test at line 635: update matchedSignals to `["me caí"]` (HARD) → risk_review wins; add test with soft-only `["urgente"]` + AI="conversation" → conversation wins | Modify existing test, add sibling test |
| Regression | 3-arg callers in scenario-endpoint.test.ts, simulation-endpoint.test.ts, whatsapp-gateway tests | No changes needed — `matchedSignals` defaults to `[]`, behavior: AI risk still wins, but det risk without signals falls through (safe) |

## Migration / Rollout

No migration required. `matchedSignals` defaults to `[]`, making 3-arg call sites degrade safely: deterministic risk_review without matched signals falls through to AI intent (same as soft-only behavior). No feature flags needed.

## Open Questions

None — all decisions resolved per spec and codebase patterns.
