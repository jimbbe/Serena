# Design: T45 Controlled Pairing Readiness

## Technical Approach

T45 is a repo-only documentation plus validation change. It adds one canonical readiness artifact at `docs/ops/t45-controlled-pairing-readiness.md`, a node:test validator at `scripts/tests/t45-controlled-pairing-readiness.test.ts`, package script wiring, and status/open-question documentation updates. No application runtime, VPS, Docker, Caddy, DNS, Evolution, WhatsApp pairing, secrets, or PostgreSQL behavior changes are part of the implementation.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Canonical gate | Use `docs/ops/t45-controlled-pairing-readiness.md` as the single T45 GO/NO-GO source. | Split between runbook/status docs. | One artifact is easier to review, validate, archive, and cite from T46. |
| Validation shape | Add `scripts/tests/t45-controlled-pairing-readiness.test.ts` using `node:test` and `node:assert/strict`. | Bash script or custom CLI. | Matches T44 pattern, zero dependencies, included in `scripts/tsconfig.json`. |
| Check wiring | Add `validate:t45` and include it in `npm run check` after `validate:t44` and before `typecheck`. | Manual-only validation. | Keeps readiness guardrails automatic without contacting runtime services. |
| Runtime config | Document allowlist/instance mapping as private operator-owned runtime config only. | Commit real numbers or require PostgreSQL. | Satisfies safety/privacy scope and keeps T45 repo-only. |
| Archive readiness | Keep active artifacts under `openspec/changes/t45-controlled-pairing-readiness/`; archive phase later merges deltas into `openspec/specs/*` and moves the full change folder. | Update main specs during design/apply. | Preserves OpenSpec change audit trail and avoids premature source-of-truth mutation. |

## Data Flow

```text
T45 specs/proposal
  -> docs/ops/t45-controlled-pairing-readiness.md
  -> scripts/tests/t45-controlled-pairing-readiness.test.ts
  -> package.json validate:t45 + check
  -> docs status/questions sync
  -> future sdd-archive merges OpenSpec deltas
```

The validator reads repository files only. It must never call HTTP endpoints, Docker, VPS, Caddy, DNS, Evolution API, WhatsApp, or Hostinger tooling.

## File Changes

| File | Action | Description |
|---|---|---|
| `docs/ops/t45-controlled-pairing-readiness.md` | Create | Canonical readiness gate with ledger, gates, evidence fields, T46-only pairing plan, risk acceptance, abort/revalidate rules, non-actions, and <=4 task runway. |
| `scripts/tests/t45-controlled-pairing-readiness.test.ts` | Create | Machine-checkable validation for required sections/fields, evidence requirements, forbidden approval wording, runtime-only allowlist posture, and roadmap constraint. |
| `package.json` | Modify | Add `validate:t45`; wire `check` as `... validate:t44 && npm run validate:t45 && npm run typecheck`. |
| `README.md` | Modify | Update current-state/T44-T45 next-step wording only. |
| `docs/project-status.md` | Modify | Mark T45 readiness gate prepared/completed and restate blocked actions. |
| `docs/open-questions.md` | Modify | Close/narrow T45 planning questions; keep future T46/T48 hardening questions explicit. |
| `openspec/changes/t45-controlled-pairing-readiness/design.md` | Create | This design artifact. |

## Interfaces / Contracts

The readiness document must include these exact conceptual sections: readiness checklist, GO/NO-GO ledger, T46 pairing activation plan, runtime allowlist/config ownership, operational evidence fields, bounded risk acceptance, abort/revalidate triggers, explicit non-actions, <=4 task roadmap, OpenSpec/archive notes.

Mandatory ledger fields: decision (`GO`/`NO-GO`/`PENDING`), reviewer, operator, timestamp or pending marker, rationale, unmet gates, remediation.

Mandatory evidence fields for future T46/T47: `timestamp`, `instanceId`, `sender/personId`, `messageId`, pipeline decision, selected action, sent/not sent, error, operator notes. The document must say message content, tokens, QR values, credentials, and unnecessary sensitive data are omitted or redacted.

Forbidden scope-expansion approval patterns should fail validation when docs approve: pairing/QR execution in T45, real sends, public/admin exposure, host ports, Caddy/DNS/VPS/Docker mutation, secret changes, PostgreSQL rollout, HMAC implementation/rollout, durable state rollout, or production/sustained use.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Repo validation | Canonical sections, ledger fields, evidence fields, deferral, non-actions, <=4 task path | `node --experimental-strip-types --test scripts/tests/t45-controlled-pairing-readiness.test.ts` |
| Negative guardrails | Missing sections/fields and forbidden approval wording fail closed | Create malformed in-memory strings and assert validation errors. |
| Check pipeline | `validate:t45` exists and is wired into `check` | Regex assertions against `package.json`. |

## Migration / Rollout

No migration required. Rollback is a repo revert of T45 docs/script/package changes; runtime rollback is not applicable because T45 performs no runtime mutation.

## Open Questions

- None blocking design. T45 should record unresolved operational hardening as future gates, not solve them.
