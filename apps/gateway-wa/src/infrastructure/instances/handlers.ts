/**
 * T11 — Instance management HTTP handlers.
 *
 * Handlers for:
 * - POST /instances     (create instance)
 * - GET /instances      (list instances)
 * - GET /instances/:name/qr (get QR code)
 * - DELETE /instances/:name (delete instance)
 */

import type { IncomingMessage } from "node:http";
import type { RequestContext, HandlerResult } from "../server.ts";
import type { InstanceManager } from "./manager.ts";

// ---------------------------------------------------------------------------
// Name validation
// ---------------------------------------------------------------------------

const VALID_NAME = /^[a-zA-Z0-9-]+$/;

function isValidInstanceName(name: unknown): name is string {
  return typeof name === "string" && name.trim().length > 0 && VALID_NAME.test(name.trim());
}

// ---------------------------------------------------------------------------
// POST /instances
// ---------------------------------------------------------------------------

export async function createInstanceHandler(
  ctx: RequestContext,
  manager: InstanceManager,
  appKey: string,
): Promise<HandlerResult> {
  const body = ctx.body as Record<string, unknown> | undefined;
  const name = body?.["name"];

  if (!isValidInstanceName(name)) {
    return {
      status: 400,
      body: { error: "invalid_instance_name" },
    };
  }

  const trimmedName = name.trim();

  try {
    const state = await manager.createInstance(trimmedName);
    return {
      status: 201,
      body: {
        name: state.name,
        status: state.status,
        qr: state.qr,
        apiKey: appKey,
      },
    };
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 409) {
      return {
        status: 409,
        body: {
          error: "instance_exists",
          name: trimmedName,
        },
      };
    }
    throw err; // rethrow unexpected errors
  }
}

// ---------------------------------------------------------------------------
// GET /instances
// ---------------------------------------------------------------------------

export async function listInstancesHandler(
  _ctx: RequestContext,
  manager: InstanceManager,
): Promise<HandlerResult> {
  const instances = manager.listInstances();
  return {
    status: 200,
    body: instances,
  };
}

// ---------------------------------------------------------------------------
// GET /instances/:name/qr
// ---------------------------------------------------------------------------

export async function getQrCodeHandler(
  _ctx: RequestContext,
  manager: InstanceManager,
  name: string,
): Promise<HandlerResult> {
  const result = manager.getQrCode(name);

  if (!result.found) {
    return {
      status: 404,
      body: {
        error: "instance_not_found",
        name,
      },
    };
  }

  if (result.status === "connected" || result.status === "open") {
    return {
      status: 200,
      body: {
        status: result.status,
        message: "Already connected",
      },
    };
  }

  return {
    status: 200,
    body: {
      qr: result.qr,
      status: result.status,
    },
  };
}

// ---------------------------------------------------------------------------
// DELETE /instances/:name
// ---------------------------------------------------------------------------

export async function deleteInstanceHandler(
  _ctx: RequestContext,
  manager: InstanceManager,
  name: string,
): Promise<HandlerResult> {
  try {
    const result = await manager.deleteInstance(name);
    return {
      status: 200,
      body: {
        name: result.name,
        deleted: true,
      },
    };
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 404) {
      return {
        status: 404,
        body: {
          error: "instance_not_found",
          name,
        },
      };
    }
    throw err;
  }
}
