/**
 * T20 — Simulation endpoint HTTP handler.
 *
 * Handles POST /dev/simulate/inbound-message:
 *   1. Validates method (POST only)
 *   2. Parses and validates JSON body against InboundMessageCommand
 *   3. Calls ProcessChannelInboundMessage.execute
 *   4. Returns ChannelInboundResult as JSON
 *
 * Dev-only — no token guard, no external services.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import type { InboundChannel, InboundMessageCommand } from "../modules/inbound-gate/domain/inbound-message-command.ts";
import type { PipelineRequestHandler } from "./server.ts";
import type { ProcessChannelInboundMessage } from "../modules/inbound-gate/application/use-cases/process-channel-inbound-message.ts";

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

function validateCommand(body: unknown):
  | { valid: true; command: InboundMessageCommand }
  | { valid: false; errors: FieldError[] } {
  const errors: FieldError[] = [];

  if (body === null || body === undefined || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, errors: [{ field: "body", message: "Request body must be a JSON object" }] };
  }

  const obj = body as Record<string, unknown>;

  // channel — required, must be one of the six valid values
  const channel = obj.channel;
  if (typeof channel !== "string" || !(VALID_CHANNELS as readonly string[]).includes(channel)) {
    errors.push({
      field: "channel",
      message: `Must be one of: ${VALID_CHANNELS.join(", ")}`,
    });
  }

  // externalSenderId — required, non-empty string
  const externalSenderId = obj.externalSenderId;
  if (typeof externalSenderId !== "string" || externalSenderId.trim().length === 0) {
    errors.push({ field: "externalSenderId", message: "Required non-empty string" });
  }

  // text — required, non-empty string
  const text = obj.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    errors.push({ field: "text", message: "Required non-empty string" });
  }

  // Optional fields: validate if present
  const tenantId = obj.tenantId;
  if (tenantId !== undefined && (typeof tenantId !== "string" || tenantId.trim().length === 0)) {
    errors.push({ field: "tenantId", message: "Must be a non-empty string" });
  }

  const personId = obj.personId;
  if (personId !== undefined && (typeof personId !== "string" || personId.trim().length === 0)) {
    errors.push({ field: "personId", message: "Must be a non-empty string" });
  }

  const conversationId = obj.conversationId;
  if (conversationId !== undefined && (typeof conversationId !== "string" || conversationId.trim().length === 0)) {
    errors.push({ field: "conversationId", message: "Must be a non-empty string" });
  }

  const occurredAt = obj.occurredAt;
  if (occurredAt !== undefined) {
    if (typeof occurredAt !== "string") {
      errors.push({ field: "occurredAt", message: "Must be a valid ISO 8601 string" });
    } else {
      const parsed = new Date(occurredAt);
      if (Number.isNaN(parsed.getTime())) {
        errors.push({ field: "occurredAt", message: "Must be a valid ISO 8601 string" });
      }
    }
  }

  const metadata = obj.metadata;
  if (metadata !== undefined && (typeof metadata !== "object" || metadata === null || Array.isArray(metadata))) {
    errors.push({ field: "metadata", message: "Must be a JSON object" });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const command: InboundMessageCommand = {
    channel: channel as InboundChannel,
    externalSenderId: (externalSenderId as string).trim(),
    text: (text as string).trim(),
  };

  if (typeof tenantId === "string" && tenantId.trim().length > 0) {
    command.tenantId = tenantId.trim();
  }
  if (typeof personId === "string" && personId.trim().length > 0) {
    command.personId = personId.trim();
  }
  if (typeof conversationId === "string" && conversationId.trim().length > 0) {
    command.conversationId = conversationId.trim();
  }
  if (typeof occurredAt === "string") {
    command.occurredAt = occurredAt;
  }
  if (typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)) {
    command.metadata = metadata as Record<string, unknown>;
  }

  return { valid: true, command };
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export function createSimulationHandler(
  processChannelInboundMessage: ProcessChannelInboundMessage,
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
    const validation = validateCommand(parsed);
    if (!validation.valid) {
      sendJson(res, 400, {
        error: "invalid_payload",
        detail: "One or more fields are invalid or missing",
        fields: validation.errors.map((e) => ({ field: e.field, message: e.message })),
      });
      return;
    }

    // Execute pipeline
    try {
      const result = await processChannelInboundMessage.execute(validation.command);
      sendJson(res, 200, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal_pipeline_error";
      sendJson(res, 500, { error: "pipeline_execution_failed", detail: message });
    }
  };
}
