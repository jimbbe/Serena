# Gateway Private Staging Ops Specification

## Purpose

Define T41 readiness for a private VPS staging topology where Evolution API runs as its own non-public service and validation stays repo-only/non-destructive.

## Requirements

### Requirement: Private Evolution Staging Topology

T41 MUST prepare templates/runbooks for Evolution API as its own VPS Docker container on private Docker networks. It MUST NOT publish Evolution admin, gateway admin, host ports, or Caddy routes in this phase.

#### Scenario: Evolution API is its own private container

- GIVEN the T41 staging template is reviewed
- WHEN Evolution services are inspected
- THEN `evolution-api` is represented as a separate container
- AND Evolution dependencies are private
- AND no public admin route or host port is required

#### Scenario: No real live operation is performed

- GIVEN T41 artifacts are applied to the repo
- WHEN the task completes
- THEN no VPS deploy, WhatsApp pairing, or real send has occurred

### Requirement: Non-Destructive Readiness Validation

T41 MUST define validation through repository checks and smoke/runbook steps that do not pair numbers, send messages, mutate production Core, expose admin, or delete volumes/secrets.

#### Scenario: Repo and smoke validation are safe

- GIVEN an operator validates T41 readiness
- WHEN repo checks and the smoke/runbook are followed
- THEN validation confirms configuration shape and private reachability assumptions
- AND it does not require real pairing, sending, public exposure, or destructive cleanup
