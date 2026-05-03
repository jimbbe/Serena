/**
 * T16 / T17B — Internal pipeline HTTP handler.
 *
 * Handles POST /internal/pipeline/process:
 *   1. Reads JSON body
 *   2. Validates minimum fields (including messageId for idempotency)
 *   3. Checks idempotency cache (ProcessedMessageStore)
 *   4. Converts to PipelineInput
 *   5. Calls ProcessIncomingWhatsAppMessage
 *   6. Returns PipelineResult as JSON
 *
 * No external infrastructure. All in-memory.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProcessIncomingWhatsAppMessage } from "../modules/orchestrator/application/use-cases/process-incoming-whatsapp-message.ts";
import type { PipelineInput, PipelineResult } from "../modules/orchestrator/domain/pipeline-result.ts";
import type { ProcessedMessageStore } from "../modules/internal-pipeline/domain/processed-message-store.ts";

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

type ValidationError = {
  field: string;
  message: string;
};

function validatePipelineInput(body: unknown): { valid: true; input: PipelineInput } | { valid: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (body === null || body === undefined || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, errors: [{ field: "body", message: "Request body must be a JSON object" }] };
  }

  const obj = body as Record<string, unknown>;

  // messageId — required, non-empty string (idempotency key)
  const messageId = obj.messageId;
  if (typeof messageId !== "string" || messageId.trim().length === 0) {
    errors.push({ field: "messageId", message: "Required non-empty string" });
  }

  // senderWhatsAppId — required, non-empty string
  const senderWhatsAppId = obj.senderWhatsAppId;
  if (typeof senderWhatsAppId !== "string" || senderWhatsAppId.trim().length === 0) {
    errors.push({ field: "senderWhatsAppId", message: "Required non-empty string" });
  }

  // messageText — required, non-empty string
  // Also accept "text" as alias for convenience
  let messageText = obj.messageText as string | undefined;
  if (messageText === undefined && typeof obj.text === "string") {
    messageText = obj.text;
  }
  if (typeof messageText !== "string" || messageText.trim().length === 0) {
    errors.push({ field: "messageText", message: "Required non-empty string" });
  }

  // receivedAt — optional ISO string, defaults to now
  let receivedAt: string;
  if (obj.receivedAt !== undefined) {
    if (typeof obj.receivedAt !== "string") {
      errors.push({ field: "receivedAt", message: "Must be an ISO 8601 string" });
    } else {
      receivedAt = obj.receivedAt;
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    input: {
      senderWhatsAppId: (senderWhatsAppId as string).trim(),
      messageText: (messageText as string).trim(),
      receivedAt: receivedAt! ?? new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export function createPipelineHandler(
  orchestrator: ProcessIncomingWhatsAppMessage,
  processedMessageStore?: ProcessedMessageStore,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
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
    const validation = validatePipelineInput(parsed);
    if (!validation.valid) {
      sendJson(res, 400, {
        error: "invalid_payload",
        detail: "One or more fields are invalid or missing",
        fields: validation.errors.map((e) => ({ field: e.field, message: e.message })),
      });
      return;
    }

    // Extract messageId for idempotency check
    const body = parsed as Record<string, unknown>;
    const messageId = (body.messageId as string).trim();

    // Idempotency check — return cached result if already processed
    if (processedMessageStore?.has(messageId)) {
      const cachedResult = processedMessageStore.get(messageId)!;
      sendJson(res, 200, { ...cachedResult, duplicate: true });
      return;
    }

    // Execute pipeline
    let result: PipelineResult;
    try {
      result = await orchestrator.execute(validation.input);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal_pipeline_error";
      sendJson(res, 500, { error: "pipeline_execution_failed", detail: message });
      return;
    }

    // Cache result for future idempotency
    processedMessageStore?.save(messageId, result);

    // Return result
    sendJson(res, 200, result);
  };
}
