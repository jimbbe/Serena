# Design: T47 Controlled Pairing Execution

## Technical Approach

T47 is a documentation-and-guardrail execution change, not product logic. Apply creates a canonical operational ledger plus a validator. Runtime work may proceed only from a private operator path after local and VPS gates pass. The only valid closeouts are sanitized attempt evidence, scan-required stop, completed-pairing sanitized state, or concrete operational NO-GO. No public route/Caddy/DNS/ports, no secrets, no full QR, no real numbers, no real sends, and `OUTBOUND_DELIVERY_ADAPTER=fake` remains invariant.

## Architecture Decisions

| Decision | Alternatives considered | Rationale |
|---|---|---|
| Canonical ledger in `docs/ops/t47-controlled-pairing-execution-evidence.md` | Put evidence in README/status only | Matches T44-T46 pattern and keeps review/audit focused. |
| Validator in `scripts/tests/t47-controlled-pairing-execution.test.ts` wired as `validate:t47` before typecheck | Manual review only | T47 evidence is risk-bearing; prohibited data must fail closed in `npm run check`. |
| Operator-run sequence, not automated pairing script | Add script that calls `/instances`/QR | Existing gateway returns QR/pairing material from `/instances` and `/instances/:name/qr`; automation increases leak risk. |
| Stop at manual scan | Poll/assume success after QR | Specs require not inventing success; scan requires human action and sanitized state only. |

## Data Flow

```text
local repo gates
  -> private VPS topology/smoke gates
  -> operator+reviewer approval
  -> at most one private pairing attempt
  -> closeout: NO-GO | scan-required | attempted | completed
  -> sanitized docs + validation
```

Runtime sequence:
1. Confirm branch from updated `main`, PR #76 merged, `npm run check`, `npm test`.
2. Confirm `/docker/serena`, expected containers, private networks, no `gateway-wa` host ports, no `proxy`/public route.
3. Confirm `OUTBOUND_DELIVERY_ADAPTER=fake` before attempt.
4. Run private smoke only: health, `/send` 401 without key, malformed `/send` 400 with key, unknown path 404.
5. Confirm operator/reviewer, approved redacted `instanceId`, route existence, allowlist existence, no public `/instances` path.
6. Execute at most one private pairing attempt. If QR/manual scan appears, stop and record scan-required. If completion is observed, record sanitized final state. Never send messages.
7. Recheck `OUTBOUND_DELIVERY_ADAPTER=fake`; close ledger.

## File Changes

| File | Action | Description |
|---|---|---|
| `docs/ops/t47-controlled-pairing-execution-evidence.md` | Create | Canonical gate/evidence/closeout ledger. |
| `scripts/tests/t47-controlled-pairing-execution.test.ts` | Create | Validates sections, sequencing, fake outbound, non-actions, and redaction. |
| `package.json` | Modify | Add `validate:t47`; wire after `validate:t46` and before `typecheck`. |
| `docs/project-status.md` | Modify | Record factual T47 result only. |
| `docs/open-questions.md` | Modify if needed | Only real unresolved follow-ups, no speculative edits. |

## Interfaces / Contracts

Evidence row schema:

```ts
type T47Evidence = {
  timestampUtc: string;
  operator: "Marco" | "redacted";
  reviewer: "Marco" | "redacted";
  localGates: "passed" | "failed";
  privateTopology: "passed" | "failed";
  outboundBefore: "fake" | "failed";
  outboundAfter: "fake" | "not_reached" | "failed";
  instanceId: "redacted/<label>";
  routeProof: "exists-redacted" | "failed";
  allowlistProof: "exists-redacted" | "failed";
  pairingState: "not_started" | "attempted" | "scan_required" | "completed" | "no_go";
  sent: "not_sent";
  blockerOrError: string;
  nextOperatorAction: string;
};
```

Sanitization forbids QR/pairing values, phones, credentials, API keys/tokens, real routing URLs, allowlist contents, message bodies, and unrelated project details. Validator should scan T47 docs plus README/status/open questions for forbidden approvals and obvious leaked patterns.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Repo validation | T47 document structure and fail-closed language | `node:test` script like T46. |
| Guardrail validation | No public exposure/real-send approval; fake invariant present | Regex assertions across changed docs. |
| Redaction | No QR, phone-like values, keys, message bodies, route/allowlist values | Denylist regexes; placeholders/redacted values allowed. |

## Migration / Rollout

No migration required. Rollback is repo-only revert of T47 artifacts. Runtime rollback is abort-only: do not delete volumes, mutate Caddy/DNS, publish ports, rotate/print secrets, change outbound from fake, or touch unrelated projects. Restart/state drift invalidates the attempt and requires NO-GO plus revalidation.

## Open Questions

- None blocking design.
