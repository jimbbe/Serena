# Spec: T32 — Mediation Clarification + Confirmation State Machine

## Context

The LLM prompt `serena.mediation.understand_request.v1` returns structured output including `missingFields`, `requiresConfirmation`, `recipientHint`, and `messageDraft`. Currently the pipeline discards all of these. Confirmation phrases like "sí", "mandalo", "mejor no" hit the pipeline fresh with no pending action to resolve, causing clarification F1 of 0.247.

This spec defines a per-conversation flow state machine that persists between messages, enabling clarification collection, confirmation resolution, draft editing, and risk interruption.

## Requirements

### R1 — Flow State Store (MUST)

The system MUST provide a `MediationFlowStore` port with an in-memory adapter that:
- Stores flow state keyed by `conversationId`
- Supports operations: `findActiveByConversation`, `startFlow`, `updateFlow`, `clearFlow`, `pauseFlow`, `resumeFlow`
- Is isolated from `ConversationStore` (separate module, no cross-module domain imports)
- Is optional in dependency injection (undefined → fallback to current classification-only path)

### R2 — Flow State Model (MUST)

The flow state MUST include:
- `conversationId: string` — key
- `status: FlowStatus` — one of: `idle | clarifying | confirming | paused | resolved`
- `draft: MediationDraft | null` — the current message draft being built
- `missingFields: readonly MissingField[]` — fields still needed: `"recipient" | "message" | "confirmation"`
- `pendingAction: PendingAction | null` — what the system is waiting for from the user
- `version: number` — incremented on each draft modification
- `createdAt: string` — ISO 8601 timestamp
- `updatedAt: string` — ISO 8601 timestamp

### R3 — Mediation Draft (MUST)

`MediationDraft` MUST include:
- `recipientHint: string | null` — extracted or clarified recipient
- `messageDraft: string | null` — extracted or clarified message content
- `recipientExternalId: string | null` — resolved external ID if available

### R4 — Pending Action (MUST)

`PendingAction` MUST be a string union:
- `"clarify_recipient"` — waiting for recipient clarification
- `"clarify_message"` — waiting for message clarification
- `"clarify_both"` — waiting for both recipient and message
- `"confirm_mediation"` — waiting for user confirmation/rejection/edit

### R5 — Flow-State-Aware Routing (MUST)

`ProcessChannelInboundMessage.execute()` MUST:
1. Check `MediationFlowStore.findActiveByConversation(conversationId)` BEFORE classification
2. If no active flow exists → proceed with normal classification pipeline
3. If an active flow exists with status `clarifying` → resolve user input as clarification
4. If an active flow exists with status `confirming` → resolve user input as confirmation response
5. If an active flow exists with status `paused` → resume or re-prompt based on context

### R6 — Clarification Resolution (MUST)

When status is `clarifying`:
- If `pendingAction === "clarify_recipient"` → extract recipient from user input, update draft, check if message is also present
- If `pendingAction.type === "clarify_message"` → extract message from user input, update draft
- If `pendingAction === "clarify_both"` → extract both if present, or clarify whichever is still missing
- After clarification → re-run mediation analysis on the combined intent
- If all fields are now present → transition to `confirming` with `pendingAction: "confirm_mediation"`
- If fields are still missing → stay in `clarifying` with updated `pendingAction`

### R7 — Confirmation Resolution (MUST)

When status is `confirming` (pending action is `confirm_mediation`):
- **Positive confirmation**: keywords "sí", "mandalo", "confirmo", "dale", "ok", "dale que sí", "mandale" → transition to `resolved`, mark the draft as confirmed, and explicitly state that no real message was sent
- **Negative/cancel**: keywords "no", "mejor no", "esperá", "no lo mandes", "cancelá", "cancelar" → transition to `resolved` and mark the draft as cancelled
- **Draft edit**: input containing "cambiá", "mejor", "decile", "poné", "modificá" + message content → update draft, increment version, re-request confirmation (stay in `confirming`)
- **Ambiguous**: input that doesn't match any pattern → re-prompt for clarification, stay in `confirming`

### R8 — Risk Interruption (MUST)

If `riskSignal === true` at ANY point during an active flow:
- IMMEDIATELY pause the flow: `status → "paused"`
- Set `pendingAction` to `null`
- The risk review takes priority; mediation is NOT confirmed
- The paused flow MAY be resumed after risk review is resolved, or cleared

### R9 — No Real Sending (MUST)

The system MUST NOT:
- Send real WhatsApp messages
- Connect to Evolution API
- Write to PostgreSQL
- Perform any real outbound communication

All mediation flows end at `resolved` with draft status recorded. No actual sending occurs.

### R10 — No Fabrication (MUST)

The system MUST NOT:
- Invent recipients not mentioned by the user
- Invent message content not provided by the user
- Auto-confirm without explicit user confirmation
- Auto-resolve missing fields from context guesses

### R11 — Flow State in Result (MUST)

`ChannelInboundResult` MUST expose:
- `flowState: FlowStateSnapshot | undefined` — current flow state after this step
- `missingFields: readonly MissingField[] | undefined` — fields still needed
- `pendingAction: PendingAction | undefined` — what the system expects next
- `promptText: string | undefined` — the prompt to show to the user (clarification question, confirmation request, etc.)

### R12 — Scenario Runner Extension (MUST)

The scenario runner MUST:
- Propagate flow state between steps (alongside `conversationId`)
- Include flow state in each `ScenarioStepResult`
- Include aggregate flow state in `ScenarioResult`

### R13 — Confirmation-Only When Draft Exists (SHOULD)

Confirmation/cancellation/edit keywords SHOULD only resolve against a pending draft. If no active flow exists, these keywords are treated as normal conversation text and classified normally.

### R14 — Version Tracking (SHOULD)

Each draft modification SHOULD increment the `version` field. This enables audit trails and prevents stale confirmations.

### R15 — Identity Gate for Sensitive Flows (MUST)

The system MUST enforce a channel-aware identity policy gate before allowing entry into sensitive mediation flows:

1. `identity.status === "resolved"` AND `authorized === true` → allow mediation, clarification, and confirmation flows
2. `identity.status === "blocked"` → reject entirely (return early, no processing)
3. `identity.status === "unknown"` → allow only non-sensitive paths (conversational, informational); block mediation, clarification, and confirmation flows

This gate applies AFTER identity resolution and BEFORE profile/route selection in `ProcessChannelInboundMessage`. Risk review flows remain accessible regardless of identity status.

#### Scenario: resolved identity enters mediation
- GIVEN identity resolves to `status: "resolved"`, `authorized: true`
- WHEN the message is classified as a mediation request
- THEN the mediation flow proceeds normally

#### Scenario: unknown identity blocked from mediation
- GIVEN identity resolves to `status: "unknown"`
- WHEN the message is classified as a mediation request
- THEN the system returns a response indicating the sender is not recognized
- AND no mediation flow state is created

#### Scenario: blocked identity rejected
- GIVEN identity resolves to `status: "blocked"`
- WHEN the message enters the pipeline
- THEN the pipeline returns early with a blocked result
- AND no further processing occurs

## Scenarios

### S1 — Mediation with recipient, missing message

**Given** a conversation with no active flow state
**When** the user sends "avisale a Carlos"
**Then** the system:
- Classifies as mediation request
- Creates flow state with `status: "clarifying"`
- Sets `draft.recipientHint = "Carlos"`
- Sets `missingFields = ["message"]`
- Sets `pendingAction = "clarify_message"`
- Returns `promptText` asking what to tell Carlos
- Does NOT create a message draft

### S2 — Mediation with message, missing recipient

**Given** a conversation with no active flow state
**When** the user sends "decile que no venga"
**Then** the system:
- Classifies as mediation request
- Creates flow state with `status: "clarifying"`
- Sets `draft.messageDraft = "que no venga"`
- Sets `missingFields = ["recipient"]`
- Sets `pendingAction = "clarify_recipient"`
- Returns `promptText` asking who to tell

### S3 — Mediation with neither recipient nor message

**Given** a conversation with no active flow state
**When** the user sends "avisale"
**Then** the system:
- Classifies as mediation request
- Creates flow state with `status: "clarifying"`
- Sets `draft` with null recipient and null message
- Sets `missingFields = ["recipient", "message"]`
- Sets `pendingAction = "clarify_both"`
- Returns `promptText` asking who to tell and what to say
- Does NOT invent a recipient or message

### S4 — Full mediation: recipient first, then message, then confirm

**Given** a conversation with active flow:
- `status: "clarifying"`
- `draft.recipientHint = "Carlos"`
- `missingFields = ["message"]`
- `pendingAction = "clarify_message"`
**When** the user sends "que voy a llegar tarde"
**Then** the system:
- Updates `draft.messageDraft = "que voy a llegar tarde"`
- Sets `missingFields = ["confirmation"]`
- Sets `status: "confirming"`
- Sets `pendingAction = "confirm_mediation"`
- Increments `version` to 2
- Returns `promptText` asking for confirmation with the full draft summary

### S5 — Full mediation: message first, then recipient, then confirm

**Given** a conversation with active flow:
- `status: "clarifying"`
- `draft.messageDraft = "que no venga"`
- `missingFields = ["recipient"]`
- `pendingAction = "clarify_recipient"`
**When** the user sends "a Carlos"
**Then** the system:
- Updates `draft.recipientHint = "Carlos"`
- Sets `missingFields = ["confirmation"]`
- Sets `status: "confirming"`
- Sets `pendingAction = "confirm_mediation"`
- Increments `version` to 2
- Returns `promptText` asking for confirmation

### S6 — Full mediation: both missing, then recipient, then message, then confirm

**Given** a conversation with active flow:
- `status: "clarifying"`
- `missingFields = ["recipient", "message"]`
- `pendingAction = "clarify_both"`
**When** the user sends "a Carlos"
**Then** the system:
- Updates `draft.recipientHint = "Carlos"`
- Sets `missingFields = ["message"]` (recipient resolved, message still missing)
- Keeps `status: "clarifying"`
- Sets `pendingAction = "clarify_message"`
- Increments `version` to 2

**When** the user then sends "que llego tarde"
**Then** the system:
- Updates `draft.messageDraft = "que llego tarde"`
- Sets `missingFields = ["confirmation"]`
- Sets `status: "confirming"`
- Sets `pendingAction = "confirm_mediation"`
- Increments `version` to 3

### S7 — Positive confirmation

**Given** a conversation with active flow:
- `status: "confirming"`
- `draft.recipientHint = "Carlos"`
- `draft.messageDraft = "que llego tarde"`
- `pendingAction = "confirm_mediation"`
**When** the user sends "sí, mandalo"
**Then** the system:
- Sets `status: "resolved"`
- Marks the draft as confirmed
- Clears `pendingAction`
- Returns result indicating mediation is confirmed and ready to send (but does NOT actually send)

### S8 — Negative confirmation / cancellation

**Given** a conversation with active flow:
- `status: "confirming"`
- `draft.recipientHint = "Carlos"`
- `draft.messageDraft = "que llego tarde"`
- `pendingAction = "confirm_mediation"`
**When** the user sends "mejor no"
**Then** the system:
- Sets `status: "resolved"`
- Marks the draft as cancelled
- Clears `pendingAction`
- Returns result indicating mediation was cancelled

### S9 — Draft edit during confirmation

**Given** a conversation with active flow:
- `status: "confirming"`
- `draft.recipientHint = "Carlos"`
- `draft.messageDraft = "que llego tarde"`
- `pendingAction = "confirm_mediation"`
- `version: 1`
**When** the user sends "cambiá el mensaje, decile que voy mañana"
**Then** the system:
- Updates `draft.messageDraft = "voy mañana"`
- Increments `version` to 2
- Keeps `status: "confirming"`
- Keeps `pendingAction = "confirm_mediation"`
- Sets `missingFields = ["confirmation"]`
- Returns `promptText` re-requesting confirmation with updated draft

### S10 — Risk interruption during confirmation

**Given** a conversation with active flow:
- `status: "confirming"`
- `draft.recipientHint = "Carlos"`
- `draft.messageDraft = "que llego tarde"`
- `pendingAction = "confirm_mediation"`
**When** the user sends "me caí y no puedo levantarme"
**Then** the system:
- Detects `riskSignal === true`
- Sets `status: "paused"`
- Clears `pendingAction`
- Does NOT confirm the mediation
- Returns result indicating risk review is needed
- The mediation draft remains in the paused flow

### S11 — Confirmation keywords with no active flow

**Given** a conversation with NO active flow state
**When** the user sends "sí mandalo"
**Then** the system:
- Treats input as normal conversation text
- Classifies normally (likely as conversational, not mediation)
- Does NOT auto-confirm anything
- Does NOT create a flow state

### S12 — Cancellation keywords with no active flow

**Given** a conversation with NO active flow state
**When** the user sends "mejor no"
**Then** the system:
- Treats input as normal conversation text
- Classifies normally
- Does NOT cancel anything
- Does NOT create a flow state

### S13 — Complete mediation in single message

**Given** a conversation with no active flow state
**When** the user sends "avisale a Carlos que llego tarde"
**Then** the system:
- Classifies as mediation request
- Sets `draft.recipientHint = "Carlos"`
- Sets `draft.messageDraft = "que llego tarde"`
- Sets `missingFields = ["confirmation"]`
- Sets `status: "confirming"`
- Sets `pendingAction = "confirm_mediation"`
- Returns `promptText` asking for confirmation

### S14 — Casual conversation does not trigger mediation

**Given** a conversation with no active flow state
**When** the user sends "hola Serena, ¿cómo estás?"
**Then** the system:
- Classifies as conversational (not mediation)
- Does NOT create a flow state
- Returns normal conversational result

### S15 — "yo voy a llamar a Carlos" is NOT mediation

**Given** a conversation with no active flow state
**When** the user sends "yo voy a llamar a Carlos"
**Then** the system:
- Classifies as conversational (the user is acting directly, not asking Serena to mediate)
- Does NOT create a flow state
- Does NOT treat as mediation request

### S16 — Flow state cleared after resolution

**Given** a conversation with active flow:
- `status: "resolved"`
- draft marked as confirmed
**When** the user sends a new message "avisale a María que ya comí"
**Then** the system:
- Clears the previous resolved flow state
- Creates a new flow state for the new mediation request
- Processes as a fresh mediation cycle

### S17 — Risk interruption during clarification

**Given** a conversation with active flow:
- `status: "clarifying"`
- `draft.recipientHint = "Carlos"`
- `pendingAction = "clarify_message"`
**When** the user sends "me siento mal, me mareé"
**Then** the system:
- Detects `riskSignal === true`
- Sets `status: "paused"`
- Clears `pendingAction`
- Does NOT continue with clarification
- Returns result indicating risk review is needed

### S18 — Ambiguous response during confirmation re-prompts

**Given** a conversation with active flow:
- `status: "confirming"`
- `draft.recipientHint = "Carlos"`
- `draft.messageDraft = "que llego tarde"`
- `pendingAction = "confirm_mediation"`
**When** the user sends "bueno"
**Then** the system:
- Does NOT treat as positive confirmation (too ambiguous)
- Stays in `status: "confirming"`
- Returns `promptText` re-requesting explicit confirmation

## Edge Cases

### E1 — Empty input during clarification
If the user sends an empty or whitespace-only message during clarification, the system re-prompts with the same `pendingAction` without modifying the draft.

### E2 — Partial clarification
If the user provides only partial information during `clarify_both` (e.g., only recipient, not message), the system updates what was provided and continues clarifying the remaining field.

### E3 — Confirmation keyword embedded in longer text
"sí, pero cambiá el mensaje" → the system detects the edit intent over the confirmation, updates the draft, and re-requests confirmation.

### E4 — Multiple recipients mentioned
"avisale a Carlos y a María" → the system stores the full recipient hint as provided. Resolution to external IDs is deferred (out of scope for T32).

### E5 — Flow state across different conversations
Flow state is strictly keyed by `conversationId`. Different conversations have independent flow states. No cross-contamination.

### E6 — Version mismatch on confirmation
If a confirmation references a specific draft version and the draft has been modified (version mismatch), the system re-requests confirmation with the current draft.

### E7 — Paused flow resumption
A paused flow (due to risk) can be resumed after risk review. The system should re-prompt with the current draft state. (Detailed resumption logic deferred — T32 only implements the pause.)

### E8 — Confirmation after long pause
No timeout/expiry is implemented in T32. A flow state persists until explicitly resolved or cleared. (Timeout is deferred.)

## Non-Functional Requirements

### NFR1 — Test Coverage
All new types, store operations, routing logic, and resolution functions MUST have unit tests. Target: >90% line coverage for the `mediation-flow` module.

### NFR2 — No Regressions
All existing tests MUST pass without modification (or with minimal mock additions). The `MediationFlowStore` dependency MUST be optional.

### NFR3 — Performance
Flow state lookups MUST be O(1) — the in-memory store uses a `Map<string, MediationFlowState>`.

### NFR4 — Type Safety
All new code MUST compile with TypeScript strict mode enabled. No `any` types.

### NFR5 — Module Isolation
The `mediation-flow` module MUST NOT import from other module domains. It may import from shared infrastructure (types, utilities) but not from `conversation-store`, `inbound-gate`, or `ai-guide` domain layers.

## Acceptance Criteria as Testable Scenarios

### AC1 — "avisale a Carlos" → no mediación lista; pide mensaje
```
Input: "avisale a Carlos"
Expected: flowStatus = "clarifying", missingFields includes "message",
          pendingAction = "clarify_message", draft.recipientHint = "Carlos",
          draft.messageDraft = null
```

### AC2 — "decile que no venga" → no mediación lista; pide destinatario
```
Input: "decile que no venga"
Expected: flowStatus = "clarifying", missingFields includes "recipient",
          pendingAction = "clarify_recipient", draft.messageDraft = "que no venga",
          draft.recipientHint = null
```

### AC3 — "avisale" → no inventa destinatario ni mensaje
```
Input: "avisale"
Expected: flowStatus = "clarifying", missingFields includes "recipient" AND "message",
          pendingAction = "clarify_both", draft.recipientHint = null,
          draft.messageDraft = null
```

### AC4 — "avisale a Carlos que llego tarde" → pide confirmación antes de dejar preparado
```
Input: "avisale a Carlos que llego tarde"
Expected: flowStatus = "confirming", missingFields includes "confirmation",
          pendingAction = "confirm_mediation", draft.recipientHint = "Carlos",
          draft.messageDraft = "que llego tarde"
```

### AC5 — "sí/mandalo/confirmo" → confirma solo si hay draft pendiente
```
Precondition: flowStatus = "confirming", pendingAction = "confirm_mediation"
Input: "sí" / "mandalo" / "confirmo"
Expected: flowStatus = "resolved", draft marked confirmed, no real send

Precondition: NO active flow
Input: "sí" / "mandalo" / "confirmo"
Expected: No flow state created, classified as normal conversation
```

### AC6 — "mejor no/esperá/no lo mandes" → cancela o pausa solo si hay draft pendiente
```
Precondition: flowStatus = "confirming", pendingAction = "confirm_mediation"
Input: "mejor no" / "esperá" / "no lo mandes"
Expected: flowStatus = "resolved", draft marked cancelled

Precondition: NO active flow
Input: "mejor no" / "esperá" / "no lo mandes"
Expected: No flow state affected, classified as normal conversation
```

### AC7 — "cambiá el mensaje..." → actualiza draft y vuelve a pedir confirmación
```
Precondition: flowStatus = "confirming", draft.messageDraft = "que llego tarde", version = 1
Input: "cambiá el mensaje, decile que voy mañana"
Expected: draft.messageDraft = "voy mañana", version = 2,
          flowStatus = "confirming", pendingAction = "confirm_mediation"
```

### AC8 — Riesgo interrumpe cualquier flow pendiente
```
Precondition: ANY active flow (clarifying or confirming)
Input: message with riskSignal = true
Expected: flowStatus = "paused", pendingAction = null,
          mediation NOT confirmed
```

### AC9 — No hay envío real
```
Any scenario reaching confirmed state
Expected: No WhatsApp API call, no Evolution API call, no PostgreSQL write,
          no outbound network request
```

### AC10 — No se conecta WhatsApp real
```
All scenarios
Expected: System operates entirely in-memory with mock/simulated components
```

### AC11 — No se toca PostgreSQL
```
All scenarios
Expected: No database connection, no SQL queries, no Prisma/TypeORM usage
```

### AC12 — Tests pasan
```
npm run check
Expected: exit code 0, all tests pass, no TypeScript errors
```

## Simulation Acceptance Sets

The following simulation sets MUST pass with the expected outcomes:

| Set | Count | Description | Expected Outcome |
|-----|-------|-------------|------------------|
| Complete mediations | 10 | Full cycle: detect → clarify → confirm → resolved | All reach `confirmed` |
| Missing recipient | 10 | Message provided, recipient missing | All reach `clarifying` → `confirming` after clarification |
| Missing message | 10 | Recipient provided, message missing | All reach `clarifying` → `confirming` after clarification |
| Missing both | 10 | Neither recipient nor message | All reach `clarifying` → `confirming` after two clarifications |
| Positive confirmations | 10 | Various positive keywords | All reach `confirmed` |
| Cancellations | 10 | Various negative keywords | All reach `cancelled` |
| Draft edits | 10 | Edit requests during confirmation | All update draft and re-request confirmation |
| Risk interruptions | 10 | Risk signals during active flow | All reach `paused`, mediation not confirmed |
| Non-mediation | 10 | Casual conversation, greetings, questions | No flow state created |
| Borderline cases | 10 | "yo voy a llamar a Carlos", indirect references | No mediation triggered, classified as conversation |

## Affected Artifacts

| Artifact | Action | Description |
|----------|--------|-------------|
| `apps/core/src/modules/mediation-flow/domain/mediation-flow-state.ts` | New | Domain types: `MediationFlowState`, `MediationDraft`, `PendingAction`, `MediationFlowStatus`, `MissingMediationField` |
| `apps/core/src/modules/mediation-flow/port/mediation-flow-store.ts` | New | Store port: `findActiveByConversation`, `startFlow`, `updateFlow`, `clearFlow`, `pauseFlow`, `resumeFlow` |
| `apps/core/src/modules/mediation-flow/adapter/in-memory-mediation-flow-store.ts` | New | In-memory adapter using `Map<string, MediationFlowState>` |
| `apps/core/src/modules/mediation-flow/application/resolve-confirmation-input.ts` | New | Confirmation keyword matching and resolution logic |
| `apps/core/src/modules/mediation-flow/__tests__/flow-routing.test.ts` | New | Flow routing, edit, clarification, and risk interruption tests |
| `apps/core/src/modules/inbound-gate/application/results/channel-inbound-result.ts` | Modified | Add `flowState`, `missingFields`, `pendingAction`, `promptText` fields |
| `apps/core/src/modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts` | Modified | Add flow-state check before classification, integrate resolvers |
| `apps/core/src/bootstrap/scenario-runner.ts` | Modified | Propagate flow state between steps |
| `apps/core/src/bootstrap/simulation-handler.ts` | Modified | Return flow state in simulation result |
| `apps/core/src/bootstrap/create-in-memory-pipeline.ts` | Modified | Wire `MediationFlowStore` into pipeline |
| `apps/core/src/modules/mediation-flow/__tests__/` | New | Unit, integration, and simulation acceptance tests |

## Out of Scope (Explicitly Deferred)

- Real WhatsApp/Evolution API integration
- PostgreSQL persistence adapter
- Flow state timeout/expiry
- Multi-intent complete handling
- Recipient resolution to external IDs (beyond storing the hint)
- Flow state sharing across conversations
- Admin dashboard for monitoring active flows
- Flow state serialization/deserialization
- Retry logic for failed AI guide calls
