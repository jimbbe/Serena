/**
 * T30 — Resolved identity for inbound pipeline actor resolution.
 *
 * Represents the result of translating external channel sender identifiers
 * (tenantId + channel + externalSenderId) into an internal domain identity.
 * Lives in application/results/ because it couples channel concepts with
 * internal identity concepts — same rationale as ChannelInboundResult.
 */

export type IdentityStatus = "resolved" | "unknown" | "blocked";

export type IdentityRole = "elder" | "contact" | "system";

export type ResolvedInboundActor = {
  /** Resolution outcome. */
  status: IdentityStatus;
  /** Multi-tenant identifier (echoed from command or defaulted). */
  tenantId: string;
  /** Channel the message arrived through. */
  channel: string;
  /** Sender identifier as provided by the channel. */
  externalSenderId: string;
  /** Internal domain identifier for the person (set when resolved). */
  personId?: string;
  /** Actor identifier within the system (set when resolved). */
  actorId?: string;
  /** Role of the sender in the Serena ecosystem. */
  role?: IdentityRole;
  /** Human-readable name for display. */
  displayName?: string;
  /** Whether this sender is authorized to interact. */
  authorized: boolean;
  /** Reason for status (e.g. "unknown_sender", "sender_blocked"). */
  reason?: string;
};
