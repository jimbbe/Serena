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

- What deployment target and rollback process will be used after local development works?

## Resolved In T02

- Local default ports: `CORE_PORT=3000` maps to the core container port `3000`; `POSTGRES_PORT=5432` maps to the PostgreSQL container port `5432`.
- Baseline environment variable names: `APP_ENV`, `NODE_ENV`, `CORE_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`, `DATABASE_URL`, `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`.
