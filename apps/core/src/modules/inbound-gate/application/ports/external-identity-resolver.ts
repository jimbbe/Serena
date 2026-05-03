/**
 * T30 — External identity resolver port.
 *
 * Translates external channel sender identifiers into internal domain
 * identity. Implementations may consult a database, IDP, or in-memory
 * registry. The resolver must never throw — errors are caught internally
 * and returned as status: "unknown".
 */

import type { InboundMessageCommand } from "../../domain/inbound-message-command.ts";
import type { ResolvedInboundActor } from "../results/resolved-inbound-actor.ts";

export interface ExternalIdentityResolver {
  resolve(command: InboundMessageCommand): Promise<ResolvedInboundActor>;
}
