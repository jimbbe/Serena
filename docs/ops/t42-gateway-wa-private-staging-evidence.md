# T42 — Gateway WA private staging evidence

## Execution Status

- **Status**: Deferred (no live VPS mutation performed in this apply run)
- **Reason**: This execution environment has repository access only and no operator-approved private VPS mutation session attached.

## Guardrail Check

- Backup-first requirement: ✅ Defined in runbook, not executed.
- Private-only operator path: ✅ Required, not executed.
- Rollback steps documented: ✅ Defined for staging containers only.
- No Caddy/DNS/public admin change: ✅ Not performed.
- No WhatsApp pairing: ✅ Not performed.
- No real outbound send: ✅ Not performed.
- No secret printing/commit: ✅ Not performed.
- No Docker volume deletion: ✅ Not performed.

## Backup Path

- **Not created in this run** (deferred with no live VPS mutation).
- Required at execution time: record absolute backup artifact path before any mutation.

## Smoke Evidence

- Non-destructive smoke scope is documented and constrained to:
  - `/health`
  - auth rejection on protected routes
  - unknown route (`routing_not_configured`)
  - malformed `/send` validation
  - private reachability checks
- **Not executed against VPS in this run**.

## Rollback Steps (when executed)

1. Stop/remove only staging containers (`gateway-wa`, `evolution-api`, `evo-postgres`, `redis`) in staging project.
2. Restore pre-mutation backup from recorded path.
3. Re-run private smoke checks.
4. Confirm Serena Core/Caddy/DNS remain unchanged.

## Explicit Non-Actions

- No Caddy changes.
- No DNS changes.
- No public admin route.
- No WhatsApp pairing.
- No real message sends.
- No secret material committed.
- No Docker volume deletion.
