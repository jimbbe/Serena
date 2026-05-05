# Spec: T31A — Manual Simulation Readiness

## Required

- There MUST be instrucciones manuales para probar la Simulation API con `mock` o con un provider `openai-compatible` real.
- There MUST be un env example seguro con placeholders solamente.
- There MUST be ejemplos `curl` listos para copiar para conversación, mediación, ambigüedad, riesgo, usuario desconocido y continuidad técnica vía `conversationId`.
- The docs MUST explain which response fields inspect manual behavior and that `conversationId` is debug-only for simulation.

## Explicitly Out of Scope

- No runner automático.
- No consola manual.
- No WhatsApp real.
- No Evolution API.
- No PostgreSQL.
- No cambios de prompts ni policies.
