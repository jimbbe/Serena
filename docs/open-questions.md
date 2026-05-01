# Open Questions

These questions are intentionally left open until a task needs the decision.

## Product And Safety

- How is the allowed contact list defined, stored and reviewed?
- What exact user intents should trigger a mediated WhatsApp message?
- When should Serena summarize a response and when should it quote literally?
- What escalation path exists if a message suggests risk, confusion or urgency?
- What audit trail is required for mediated messages?

## Technical

- Which module should be implemented first: `core`, `gateway-wa` or local infrastructure?
- Which WhatsApp provider or API will be used?
- Where should Go be introduced first, if at all?
- Should each Go service use its own `go.mod`, or should the repo use a Go workspace later?
- Which Node package manager should be standardized if npm stops being enough?
- What migration tool should be used for PostgreSQL?

## Infrastructure

- Preflight for T04: who has SSH access to the VPS and which key should be used?
- Preflight for T04: when will DNS for `serena.goingmerry01.tech` be created and pointed to the VPS?
- Preflight for T04: what exact Docker and Docker Compose versions are installed on the VPS?
- Preflight for T04: confirm the external Docker network `proxy` and the active Caddyfile location on the VPS.

## Prepared In T03

- Deployment target/path: future `serena-core` Compose project on the VPS, attached to external Docker network `proxy`, routed by existing Caddy edge.
- Rollback process: stop the `serena-core` Compose project, revert the Serena Caddy route, reload Caddy, and inspect Caddy/app logs.

## Resolved In T02

- Local default ports: `CORE_PORT=3000` maps to the core container port `3000`; `POSTGRES_PORT=5432` maps to the PostgreSQL container port `5432`.
- Baseline environment variable names: `APP_ENV`, `NODE_ENV`, `CORE_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`, `DATABASE_URL`, `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`.
