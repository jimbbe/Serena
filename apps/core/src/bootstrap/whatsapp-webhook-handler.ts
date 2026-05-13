import type { IncomingMessage, ServerResponse } from "node:http";

import type { InboundMessageCommand } from "../modules/inbound-gate/domain/inbound-message-command.ts";
import type { ProcessChannelInboundMessage } from "../modules/channel-inbound/application/use-cases/process-channel-inbound-message.ts";

type ValidationError = {
  field: string;
  message: string;
};

type WhatsAppWebhookPayload = {
  channel?: "whatsapp";
  provider?: string;
  instanceId: string;
  messageId: string;
  senderWhatsAppId: string;
  senderName?: string;
  text: string;
  receivedAt: string;
  raw?: Record<string, unknown>;
};

function sendJson(response: ServerResponse, statusCode: number, body: object): void {
  const payload = JSON.stringify(body);

  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload).toString(),
  });
  response.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidIso8601UtcTimestamp(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  if (!isoPattern.test(trimmed)) return false;

  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) return false;

  const expected = trimmed.includes(".")
    ? trimmed
    : trimmed.replace("Z", ".000Z");

  return parsed.toISOString() === expected;
}

function validatePayload(body: unknown):
  | { valid: true; payload: WhatsAppWebhookPayload }
  | { valid: false; errors: ValidationError[] } {
  if (!isPlainJsonObject(body)) {
    return { valid: false, errors: [{ field: "body", message: "Request body must be a JSON object" }] };
  }

  const errors: ValidationError[] = [];

  const channel = body.channel;
  if (channel !== undefined && channel !== "whatsapp") {
    errors.push({ field: "channel", message: "If present, channel must be 'whatsapp'" });
  }

  const provider = body.provider;
  if (provider !== undefined && (typeof provider !== "string" || provider.trim().length === 0)) {
    errors.push({ field: "provider", message: "If present, provider must be a non-empty string" });
  }

  const instanceId = body.instanceId;
  if (typeof instanceId !== "string" || instanceId.trim().length === 0) {
    errors.push({ field: "instanceId", message: "Required non-empty string" });
  }

  const messageId = body.messageId;
  if (typeof messageId !== "string" || messageId.trim().length === 0) {
    errors.push({ field: "messageId", message: "Required non-empty string" });
  }

  const senderWhatsAppId = body.senderWhatsAppId;
  if (typeof senderWhatsAppId !== "string" || senderWhatsAppId.trim().length === 0) {
    errors.push({ field: "senderWhatsAppId", message: "Required non-empty string" });
  }

  const senderName = body.senderName;
  if (senderName !== undefined && (typeof senderName !== "string" || senderName.trim().length === 0)) {
    errors.push({ field: "senderName", message: "If present, senderName must be a non-empty string" });
  }

  const text = body.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    errors.push({ field: "text", message: "Required non-empty string" });
  }

  const receivedAt = body.receivedAt;
  if (typeof receivedAt !== "string" || !isValidIso8601UtcTimestamp(receivedAt)) {
    errors.push({ field: "receivedAt", message: "Must be a valid ISO 8601 UTC timestamp" });
  }

  const raw = body.raw;
  if (raw !== undefined && !isPlainJsonObject(raw)) {
    errors.push({ field: "raw", message: "If present, raw must be an object" });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    payload: {
      ...(channel === "whatsapp" ? { channel } : {}),
      ...(typeof provider === "string" ? { provider: provider.trim() } : {}),
      instanceId: (instanceId as string).trim(),
      messageId: (messageId as string).trim(),
      senderWhatsAppId: (senderWhatsAppId as string).trim(),
      ...(typeof senderName === "string" ? { senderName: senderName.trim() } : {}),
      text: (text as string).trim(),
      receivedAt: (receivedAt as string).trim(),
      ...(raw !== undefined ? { raw: raw as Record<string, unknown> } : {}),
    },
  };
}

function toInboundCommand(payload: WhatsAppWebhookPayload): InboundMessageCommand {
  return {
    channel: "whatsapp",
    externalSenderId: payload.senderWhatsAppId,
    text: payload.text,
    occurredAt: payload.receivedAt,
    metadata: {
      ...(payload.provider !== undefined ? { provider: payload.provider } : {}),
      instanceId: payload.instanceId,
      messageId: payload.messageId,
      ...(payload.senderName !== undefined ? { senderName: payload.senderName } : {}),
      ...(payload.raw !== undefined ? { raw: payload.raw } : {}),
    },
  };
}

export function createWhatsAppWebhookHandler(
  processChannelInboundMessage: ProcessChannelInboundMessage,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    let rawBody: string;
    try {
      rawBody = await readBody(req);
    } catch {
      sendJson(res, 400, { error: "failed_to_read_body" });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      sendJson(res, 400, { error: "invalid_json", detail: "Request body is not valid JSON" });
      return;
    }

    const validation = validatePayload(parsed);
    if (!validation.valid) {
      sendJson(res, 400, {
        error: "invalid_payload",
        detail: "One or more fields are invalid or missing",
        fields: validation.errors.map((e) => ({ field: e.field, message: e.message })),
      });
      return;
    }

    const command = toInboundCommand(validation.payload);

    try {
      const result = await processChannelInboundMessage.execute(command);
      sendJson(res, 200, {
        received: true,
        routedTo: "serena-core",
        result,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "internal_webhook_error";
      sendJson(res, 500, { error: "webhook_processing_failed", detail });
    }
  };
}
