# AGENTS.md — Serena

Este archivo agrega reglas locales para Serena. No reemplaza el contrato del directorio padre.

## Lectura Inicial

Antes de modificar el proyecto, leer:

- `README.md`
- `docs/project-status.md`
- `docs/open-questions.md`
- el `AGENTS.md` del directorio padre si esta disponible

## Contexto Del Proyecto

Serena acompana conversacionalmente a una persona mayor.

La Fase 1 apunta a mediacion prudente por WhatsApp: Serena puede recibir un pedido, decidir si corresponde enviar un recado a un contacto permitido, redactar con prudencia, esperar respuesta y devolver una sintesis o una cita literal si hay ambiguedad.

## Reglas Locales

- No implementar logica de negocio sin tarea especifica.
- No integrar WhatsApp sin tarea especifica.
- No conectar PostgreSQL real sin tarea especifica.
- No desplegar infraestructura desde tareas de bootstrap.
- No hardcodear secretos.
- Documentar preguntas abiertas en `docs/open-questions.md`.
- Mantener modulos separados y limites claros.

## Protocolo PR-only

- Toda tarea con cambios mergeables debe terminar en Pull Request.
- No se mergea directo a `main`.
- Aplica a codigo, documentacion, configuracion, contratos operativos y scripts de build/test.
- El PR debe ser revisado y aprobado por Marco antes del merge.
- Recien despues de esa aprobacion se puede mergear.
- Despues del merge, borrar la rama de trabajo si corresponde.

## Stack Base

- Node.js + TypeScript para producto, APIs, tooling web e integraciones donde convenga el ecosistema web.
- Go para servicios pequenos, workers, gateways/adapters o responsabilidades acotadas cuando este justificado.
- PostgreSQL previsto como base de datos.
- Docker / Docker Compose previsto para entorno local e infraestructura.

## Validacion

Para el bootstrap actual, usar:

```sh
npm run check
```

## Reporte Final Obligatorio

En toda entrega de resultado de tareas, incluir siempre:

- tipo de tarea y clasificacion
- archivos inspeccionados
- archivos tocados
- comandos ejecutados
- resultado de validacion
- riesgos / pendientes
- proximo paso recomendado
