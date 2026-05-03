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
import type { ResolvedInboundActor } from "../../application/results/resolved-inbound-actor.ts";
import type { InboundMessageCommand } from "../../domain/inbound-message-command.ts";

// ---------------------------------------------------------------------------
// Default demo data
// ---------------------------------------------------------------------------

const DEMO_DATA: Record<string, ResolvedInboundActor> = {
  // Marta (elder) on WhatsApp
  "demo:whatsapp:+5492600000000": {
    status: "resolved",
    tenantId: "demo",
    channel: "whatsapp",
    externalSenderId: "+5492600000000",
    personId: "elder_001",
    actorId: "elder_001",
    role: "elder",
    displayName: "Marta",
    authorized: true,
  },
  // Marta (elder) on voice device
  "demo:voice:device_marta_livingroom": {
    status: "resolved",
    tenantId: "demo",
    channel: "voice",
    externalSenderId: "device_marta_livingroom",
    personId: "elder_001",
    actorId: "elder_001",
    role: "elder",
    displayName: "Marta",
    authorized: true,
  },
  // Marta (elder) on web chat
  "demo:web_chat:session_abc": {
    status: "resolved",
    tenantId: "demo",
    channel: "web_chat",
    externalSenderId: "session_abc",
    personId: "elder_001",
    actorId: "elder_001",
    role: "elder",
    displayName: "Marta",
    authorized: true,
  },
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

  constructor(extraEntries?: Record<string, ResolvedInboundActor>) {
    this.registry = new Map();

    // Prime with demo defaults
    for (const [key, entry] of Object.entries(DEMO_DATA)) {
      this.registry.set(key, entry);
    }

    // Override/extend with caller-provided entries
    if (extraEntries) {
      for (const [key, entry] of Object.entries(extraEntries)) {
        this.registry.set(key, entry);
      }
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
