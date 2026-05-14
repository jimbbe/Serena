# Proposal: T38 — VPS Core Update and Gateway Network

## Intent

Bring Serena Core on the VPS up to the approved source level required by the internal WhatsApp webhook contract, without deploying `gateway-wa` or changing edge/public infrastructure.

## Scope

### In Scope
- Update `/docker/serena` from `main` or an approved source copy, preserving `.env` and Docker volumes.
- Configure `SERENA_INTERNAL_TOKEN` only on the VPS runtime and keep it out of Git/logs.
- Verify `GET /health` and authenticated `POST /internal/webhook/whatsapp` after the core-only refresh.
- Update `infra/vps/gateway-wa-staging/docker-compose.yml` so future `gateway-wa` can join external `serena-internal`.

### Out of Scope
- Deploy `gateway-wa`, start Evolution API, pair WhatsApp, open ports, or modify Caddy.
- Change Hermes, `necrologia-bot`, unrelated services, volumes, or commit secrets.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `internal-auth`: runtime deployment guidance must require `SERENA_INTERNAL_TOKEN` only in VPS env/config and never in repository artifacts.
- `whatsapp-inbound-webhook`: acceptance must include post-refresh verification that authenticated webhook requests succeed on the updated core runtime.

## Approach

Use a repo-backed runbook, not live infra mutation from this phase. The change will document the safe source-replacement path for `/docker/serena`, require the token in VPS compose/runtime, and prepare gateway staging network attachment so a later approved task can consume `http://serena-core:3000/internal/webhook/whatsapp` privately.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `infra/vps/docker-compose.yml` | Modified | Require/pass `SERENA_INTERNAL_TOKEN` for `serena-core`. |
| `infra/vps/gateway-wa-staging/docker-compose.yml` | Modified | Attach `gateway-wa` to external `serena-internal`. |
| `docs/ops/t38-vps-core-update-runbook.md` | New | Safe update, verify, rollback sequence. |
| `docs/ops/t37-gateway-wa-staging-runbook.md` | Modified | Gate staging deploy on T38 preconditions. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Overwriting VPS runtime material | Med | Explicitly preserve `.env`; do not touch volumes. |
| Missing token after refresh | Med | Make token setup and verification mandatory in runbook. |
| Scope drift into gateway rollout | Med | Freeze gateway/Evolution/Caddy actions as out of scope. |

## Rollback Plan

Revert `/docker/serena` to the prior approved source copy, restore prior compose/runbook files, keep the existing `.env` and volumes unchanged, rebuild only `serena-core`, and re-run `/health` verification.

## Dependencies

- Approved source snapshot for `serena-core`.
- Operator access to update `/docker/serena` on the VPS.

## Success Criteria

- [ ] Proposal keeps T38 limited to core refresh readiness plus gateway network preparation.
- [ ] Token management is VPS-only and secrets never enter Git.
- [ ] Verification covers `GET /health` and authenticated `POST /internal/webhook/whatsapp`.
- [ ] Gateway/Evolution deploy work is clearly deferred to a later task.
