/**
 * TXX — Scenario simulation endpoint HTTP handler.
 *
 * Handles POST /dev/simulate/scenario:
 *   1. Validates method (POST only)
 *   2. Parses and validates JSON body against ScenarioRequest
 *   3. Calls SimulationScenarioRunner.execute
 *   4. Returns ScenarioResult as JSON
 *
 * Dev-only — no token guard, no external services.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import type { InboundChannel } from "../modules/inbound-gate/domain/inbound-message-command.ts";
import type { PipelineRequestHandler } from "./server.ts";
import type {
  ScenarioStepInput,
  ScenarioRequest,
} from "./scenario-runner.ts";
import type { SimulationScenarioRunner } from "./scenario-runner.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(res: ServerResponse, statusCode: number, body: object): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload).toString(),
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_CHANNELS: readonly InboundChannel[] = [
  "whatsapp",
  "voice",
  "web_chat",
  "telegram",
  "system",
  "simulation",
];

type FieldError = { field: string; message: string };

function isValidChannel(value: unknown): value is InboundChannel {
  return typeof value === "string" && (VALID_CHANNELS as readonly string[]).includes(value);
}

/**
 * Validates a scenario request payload.
 *
 * Checks:
 *   - scenarioId: required, non-empty string
 *   - tenantId: required, non-empty string
 *   - channel: required, must be one of the valid InboundChannel values
 *   - externalSenderId: required at scenario level, non-empty string
 *   - steps: required, non-empty array
 *   - steps[].text: required per step, non-empty string
 *   - Steps with overrides: channel must be valid, externalSenderId non-empty
 *   - stopOnError: if present, must be boolean
 *   - metadata: if present at scenario level, must be object
 *   - conversationId: if present, must be non-empty string
 *
 * Returns the validated ScenarioRequest on success, or field errors on failure.
 */
function validateScenarioRequest(body: unknown):
  | { valid: true; request: ScenarioRequest }
  | { valid: false; errors: FieldError[] } {
  const errors: FieldError[] = [];

  if (body === null || body === undefined || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, errors: [{ field: "body", message: "Request body must be a JSON object" }] };
  }

  const obj = body as Record<string, unknown>;

  // scenarioId — required, non-empty string
  const scenarioId = obj.scenarioId;
  if (typeof scenarioId !== "string" || scenarioId.trim().length === 0) {
    errors.push({ field: "scenarioId", message: "Required non-empty string" });
  }

  // tenantId — required, non-empty string
  const tenantId = obj.tenantId;
  if (typeof tenantId !== "string" || tenantId.trim().length === 0) {
    errors.push({ field: "tenantId", message: "Required non-empty string" });
  }

  // channel — required, must be valid
  const channel = obj.channel;
  if (!isValidChannel(channel)) {
    errors.push({
      field: "channel",
      message: `Must be one of: ${VALID_CHANNELS.join(", ")}`,
    });
  }

  // externalSenderId — required at scenario level, non-empty string
  const externalSenderId = obj.externalSenderId;
  if (typeof externalSenderId !== "string" || externalSenderId.trim().length === 0) {
    errors.push({ field: "externalSenderId", message: "Required non-empty string" });
  }

  // conversationId — optional, non-empty string if present
  const conversationId = obj.conversationId;
  if (conversationId !== undefined && (typeof conversationId !== "string" || conversationId.trim().length === 0)) {
    errors.push({ field: "conversationId", message: "Must be a non-empty string" });
  }

  // stopOnError — optional boolean
  const stopOnError = obj.stopOnError;
  if (stopOnError !== undefined && typeof stopOnError !== "boolean") {
    errors.push({ field: "stopOnError", message: "Must be a boolean" });
  }

  // metadata — optional object at scenario level
  const metadata = obj.metadata;
  if (metadata !== undefined && (typeof metadata !== "object" || metadata === null || Array.isArray(metadata))) {
    errors.push({ field: "metadata", message: "Must be a JSON object" });
  }

  // steps — required, non-empty array
  const steps = obj.steps;
  if (!Array.isArray(steps)) {
    errors.push({ field: "steps", message: "Required non-empty array" });
  } else if (steps.length === 0) {
    errors.push({ field: "steps", message: "Must contain at least one step" });
  } else {
    // Validate each step
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const prefix = `steps[${i}]`;

      if (step === null || step === undefined || typeof step !== "object" || Array.isArray(step)) {
        errors.push({ field: prefix, message: "Each step must be a JSON object" });
        continue;
      }

      const s = step as Record<string, unknown>;

      // text — required per step, non-empty
      const stepText = s.text;
      if (typeof stepText !== "string" || stepText.trim().length === 0) {
        errors.push({ field: `${prefix}.text`, message: "Required non-empty string" });
      }

      // channel override — optional, must be valid if present
      const stepChannel = s.channel;
      if (stepChannel !== undefined && !isValidChannel(stepChannel)) {
        errors.push({
          field: `${prefix}.channel`,
          message: `Must be one of: ${VALID_CHANNELS.join(", ")}`,
        });
      }

      // externalSenderId override — optional, non-empty if present
      const stepSender = s.externalSenderId;
      if (stepSender !== undefined && (typeof stepSender !== "string" || stepSender.trim().length === 0)) {
        errors.push({ field: `${prefix}.externalSenderId`, message: "Must be a non-empty string" });
      }

      // personId — optional, non-empty if present
      const stepPersonId = s.personId;
      if (stepPersonId !== undefined && (typeof stepPersonId !== "string" || stepPersonId.trim().length === 0)) {
        errors.push({ field: `${prefix}.personId`, message: "Must be a non-empty string" });
      }

      // conversationId override — optional, non-empty if present
      const stepConvId = s.conversationId;
      if (stepConvId !== undefined && (typeof stepConvId !== "string" || stepConvId.trim().length === 0)) {
        errors.push({ field: `${prefix}.conversationId`, message: "Must be a non-empty string" });
      }

      // occurredAt — optional, valid ISO 8601 if present
      const stepOccurredAt = s.occurredAt;
      if (stepOccurredAt !== undefined) {
        if (typeof stepOccurredAt !== "string") {
          errors.push({ field: `${prefix}.occurredAt`, message: "Must be a valid ISO 8601 string" });
        } else {
          const parsed = new Date(stepOccurredAt);
          if (Number.isNaN(parsed.getTime())) {
            errors.push({ field: `${prefix}.occurredAt`, message: "Must be a valid ISO 8601 string" });
          }
        }
      }

      // metadata override — optional object
      const stepMetadata = s.metadata;
      if (stepMetadata !== undefined && (typeof stepMetadata !== "object" || stepMetadata === null || Array.isArray(stepMetadata))) {
        errors.push({ field: `${prefix}.metadata`, message: "Must be a JSON object" });
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build validated request
  const request: ScenarioRequest = {
    scenarioId: (scenarioId as string).trim(),
    tenantId: (tenantId as string).trim(),
    channel: channel as InboundChannel,
    externalSenderId: (externalSenderId as string).trim(),
    steps: (steps as ScenarioStepInput[]),
  };

  if (typeof conversationId === "string" && conversationId.trim().length > 0) {
    request.conversationId = conversationId.trim();
  }
  if (typeof stopOnError === "boolean") {
    request.stopOnError = stopOnError;
  }

  return { valid: true, request };
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export function createScenarioHandler(
  scenarioRunner: SimulationScenarioRunner,
): PipelineRequestHandler {
  return async (req, res) => {
    // Method check — POST only
    if (req.method !== "POST") {
      sendJson(res, 405, {
        error: "method_not_allowed",
        detail: `Method ${req.method} not allowed. Use POST.`,
      });
      return;
    }

    // Read body
    let rawBody: string;
    try {
      rawBody = await readBody(req);
    } catch {
      sendJson(res, 400, { error: "failed_to_read_body" });
      return;
    }

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      sendJson(res, 400, { error: "invalid_json", detail: "Request body is not valid JSON" });
      return;
    }

    // Validate
    const validation = validateScenarioRequest(parsed);
    if (!validation.valid) {
      sendJson(res, 400, {
        error: "invalid_payload",
        detail: "One or more fields are invalid or missing",
        fields: validation.errors.map((e) => ({ field: e.field, message: e.message })),
      });
      return;
    }

    // Execute scenario
    try {
      const result = await scenarioRunner.execute(validation.request);
      sendJson(res, 200, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal_runner_error";
      sendJson(res, 500, { error: "scenario_execution_failed", detail: message });
    }
  };
}
