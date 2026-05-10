/**
 * T13 — Message sending endpoint handler.
 *
 * HTTP handler for POST /send. Validates body, delegates to MessageSender,
 * and returns the appropriate HTTP response.
 */

import type { IncomingMessage } from "node:http";
import type { RequestContext, HandlerResult } from "../server.ts";
import { MessageSender } from "./sender.ts";

/**
 * Handle POST /send.
 *
 * Expects body: { instanceId, to, text }
 */
export async function sendMessageHandler(
  ctx: RequestContext,
  sender: MessageSender,
): Promise<HandlerResult> {
  const body = ctx.body as Record<string, unknown> | undefined;
  const instanceId = typeof body?.["instanceId"] === "string" ? body["instanceId"] : "";
  const to = typeof body?.["to"] === "string" ? body["to"] : "";
  const text = typeof body?.["text"] === "string" ? body["text"] : "";

  const result = await sender.sendText(instanceId, to, text);

  if (!result.ok) {
    return {
      status: result.status,
      body: {
        error: result.error,
        ...(result.fields ? { fields: result.fields } : {}),
        ...(result.name ? { name: result.name } : {}),
        ...(result.message ? { message: result.message } : {}),
      },
    };
  }

  return {
    status: 200,
    body: {
      messageId: result.value.messageId,
      status: result.value.status,
      timestamp: result.value.timestamp,
    },
  };
}
