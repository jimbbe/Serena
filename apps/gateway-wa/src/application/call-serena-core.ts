/**
 * T18 / T30A — Call Serena Core (HTTP client).
 *
 * Makes an HTTP POST to Serena Core's internal pipeline endpoint.
 * Validates configuration before attempting the HTTP call.
 * Uses Node 22 built-in fetch — zero npm dependencies.
 *
 * Endpoint contract:
 * - POST {coreUrl}/internal/pipeline/process
 * - Headers: Content-Type: application/json, X-Serena-Internal-Token: {token}
 * - Body: { messageId, senderWhatsAppId, messageText, receivedAt }
 *
 * T30A hardening:
 * - Configurable timeout via GATEWAY_CORE_TIMEOUT_MS (default 30s)
 * - Strong response validation: ensures valid JSON, known type, required fields
 */

import type { PipelineResult, PipelineInput } from "../domain/pipeline-result.ts";

export type GatewayConfig = {
  coreUrl: string;
  internalToken: string;
  /** Request timeout in ms. Default 30000 (30s). */
  timeoutMs?: number;
};

// ---------------------------------------------------------------------------
// Known PipelineResult types and their required fields
// ---------------------------------------------------------------------------

const VALID_RESULT_TYPES = [
  "discard",
  "conversation_pending",
  "risk_review_required",
  "mediation_not_understood",
  "recipient_not_found",
  "mediation_started",
  "mediation_reply_recorded",
  "ambiguous_active_session",
] as const;

const REQUIRED_FIELDS_BY_TYPE: Record<string, readonly string[]> = {
  discard: ["reason"],
  conversation_pending: ["senderId"],
  risk_review_required: ["senderId", "matchedSignals"],
  mediation_not_understood: ["senderId"],
  recipient_not_found: ["senderId", "recipientName"],
  mediation_started: [
    "sessionId",
    "requesterId",
    "requesterDisplayName",
    "recipientId",
    "recipientDisplayName",
    "rewordedText",
  ],
  mediation_reply_recorded: [
    "sessionId",
    "fromParticipantId",
    "fromDisplayName",
    "toParticipantId",
    "toDisplayName",
    "rewordedText",
  ],
  ambiguous_active_session: ["senderId", "activeSessionIds"],
};

// ---------------------------------------------------------------------------
// Timeout resolution
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30000;

function resolveTimeout(): number {
  const raw = process.env["GATEWAY_CORE_TIMEOUT_MS"];
  if (raw === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.warn(
      `[gateway-wa] GATEWAY_CORE_TIMEOUT_MS=${raw} is invalid — falling back to default ${DEFAULT_TIMEOUT_MS}ms`
    );
    return DEFAULT_TIMEOUT_MS;
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Response validation helpers
// ---------------------------------------------------------------------------

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is readonly string[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => typeof item === "string");
}

const STRING_FIELDS = new Set([
  "senderId",
  "reason",
  "sessionId",
  "requesterId",
  "requesterDisplayName",
  "recipientId",
  "recipientDisplayName",
  "rewordedText",
  "fromParticipantId",
  "fromDisplayName",
  "toParticipantId",
  "toDisplayName",
  "recipientName",
]);

const STRING_ARRAY_FIELDS = new Set(["matchedSignals", "activeSessionIds"]);

// ---------------------------------------------------------------------------
// Response validation
// ---------------------------------------------------------------------------

/**
 * Validates that a parsed JSON body conforms to a known PipelineResult shape.
 * Returns the validated result or an error message.
 */
function validatePipelineResultShape(
  body: unknown
): { ok: true; result: PipelineResult } | { ok: false; error: string } {
  if (!isObjectRecord(body)) {
    return { ok: false, error: "Response body is not a JSON object" };
  }

  const obj = body as Record<string, unknown>;

  // type field — required, non-empty string, known value
  const resType = obj.type;
  if (typeof resType !== "string" || resType.trim().length === 0) {
    return {
      ok: false,
      error: `Response missing required "type" field. Valid types: ${VALID_RESULT_TYPES.join(", ")}`,
    };
  }

  if (!(VALID_RESULT_TYPES as readonly string[]).includes(resType)) {
    return {
      ok: false,
      error: `Unknown PipelineResult type "${resType}". Valid types: ${VALID_RESULT_TYPES.join(", ")}`,
    };
  }

  // Required fields per type — check presence first
  const requiredFields = REQUIRED_FIELDS_BY_TYPE[resType];
  if (requiredFields) {
    const missing = requiredFields.filter(
      (f) => !(f in obj) || obj[f] === undefined || obj[f] === null
    );
    if (missing.length > 0) {
      return {
        ok: false,
        error: `PipelineResult type "${resType}" missing required field(s): ${missing.join(", ")}`,
      };
    }

    // Type checking for each required field
    for (const field of requiredFields) {
      const val = obj[field];
      if (STRING_FIELDS.has(field)) {
        if (!isNonEmptyString(val)) {
          return {
            ok: false,
            error: `PipelineResult type "${resType}" field "${field}" must be a non-empty string`,
          };
        }
      } else if (STRING_ARRAY_FIELDS.has(field)) {
        if (!isStringArray(val)) {
          return {
            ok: false,
            error: `PipelineResult type "${resType}" field "${field}" must be a string array`,
          };
        }
      }
    }
  }

  return { ok: true, result: obj as unknown as PipelineResult };
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

/**
 * Call Serena Core's internal pipeline endpoint.
 *
 * @param payload - Normalized pipeline input from the mock event
 * @param messageId - Original message ID (sent separately for idempotency)
 * @param config - Gateway configuration (URL, token, optional timeout)
 * @returns The validated PipelineResult from Serena Core
 * @throws On config errors (missing URL/token), network errors, timeout, or invalid responses
 */
export async function callSerenaCore(
  payload: PipelineInput,
  messageId: string,
  config: GatewayConfig,
): Promise<PipelineResult> {
  // Validate configuration BEFORE making any HTTP call
  if (!config.coreUrl || config.coreUrl.trim() === "") {
    throw new Error("SERENA_CORE_URL is not configured. Set the SERENA_CORE_URL environment variable.");
  }

  if (!config.internalToken || config.internalToken.trim() === "") {
    throw new Error("SERENA_INTERNAL_TOKEN is not configured. Set the SERENA_INTERNAL_TOKEN environment variable.");
  }

  const timeoutMs = config.timeoutMs ?? resolveTimeout();
  const url = `${config.coreUrl}/internal/pipeline/process`;

  const body = {
    messageId,
    senderWhatsAppId: payload.senderWhatsAppId,
    messageText: payload.messageText,
    receivedAt: payload.receivedAt,
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Serena-Internal-Token": config.internalToken,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Timeout / AbortError
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(`Request to Serena Core timed out after ${timeoutMs}ms`);
    }
    throw new Error(
      `Network error calling Serena Core at ${config.coreUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    let responseBody = "";
    try {
      responseBody = await response.text();
    } catch {
      // Ignore body read errors
    }
    throw new Error(
      `Serena Core returned HTTP ${response.status}${responseBody ? `: ${responseBody}` : ""}`,
    );
  }

  // Parse and validate JSON response structure
  let data: unknown;
  const rawText = await response.text();
  try {
    data = JSON.parse(rawText);
  } catch {
    const snippet = rawText.length > 500 ? rawText.slice(0, 500) : rawText;
    // Redact SERENA_INTERNAL_TOKEN from the snippet
    const token = config.internalToken;
    const safeSnippet = token && token.length > 0
      ? snippet.split(token).join("[REDACTED]")
      : snippet;
    throw new Error(`Serena Core response was not valid JSON: ${safeSnippet}`);
  }

  // Validate PipelineResult structure
  const validation = validatePipelineResultShape(data);
  if (!validation.ok) {
    throw new Error(`Invalid PipelineResult from Serena Core: ${validation.error}`);
  }

  return validation.result;
}
