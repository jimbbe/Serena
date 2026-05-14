import { readFileSync } from "node:fs";

export type RoutingTableRoute = {
  instanceId: string;
  consumerId: string;
  internalWebhookUrl: string;
  authHeader: string;
  authValue: string;
};

export type RoutingTable = {
  findRoute(instanceId: string): RoutingTableRoute | null;
};

type RawRoute = {
  instanceId?: unknown;
  consumerId?: unknown;
  internalWebhookUrl?: unknown;
  auth?: { header?: unknown; env?: unknown };
};

export function loadRoutingTable(input: {
  routingTablePath: string | undefined;
  routingTableJson: string | undefined;
}): RoutingTable {
  const source = input.routingTableJson
    ? input.routingTableJson
    : input.routingTablePath
      ? readFileSync(input.routingTablePath, "utf-8")
      : "{\"routes\":[]}";

  const parsed = JSON.parse(source) as { routes?: unknown };
  if (!Array.isArray(parsed.routes)) {
    throw new Error("Invalid routing table: routes must be an array.");
  }

  const routes = parsed.routes.map(validateAndResolveRoute);
  const byInstance = new Map<string, RoutingTableRoute>();
  for (const route of routes) {
    byInstance.set(route.instanceId, route);
  }

  return {
    findRoute(instanceId: string): RoutingTableRoute | null {
      return byInstance.get(instanceId) ?? null;
    },
  };
}

function validateAndResolveRoute(raw: unknown): RoutingTableRoute {
  const route = raw as RawRoute;
  const instanceId = asNonEmptyString(route.instanceId, "instanceId");
  const consumerId = asNonEmptyString(route.consumerId, "consumerId");
  const internalWebhookUrl = asNonEmptyString(
    route.internalWebhookUrl,
    "internalWebhookUrl",
  );
  const authHeader = asNonEmptyString(route.auth?.header, "auth.header");
  const authEnv = asNonEmptyString(route.auth?.env, "auth.env");

  const authValue = (process.env[authEnv] ?? "").trim();
  if (!authValue) {
    throw new Error(`Missing env var for routing auth: ${authEnv}`);
  }

  return {
    instanceId,
    consumerId,
    internalWebhookUrl,
    authHeader,
    authValue,
  };
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid routing table route field: ${field}`);
  }
  return value.trim();
}
