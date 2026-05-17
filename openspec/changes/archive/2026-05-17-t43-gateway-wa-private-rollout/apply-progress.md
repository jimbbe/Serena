# Apply Progress — t43-gateway-wa-private-rollout

## Mode
Strict TDD configured in `openspec/config.yaml`; T43 implementation scope remained ops/docs/infrastructure evidence (no product code-path changes).

## Completed Tasks (cumulative)
- [x] 1.1 Preflight branch/state on `feat/t43-gateway-wa-private-rollout` and read T40/T41/T42 evidence docs.
- [x] 1.2 Reviewed and updated staging compose/env template to keep private-only networking and no host ports.
- [x] 1.3 Updated runbook + evidence ledger for T43 backup-first rollout, private smoke, rollback, and redaction rules.
- [x] 1.4 Updated project status with T43 apply state and explicit deferral note.
- [x] 2.1 Re-verified T40 webhook readiness live via private Docker-network probe.
- [x] 2.2 Recorded VPS staging rollout scope and reconfirmed core outbound runtime remains fake.
- [x] 2.3 Created pre-mutation backup: `/docker/backups/serena-t43-pre-mutation-20260517-162821.tar.gz`.
- [x] 3.1 Provisioned/validated VPS staging `.env` + routing artifact presence with redacted key checks only.
- [x] 3.2 Ran `docker compose config` and applied private staging stack (`gateway-wa`, `evolution-api`, `evo-postgres`, `redis`).
- [x] 3.3 Verified live services/networks/no host ports/no Caddy/DNS/public exposure.
- [x] 4.1 Executed non-destructive private smoke (`/health`, auth rejection, malformed `/send`, unknown route).
- [x] 4.2 Rollback remained staged-only and conditional; not executed because required smoke checks passed.
- [x] 4.3 Finalized evidence ledger with backup path, remediation notes, smoke outputs, and explicit non-actions.
- [x] 5.1 Ran `npm run check` after repo-side edits.
- [x] 5.2 Reviewed changes for guardrails/secrets/public exposure and prepared apply report.

## Strict TDD Cycle Evidence (structural, non-code tasks)

| Task | RED (pre-check/gate first) | GREEN (evidence/check passes) | TRIANGULATE (second source) | SAFETY NET |
|---|---|---|---|---|
| 1.1 | Verified guardrail scope and prior evidence prerequisites before any mutation. | Preconditions satisfied and documented from T40/T41/T42 artifacts. | Cross-checked with runbook and task checklist. | Fail-closed rule: stop rollout if prerequisites missing/stale. |
| 1.2 | Inspected compose/env for forbidden public exposure patterns first (`proxy`, `ports:`). | Final compose evidence confirms private-only networks and no host ports. | Matched against design requirement + evidence ledger. | Existing `validate:t41` guardrail checks + manual diff review. |
| 1.3 | Defined required evidence fields before rollout execution. | Ledger includes backup, smoke, rollback, secrets posture, explicit non-actions. | Spec scenarios + ledger sections aligned one-to-one. | Redaction rules prevent secret leak regressions. |
| 1.4 | Checked docs for stale/ambiguous rollout state language first. | Status docs updated to reflect T43 private rollout completion. | Compared README/project-status wording with evidence ledger. | `npm run check` and repo review prevent structural drift. |
| 2.1 | Webhook precondition check (`200/401`) performed before rollout mutation. | Sanitized preflight evidence recorded (`WEBHOOK_WITH_TOKEN=200`, `WEBHOOK_WITHOUT_TOKEN=401`). | Confirmed in ledger + runbook narrative. | Abort gate if stale or failing readiness. |
| 2.2 | Reviewed outbound policy gate before touching staging. | `OUTBOUND_RUNTIME=fake` preserved and recorded. | Matched runtime evidence + spec scenario. | No product auto-send enabled in this task. |
| 2.3 | Backup requirement validated before mutation. | Backup path captured and retained. | Rollback section references same backup scope. | Staging-scoped rollback preserves volumes by default. |
| 3.1 | Secret handling constraints enforced before env/routing changes. | VPS-only secret keys validated by presence only; no value printed. | `.env.example` placeholders + evidence redaction statements. | Explicit no-secret-print/non-commit non-actions. |
| 3.2 | Compose validation (`docker compose config`) before `up -d`. | Staging services converged (`gateway-wa`, `evolution-api`, `evo-postgres`, `redis`). | Cross-checked with rollout scope and remediation notes. | No Caddy/DNS/public routing mutation allowed. |
| 3.3 | Exposure checks performed first (ports/networks/public surface). | Verified no host ports and no `proxy` attachment for gateway-wa. | Compose topology + smoke/private-path evidence agree. | Fail-closed guardrail stops on public exposure requirement. |
| 4.1 | Smoke scope constrained to synthetic/non-destructive checks before execution. | Health/auth/malformed/unknown-route checks passed (200/401/400/404). | Matches runbook allowed smoke list and ledger outputs. | No pairing, QR, or real sends performed. |
| 4.2 | Rollback criteria defined before deciding not to execute rollback. | Rollback stayed conditional and staging-scoped because smoke passed. | Spec rollback scenario + ledger rollback steps aligned. | Preserves core/Caddy/DNS and non-related projects. |
| 4.3 | Evidence completeness checklist applied before finalization. | Ledger finalized with required scope, actions, non-actions, and secrets posture. | Verified against all 9 delta scenarios traceability table below. | Evidence artifact becomes verify input for strict checks. |
| 5.1 | Validation command required before final report. | `npm run check` passed. | Includes `validate:t38`, `validate:t39`, `validate:t41` outputs. | Typecheck/structure validation protects against drift. |
| 5.2 | Secret/public exposure review required before handoff. | Diff review confirmed guardrails preserved and no secret leakage. | Matched with explicit non-actions in ledger. | PR/readout checklist prevents accidental scope expansion. |

## Scenario → Test/Check Traceability (T43 delta spec)

| Scenario (spec) | Primary check/evidence | Supporting check | Status |
|---|---|---|---|
| Private rollout remains non-public | `infra/vps/gateway-wa-staging/docker-compose.yml` (no `ports:`, no `proxy` for `gateway-wa`) | Evidence Guardrail Check + Explicit Non-Actions | ✅ |
| Core webhook readiness is a precondition | Evidence sanitized preflight (`WEBHOOK_WITH_TOKEN=200`, `WEBHOOK_WITHOUT_TOKEN=401`) | Runbook abort-before-mutation rule | ✅ |
| Backup and rollback precede VPS mutation | Evidence backup path + rollback steps | Task 2.3/4.2 completion records | ✅ |
| Smoke checks are safe and private | Evidence smoke statuses (`200/401/400/404`) | Runbook non-destructive smoke scope | ✅ |
| Outbound remains fake | Evidence `OUTBOUND_RUNTIME=fake` | Guardrail Check + non-actions | ✅ |
| Public exposure checks fail closed | Runbook fail-closed section (stop if Caddy/DNS/public/host-port needed) | Compose private topology proof | ✅ |
| Evidence records actions and non-actions | `docs/ops/t42-gateway-wa-private-staging-evidence.md` full ledger | Apply completed tasks + guardrail checklist | ✅ |
| Secrets stay private | VPS-only `.env` handling + redacted evidence | `.env.example` placeholders in repo | ✅ |
| Rollback is staging-scoped | Ledger rollback steps (`gateway-wa` staging containers only, volumes preserved) | Explicit untouched Core/Caddy/DNS statement | ✅ |

## Validation
- `npm run check` (latest run in this apply batch)

## Remaining / Follow-up
- [ ] Future hardening task: investigate unknown-instance synthetic webhook payload shape that returned `500` during smoke.

## Deviations
None from T43 guardrails. No Caddy/DNS/public/admin exposure, no host ports, no pairing, no real sends, no secret print, no volume deletion.
