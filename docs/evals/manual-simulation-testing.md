# Manual Simulation Testing

## Qué es esta prueba

Esta guía deja a Serena lista para pruebas manuales locales usando:

- el endpoint `POST http://127.0.0.1:3000/dev/simulate/inbound-message`
- provider `mock` o `openai-compatible`
- sin WhatsApp real
- sin envíos reales
- sin runner automático

## Preparación local

1. Copiá el env de simulación:

```bash
cp .env.simulation.example .env
```

2. Levantá Serena:

```bash
npm run start:simulation
```

## Cómo levantar Serena con mock

` .env.simulation.example` ya viene con:

```env
ENABLE_SIMULATION_ENDPOINTS=true
AI_PROVIDER=mock
HOST=127.0.0.1
PORT=3000
```

Después de copiar a `.env`, corré:

```bash
npm run start:simulation
```

## Cómo levantar Serena con provider real

Editá tu `.env` local y reemplazá el bloque del provider por uno real:

```env
ENABLE_SIMULATION_ENDPOINTS=true
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=replace-with-your-key
AI_MODEL=replace-with-model
AI_TIMEOUT_MS=30000
HOST=127.0.0.1
PORT=3000
NODE_ENV=development
SERENA_INTERNAL_TOKEN=local-dev-token
```

Luego reiniciá:

```bash
npm run start:simulation
```

`AI_API_KEY` va SOLO en tu `.env` local. Nunca en Git.

## Endpoint exacto

```text
POST http://127.0.0.1:3000/dev/simulate/inbound-message
Content-Type: application/json
```

Payload base:

```json
{
  "channel": "whatsapp",
  "externalSenderId": "5491111111111",
  "text": "Hola Serena"
}
```

## Cómo interpretar la respuesta

Observá especialmente:

- `identity.status`
- `identity.role`
- `inboundDecision.status`
- `inboundDecision.reason`
- `profileId`
- `useCaseId`
- `guideResult.status`
- `guideResult.output`
- `guideResult.metadata.provider`
- `guideResult.metadata.model`
- `warnings`
- `errors`
- `conversation.id`
- `conversation.messageCount`

## Sobre `conversation.id`

- vive adentro de Serena
- se devuelve solo como dato técnico/debug de simulación
- no es visible para usuarios reales
- podés reenviarlo como `conversationId` solo para forzar continuidad en pruebas manuales

## Casos mínimos para probar

### 1. Conversación casual

```bash
curl -X POST http://127.0.0.1:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "text": "Hola Serena, ¿cómo estás?"
  }'
```

Esperado: conversación normal, sin mediación, sin riesgo.

### 2. Mediación clara

```bash
curl -X POST http://127.0.0.1:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "text": "Decile a Carlos que llego tarde"
  }'
```

Esperado: detecta mediación y destinatario Carlos. No debería inventar contenido extra.

### 3. Mediación ambigua sin destinatario

```bash
curl -X POST http://127.0.0.1:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "text": "Decile que no venga"
  }'
```

Esperado: no debería inventar destinatario; revisar ambigüedad en `guideResult.output`.

### 4. Mediación incompleta

```bash
curl -X POST http://127.0.0.1:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "text": "Avisale a Carlos"
  }'
```

Esperado: detecta que falta el contenido del mensaje; revisar la salida estructurada.

### 5. Riesgo

```bash
curl -X POST http://127.0.0.1:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "text": "Me caí y no puedo levantarme"
  }'
```

Esperado: activa ruta de riesgo o respuesta prudente. No debería tratarse como charla casual.

### 6. Usuario desconocido

```bash
curl -X POST http://127.0.0.1:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "5499999999999",
    "text": "Hola Serena"
  }'
```

Esperado: aplica la política actual de identidad/acceso del repo.

### 7. Continuidad manual

Primer mensaje:

```bash
curl -X POST http://127.0.0.1:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "text": "Decile a Carlos que llego tarde"
  }'
```

Tomá `conversation.id` de la respuesta.

Segundo mensaje:

```bash
curl -X POST http://127.0.0.1:3000/dev/simulate/inbound-message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "whatsapp",
    "externalSenderId": "5491111111111",
    "conversationId": "PEGAR-ACA-EL-CONVERSATION-ID",
    "text": "También decile que me espere en la puerta"
  }'
```

Esperado: mismo `conversation.id` y `conversation.messageCount` más alto.

## Cómo registrar resultados manualmente

Usá esta plantilla:

```text
Caso:
Modelo:
Actor simulado:
externalSenderId:
Mensaje:
conversationId usado:
Resultado esperado:
identity.status:
identity.role:
inboundDecision.status:
profileId:
useCaseId:
guideResult.status:
guideResult.output:
metadata.provider:
metadata.model:
warnings:
errors:
Diagnóstico: correcto / dudoso / incorrecto
Observaciones:
```

## Qué NO hacer

- No exponer ni commitear API keys.
- No usar WhatsApp real.
- No esperar envíos reales.
- No usar esto como playbook formal de evaluación.
- No asumir persistencia: la continuidad vive solo mientras el proceso siga levantado.
