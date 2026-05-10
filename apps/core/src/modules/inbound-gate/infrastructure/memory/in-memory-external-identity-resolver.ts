/**
 * T30 — In-memory implementation of ExternalIdentityResolver.
 *
 * Uses a Map keyed by "tenantId:channel:externalSenderId" to resolve
 * external sender identifiers into internal domain identity.  Includes
 * default demo data for Marta (elder_001) on three channels and a
 * blocked sender entry for testing.
 *
 * Constructor accepts an optional Record of additional seed entries
 * that extend or override the defaults.
 */

import type { ExternalIdentityResolver } from "../../application/ports/external-identity-resolver.ts";
import type { ResolvedInboundActor } from "../../../channel-inbound/application/results/resolved-inbound-actor.ts";
import type { InboundMessageCommand } from "../../domain/inbound-message-command.ts";
import type { ChannelBinding } from "../../../shared/channel.ts";

// ---------------------------------------------------------------------------
// Default demo data
// ---------------------------------------------------------------------------

const DEMO_BINDINGS: ChannelBinding[] = [
  {
    channel: "whatsapp",
    externalId: "+5492600000000",
    ownerPersonId: "marta",
    role: "elder",
    displayName: "Marta",
    authorized: true,
    bindingKind: "whatsapp_sender",
  },
  {
    channel: "voice",
    externalId: "serena_device_001",
    ownerPersonId: "marta",
    role: "elder",
    displayName: "Marta",
    authorized: true,
    bindingKind: "local_device",
  },
  {
    channel: "web_chat",
    externalId: "session_abc",
    ownerPersonId: "marta",
    role: "elder",
    displayName: "Marta",
    authorized: true,
    bindingKind: "web_session",
  },
];

const DEFAULT_BLOCKED: Record<string, ResolvedInboundActor> = {
  // Blocked sender (testing)
  "demo:whatsapp:+5499999999999": {
    status: "blocked",
    tenantId: "demo",
    channel: "whatsapp",
    externalSenderId: "+5499999999999",
    authorized: false,
    reason: "sender_blocked",
  },
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class InMemoryExternalIdentityResolver implements ExternalIdentityResolver {
  private readonly registry: Map<string, ResolvedInboundActor>;

  constructor(input?: Record<string, ResolvedInboundActor> | { bindings?: ChannelBinding[]; overrides?: Record<string, ResolvedInboundActor> }) {
    this.registry = new Map();

    for (const [key, entry] of Object.entries(DEFAULT_BLOCKED)) {
      this.registry.set(key, entry);
    }

    const bindings = Array.isArray((input as { bindings?: ChannelBinding[] } | undefined)?.bindings)
      ? (input as { bindings?: ChannelBinding[] }).bindings ?? []
      : DEMO_BINDINGS;

    for (const binding of bindings) {
      const key = `demo:${binding.channel}:${binding.externalId}`;
      this.registry.set(key, {
        status: "resolved",
        tenantId: "demo",
        channel: binding.channel,
        externalSenderId: binding.externalId,
        personId: binding.ownerPersonId,
        actorId: binding.ownerPersonId,
        role: binding.role,
        displayName: binding.displayName,
        authorized: binding.authorized,
      });
    }

    const overrides = isLegacyOverrides(input)
      ? input
      : ((input as { overrides?: Record<string, ResolvedInboundActor> } | undefined)?.overrides ?? {});
    for (const [key, entry] of Object.entries(overrides)) {
        this.registry.set(key, entry);
    }
  }

  async resolve(cmd: InboundMessageCommand): Promise<ResolvedInboundActor> {
    try {
      const tenantId = cmd.tenantId ?? "demo";
      const key = `${tenantId}:${cmd.channel}:${cmd.externalSenderId}`;
      const entry = this.registry.get(key);

      if (entry) {
        return entry;
      }

      // Unknown sender — sentinel value
      return {
        status: "unknown",
        tenantId,
        channel: cmd.channel,
        externalSenderId: cmd.externalSenderId,
        authorized: false,
        reason: "unknown_sender",
      };
    } catch (_err) {
      // Never throw — degrade to unknown with warning
      const tenantId = cmd.tenantId ?? "demo";
      return {
        status: "unknown",
        tenantId,
        channel: cmd.channel,
        externalSenderId: cmd.externalSenderId,
        authorized: false,
        reason: "resolution_error",
      };
    }
  }
}

function isLegacyOverrides(
  input: Record<string, ResolvedInboundActor> | { bindings?: ChannelBinding[]; overrides?: Record<string, ResolvedInboundActor> } | undefined,
): input is Record<string, ResolvedInboundActor> {
  return input !== undefined && !("bindings" in input) && !("overrides" in input);
}
