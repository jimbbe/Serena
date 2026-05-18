# Design: T44 Private Staging Operational Readiness

## Technical Approach

T44 will be implemented as a repo-only operational readiness package layered on top of the existing T43 private rollout artifacts. It will not add runtime behavior. The work will create a canonical readiness/go-no-go artifact, tighten the existing runbook/evidence ledger as the operator handoff surface, and add a repo-side validation test wired into `npm run check`. The design maps directly to `gateway-private-staging-readiness` and the `gateway-private-staging-ops` delta: T43 evidence is an input, not authorization for VPS/Caddy/DNS/Docker mutation.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Canonical readiness artifact | Create `docs/ops/t44-private-staging-readiness.md` as the go/no-go ledger, checklist, handoff, rollback, and blocked-follow-up record. | Only append to T42 evidence; only use OpenSpec. | A dedicated operator artifact prevents T44 from becoming a tiny doc tweak and gives reviewers one bounded handoff surface. |
| Evidence source | Treat `docs/ops/t42-gateway-wa-private-staging-evidence.md` as immutable baseline input, with T44 readiness citing it. | Rewrite T43 evidence into T44; re-run live smoke. | Preserves audit history and avoids runtime mutation. |
| Validation | Add `scripts/tests/t44-private-staging-readiness.test.ts` and wire `validate:t44` into `package.json` `check`. | Shell grep script; no validation. | Existing repo validation uses Node `node:test` TypeScript files under `scripts/tests`; keeping that pattern gives machine-checkable guardrails without contacting runtime services. |
| Guardrails | Validation fails closed on approval language for pairing, public/admin exposure, real sends, host ports, Caddy/DNS changes, VPS/Docker mutation, secrets, HMAC, or durable state. | Rely on human review only. | T44’s main risk is scope expansion; automated text checks make drift visible. |

## Data Flow

```text
T43 evidence/runbook/templates/specs
        │
        ▼
docs/ops/t44-private-staging-readiness.md
        │
        ▼
scripts/tests/t44-private-staging-readiness.test.ts
        │
        ▼
npm run check  ── validates repo artifacts only
```

No network calls, Docker commands, VPS access, Caddy reloads, DNS changes, pairing, real sends, or secret reads occur in this flow.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `docs/ops/t44-private-staging-readiness.md` | Create | Canonical T44 readiness package: checklist, evidence links, go/no-go ledger fields, owner responsibilities, rollback ownership, explicit non-actions, and blocked follow-ups. |
| `docs/ops/t37-gateway-wa-staging-runbook.md` | Modify | Add T44 handoff pointer and clarify that T44 review is repo-only and does not authorize additional runtime operations. |
| `docs/ops/t42-gateway-wa-private-staging-evidence.md` | Modify | Add a short T44-readiness-input note pointing to the new readiness package while preserving T43 evidence as baseline history. |
| `docs/project-status.md` | Modify | Record T44 as an operational readiness/go-no-go milestone and keep follow-ups blocked. |
| `docs/open-questions.md` | Modify | Track any remaining follow-up questions only if the readiness package exposes unresolved ownership or next-milestone ambiguity. |
| `scripts/tests/t44-private-staging-readiness.test.ts` | Create | Repo-only validation for required sections, evidence links, fail-closed guardrails, placeholder-only posture, and absence of approval language for blocked operations. |
| `package.json` | Modify | Add `validate:t44` and include it in `npm run check`. |

## Interfaces / Contracts

The readiness document is the contract. It must contain these stable sections so validation can assert them:

- `Readiness Checklist`
- `Evidence Inputs`
- `Go/No-Go Ledger`
- `Operator Handoff`
- `Rollback Ownership`
- `Explicit Non-Actions`
- `Blocked Follow-ups`

The ledger must include blank/operator-filled fields for decision, reviewer/operator, timestamp, rationale, unmet gates, and remediation. Blank fields mean “not ready” until completed; a GO remains limited to private operator-only staging review.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Repo validation | Required T44 readiness sections and links to T43 evidence/runbook/specs | `node:test` reads tracked files and asserts required markers. |
| Guardrail validation | Forbidden scope expansion is not approved | Regex checks fail if artifacts approve pairing, public/admin exposure, real sends, host ports, Caddy/DNS/VPS/Docker mutation, secret changes, HMAC, or durable state. |
| Runtime/E2E | None | Explicitly out of scope; no service calls or Docker operations. |

## Migration / Rollout

No migration required. Rollout is a PR-only documentation and validation change. Rollback is reverting the T44 artifact/test/package changes; runtime staging remains untouched.

## Open Questions

- [ ] None blocking. Any future approval for pairing, public/admin exposure, HMAC, durable state, or real sends must be a separate milestone.
