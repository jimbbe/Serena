# Tests

Cross-module and acceptance tests can live here when they exist.

Module-local tests stay near the module when that is clearer.

## Current test coverage

- **36 tests passing** across two modules:
  - `inbound-gate`: evaluate-inbound-message (9 tests) + process-inbound-message (8 tests) — message classification, policy evaluation, routing to LLM profiles, decision audit.
  - `mediation-bridge`: mediation-bridge-session (19 tests) — session lifecycle, turns, outbound drafts, Serena introduction, participant ordering, close reasons.

Run all tests from repo root:

```sh
npm run test
```

No acceptance or cross-module integration tests exist yet (pending T16).
